#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Loopback-only YouTube Music API/audio bridge for Wave UI and MPD."""

import argparse
from collections import OrderedDict
from functools import partial
from http.cookiejar import Cookie
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import logging
import os
from pathlib import Path
import re
import shutil
import tempfile
from threading import RLock, Thread
import time
from urllib.parse import urlparse, parse_qs

import requests
from yt_dlp import YoutubeDL
from yt_dlp.extractor.youtube.jsc._builtin.ejs import EJSBaseJCP
from yt_dlp.utils import DownloadError
from ytmusicapi import YTMusic, setup
from ytmusicapi.exceptions import YTMusicServerError, YTMusicUserError
from ytmusicapi.models.content.enums import LikeStatus

from youtube_solver import warm_player_cache

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
BROWSE_ID = re.compile(r"^[A-Za-z0-9_-]{1,160}$")
DEFAULT_SETTINGS = {
    "hideAiKeywords": False,
    "aiKeywords": ["ai generated", "ai-generated", "ai music", "suno", "udio",
                   "нейросет", "ии музыка", "ии-музыка"],
    "blockedArtists": [],
}
MUTATIONS = {"save_auth", "disconnect", "save_settings", "rate_song", "prepare_track"}
AUDIO_CHUNK_SIZE = 1024 * 1024
# Upstream disables this cache because it has no rotation. Keep it bounded here
# so the Pi does not parse the entire YouTube player for every selected song.
EJSBaseJCP._ENABLE_PREPROCESSED_PLAYER_CACHE = True


def trim_player_cache(storage):
    directory = Path(storage) / "extractor-cache" / "challenge-solver"
    files = sorted(directory.glob("player*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in files[4:]:
        path.unlink(missing_ok=True)


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def valid_id(value, video=False):
    if not isinstance(value, str) or not (VIDEO_ID if video else BROWSE_ID).fullmatch(value):
        raise ApiError(400, "Invalid YouTube Music id")
    return value


def audio_byte_range(value, size):
    if not value:
        return 0, size - 1, 200
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()) or size <= 0:
        raise ApiError(416, "Unsupported byte range")
    start, end = match.groups()
    if not start:
        suffix = int(end)
        if suffix == 0:
            raise ApiError(416, "Invalid byte range")
        return max(0, size - suffix), size - 1, 206
    start, end = int(start), min(int(end), size - 1) if end else size - 1
    if start >= size or end < start:
        raise ApiError(416, "Invalid byte range")
    return start, end, 206


def atomic_json(path, data):
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=".wave-")
    try:
        with os.fdopen(fd, "w") as out:
            json.dump(data, out, ensure_ascii=False)
        os.replace(name, path)  # mkstemp creates mode 0600; never expose credentials in the web root.
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_json(path, default):
    try:
        with path.open() as source:
            data = json.load(source)
        return data if isinstance(data, dict) else default
    except (OSError, ValueError):
        return default


def parse_auth(value):
    if isinstance(value, str):
        if not value.strip() or len(value) > 65536:
            raise ApiError(400, "Paste browser.json or authenticated request headers")
        try:
            value = json.loads(value)
        except ValueError:
            try:
                value = json.loads(setup(headers_raw=value))
            except (YTMusicUserError, ValueError):
                raise ApiError(400, "Invalid browser headers") from None
    if not isinstance(value, dict):
        raise ApiError(400, "Browser authentication must be a JSON object")
    allowed = {"cookie", "authorization", "x-goog-authuser", "x-goog-pageid", "user-agent"}
    headers = {}
    for key, val in value.items():
        key = str(key).lower()
        if key in allowed:
            if not isinstance(val, str) or len(val) > 65536 or re.search(r"[\r\n\x00]", val):
                raise ApiError(400, "Invalid browser header value")
            headers[key] = val
    cookie = SimpleCookie()
    try:
        cookie.load(headers.get("cookie", ""))
    except CookieError:
        raise ApiError(400, "Invalid YouTube Music cookie header") from None
    if not (cookie.get("SAPISID") or cookie.get("__Secure-3PAPISID")):
        raise ApiError(400, "Headers must contain authenticated YouTube Music cookies")
    # ytmusicapi regenerates SAPISIDHASH on every request. The imported timestamp
    # must never become an expired bearer token, and client headers cannot change the origin.
    headers.update({"authorization": "SAPISIDHASH", "x-goog-authuser": headers.get("x-goog-authuser", "0"),
                    "origin": "https://music.youtube.com", "x-origin": "https://music.youtube.com",
                    "content-type": "application/json", "accept": "*/*"})
    if not re.fullmatch(r"\d{1,2}", headers["x-goog-authuser"]):
        raise ApiError(400, "Invalid Google account index")
    return headers


def validate_settings(data):
    if not isinstance(data, dict) or not isinstance(data.get("hideAiKeywords"), bool):
        raise ApiError(400, "Invalid filter settings")
    result = {"hideAiKeywords": data["hideAiKeywords"]}
    for key in ("aiKeywords", "blockedArtists"):
        items = data.get(key)
        if not isinstance(items, list) or len(items) > 200:
            raise ApiError(400, "Use up to 200 filter entries")
        if any(not isinstance(item, str) or len(item) > 200 or re.search(r"[\r\n\x00]", item) for item in items):
            raise ApiError(400, "Invalid filter entry")
        result[key] = list(dict.fromkeys(item.strip() for item in items if item.strip()))
    return result


def image_url(item):
    images = item.get("thumbnails") or item.get("thumbnail") or []
    if isinstance(images, dict):
        images = images.get("thumbnails", [])
    images = [image for image in images if isinstance(image, dict) and isinstance(image.get("url"), str)]
    if not images:
        return None
    url = max(images, key=lambda image: image.get("width") or 0)["url"]
    return url if url.startswith("https://") else None


def artists(item):
    values = item.get("artists") or item.get("author") or []
    if isinstance(values, dict):
        values = [values]
    if isinstance(values, str):
        values = [{"name": values}]
    return [value for value in values if isinstance(value, dict)]


def duration(item):
    value = item.get("duration_seconds") or item.get("lengthSeconds")
    try:
        if value is not None:
            return max(0, int(value))
        parts = str(item.get("duration") or item.get("length") or "0").split(":")
        seconds = 0
        for part in parts:
            seconds = seconds * 60 + int(part)
        return max(0, seconds)
    except (ValueError, TypeError):
        return 0


def is_filtered(item, settings):
    people = artists(item)
    names = {str(value.get("name") or "").casefold() for value in people}
    ids = {str(value.get("id") or "").casefold() for value in people}
    if item.get("resultType") == "artist" or str(item.get("browseId", "")).startswith("UC"):
        names.add(str(item.get("artist") or item.get("title") or "").casefold())
        ids.add(str(item.get("browseId") or "").casefold())
    if any(entry.casefold() in names | ids for entry in settings["blockedArtists"]):
        return True
    # This is an explicit text filter, not a claim to detect synthetic audio.
    text = " ".join([str(item.get("title") or ""), str(item.get("description") or ""), *names]).casefold()
    def matches(word):
        word = word.casefold()
        # Match Latin words at word boundaries: "udio" must not hide "studio".
        if re.fullmatch(r"[a-z0-9 -]+", word):
            return re.search(r"(?<!\w)" + re.escape(word) + r"(?!\w)", text) is not None
        return word in text
    return settings["hideAiKeywords"] and any(matches(word) for word in settings["aiKeywords"])


def runtime_info():
    for name, minimum in (("deno", (2, 3)), ("node", (22, 0))):
        path = shutil.which(name)
        if path:
            import subprocess
            try:
                result = subprocess.run([path, "--version"], capture_output=True, text=True, timeout=3)
                match = re.search(r"(\d+)\.(\d+)", result.stdout)
                if result.returncode == 0 and match and tuple(map(int, match.groups())) >= minimum:
                    return name, path
            except (OSError, subprocess.TimeoutExpired):
                pass
    return None


class MusicBridge:
    def __init__(self, storage, port=8766, client_factory=None):
        self.storage = Path(storage)
        self.auth_file = self.storage / "browser.json"
        self.settings_file = self.storage / "settings.json"
        self.port = port
        self.lock = RLock()  # YTMusic's requests session/context are not thread safe.
        self.audio_lock = RLock()
        self.audio_jobs = {}
        self.client_factory = client_factory or self.make_client
        self.client = None
        self.headers = None
        self.meta = OrderedDict()
        self.audio_cache = OrderedDict()
        self.metadata_lock = RLock()
        self.runtime = runtime_info()
        self.settings = validate_settings(read_json(self.settings_file, DEFAULT_SETTINGS))

    def extractor_options(self):
        name, path = self.runtime
        return {"format": "bestaudio[ext=m4a]/bestaudio", "quiet": True, "no_warnings": True,
                "noplaylist": True, "socket_timeout": 15, "retries": 1,
                "cachedir": str(self.storage / "extractor-cache"),
                "extractor_args": {"youtube": {"player_skip": ["webpage"]}},
                "js_runtimes": {name: {"path": path}}, "logger": ExtractorLogger()}

    @staticmethod
    def make_client(headers):
        session = requests.Session()
        session.request = partial(session.request, timeout=(5, 20))
        return YTMusic(auth=headers, requests_session=session)

    def api(self):
        if self.client is None:
            headers = read_json(self.auth_file, None)
            if not headers:
                raise ApiError(401, "Connect YouTube Music in Settings")
            self.headers = headers
            self.client = self.client_factory(headers)
        return self.client

    def stream_url(self, video_id):
        return f"http://127.0.0.1:{self.port}/youtube/stream/{valid_id(video_id, video=True)}"

    def track(self, item):
        video_id = item.get("videoId")
        if not isinstance(video_id, str) or not VIDEO_ID.fullmatch(video_id) or item.get("isAvailable") is False:
            return None
        people = artists(item)
        album = item.get("album") or {}
        if not isinstance(album, dict):
            album = {"name": str(album)}
        track = {"id": video_id, "file": self.stream_url(video_id), "service": "youtube",
                 "title": item.get("title") or "Untitled", "artist": ", ".join(dict.fromkeys(p.get("name") or "" for p in people if p.get("name"))),
                 "album": album.get("name") or "", "albumId": album.get("id"),
                 "artistId": next((p.get("id") for p in people if p.get("id")), None),
                 "image": image_url(item), "time": duration(item), "genre": "", "track": "",
                 "liked": item.get("likeStatus") == "LIKE"}
        with self.metadata_lock:
            previous = self.meta.get(video_id)
            if previous and not track["time"]:
                track["time"] = previous.get("time") or 0
            self.meta[video_id] = track
            self.meta.move_to_end(video_id)
            while len(self.meta) > 1000:
                self.meta.popitem(last=False)
        return track

    def tracks(self, items):
        result, hidden = [], 0
        for item in items:
            track = self.track(item)
            if track:
                if is_filtered(item, self.settings):
                    hidden += 1
                else:
                    result.append(track)
        return result, hidden

    def card(self, item, kind=None):
        browse_id = item.get("browseId") or item.get("playlistId")
        kind = kind or item.get("resultType")
        if not kind:
            kind = "playlist" if item.get("playlistId") else "artist" if str(browse_id).startswith("UC") else "album"
        if kind == "artist":
            title = item.get("artist") or item.get("title") or "Artist"
        else:
            title = item.get("title") or "Untitled"
        if kind not in {"artist", "album", "playlist"} or not isinstance(browse_id, str) or not BROWSE_ID.fullmatch(browse_id):
            return None
        if kind == "playlist" and browse_id.startswith("VL"):
            browse_id = browse_id[2:]
        return {"id": browse_id, "title": title, "kind": kind, "image": image_url(item),
                "subtitle": ", ".join(p.get("name") or "" for p in artists(item)),
                "trackCount": item.get("count") or item.get("trackCount")}

    def get_meta(self, video_id):
        valid_id(video_id, video=True)
        with self.metadata_lock:
            cached = self.meta.get(video_id)
            if cached and cached.get("time"):
                return dict(cached)
        song = self.api().get_song(video_id).get("videoDetails") or {}
        if cached and song.get("lengthSeconds"):
            with self.metadata_lock:
                updated = {**cached, "time": duration(song)}
                self.meta[video_id] = updated
                return updated
        track = self.track({"videoId": video_id, "title": song.get("title"),
                            "artists": [{"name": song.get("author"), "id": song.get("channelId")}],
                            "lengthSeconds": song.get("lengthSeconds"), "thumbnail": song.get("thumbnail")})
        if not song or not track:
            raise ApiError(404, "YouTube Music track is unavailable")
        return track

    def dispatch(self, action, params, method="GET"):
        if action in MUTATIONS and method != "POST":
            raise ApiError(405, "This action requires POST")
        if action == "prepare_track":
            # Browsing/favorites use the YTMusic session lock. Audio preparation
            # must not wait behind those library requests.
            video_id = valid_id(params.get("id"), video=True)
            audio = self.audio(video_id)
            return {"status": "ok", "track": audio.get("track")}
        with self.lock:
            try:
                return self._dispatch(action, params)
            except YTMusicServerError as error:
                code = re.search(r"HTTP (\d{3})", str(error))
                status = int(code[1]) if code else 502
                if status in (401, 403):
                    self.client = None
                    raise ApiError(401, "YouTube Music session expired; reconnect in Settings") from None
                raise ApiError(429 if status == 429 else 502, "YouTube Music request failed; try again") from None
            except requests.RequestException:
                raise ApiError(502, "Could not reach YouTube Music") from None
            except YTMusicUserError:
                raise ApiError(400, "YouTube Music rejected this request") from None

    def _dispatch(self, action, params):
        if action == "get_settings":
            return self.settings
        if action == "save_settings":
            settings = validate_settings(params)
            atomic_json(self.settings_file, settings)
            self.settings = settings
            return settings
        if action == "disconnect":
            self.auth_file.unlink(missing_ok=True)
            self.client = self.headers = None
            self.meta.clear()
            with self.audio_lock:
                self.audio_cache.clear()
            return {"status": "ok"}
        if action == "save_auth":
            headers = parse_auth(params.get("auth"))
            client = self.client_factory(headers)
            try:
                account = client.get_account_info()
            except (KeyError, YTMusicUserError):
                raise ApiError(401, "Browser session is not signed in to YouTube Music") from None
            if not account.get("accountName"):
                raise ApiError(401, "Browser session is not signed in to YouTube Music")
            atomic_json(self.auth_file, headers)
            self.headers, self.client = headers, client
            self.meta.clear()
            with self.audio_lock:
                self.audio_cache.clear()
            return {"authorized": True, "accountName": account["accountName"], "playbackReady": self.runtime is not None}
        if action == "status":
            if not self.auth_file.exists():
                return {"authorized": False, "playbackReady": self.runtime is not None}
            try:
                account = self.api().get_account_info()
            except KeyError:
                raise ApiError(401, "YouTube Music session expired; reconnect in Settings") from None
            return {"authorized": bool(account.get("accountName")), "accountName": account.get("accountName"),
                    "playbackReady": self.runtime is not None}
        if action == "get_meta":
            return self.get_meta(params.get("id"))
        if action == "batch_get_meta":
            ids = params.get("ids")
            if not isinstance(ids, list) or len(ids) > 50:
                raise ApiError(400, "Request up to 50 track ids")
            for video_id in ids:
                valid_id(video_id, video=True)
            result = {}
            for video_id in ids:
                try:
                    result[video_id] = self.get_meta(video_id)
                except ApiError as error:
                    if error.status != 404:
                        raise
                    result[video_id] = None
            return result
        api = self.api()
        if action == "search":
            query = params.get("query", "")
            if not isinstance(query, str) or len(query) > 300:
                raise ApiError(400, "Invalid search query")
            filter_type = params.get("filter", "songs")
            if filter_type not in {"songs", "albums", "artists", "playlists", "videos"}:
                raise ApiError(400, "Invalid search filter")
            items = api.search(query, filter=filter_type, limit=40) if query.strip() else []
            tracks, hidden = self.tracks(items)
            cards = [self.card(item) for item in items if not item.get("videoId") and not is_filtered(item, self.settings)]
            return {"tracks": tracks, "cards": [card for card in cards if card], "hiddenCount": hidden}
        if action == "get_home":
            sections = []
            for row in api.get_home(limit=6):
                items = row.get("contents") or []
                tracks, hidden = self.tracks(items)
                cards = [self.card(item) for item in items if not item.get("videoId") and not is_filtered(item, self.settings)]
                sections.append({"title": row.get("title") or "Recommendations", "tracks": tracks,
                                 "cards": [card for card in cards if card], "hiddenCount": hidden})
            return {"sections": sections}
        if action == "get_playlists":
            items = api.get_library_playlists(limit=100)
            cards = [self.card(item, "playlist") for item in items if not is_filtered(item, self.settings)]
            return {"cards": [card for card in cards if card]}
        if action == "get_favorites_ids":
            items = api.get_liked_songs(limit=None).get("tracks") or []
            return {"ids": [item["videoId"] for item in items if VIDEO_ID.fullmatch(item.get("videoId") or "")]}
        if action == "get_playlist":
            playlist_id = valid_id(params.get("id"))
            try:
                offset = int(params.get("offset", 0))
            except (ValueError, TypeError):
                raise ApiError(400, "Invalid playlist offset") from None
            if not 0 <= offset <= 10000:
                raise ApiError(400, "Playlist offset is out of range")
            end = offset + 50
            data = api.get_playlist(playlist_id, limit=end + 1)
            raw = data.get("tracks") or []
            tracks, hidden = self.tracks(raw[offset:end])
            return {"title": data.get("title") or "Playlist", "image": image_url(data),
                    "tracks": tracks, "cards": [], "hiddenCount": hidden,
                    "nextOffset": end, "hasMore": len(raw) > end, "trackCount": data.get("trackCount")}
        if action == "get_album":
            data = api.get_album(valid_id(params.get("id")))
            # Album rows often omit the album/artist fields that their header supplies.
            raw = [{**item, "album": {"name": data.get("title"), "id": params["id"]},
                    "artists": item.get("artists") or data.get("artists") or []} for item in data.get("tracks") or []]
            tracks, hidden = self.tracks(raw)
            return {"title": data.get("title") or "Album", "image": image_url(data),
                    "tracks": tracks, "cards": [], "hiddenCount": hidden}
        if action == "get_artist":
            data = api.get_artist(valid_id(params.get("id")))
            owner = {"name": data.get("name") or "", "id": params["id"]}
            raw = [{**item, "artists": [*artists(item), owner] if not any(person.get("id") == owner["id"] for person in artists(item))
                    else artists(item)} for item in (data.get("songs") or {}).get("results") or []]
            tracks, hidden = self.tracks(raw)
            releases = ((data.get("albums") or {}).get("results") or []) + ((data.get("singles") or {}).get("results") or [])
            cards = [self.card(item, "album") for item in releases if not is_filtered(item, self.settings)]
            return {"title": data.get("name") or "Artist", "image": image_url(data), "tracks": tracks,
                    "cards": [card for card in cards if card], "hiddenCount": hidden}
        if action in {"get_radio", "get_lyrics"}:
            data = api.get_watch_playlist(videoId=valid_id(params.get("id"), video=True), limit=50, radio=action == "get_radio")
            if action == "get_lyrics":
                return (api.get_lyrics(data["lyrics"]) if data.get("lyrics") else None) or {"lyrics": None, "source": None}
            tracks, hidden = self.tracks(data.get("tracks") or [])
            return {"title": "Track radio", "tracks": tracks, "cards": [], "hiddenCount": hidden}
        if action == "rate_song":
            rating = params.get("rating")
            if rating not in {"LIKE", "INDIFFERENT", "DISLIKE"}:
                raise ApiError(400, "Invalid song rating")
            api.rate_song(valid_id(params.get("id"), video=True), LikeStatus(rating))
            if params["id"] in self.meta:
                self.meta[params["id"]]["liked"] = rating == "LIKE"
            return {"status": "ok"}
        raise ApiError(400, "Unknown YouTube Music action")

    def audio(self, video_id, refresh=False):
        valid_id(video_id, video=True)
        auth_headers = read_json(self.auth_file, None)
        if not auth_headers:
            raise ApiError(401, "Connect YouTube Music in Settings")
        if not self.runtime:
            raise ApiError(503, "Playback needs Deno >= 2.3 or Node.js >= 22 on the moOde device")
        with self.audio_lock:
            cached = self.audio_cache.get(video_id)
            if cached and cached["expires"] > time.monotonic() and not refresh:
                return cached
            job = self.audio_jobs.setdefault(video_id, RLock())
        with job:
            # Requests for the same track share one extraction. Ready tracks
            # remain available while another track is being prepared.
            with self.audio_lock:
                cached = self.audio_cache.get(video_id)
                if cached and cached["expires"] > time.monotonic() and not refresh:
                    return cached
            with YoutubeDL(self.extractor_options()) as downloader:
                cookies = SimpleCookie()
                cookies.load(auth_headers["cookie"])
                for key, morsel in cookies.items():
                    downloader.cookiejar.set_cookie(Cookie(0, key, morsel.value, None, False, ".youtube.com", True,
                                                         True, "/", True, True, None, True, None, None, {}))
                watch_url = f"https://music.youtube.com/watch?v={video_id}"
                try:
                    info = downloader.extract_info(watch_url, download=False)
                except DownloadError:
                    # Some restricted videos need data from the full watch page.
                    downloader.params["extractor_args"] = {}
                    info = downloader.extract_info(watch_url, download=False)
                if not info or not info.get("url") or info.get("vcodec") != "none":
                    raise ApiError(502, "No playable audio found for this track")
                url = urlparse(info["url"])
                if url.scheme != "https" or not (url.hostname or "").endswith(".googlevideo.com"):
                    raise ApiError(502, "Unsupported YouTube audio URL")
                try:
                    expires = int(parse_qs(url.query).get("expire", ["0"])[0])
                    ttl = max(30, min(3600, expires - time.time() - 120)) if expires else 1800
                except (TypeError, ValueError):
                    ttl = 1800
                with self.metadata_lock:
                    cached_meta = self.meta.get(video_id)
                    track = {**(cached_meta or {"id": video_id, "file": self.stream_url(video_id), "service": "youtube",
                             "title": info.get("track") or info.get("title") or "Untitled",
                             "artist": info.get("artist") or info.get("uploader") or "", "album": info.get("album") or "",
                             "image": info.get("thumbnail"), "genre": "", "track": ""}),
                             "time": int(info.get("duration") or (cached_meta or {}).get("time") or 0)}
                    self.meta[video_id] = track
                result = {"url": info["url"], "headers": info.get("http_headers") or {}, "track": track,
                          "size": info.get("filesize") or 0, "expires": time.monotonic() + ttl}
            with self.audio_lock:
                self.audio_cache[video_id] = result
                self.audio_cache.move_to_end(video_id)
                while len(self.audio_cache) > 100:
                    removed, _ = self.audio_cache.popitem(last=False)
                    self.audio_jobs.pop(removed, None)
            trim_player_cache(self.storage)
            return result


class ExtractorLogger:
    # Upstream debug/error messages may contain URLs, cookies or account details.
    def debug(self, message):
        pass

    def warning(self, message):
        pass

    def error(self, message):
        pass


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        pass

    def json_response(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def do_GET(self):
        if self.path.startswith("/youtube/stream/"):
            self.serve_audio()
        else:
            self.json_response(404, {"error": "Not found"})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        if self.path != "/api" or self.headers.get("X-Wave-Proxy") != "1":
            self.json_response(403, {"error": "Use the Wave UI API endpoint"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 131072:
                raise ApiError(413, "Request is too large")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict) or not isinstance(payload.get("params", {}), dict):
                raise ApiError(400, "Invalid request")
            data = self.server.bridge.dispatch(payload.get("action"), payload.get("params", {}), payload.get("method", "GET"))
            self.json_response(200, data)
        except ApiError as error:
            self.json_response(error.status, {"error": str(error)})
        except (ValueError, TypeError):
            self.json_response(400, {"error": "Invalid request"})
        except Exception as error:
            logging.warning("YouTube Music request failed (%s)", type(error).__name__)
            self.json_response(502, {"error": "YouTube Music request failed; reconnect or try again"})

    def serve_audio(self):
        response = None
        started = False
        try:
            video_id = valid_id(self.path.removeprefix("/youtube/stream/"), video=True)
            range_value = self.headers.get("Range")
            if range_value and (not re.fullmatch(r"bytes=\d*-\d*", range_value) or range_value == "bytes=-"):
                raise ApiError(416, "Unsupported byte range")
            audio = self.server.bridge.audio(video_id)

            def open_chunk(first, last):
                nonlocal audio
                for attempt in range(2):
                    headers = {**audio["headers"], "Accept-Encoding": "identity", "Range": f"bytes={first}-{last}"}
                    chunk = requests.get(audio["url"], headers=headers, stream=True, timeout=(10, 20))
                    if chunk.status_code != 403 or attempt > 0:
                        return chunk
                    chunk.close()
                    audio = self.server.bridge.audio(video_id, refresh=True)

            size = audio.get("size") or 0
            if not size:
                response = open_chunk(0, 0)
                total = re.fullmatch(r"bytes \d+-\d+/(\d+)", response.headers.get("Content-Range", ""))
                if response.status_code != 206 or not total:
                    raise ApiError(502, "YouTube audio does not support seeking")
                size = int(total[1])
                response.close()
                response = None
            first, last, status = audio_byte_range(range_value, size)
            # Open-ended requests are throttled by YouTube. Read bounded ranges
            # while exposing a complete, seekable response to MPD.
            response = open_chunk(first, min(last, first + AUDIO_CHUNK_SIZE - 1))
            if response.status_code != 206:
                raise ApiError(502, "YouTube audio is unavailable")
            self.send_response(status)
            self.send_header("Content-Type", response.headers.get("Content-Type", "audio/mp4"))
            self.send_header("Content-Length", str(last - first + 1))
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {first}-{last}/{size}")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True
            started = True
            if self.command != "HEAD":
                position = first
                retries = 0
                while position <= last:
                    chunk_end = min(last, position + AUDIO_CHUNK_SIZE - 1)
                    if response is None:
                        response = open_chunk(position, chunk_end)
                    expected = f"bytes {position}-{chunk_end}/{size}"
                    if response.status_code != 206 or response.headers.get("Content-Range") != expected:
                        raise ApiError(502, "YouTube returned an incomplete audio range")
                    previous = position
                    try:
                        for chunk in response.iter_content(65536):
                            if position + len(chunk) > chunk_end + 1:
                                raise ApiError(502, "Invalid YouTube audio range length")
                            self.wfile.write(chunk)
                            position += len(chunk)
                    except requests.RequestException:
                        pass  # Resume from the last byte delivered, without repeating AAC frames.
                    finally:
                        response.close()
                        response = None
                    if position <= chunk_end:
                        retries += 1
                        if retries > 2 or position == previous:
                            raise ApiError(502, "YouTube audio download was interrupted")
                    else:
                        retries = 0
        except (BrokenPipeError, ConnectionResetError):
            pass  # MPD skipped/seeks a track; stop reading the upstream response.
        except Exception as error:
            if not started:
                status = error.status if isinstance(error, ApiError) else 502
                message = str(error) if isinstance(error, ApiError) else "Could not stream YouTube audio"
                self.json_response(status, {"error": message})
            else:
                logging.warning("YouTube audio relay interrupted (%s)", type(error).__name__)
        finally:
            if response is not None:
                response.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--storage", default="/var/local/www/youtube-music")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.bridge = MusicBridge(args.storage, args.port)
    if server.bridge.runtime and server.bridge.runtime[0] == "deno":
        Thread(target=warm_player_cache, args=(server.bridge.extractor_options(),), daemon=True).start()
    server.serve_forever()


if __name__ == "__main__":
    main()
