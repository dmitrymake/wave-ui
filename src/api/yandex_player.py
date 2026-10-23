# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Single-owner MPD queue and radio-session state machine.

MPD observation never waits for a CDN or Yandex request. Refill/prefetch/feedback
run separately; generation checks prevent an old request from reviving a stopped
or replaced session. State survives service restarts, history survives reboots.
"""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
import logging
from pathlib import Path
import re
from threading import Event, RLock, Thread
import time
import uuid

from mpd import MPDClient

from yandex_client import ApiError, atomic_json, format_track, identifier, read_json

STREAM_BASE = "http://127.0.0.1:8767/yandex/stream/"
HISTORY_WINDOW = 100


@contextmanager
def mpd_connection():
    client = MPDClient()
    client.timeout = 3
    try:
        client.connect("127.0.0.1", 6600)
        yield client
    except Exception as error:
        # MPD errors can include the command/URL; do not pass them to diagnostics.
        if isinstance(error, ApiError):
            raise
        raise ApiError(503, "MPD is not available") from None
    finally:
        try:
            client.disconnect()
        except Exception:
            pass


def station_seeds(station):
    station = str(station or "user:onyourwave")
    if station.startswith("vibe:seed:"):
        seeds = ["user:onyourwave", station[len("vibe:seed:"):]]
    elif station.startswith("vibe:"):
        parts = station.split(":")
        groups = {"moodEnergy": "settingMoodEnergy", "diversity": "settingDiversity", "language": "settingLanguage"}
        if len(parts) != 3 or parts[1] not in groups:
            raise ApiError(400, "Invalid wave setting")
        seeds = ["user:onyourwave", groups[parts[1]] + ":" + parts[2]]
    else:
        seeds = [station]
    if any(not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,40}:[A-Za-z0-9_.-]{1,120}", seed) for seed in seeds):
        raise ApiError(400, "Invalid radio seed")
    return seeds


class WavePlayer:
    def __init__(self, catalog, audio, runtime_dir, data_dir, mpd_factory=mpd_connection, clock=time.monotonic):
        self.catalog, self.audio = catalog, audio
        self.mpd_factory, self.clock = mpd_factory, clock
        self.lock = RLock()
        self.path = Path(runtime_dir) / "bridge-state.json"
        self.history_path = Path(data_dir) / "history.json"
        saved = read_json(self.path, {})
        self.state = {"active": False, "mode": "idle", "generation": uuid.uuid4().hex,
                      "context_name": "Yandex Music", "buffer": [], "entries": {}, "outbox": [],
                      "current": None, "seeds": [], "session_id": None, "source": None,
                      "resume_when_ready": False, "last_error": None, "feedback_error": None, "feedback_acks": {}}
        if isinstance(saved, dict) and saved.get("version") == 1:
            self.state.update(saved)
        self.state["preparing"] = False
        # Never count downtime between process instances as listening time.
        self.last_sample = self.clock()
        self.last_checkpoint = self.clock()
        self.history = read_json(self.history_path, {"owner": "", "ids": []})
        if not isinstance(self.history, dict) or not isinstance(self.history.get("ids"), list):
            self.history = {"owner": "", "ids": []}
        self.stop_event = Event()
        self.feedback_event = Event()
        self.refill_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yandex-refill")
        self.audio_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="yandex-prefetch")
        self.job_generation = None
        self.prefetching = set()
        self.prefetch_retry = {}
        self.retry_at = 0
        self.failures = 0
        self.feedback_retry_at = 0
        self.feedback_failures = 0
        self.skip_hint = None
        self.threads = []

    def _save(self):
        atomic_json(self.path, {**self.state, "version": 1})
        self.last_checkpoint = self.clock()

    def bind_owner(self, uid):
        with self.lock:
            if self.history.get("owner") != str(uid):
                self.history = {"owner": str(uid), "ids": []}
                atomic_json(self.history_path, self.history)

    def account_changed(self, uid):
        with self.lock:
            if self.history.get("owner") != str(uid):
                self.state.update(active=False, generation=uuid.uuid4().hex, buffer=[], entries={}, current=None,
                                  outbox=[], mode="idle", preparing=False, source=None, session_id=None)
            self.bind_owner(uid)
            self.feedback_retry_at = 0
            self._save()

    def _event(self, entry, kind, played=None):
        if not entry.get("session_id"):
            return
        event = {"id": uuid.uuid4().hex, "session_id": entry["session_id"], "batch_id": entry.get("batch_id"),
                 "type": kind, "timestamp": datetime.now(timezone.utc).isoformat(), "owner": self.history.get("owner", "")}
        if kind != "radioStarted":
            event["track_id"] = str(entry["track"]["id"])
        if played is not None:
            event["played"] = round(max(0, played), 3)
        self.state["outbox"].append(event)
        self.feedback_event.set()
        if len(self.state["outbox"]) > 512:
            self.state["active"] = False
            self.state["last_error"] = "Radio paused: feedback is not reaching Yandex"

    def _terminal(self, kind=None):
        current = self.state.get("current")
        if not current:
            return
        duration = current["entry"]["track"].get("time") or current.get("duration") or 0
        if kind is None:
            hinted = self.skip_hint and self.skip_hint[0] == current["song_id"] and self.clock() < self.skip_hint[1]
            kind = "trackFinished" if not hinted and duration > 0 and current["elapsed"] >= duration - 3 else "skip"
        self._event(current["entry"], kind, current["played"])
        self.state["current"] = None
        self.skip_hint = None
        self._save()
        return kind

    def _observe(self, status, song):
        now = self.clock()
        delta = max(0, min(now - self.last_sample, 5))
        self.last_sample = now
        sid, playback = str(song.get("id", "")), status.get("state", "stop")
        elapsed = float(status.get("elapsed") or 0)
        current = self.state.get("current")
        same = current and current["song_id"] == sid
        if current:
            if same and playback == "stop":
                # MPD can omit/reset elapsed once it stops at the end of a queue.
                elapsed = max(current["elapsed"], elapsed)
            if same:
                progress = max(0, elapsed - current["elapsed"])
                if current["playback"] == "play":
                    # Seek jumps never become listening time; a paused/buffering
                    # player with unchanged elapsed contributes nothing.
                    current["played"] += min(delta, progress)
                current["elapsed"] = elapsed
                current["playback"] = playback
            elif current["playback"] == "play":
                duration = current["entry"]["track"].get("time") or 0
                current["played"] += min(delta, max(0, duration - current["elapsed"]))
                current["elapsed"] += min(delta, max(0, duration - current["elapsed"]))
            if not same or playback == "stop":
                terminal = self._terminal()
                if playback == "stop" and self.state["active"]:
                    if terminal == "trackFinished":
                        self.state["resume_when_ready"] = True
                    else:
                        # An explicit MPD stop is not an empty-queue retry signal.
                        self.state.update(active=False, buffer=[], resume_when_ready=False)
        entry = self.state["entries"].get(sid)
        if playback == "play" and not self.state.get("current"):
            if entry:
                self.state["current"] = {"song_id": sid, "entry": entry, "elapsed": elapsed,
                                         "played": 0.0, "playback": "play",
                                         "duration": float(status.get("duration") or 0)}
                self._event(entry, "trackStarted")
                self.history["ids"].append(str(entry["track"]["id"]))
                self.history["ids"] = self.history["ids"][-500:]
                atomic_json(self.history_path, self.history)
                self._save()
            elif self.state["active"]:
                # Another client selected local music/radio: do not fight it.
                self.state.update(active=False, buffer=[], resume_when_ready=False, preparing=False,
                                  generation=uuid.uuid4().hex)
                self._save()

    def hint_skip(self, track_id):
        track_id = identifier(track_id).split(":")[0]
        with self.lock:
            current = self.state.get("current")
            if current and str(current["entry"]["track"]["id"]) == track_id:
                # This is intent, not a terminal event: a failed MPD next command
                # must not tell Yandex the still-playing track was skipped.
                self.skip_hint = (current["song_id"], self.clock() + 10)
        return {"status": "ok"}

    def _begin(self):
        with self.lock:
            generation = uuid.uuid4().hex
            self.state.update(generation=generation, preparing=True)
            self._save()
            return generation

    def _cancel(self, generation):
        with self.lock:
            if self.state["generation"] == generation:
                self.state["preparing"] = False
                self._save()

    @staticmethod
    def _novel(entries, excluded):
        seen, result = set(excluded), []
        for entry in entries:
            tid = str(entry["track"]["id"])
            if tid not in seen:
                seen.add(tid)
                result.append(entry)
        return result

    def start_station(self, station):
        deadline = self.clock() + 65  # below the frontend/proxy request deadlines
        seeds = station_seeds(station)
        self.catalog.status()
        self.bind_owner(self.catalog.uid)
        generation = self._begin()
        try:
            with self.lock:
                history = list(self.history["ids"][-HISTORY_WINDOW:])
            batch = self.catalog.new_session(seeds, history)
            entries = self._novel(batch["entries"], history)
            for _ in range(2):
                if entries:
                    break
                batch = self.catalog.more(batch["session_id"], history)
                entries = self._novel(batch["entries"], history)
            if not entries:
                raise ApiError(502, "Yandex returned only recently played tracks; try another wave")
            # Resolve/cache the first playable track BEFORE replacing the MPD queue.
            self.audio.prepare(entries[0]["track"]["id"])
            context = "My Vibe" if seeds == ["user:onyourwave"] else "Vibe: " + seeds[-1].split(":", 1)[1]
            self._activate(generation, entries, "station", context, seeds, batch["session_id"], deadline=deadline)
            return {"status": "started", "context": context, "tracks": len(entries)}
        except Exception:
            self._cancel(generation)
            raise

    def start_playlist(self, tracks, context, source=None, deadline=None):
        deadline = self.clock() + 65 if deadline is None else deadline
        clean = [t for row in tracks if (t := format_track(row))]
        if not clean:
            raise ApiError(400, "No playable tracks provided")
        self.catalog.status()
        self.bind_owner(self.catalog.uid)
        generation = self._begin()
        try:
            self.catalog.metadata.remember(clean)
            self.audio.prepare(clean[0]["id"])
            entries = [{"track": track, "session_id": None, "batch_id": None} for track in clean]
            self._activate(generation, entries, "static", str(context or "Yandex Playlist")[:200], source=source,
                           deadline=deadline)
            return {"status": "ok", "buffered": max(0, len(clean) - 5)}
        except Exception:
            self._cancel(generation)
            raise

    def _activate(self, generation, entries, mode, context, seeds=None, session_id=None, source=None, deadline=None):
        with self.lock:
            if self.state["generation"] != generation:
                raise ApiError(409, "Playback request was superseded")
            if deadline is not None and self.clock() > deadline:
                raise ApiError(504, "Yandex audio took too long to prepare; try again")
            with self.mpd_factory() as mpd:
                self._observe(mpd.status(), mpd.currentsong())
                self._terminal("skip")
                mpd.stop()
                mpd.clear()
                self._normalize(mpd)
                self.state.update(active=True, generation=generation, mode=mode, context_name=context, seeds=seeds or [],
                                  session_id=session_id, source=source, buffer=list(entries), entries={}, current=None,
                                  resume_when_ready=False, preparing=False, last_error=None)
                if mode == "station":
                    self._event(entries[0], "radioStarted")
                first = self._append(mpd, 5)
                self._save()
                if first is None:
                    raise ApiError(502, "Could not add tracks to MPD")
                mpd.playid(first)
                self._observe(mpd.status(), mpd.currentsong())
                self._save()
            self.failures, self.retry_at = 0, 0

    @staticmethod
    def _normalize(mpd):
        mpd.repeat(0)
        mpd.single(0)
        mpd.random(0)
        mpd.consume(0)

    def _append(self, mpd, limit):
        first = None
        for _ in range(min(limit, len(self.state["buffer"]))):
            entry = self.state["buffer"][0]
            song_id = str(mpd.addid(STREAM_BASE + str(entry["track"]["id"])))
            self.state["buffer"].pop(0)
            self.state["entries"][song_id] = entry
            if first is None:
                first = song_id
        return first

    def append_tracks(self, tracks):
        clean = [t for row in tracks if (t := format_track(row))]
        if not clean:
            raise ApiError(400, "No playable tracks provided")
        self.catalog.metadata.remember(clean)
        with self.lock:
            # Explicit appends become a static queue, as in the old API, while
            # existing station entries retain their own feedback identities.
            self.state.update(active=True, mode="static", source=None, seeds=[], session_id=None,
                              generation=uuid.uuid4().hex, preparing=False, resume_when_ready=False)
            self.state["buffer"].extend({"track": t, "session_id": None, "batch_id": None} for t in clean)
            if len(self.state["buffer"]) > 1000:
                self.state["buffer"] = self.state["buffer"][:1000]
            with self.mpd_factory() as mpd:
                self._append(mpd, 1)
            self._save()
        return {"status": "ok", "added": 1}

    def play_track(self, track_id, append=False):
        deadline = self.clock() + 65
        tracks = self.catalog.tracks([identifier(track_id)])
        if not tracks:
            raise ApiError(404, "Track is unavailable")
        if not append:
            return self.start_playlist(tracks, "Single Track", deadline=deadline)
        # play_track&append=1 must append immediately: the frontend resolves its
        # stable MPD id and moves it with moveid/playid.
        self.audio.prepare(tracks[0]["id"])
        with self.lock:
            if self.clock() > deadline:
                raise ApiError(504, "Yandex audio took too long to prepare; try again")
            with self.mpd_factory() as mpd:
                sid = str(mpd.addid(STREAM_BASE + tracks[0]["id"]))
                self.state["entries"][sid] = {"track": tracks[0], "session_id": None, "batch_id": None}
            self._save()
        return {"status": "ok", "mpd_id": int(sid)}

    def stop(self):
        with self.lock:
            self.state.update(active=False, mode="idle", preparing=False, buffer=[], source=None,
                              generation=uuid.uuid4().hex, context_name="Stopped", resume_when_ready=False)
            self._save()
        # Stop means stop replenishing; it deliberately leaves MPD playback alone.
        return {"status": "stopped"}

    def _exclusions(self):
        return list(dict.fromkeys(self.history["ids"][-HISTORY_WINDOW:] +
                                 [e["track"]["id"] for e in self.state["entries"].values()] +
                                 [e["track"]["id"] for e in self.state["buffer"]]))

    def _refill(self, generation):
        try:
            with self.lock:
                if self.state["generation"] != generation or not self.state["active"]:
                    return
                mode, source = self.state["mode"], self.state.get("source")
                seeds, session_id = list(self.state["seeds"]), self.state["session_id"]
                excluded = self._exclusions()
            replacement = False
            if mode == "station":
                try:
                    batch = self.catalog.more(session_id, excluded)
                except ApiError as error:
                    if error.status != 409:
                        raise
                    batch = self.catalog.new_session(seeds, excluded)
                    replacement = True
                entries = self._novel(batch["entries"], excluded)
                if not entries:
                    # A stale or duplicate-only response never bypasses history.
                    batch = self.catalog.new_session(seeds, excluded)
                    entries = self._novel(batch["entries"], excluded)
                    replacement = True
                if not entries:
                    raise ApiError(502, "Yandex returned no new tracks; radio will retry")
            elif source:
                tracks, offset, more = self.catalog.playlist_page(source["uid"], source["kind"], source["offset"])
                entries = [{"track": t, "session_id": None, "batch_id": None} for t in tracks]
                source = {**source, "offset": offset} if more else None
            else:
                return
            with self.lock:
                if self.state["generation"] != generation or not self.state["active"] or self.state["preparing"]:
                    return
                if mode == "station":
                    # Recheck after I/O: another poll may have started a track.
                    entries = self._novel(entries, self._exclusions())
                    if not entries:
                        raise ApiError(502, "Yandex returned no new tracks; radio will retry")
                    self.state["session_id"] = batch["session_id"]
                    if replacement:
                        self._event(entries[0], "radioStarted")
                else:
                    self.state["source"] = source
                self.state["buffer"].extend(entries[:300])
                self.state["last_error"] = None
                self.failures, self.retry_at = 0, 0
                self._save()
        except Exception as error:
            with self.lock:
                if self.state["generation"] == generation:
                    self.failures += 1
                    self.retry_at = self.clock() + min(60, 2 ** min(self.failures, 6))
                    self.state["last_error"] = str(error) if isinstance(error, ApiError) else "Radio refill failed"
                    self._save()
                    logging.warning("Yandex refill failed (%s); retry scheduled", type(error).__name__)
        finally:
            with self.lock:
                if self.job_generation == generation:
                    self.job_generation = None

    def _prefetch(self, track_id, generation):
        try:
            with self.lock:
                if self.state["generation"] != generation:
                    return
            self.audio.prepare(track_id)
        except Exception as error:
            with self.lock:
                self.prefetch_retry[track_id] = self.clock() + 60
            logging.warning("Yandex prefetch failed track=%s (%s)", track_id, type(error).__name__)
        finally:
            with self.lock:
                self.prefetching.discard(track_id)

    def tick(self):
        with self.lock:
            with self.mpd_factory() as mpd:
                status, song, queue = mpd.status(), mpd.currentsong(), mpd.playlistinfo()
                self._observe(status, song)
                live_ids = {str(row["id"]) for row in queue}
                self.state["entries"] = {sid: entry for sid, entry in self.state["entries"].items() if sid in live_ids}
                current_pos = int(song.get("pos", -1))
                ahead = len(queue) - current_pos - 1 if current_pos >= 0 else len(queue)
                if self.state["active"] and not self.state["preparing"]:
                    # A sliding station window must not become a repeat/shuffle loop.
                    if any(status.get(key) not in (None, "0", "off") for key in ("repeat", "single", "random", "consume")):
                        self._normalize(mpd)
                    if current_pos > 3:
                        for row in queue[:current_pos - 3]:
                            mpd.deleteid(row["id"])
                            self.state["entries"].pop(str(row["id"]), None)
                    if ahead < 3 and self.state["buffer"]:
                        first = self._append(mpd, 3 - ahead)
                        if self.state["resume_when_ready"] and first is not None:
                            mpd.playid(first)
                            self.state["resume_when_ready"] = False
                        self._save()
                    can_page = self.state["mode"] == "station" or self.state.get("source")
                    if ahead < 3 and not self.state["buffer"] and can_page and self.clock() >= self.retry_at:
                        generation = self.state["generation"]
                        if self.job_generation != generation:
                            self.job_generation = generation
                            self.refill_executor.submit(self._refill, generation)
                if status.get("state") == "play":
                    following = queue[current_pos + 1:current_pos + 2]
                    for row in following:
                        entry = self.state["entries"].get(str(row["id"]))
                        if entry:
                            tid = entry["track"]["id"]
                            if (tid not in self.prefetching and len(self.prefetching) < 2
                                    and self.clock() >= self.prefetch_retry.get(tid, 0)):
                                self.prefetching.add(tid)
                                self.prefetch_retry[tid] = self.clock() + 60
                                self.audio_executor.submit(self._prefetch, tid, self.state["generation"])
                if self.clock() - self.last_checkpoint >= 5:
                    self._save()

    def send_feedback(self):
        with self.lock:
            if not self.state["outbox"] or self.clock() < self.feedback_retry_at:
                return False
            event = dict(self.state["outbox"][0])
        try:
            self.catalog.feedback(event)
        except Exception as error:
            with self.lock:
                if not self.state["outbox"] or self.state["outbox"][0]["id"] != event["id"]:
                    return True  # Account replacement discarded this old event.
                self.feedback_failures += 1
                self.feedback_retry_at = self.clock() + min(60, 2 ** min(self.feedback_failures, 6))
                self.state["feedback_error"] = str(error) if isinstance(error, ApiError) else "Radio feedback failed"
                self._save()
            logging.warning("Yandex feedback failed type=%s (%s); retry scheduled", event["type"], type(error).__name__)
            return False
        with self.lock:
            if self.state["outbox"] and self.state["outbox"][0]["id"] == event["id"]:
                self.state["outbox"].pop(0)
                counts = self.state["feedback_acks"]
                counts[event["type"]] = counts.get(event["type"], 0) + 1
                self.feedback_failures, self.feedback_retry_at = 0, 0
                self.state["feedback_error"] = None
                self._save()
        logging.info("Yandex feedback accepted type=%s track=%s batch=%s", event["type"], event.get("track_id", "-"),
                     event.get("batch_id", "-"))
        return True

    def snapshot(self):
        with self.lock:
            return {"active": self.state["active"], "context_name": self.state["context_name"],
                    "backend": "python", "mode": self.state["mode"], "preparing": self.state["preparing"],
                    "buffered": len(self.state["buffer"]), "history_count": len(self.history["ids"]),
                    "feedback_pending": len(self.state["outbox"]), "feedback_acks": dict(self.state["feedback_acks"]),
                    "last_error": self.state["last_error"] or self.state.get("feedback_error")}

    def _poll_loop(self):
        while not self.stop_event.is_set():
            try:
                self.tick()
            except Exception as error:
                logging.warning("Yandex MPD poll failed (%s)", type(error).__name__)
            self.stop_event.wait(0.5)

    def _feedback_loop(self):
        while not self.stop_event.is_set():
            self.feedback_event.clear()
            while not self.stop_event.is_set() and self.send_feedback():
                pass
            self.feedback_event.wait(1)

    def start(self):
        for target, name in ((self._poll_loop, "yandex-mpd"), (self._feedback_loop, "yandex-feedback")):
            thread = Thread(target=target, name=name, daemon=True)
            self.threads.append(thread)
            thread.start()

    def close(self):
        self.stop_event.set()
        self.feedback_event.set()
        for thread in self.threads:
            thread.join(timeout=15)
        self.refill_executor.shutdown(wait=True, cancel_futures=True)
        self.audio_executor.shutdown(wait=True, cancel_futures=True)
        with self.lock:
            self._save()
