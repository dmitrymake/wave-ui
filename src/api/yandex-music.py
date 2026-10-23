#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Loopback-only Yandex Music API/audio bridge and MPD radio worker."""
import argparse
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import re
import signal
from threading import Thread
from urllib.parse import urlparse

from yandex_audio import AudioCache, byte_range
from yandex_client import ApiError, Catalog, MetadataCache, format_track, identifier, offset_value
from yandex_player import WavePlayer

READ_ACTIONS = {"status", "search", "get_landing", "get_stations_dashboard", "get_playlists", "get_playlist_tracks",
                "get_artist_details", "get_album_details", "get_favorites_ids", "get_meta", "get_state"}
POST_ACTIONS = {"save_token", "play_playlist", "add_tracks", "feedback_skip", "batch_get_meta", "prepare_track"}
# Existing installed frontends use GET for these controls. Retain that contract;
# JSON/token imports still require POST. The public PHP endpoint is trusted-LAN only.
CONTROL_ACTIONS = {"play_station", "play_track", "stop_daemon", "like", "dislike"}


class MusicBridge:
    def __init__(self, data_dir="/var/local/www/yandex-music", runtime_dir="/dev/shm/yandex_music",
                 token_file="/var/local/www/yandex-music/token.dat", catalog=None, player=None, audio=None):
        self.metadata = MetadataCache(runtime_dir)
        self.catalog = catalog or Catalog(token_file, self.metadata)
        self.audio = audio or AudioCache(Path(runtime_dir) / "audio", self.catalog)
        self.player = player or WavePlayer(self.catalog, self.audio, runtime_dir, data_dir)

    def _tracks(self, value):
        if not isinstance(value, list) or not value or len(value) > 1000 or any(not isinstance(t, dict) for t in value):
            raise ApiError(400, "Provide between 1 and 1000 tracks")
        clean, missing = [], []
        for row in value:
            track_id = identifier(row.get("id")).split(":")[0]
            if row.get("isYandex") is True and isinstance(row.get("title"), str) and isinstance(row.get("artist"), str):
                clean.append(format_track(row))
            else:
                missing.append(track_id)
                clean.append(track_id)
        fetched = {t["id"]: t for t in self.catalog.tracks(list(dict.fromkeys(missing)))} if missing else {}
        return [fetched[t] if isinstance(t, str) else t for t in clean if not isinstance(t, str) or t in fetched]

    def _metadata(self, urls):
        result = {url: self.metadata.lookup(url) for url in urls}
        missing = list(dict.fromkeys(track_id for url, row in result.items()
                                     if row is None and (track_id := self.metadata.track_id(url))))
        if missing:
            # Saved stable MPD URLs remain useful after tmpfs is cleared/rebooted.
            # Only recognised Yandex ids reach the SDK; never fetch a supplied URL.
            self.catalog.tracks(missing)
            result = {url: self.metadata.lookup(url) for url in urls}
        return result

    @staticmethod
    def _source(value):
        if value is None:
            return None
        if not isinstance(value, dict):
            raise ApiError(400, "Invalid playlist source")
        kind = value.get("kind")
        return {"kind": "favorites" if kind == "favorites" else identifier(kind),
                "uid": identifier(value.get("uid")), "offset": offset_value(value.get("offset"))}

    def dispatch(self, action, params, method="GET"):
        if action == "debug_dump":
            raise ApiError(403, "debug_dump disabled")
        if action not in READ_ACTIONS | POST_ACTIONS | CONTROL_ACTIONS:
            raise ApiError(400, "Unknown Yandex Music action")
        if not isinstance(params, dict):
            raise ApiError(400, "Invalid request parameters")
        if method not in ("GET", "POST") or (action in POST_ACTIONS and method != "POST"):
            raise ApiError(405, "This action requires POST")
        if action == "status":
            return self.catalog.status()
        if action == "save_token":
            uid = self.catalog.save_token(params.get("token"))
            self.player.account_changed(uid)
            return {"status": "ok"}
        if action == "get_state":
            return self.player.snapshot()
        if action == "stop_daemon":
            return self.player.stop()
        if action == "search":
            return self.catalog.search(params.get("query", ""))
        if action == "get_landing":
            return self.catalog.landing()
        if action == "get_stations_dashboard":
            return self.catalog.stations()
        if action == "get_playlists":
            return self.catalog.playlists()
        if action == "get_playlist_tracks":
            tracks, offset, more = self.catalog.playlist_page(params.get("uid"), params.get("kind"), params.get("offset", 0))
            return {"tracks": tracks, "nextOffset": offset, "hasMore": more}
        if action == "get_artist_details":
            return self.catalog.artist(params.get("id"))
        if action == "get_album_details":
            return self.catalog.album(params.get("id"))
        if action == "get_favorites_ids":
            return {"ids": self.catalog.favorites()}
        if action == "prepare_track":
            self.audio.prepare(identifier(params.get("track_id")))
            return {"status": "ready"}
        if action == "play_station":
            return self.player.start_station(params.get("station"))
        if action == "play_playlist":
            return self.player.start_playlist(self._tracks(params.get("tracks")), params.get("context"),
                                              self._source(params.get("source")))
        if action == "add_tracks":
            return self.player.append_tracks(self._tracks(params.get("tracks")))
        if action == "play_track":
            return self.player.play_track(params.get("id"), str(params.get("append", "0")) == "1")
        if action == "feedback_skip":
            return self.player.hint_skip(params.get("track_id"))
        if action in ("like", "dislike"):
            result = self.catalog.call("users_likes_tracks_add" if action == "like" else "users_likes_tracks_remove",
                                       identifier(params.get("track_id")))
            if not result:
                raise ApiError(502, "Yandex did not acknowledge the favorite change")
            # Legacy 'dislike' means remove a like, NOT block a recommendation.
            return {"status": "liked" if action == "like" else "disliked"}
        if action == "get_meta":
            url = params.get("url", "")
            if not isinstance(url, str) or len(url) > 8192:
                raise ApiError(400, "Invalid metadata URL")
            return self._metadata([url])[url]
        if action == "batch_get_meta":
            urls = params.get("urls")
            if not isinstance(urls, list) or len(urls) > 1000 or any(not isinstance(u, str) or len(u) > 8192 for u in urls):
                raise ApiError(400, "Invalid metadata URLs")
            return self._metadata(urls)


class Handler(BaseHTTPRequestHandler):
    server_version = "WaveYandex/1"

    def setup(self):
        super().setup()
        self.connection.settimeout(90)

    def log_message(self, *_):
        # BaseHTTPRequestHandler logs the whole request target (possibly a CDN URL).
        pass

    def _json(self, status, body):
        payload = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_POST(self):
        try:
            if self.path != "/api" or self.headers.get("X-Wave-Proxy") != "1":
                raise ApiError(403, "Use the Wave UI API proxy")
            if self.headers.get_content_type() != "application/json":
                raise ApiError(415, "Use application/json")
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                raise ApiError(400, "Invalid request length") from None
            if not 0 < size <= 2 * 1024 * 1024:
                raise ApiError(413, "Request is too large or empty")
            try:
                payload = json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                raise ApiError(400, "Invalid JSON") from None
            if not isinstance(payload, dict) or not isinstance(payload.get("action"), str):
                raise ApiError(400, "Invalid API request")
            result = self.server.bridge.dispatch(payload["action"], payload.get("params", {}), payload.get("method", "GET"))
            self._json(200, result)
        except ApiError as error:
            self._json(error.status, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            logging.warning("Yandex API request failed (%s)", type(error).__name__)
            self._json(500, {"error": "Yandex Music bridge request failed"})

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        headers_sent = False
        try:
            match = re.fullmatch(r"/yandex/stream/(\d{1,24})", urlparse(self.path).path)
            if not match:
                raise ApiError(404, "Not found")
            with self.server.bridge.audio.open(match[1]) as stream:
                size = os.fstat(stream.fileno()).st_size
                start, end, partial = byte_range(self.headers.get("Range"), size)
                self.send_response(206 if partial else 200)
                self.send_header("Content-Type", "audio/mpeg")
                self.send_header("Accept-Ranges", "bytes")
                self.send_header("Content-Length", str(end - start + 1))
                self.send_header("Cache-Control", "private, no-store")
                if partial:
                    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
                self.end_headers()
                headers_sent = True
                if self.command == "HEAD":
                    return
                stream.seek(start)
                remaining = end - start + 1
                while remaining:
                    chunk = stream.read(min(64 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except ApiError as error:
            if not headers_sent:
                if error.status == 416:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                else:
                    self._json(error.status, {"error": str(error)})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as error:
            logging.warning("Yandex audio request failed (%s)", type(error).__name__)
            if not headers_sent:
                self._json(502, {"error": "Yandex audio is unavailable"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8767)
    parser.add_argument("--data-dir", default="/var/local/www/yandex-music")
    parser.add_argument("--runtime-dir", default="/dev/shm/yandex_music")
    parser.add_argument("--token-file", default="/var/local/www/yandex-music/token.dat")
    args = parser.parse_args()
    if args.port != 8767:
        parser.error("The MPD stream contract uses loopback port 8767")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # Do not let the SDK's verbose request logging disclose credentials.
    logging.getLogger("yandex_music").setLevel(logging.ERROR)
    logging.getLogger("mpd").setLevel(logging.WARNING)
    runtime = Path(args.runtime_dir)
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock = (runtime / "bridge.lock").open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit("Another Yandex bridge is already running") from None
    bridge = MusicBridge(args.data_dir, args.runtime_dir, args.token_file)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    server.bridge = bridge
    def shutdown(*_):
        Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    bridge.player.start()
    logging.info("Yandex Music Python bridge listening on loopback:%s", args.port)
    try:
        server.serve_forever()
    finally:
        server.server_close()
        bridge.player.close()
        lock.close()


if __name__ == "__main__":
    main()
