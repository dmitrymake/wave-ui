# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parents[1]))
from yandex_client import ApiError, Catalog, MetadataCache, atomic_json, format_track
from yandex_player import WavePlayer, STREAM_BASE, station_seeds
from yandex_music import Track, Artist, Album, Description, RotorSession, RotorSessionTracks, Sequence, SessionEvent
from yandex_music.exceptions import NetworkError, UnauthorizedError

spec = importlib.util.spec_from_file_location("wave_yandex", Path(__file__).parents[1] / "yandex-music.py")
yandex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(yandex)


def track(tid, **overrides):
    return {"id": str(tid), "title": f"Song {tid}", "artist": "Artist", "album": "Album", "time": 180,
            "isYandex": True, "file": "yandex:" + str(tid), **overrides}


def batch(ids, bid="batch-A", session="session-A"):
    return {"session_id": session, "batch_id": bid,
            "entries": [{"track": track(i), "session_id": session, "batch_id": bid} for i in ids]}


class QueuedExecutor:
    def __init__(self):
        self.jobs = []

    def submit(self, function, *args):
        self.jobs.append((function, args))

    def shutdown(self, **_):
        pass


class FakeMPD:
    def __init__(self):
        self.rows = []
        self.sid = None
        self.elapsed = 0
        self.playback = "stop"
        self.next_id = 1
        self.flags = {k: "0" for k in ("repeat", "single", "random", "consume")}

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def status(self):
        return {"state": self.playback, "elapsed": str(self.elapsed), "duration": "180", **self.flags}

    def currentsong(self):
        for index, row in enumerate(self.rows):
            if row["id"] == self.sid:
                return {**row, "pos": str(index)}
        return {}

    def playlistinfo(self):
        return [dict(row) for row in self.rows]

    def addid(self, url):
        sid = str(self.next_id)
        self.next_id += 1
        self.rows.append({"id": sid, "file": url})
        return sid

    def playid(self, sid):
        self.sid, self.elapsed, self.playback = str(sid), 0, "play"

    def stop(self):
        self.playback = "stop"

    def clear(self):
        self.rows = []
        self.sid = None

    def deleteid(self, sid):
        self.rows = [row for row in self.rows if row["id"] != str(sid)]

    def repeat(self, value): self.flags["repeat"] = str(value)
    def single(self, value): self.flags["single"] = str(value)
    def random(self, value): self.flags["random"] = str(value)
    def consume(self, value): self.flags["consume"] = str(value)


class PlayerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name) / "runtime"
        self.storage = Path(self.temp.name) / "data"
        self.now = 1000.0
        self.mpd = FakeMPD()
        self.catalog = Mock(uid="123")
        self.catalog.new_session.return_value = batch(range(1, 6))
        self.catalog.more.return_value = batch(range(6, 11), "batch-B")
        self.audio = Mock()
        self.player = self.make_player()
        self.addCleanup(self.player.close)

    def make_player(self):
        player = WavePlayer(self.catalog, self.audio, self.runtime, self.storage,
                            mpd_factory=lambda: self.mpd, clock=lambda: self.now)
        player.refill_executor.shutdown()
        player.audio_executor.shutdown()
        player.refill_executor, player.audio_executor = QueuedExecutor(), QueuedExecutor()
        return player

    def start(self):
        return self.player.start_station("user:onyourwave")

    def events(self, kind=None):
        return [e for e in self.player.state["outbox"] if kind is None or e["type"] == kind]

    def listen(self, seconds):
        for _ in range(seconds):
            self.now += 1
            self.mpd.elapsed += 1
            self.player.tick()

    def test_start_uses_session_api_and_only_actual_playback_enters_history(self):
        result = self.start()
        self.assertEqual(result["tracks"], 5)
        self.catalog.new_session.assert_called_once_with(["user:onyourwave"], [])
        self.assertEqual(self.player.history["ids"], ["1"])
        self.assertEqual(len(self.mpd.rows), 5)
        self.assertTrue(all(row["file"].startswith(STREAM_BASE) for row in self.mpd.rows))
        self.assertEqual([e["type"] for e in self.events()], ["radioStarted", "trackStarted"])
        self.audio.prepare.assert_called_once_with("1")

    def test_skip_has_exactly_one_terminal_event_and_correct_batch(self):
        self.start()
        self.listen(8)
        self.player.hint_skip("1")
        self.assertFalse(self.events("skip"))
        self.mpd.playid("2")
        self.now += 0.1
        self.player.tick()
        terminals = [e for e in self.events() if e["type"] in ("skip", "trackFinished")]
        self.assertEqual(len(terminals), 1)
        self.assertEqual(terminals[0]["type"], "skip")
        self.assertEqual(terminals[0]["track_id"], "1")
        self.assertEqual(terminals[0]["batch_id"], "batch-A")
        self.assertLess(terminals[0]["played"], 9)
        self.player.tick()
        self.assertEqual(len(self.events("skip")), 1)

    def test_skip_hint_without_a_successful_mpd_transition_is_not_feedback(self):
        self.start()
        self.player.hint_skip("1")
        self.listen(2)
        self.assertFalse(self.events("skip"))
        self.assertEqual(self.player.state["current"]["song_id"], "1")

    def test_finished_is_distinct_from_skip(self):
        self.start()
        self.mpd.elapsed = 179
        self.now += 1
        self.player.tick()
        self.mpd.playid("2")
        self.now += 1
        self.player.tick()
        self.assertEqual(len(self.events("trackFinished")), 1)
        self.assertFalse(self.events("skip"))

    def test_pause_and_seek_do_not_inflate_listening_time(self):
        self.start()
        self.listen(5)
        self.mpd.playback = "pause"
        self.player.tick()
        self.now += 3600
        self.player.tick()
        self.assertEqual(self.player.state["current"]["played"], 5)
        self.mpd.playback = "play"
        self.player.tick()
        self.now += 1
        self.mpd.elapsed = 120
        self.player.tick()
        self.assertEqual(self.player.state["current"]["played"], 6)

    def test_refilling_does_not_relabel_old_mpd_entries_with_new_batch(self):
        self.start()
        self.player._refill(self.player.state["generation"])
        self.assertEqual(self.player.state["buffer"][0]["batch_id"], "batch-B")
        self.mpd.playid("2")
        self.now += 1
        self.player.tick()
        self.assertEqual(self.events("trackStarted")[-1]["batch_id"], "batch-A")
        self.assertEqual(self.events("skip")[-1]["batch_id"], "batch-A")
        self.assertEqual(self.player.state["entries"]["1"]["batch_id"], "batch-A")

    def test_duplicate_only_refill_never_bypasses_history_or_queue_dedup(self):
        self.start()
        self.catalog.more.return_value = batch(range(1, 6))
        self.catalog.new_session.return_value = batch(range(1, 6), session="new-session")
        self.player._refill(self.player.state["generation"])
        self.assertEqual(self.player.state["buffer"], [])
        self.assertIn("no new tracks", self.player.snapshot()["last_error"])
        self.assertGreater(self.player.retry_at, self.now)
        self.assertEqual(len(self.mpd.rows), 5)

    def test_duplicate_only_initial_response_does_not_clear_existing_mpd_queue(self):
        self.player.history = {"owner": "123", "ids": [str(i) for i in range(1, 6)]}
        self.catalog.more.return_value = batch(range(1, 6))
        self.mpd.addid("Music/old.flac")
        with self.assertRaises(ApiError):
            self.start()
        self.assertEqual(self.mpd.rows[0]["file"], "Music/old.flac")
        self.assertFalse(self.player.state["preparing"])

    def test_stale_refill_cannot_revive_a_stopped_player(self):
        self.start()
        def stop_during_request(*_):
            self.player.stop()
            return batch(range(6, 11))
        self.catalog.more.side_effect = stop_during_request
        self.player._refill(self.player.state["generation"])
        self.assertFalse(self.player.state["active"])
        self.assertFalse(self.player.state["buffer"])

    def test_stop_supersedes_a_start_still_preparing_audio(self):
        self.mpd.addid("Music/old.flac")
        self.audio.prepare.side_effect = lambda _: self.player.stop()
        with self.assertRaises(ApiError) as caught:
            self.start()
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(self.mpd.rows[0]["file"], "Music/old.flac")
        self.assertFalse(self.player.state["active"])

    def test_failed_first_audio_does_not_change_queue(self):
        self.mpd.addid("Music/old.flac")
        self.audio.prepare.side_effect = ApiError(502, "No audio")
        with self.assertRaises(ApiError):
            self.start()
        self.assertEqual(self.mpd.rows[0]["file"], "Music/old.flac")

    def test_slow_prepare_cannot_start_playback_after_the_frontend_deadline(self):
        self.mpd.addid("Music/old.flac")
        def slow_prepare(_):
            self.now += 70
        self.audio.prepare.side_effect = slow_prepare
        with self.assertRaises(ApiError) as caught:
            self.start()
        self.assertEqual(caught.exception.status, 504)
        self.assertEqual(self.mpd.rows[0]["file"], "Music/old.flac")
        self.assertFalse(self.player.state["preparing"])

    def test_external_local_playback_deactivates_radio_without_touching_queue(self):
        self.start()
        sid = self.mpd.addid("Music/local.flac")
        self.mpd.playid(sid)
        self.player.tick()
        self.assertFalse(self.player.state["active"])
        self.assertEqual(self.mpd.currentsong()["file"], "Music/local.flac")
        self.assertEqual(len(self.events("skip")), 1)

    def test_explicit_stop_does_not_auto_resume(self):
        self.start()
        self.listen(3)
        self.mpd.stop()
        self.player.tick()
        self.assertFalse(self.player.state["active"])
        self.assertFalse(self.player.state["resume_when_ready"])
        self.assertEqual(self.mpd.playback, "stop")

    def test_natural_end_with_mpd_elapsed_reset_resumes_only_new_tracks(self):
        self.start()
        self.mpd.playid("5")
        self.player.tick()
        self.mpd.elapsed = 179
        self.now += 1
        self.player.tick()
        self.mpd.elapsed = 0
        self.mpd.stop()
        self.player.tick()
        self.assertTrue(self.player.state["active"])
        self.assertTrue(self.player.state["resume_when_ready"])
        self.assertEqual(self.events("trackFinished")[-1]["track_id"], "5")
        self.player._refill(self.player.state["generation"])
        self.player.tick()
        self.assertEqual(self.mpd.currentsong()["file"], STREAM_BASE + "6")
        self.assertEqual(self.mpd.playback, "play")

    def test_repeat_and_random_cannot_loop_the_sliding_window(self):
        self.start()
        self.mpd.flags.update(repeat="1", random="1", single="1", consume="1")
        self.player.tick()
        self.assertEqual(set(self.mpd.flags.values()), {"0"})

    def test_stale_prefetch_is_discarded_and_pending_prefetch_is_bounded(self):
        self.start()
        self.audio.prepare.reset_mock()
        old_generation = self.player.state["generation"]
        self.player.stop()
        self.player._prefetch("99", old_generation)
        self.audio.prepare.assert_not_called()
        self.start()
        for sid in ("6", "7", "8", "9"):
            self.mpd.playid(sid)
            self.player.tick()
        self.assertLessEqual(len(self.player.prefetching), 2)

    def test_feedback_failure_is_persisted_and_retried_not_acknowledged(self):
        self.start()
        self.catalog.feedback.side_effect = ApiError(502, "Feedback rejected")
        self.assertFalse(self.player.send_feedback())
        self.assertEqual(self.player.snapshot()["feedback_pending"], 2)
        self.assertEqual(self.player.snapshot()["feedback_acks"], {})
        self.now += 5
        self.catalog.feedback.side_effect = None
        self.assertTrue(self.player.send_feedback())
        self.assertEqual(self.player.snapshot()["feedback_acks"], {"radioStarted": 1})
        self.assertEqual(self.player.snapshot()["feedback_pending"], 1)

    def test_restart_preserves_outbox_and_does_not_restart_same_track_feedback(self):
        self.start()
        self.listen(5)
        self.player._save()
        self.now += 3600
        other = self.make_player()
        self.addCleanup(other.close)
        other.tick()
        self.assertEqual(other.history["ids"], ["1"])
        self.assertEqual(len(other.state["outbox"]), 2)
        self.assertEqual(other.state["current"]["played"], 5)

    def test_history_survives_reboot_but_not_an_account_switch(self):
        self.start()
        self.player.path.unlink()
        other = self.make_player()
        self.addCleanup(other.close)
        self.assertEqual(other.history["ids"], ["1"])
        other.account_changed("another-user")
        self.assertEqual(other.history["ids"], [])
        self.assertFalse(other.state["outbox"])

    def test_static_paging_advances_by_source_window_not_filtered_track_count(self):
        self.player.start_playlist([track(1)], "Favorites", {"uid": "123", "kind": "favorites", "offset": 50})
        self.catalog.playlist_page.return_value = ([], 100, True)
        self.player._refill(self.player.state["generation"])
        self.assertEqual(self.player.state["source"]["offset"], 100)
        self.catalog.playlist_page.return_value = ([track(101)], 101, False)
        self.player._refill(self.player.state["generation"])
        self.assertIsNone(self.player.state["source"])
        self.assertEqual(self.player.state["buffer"][0]["track"]["id"], "101")

    def test_expired_session_is_replaced_without_relabeling_existing_entries(self):
        self.start()
        self.catalog.more.side_effect = ApiError(409, "Expired")
        self.catalog.new_session.return_value = batch(range(6, 11), "new-batch", "new-session")
        self.player._refill(self.player.state["generation"])
        self.assertEqual(self.player.state["session_id"], "new-session")
        self.assertEqual(self.player.state["entries"]["1"]["session_id"], "session-A")
        self.assertEqual(self.player.state["buffer"][0]["session_id"], "new-session")
        self.assertEqual(self.events("radioStarted")[-1]["session_id"], "new-session")

    def test_append_returns_actual_mpd_id_not_a_position_guess(self):
        self.catalog.tracks.return_value = [track(77)]
        result = self.player.play_track("77", append=True)
        self.assertEqual(result["mpd_id"], int(self.mpd.rows[-1]["id"]))


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.token_file = self.root / "token"
        self.token_file.write_text("old-token")
        self.metadata = MetadataCache(self.root)
        self.sdk = Mock(account_uid="123")
        self.sdk.init.return_value = self.sdk
        self.catalog = Catalog(self.token_file, self.metadata, client_factory=lambda _: self.sdk)

    def test_normalization_uses_real_sdk_models_and_preserves_frontend_contract(self):
        raw = Track(123, title="Title", artists=[Artist(1, name="Artist")],
                    albums=[Album(2, title="Album")], cover_uri="cdn.yandex.net/%%", duration_ms=123000)
        result = format_track(raw)
        self.assertEqual(result, track(123, title="Title", time=123, image="https://cdn.yandex.net/400x400", service="yandex"))
        self.assertIsNone(format_track(Track(1, available=False)))

    def test_artist_description_is_text_not_the_serialized_sdk_object(self):
        biography = "Советская и российская рок-группа из Новосибирска."
        artist = Artist(359560, name="Калинов Мост", description=Description(biography, "https://example.com/artist"))
        self.sdk.artists_brief_info.return_value = {"artist": artist.to_dict()}
        self.sdk.artists_tracks.return_value = {"tracks": []}
        self.sdk.artists_direct_albums.return_value = {"albums": []}
        result = self.catalog.artist("359560")
        self.assertEqual(result["artist"]["description"], biography)
        self.assertIsInstance(result["artist"]["description"], str)

    def test_artist_description_supports_legacy_text_and_missing_or_invalid_values(self):
        self.sdk.artists_tracks.return_value = {"tracks": []}
        self.sdk.artists_direct_albums.return_value = {"albums": []}
        for description, expected in [("Legacy biography", "Legacy biography"), (None, ""),
                                      ({"uri": "https://example.com"}, ""), ({"text": {}}, "")]:
            with self.subTest(description=description):
                self.sdk.artists_brief_info.return_value = {"artist": {"name": "Artist", "description": description}}
                self.assertEqual(self.catalog.artist("1")["artist"]["description"], expected)

    def test_token_validation_failure_preserves_working_file(self):
        self.sdk.init.side_effect = UnauthorizedError("secret upstream token")
        with self.assertRaises(ApiError) as caught:
            self.catalog.save_token("replacement-token")
        self.assertEqual(caught.exception.status, 401)
        self.assertNotIn("secret", str(caught.exception))
        self.assertEqual(self.token_file.read_text(), "old-token")

    def test_saved_token_is_private_and_uses_validated_account(self):
        self.assertEqual(self.catalog.save_token("new-token"), "123")
        self.assertEqual(self.token_file.stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.token_file.read_text(), "new-token")

    def test_empty_token_file_means_disconnected(self):
        self.token_file.write_text("")
        self.assertEqual(self.catalog.status(), {"authorized": False})

    def test_sdk_network_failure_is_not_an_empty_success_or_a_credential_leak(self):
        self.sdk.search.side_effect = NetworkError("secret URL https://signed.example/token")
        with self.assertRaises(ApiError) as caught:
            self.catalog.search("test")
        self.assertEqual(caught.exception.status, 502)
        self.assertNotIn("secret", str(caught.exception))

    def test_feedback_uses_sdk_event_skip_even_for_zero_seconds(self):
        self.sdk.rotor_session_feedback.return_value = True
        self.catalog.feedback({"session_id": "s", "batch_id": "b", "type": "skip", "timestamp": "now",
                               "track_id": "1", "played": 0})
        args, kwargs = self.sdk.rotor_session_feedback.call_args
        self.assertEqual(args[0], "s")
        self.assertIsInstance(args[1], SessionEvent)
        self.assertEqual(args[1].type, "skip")
        self.assertEqual(args[1].total_played_seconds, 0)
        self.assertEqual(kwargs["batch_id"], "b")
        self.sdk.rotor_session_feedback.return_value = False
        with self.assertRaises(ApiError):
            self.catalog.feedback({"session_id": "s", "type": "radioStarted", "timestamp": "now"})

    def test_playlist_pagination_preserves_order_and_advances_past_unavailable_tracks(self):
        self.sdk.users_playlists.return_value = SimpleNamespace(tracks=[{"id": str(i)} for i in range(1, 53)])
        self.sdk.tracks.side_effect = lambda ids: [
            Track(tid, title=f"Song {tid}", available=tid not in {"10", "51"}) for tid in reversed(ids)
        ]
        bridge = yandex.MusicBridge(self.root, self.root, self.token_file,
                                    catalog=self.catalog, player=Mock(), audio=Mock())
        page = bridge.dispatch("get_playlist_tracks", {"uid": "123", "kind": "7", "offset": 0})
        self.assertEqual([t["id"] for t in page["tracks"]], [str(i) for i in range(1, 51) if i != 10])
        self.assertEqual(page["nextOffset"], 50)
        self.assertTrue(page["hasMore"])
        final = bridge.dispatch("get_playlist_tracks", {"uid": "123", "kind": "7", "offset": page["nextOffset"]})
        self.assertEqual([t["id"] for t in final["tracks"]], ["52"])
        self.assertEqual(final["nextOffset"], 52)
        self.assertFalse(final["hasMore"])

    def test_rotor_session_adapter_preserves_sdk_calls_and_per_batch_identity(self):
        first_track, next_track = Track(1, title="First"), Track(3, title="Next")
        self.sdk.rotor_session_new.return_value = RotorSession(
            radio_session_id="session-A", batch_id="batch-A", sequence=[
                Sequence("track", first_track, False), Sequence("track", Track(2, available=False), False),
            ])
        self.sdk.rotor_session_tracks.return_value = RotorSessionTracks(
            batch_id="batch-B", sequence=[Sequence("track", next_track, False)])
        first = self.catalog.new_session(["user:onyourwave"], ["42"])
        self.sdk.rotor_session_new.assert_called_once_with(
            ["user:onyourwave"], queue=["42"], include_tracks_in_response=True)
        self.assertEqual(first, {"session_id": "session-A", "batch_id": "batch-A", "entries": [
            {"track": format_track(first_track), "session_id": "session-A", "batch_id": "batch-A"},
        ]})
        following = self.catalog.more("session-A", ["42", "1"])
        self.sdk.rotor_session_tracks.assert_called_once_with("session-A", queue=["42", "1"])
        self.assertEqual(following, {"session_id": "session-A", "batch_id": "batch-B", "entries": [
            {"track": format_track(next_track), "session_id": "session-A", "batch_id": "batch-B"},
        ]})
        self.assertEqual(first["entries"][0]["batch_id"], "batch-A")
        self.assertEqual(self.metadata.lookup(STREAM_BASE + "3")["id"], "3")

    def test_rotor_session_adapter_maps_expired_sdk_sessions_to_conflict(self):
        for response in (RotorSessionTracks(terminated=True), RotorSessionTracks(unknown_session=True)):
            self.sdk.rotor_session_tracks.return_value = response
            with self.subTest(response=response), self.assertRaises(ApiError) as caught:
                self.catalog.more("expired-session", [])
            self.assertEqual(caught.exception.status, 409)

    def test_metadata_supports_new_stream_urls_and_legacy_php_cache(self):
        self.metadata.remember([track(123)])
        self.assertEqual(self.metadata.lookup(STREAM_BASE + "123")["title"], "Song 123")
        self.assertEqual(self.metadata.lookup("yandex:123")["id"], "123")
        self.assertEqual(self.metadata.lookup("file:///dev/shm/yandex_music/tracks/123.mp3")["id"], "123")
        atomic_json(self.root / "meta_cache.json", {"456": track(456)})
        loaded = MetadataCache(self.root)
        self.assertEqual(loaded.lookup("/dev/shm/yandex_music/tracks/456.mp3")["id"], "456")
        self.assertIsNone(loaded.lookup("https://unrelated.example/track"))

    def test_landing_unwraps_generated_personal_playlist(self):
        result = Mock()
        result.to_dict.return_value = {"blocks": [{"entities": [{"type": "personal-playlist", "data": {
            "type": "playlist-of-the-day", "ready": True,
            "data": {"kind": 1001, "title": "Daily", "owner": {"uid": 123}, "track_count": 60}
        }}]}]}
        self.sdk.landing.return_value = result
        personal = self.catalog.landing()["personal"]
        self.assertEqual(len(personal), 1)
        self.assertEqual(personal[0]["kind"], "1001")
        self.assertEqual(personal[0]["trackCount"], 60)

    def test_station_settings_are_seeds_not_mutating_global_rotor_settings(self):
        self.assertEqual(station_seeds("vibe:moodEnergy:active"), ["user:onyourwave", "settingMoodEnergy:active"])
        self.assertEqual(station_seeds("vibe:seed:settingDiversity:discover"),
                         ["user:onyourwave", "settingDiversity:discover"])
        with self.assertRaises(ApiError):
            station_seeds("track:123\nclear")


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.catalog, self.player, self.audio = Mock(), Mock(), Mock()
        self.bridge = yandex.MusicBridge(self.temp.name, self.temp.name, self.temp.name + "/token",
                                        catalog=self.catalog, player=self.player, audio=self.audio)

    def test_token_import_requires_post(self):
        with self.assertRaises(ApiError) as caught:
            self.bridge.dispatch("save_token", {"token": "secret"})
        self.assertEqual(caught.exception.status, 405)
        self.catalog.save_token.assert_not_called()

    def test_prepare_track_caches_audio_without_changing_mpd_playback(self):
        self.assertEqual(self.bridge.dispatch("prepare_track", {"track_id": "123"}, "POST"), {"status": "ready"})
        self.audio.prepare.assert_called_once_with("123")
        self.player.play_track.assert_not_called()
        self.player.start_station.assert_not_called()
        with self.assertRaises(ApiError) as caught:
            self.bridge.dispatch("prepare_track", {"track_id": "123"}, "GET")
        self.assertEqual(caught.exception.status, 405)
        with self.assertRaises(ApiError):
            self.bridge.dispatch("prepare_track", {"track_id": "../bad"}, "POST")

    def test_legacy_get_play_controls_remain_compatible(self):
        self.bridge.dispatch("play_station", {"station": "user:onyourwave"})
        self.player.start_station.assert_called_once_with("user:onyourwave")

    def test_dislike_removes_a_favorite_not_a_recommendation(self):
        self.bridge.dispatch("dislike", {"track_id": "1"})
        self.catalog.call.assert_called_once_with("users_likes_tracks_remove", "1")

    def test_skip_body_is_only_a_transition_hint_not_a_second_feedback_sender(self):
        self.bridge.dispatch("feedback_skip", {"track_id": "1", "played_seconds": 99999}, "POST")
        self.player.hint_skip.assert_called_once_with("1")
        self.catalog.feedback.assert_not_called()

    def test_cold_metadata_is_restored_by_id_without_fetching_supplied_urls(self):
        def fetch(ids):
            self.bridge.metadata.remember([track(i) for i in ids])
            return [track(i) for i in ids]
        self.catalog.tracks.side_effect = fetch
        url = STREAM_BASE + "123"
        result = self.bridge.dispatch("get_meta", {"url": url})
        self.assertEqual(result["id"], "123")
        self.catalog.tracks.assert_called_once_with(["123"])
        self.catalog.tracks.reset_mock()
        self.assertIsNone(self.bridge.dispatch("get_meta", {"url": "https://unrelated.example/tracks/9.mp3"}))
        self.catalog.tracks.assert_not_called()

    def test_static_sources_and_metadata_inputs_are_validated(self):
        for source in ({"kind": "favorites", "uid": "../bad"}, [], {"kind": "favorites", "uid": "1", "offset": -1}):
            with self.subTest(source=source), self.assertRaises(ApiError):
                self.bridge._source(source)
        for urls in ("not-a-list", [123], ["x"] * 1001):
            with self.subTest(urls=type(urls)), self.assertRaises(ApiError):
                self.bridge.dispatch("batch_get_meta", {"urls": urls}, "POST")
        with self.assertRaises(ApiError):
            self.bridge.dispatch("debug_dump", {})


if __name__ == "__main__":
    unittest.main()
