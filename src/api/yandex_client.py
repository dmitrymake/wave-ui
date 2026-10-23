# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Yandex Music SDK adapter. Only this module knows the upstream model shapes."""
from collections import OrderedDict
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import re
from threading import RLock
import uuid

from yandex_music import Client, SessionEvent
from yandex_music.exceptions import NetworkError, UnauthorizedError, YandexMusicError
from yandex_music.utils.request import Request


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".tmp")
    try:
        with open(temporary, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
            json.dump(value, stream, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def data(value):
    if isinstance(value, dict):
        return value
    return value.to_dict() if value is not None and hasattr(value, "to_dict") else {}


def identifier(value):
    value = str(value or "")
    if not re.fullmatch(r"\d{1,24}(?::\d{1,24})?", value):
        raise ApiError(400, "Invalid Yandex identifier")
    return value


def offset_value(value):
    try:
        result = int(value or 0)
    except (ValueError, TypeError):
        raise ApiError(400, "Invalid offset") from None
    if not 0 <= result <= 1_000_000:
        raise ApiError(400, "Invalid offset")
    return result


def cover_url(value):
    if not isinstance(value, str) or not value:
        return None
    value = value.replace("%%", "400x400")
    if value.startswith("//"):
        return "https:" + value
    if value.startswith(("https://", "http://")):
        return value
    return "https://" + value


def description_text(value):
    """The SDK's Description model is not the frontend's plain-text description."""
    if isinstance(value, str):
        return value
    text = data(value).get("text")
    return text if isinstance(text, str) else ""


def format_track(value):
    row = data(value)
    if not row or not row.get("id") or row.get("available") is False or row.get("error"):
        return None
    track_id = identifier(row["id"]).split(":")[0]
    if row.get("isYandex") is True:
        try:
            duration = float(row.get("time") or 0)
        except (ValueError, TypeError):
            raise ApiError(400, "Invalid track duration") from None
        if not math.isfinite(duration) or not 0 <= duration <= 86400:
            raise ApiError(400, "Invalid track duration")
        return {"id": track_id, "title": str(row.get("title") or "Unknown Title"),
                "artist": str(row.get("artist") or "Unknown Artist"), "album": str(row.get("album") or ""),
                "image": cover_url(row.get("image")), "time": duration,
                "file": "yandex:" + track_id, "isYandex": True, "service": "yandex"}
    albums = row.get("albums") or []
    artists = row.get("artists") or []
    album = data(albums[0]) if albums else {}
    return {"id": track_id, "title": row.get("title") or "Unknown Title",
            "artist": ", ".join(data(a).get("name", "") for a in artists) or "Unknown Artist",
            "album": album.get("title") or "", "file": "yandex:" + track_id,
            "image": cover_url(row.get("cover_uri") or row.get("og_image") or album.get("cover_uri")),
            "time": (row.get("duration_ms") or 0) / 1000, "isYandex": True, "service": "yandex"}


def format_album(value):
    row = data(value)
    return {"id": str(row.get("id", "")), "title": row.get("title") or "",
            "artist": ", ".join(data(a).get("name", "") for a in row.get("artists") or []),
            "image": cover_url(row.get("cover_uri")), "year": row.get("year"), "kind": "album"}


def format_playlist(value, uid=""):
    row = data(value)
    cover = data(row.get("cover"))
    items = cover.get("items_uri") or []
    return {"title": row.get("title") or "", "kind": str(row.get("kind", "")),
            "uid": str(data(row.get("owner")).get("uid") or row.get("uid") or uid),
            "cover": cover_url(cover.get("uri") or (items[0] if items else None)),
            "trackCount": row.get("track_count") or 0, "service": "yandex"}


class MetadataCache:
    """Bounded RAM-disk cache, including read compatibility with the old PHP cache."""
    def __init__(self, directory):
        self.path = Path(directory) / "bridge-meta.json"
        self.lock = RLock()
        saved = read_json(self.path, {})
        self.tracks = OrderedDict(saved if isinstance(saved, dict) else {})
        legacy = read_json(Path(directory) / "meta_cache.json", {})
        self.legacy = legacy if isinstance(legacy, dict) else {}

    def remember(self, tracks):
        with self.lock:
            for track in tracks:
                if track:
                    key = str(track["id"])
                    self.tracks[key] = track
                    self.tracks.move_to_end(key)
            while len(self.tracks) > 2000:
                self.tracks.popitem(last=False)
            atomic_json(self.path, self.tracks)

    @staticmethod
    def track_id(value):
        value = str(value or "").removeprefix("file://").strip()
        for pattern in (r"(\d{1,24})", r"yandex:(\d{1,24})",
                        r"/dev/shm/yandex_music/tracks/(\d{1,24})\.\w+",
                        r"http://127\.0\.0\.1:8767/yandex/stream/(\d{1,24})(?:\?[^\r\n]*)?"):
            match = re.fullmatch(pattern, value)
            if match:
                return match[1]
        return None

    def lookup(self, value):
        value = str(value or "").removeprefix("file://").strip()
        key = self.track_id(value) or ""
        with self.lock:
            track = self.tracks.get(key)
            if track:
                return dict(track)
            legacy = self.legacy.get(key) or self.legacy.get(hashlib.md5(value.encode()).hexdigest())
            return format_track(legacy) if legacy else None


class Catalog:
    def __init__(self, token_file, metadata, client_factory=None):
        self.token_file = Path(token_file)
        self.metadata = metadata
        self.lock = RLock()
        self.client_factory = client_factory or (lambda token: Client(token, request=Request(timeout=10)))
        self.client = None
        self.uid = ""

    @staticmethod
    def _upstream(function, *args, **kwargs):
        try:
            return function(*args, **kwargs)
        except UnauthorizedError:
            raise ApiError(401, "Yandex authorization expired; reconnect your account") from None
        except NetworkError:
            raise ApiError(502, "Yandex Music is temporarily unavailable") from None
        except YandexMusicError as error:
            # SDK exception text may contain response bodies or signed URLs.
            logging.warning("Yandex SDK request failed (%s)", type(error).__name__)
            raise ApiError(502, "Yandex Music rejected the request") from None

    def _connected(self):
        if self.client is None:
            try:
                token = self.token_file.read_text().strip()
            except OSError:
                token = ""
            if not token:
                raise ApiError(401, "Connect your Yandex Music account")
            client = self._upstream(self.client_factory(token).init)
            uid = str(getattr(client, "account_uid", "") or "")
            if not uid:
                raise ApiError(401, "Yandex token validation failed")
            self.client, self.uid = client, uid
        return self.client

    def call(self, method, *args, **kwargs):
        # The SDK client is shared, but not used concurrently by HTTP/refill/feedback threads.
        with self.lock:
            return self._upstream(getattr(self._connected(), method), *args, **kwargs)

    def status(self):
        with self.lock:
            if not self.token_file.exists() or not self.token_file.read_text().strip():
                return {"authorized": False}
            self._connected()
            return {"authorized": True}

    def save_token(self, token):
        if not isinstance(token, str) or not token.strip() or len(token) > 8192 or re.search(r"\s", token.strip()):
            raise ApiError(400, "Invalid token")
        with self.lock:
            candidate = self._upstream(self.client_factory(token.strip()).init)
            uid = str(getattr(candidate, "account_uid", "") or "")
            if not uid:
                raise ApiError(401, "Yandex token validation failed")
            self.token_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.token_file.with_name(self.token_file.name + "." + uuid.uuid4().hex)
            try:
                with open(temporary, "x", opener=lambda p, flags: os.open(p, flags, 0o600)) as stream:
                    stream.write(token.strip())
                temporary.replace(self.token_file)
            finally:
                temporary.unlink(missing_ok=True)
            self.client, self.uid = candidate, uid
            return uid

    def tracks(self, ids):
        if not ids:
            return []
        raw = self.call("tracks", [identifier(i) for i in ids])
        tracks = [t for item in raw if (t := format_track(item))]
        self.metadata.remember(tracks)
        return tracks

    def favorites(self):
        result = self.call("users_likes_tracks")
        if result is None:
            raise ApiError(502, "Yandex returned no favorites response")
        return [identifier(data(t)["id"]).split(":")[0] for t in result.tracks or []]

    def playlist_page(self, uid, kind, offset=0):
        offset = offset_value(offset)
        if kind == "favorites":
            ids = self.favorites()
            window = ids[offset:offset + 50]
            return self.tracks(window), offset + len(window), offset + len(window) < len(ids)
        result = self.call("users_playlists", identifier(kind), user_id=identifier(uid))
        if result is None:
            raise ApiError(502, "Yandex returned no playlist response")
        rows = result.tracks or []
        window = rows[offset:offset + 50]
        # Some playlist rows have only an id, others embed a complete Track.
        ids = [identifier(data(item).get("id") or data(data(item).get("track")).get("id")) for item in window]
        tracks = self.tracks(ids)
        by_id = {t["id"]: t for t in tracks}
        ordered = [by_id[i.split(":")[0]] for i in ids if i.split(":")[0] in by_id]
        return ordered, offset + len(window), offset + len(window) < len(rows)

    def search(self, query):
        if not isinstance(query, str) or len(query) > 1000:
            raise ApiError(400, "Invalid search query")
        if not query.strip():
            return {"tracks": [], "albums": [], "artists": []}
        result = self.call("search", query, type_="all")
        if result is None:
            raise ApiError(502, "Yandex returned no search response")
        rows = data(result)
        tracks = [t for row in data(rows.get("tracks")).get("results") or [] if (t := format_track(row))]
        self.metadata.remember(tracks)
        return {"tracks": tracks,
                "albums": [format_album(a) for a in data(rows.get("albums")).get("results") or []],
                "artists": [{"id": str(a["id"]), "title": a.get("name") or "", "kind": "artist",
                             "image": cover_url(data(a.get("cover")).get("uri"))}
                            for a in data(rows.get("artists")).get("results") or []]}

    def playlists(self):
        rows = self.call("users_playlists_list")
        return [{"title": "Favorites", "kind": "favorites", "uid": self.uid,
                 "cover": "https://music.yandex.ru/blocks/playlist-cover/playlist-cover_like.png",
                 "trackCount": "♥", "service": "yandex"}] + [format_playlist(p, self.uid) for p in rows]

    def landing(self):
        result = self.call("landing", ["personal-playlists"])
        if result is None:
            raise ApiError(502, "Yandex returned no landing response")
        playlists = []
        for block in data(result).get("blocks") or []:
            for entity in block.get("entities") or []:
                row = entity.get("data") or {}
                # personal-playlist is a generated-playlist wrapper whose nested
                # 'data' contains the actual Playlist, unlike ordinary entities.
                if entity.get("type") == "personal-playlist":
                    row = data(row.get("data"))
                if row.get("kind") is not None:
                    playlists.append(format_playlist(row, self.uid))
        return {"personal": playlists}

    def stations(self):
        result = self.call("rotor_wave_settings")
        if result is None:
            raise ApiError(502, "Yandex returned no wave settings")
        rows = data(result)
        stations = []
        for block in rows.get("blocks") or []:
            for row in block.get("items") or []:
                sid = data(row.get("id"))
                if not sid.get("type") or not sid.get("tag") or sid.get("tag") == "onyourwave":
                    continue
                stations.append({"title": row.get("name") or sid["tag"],
                                 "id": sid["type"] + ":" + sid["tag"], "kind": "station", "uid": "",
                                 "cover": cover_url(data(row.get("icon")).get("image_url")),
                                 "isStation": True, "service": "yandex"})
        restrictions = data(rows.get("setting_restrictions"))
        for group in ("mood_energy", "diversity", "language"):
            for value in data(restrictions.get(group)).get("possible_values") or []:
                seed = value.get("serialized_seed")
                if seed and not value.get("unspecified"):
                    stations.append({"title": value.get("name") or str(value["value"]),
                                     "id": "vibe:seed:" + seed, "kind": "station", "uid": "",
                                     "cover": cover_url(value.get("image_url")), "isStation": True,
                                     "service": "yandex"})
        return {"stations": stations}

    def artist(self, artist_id):
        artist_id = identifier(artist_id)
        info = data(self.call("artists_brief_info", artist_id))
        artist = data(info.get("artist"))
        tracks = data(self.call("artists_tracks", artist_id, page_size=50)).get("tracks") or []
        albums = data(self.call("artists_direct_albums", artist_id, page_size=50)).get("albums") or []
        clean = [t for row in tracks if (t := format_track(row))]
        self.metadata.remember(clean)
        return {"artist": {"name": artist.get("name"), "description": description_text(artist.get("description"))},
                "cover": cover_url(data(artist.get("cover")).get("uri")),
                "tracks": clean, "albums": [format_album(a) for a in albums]}

    def album(self, album_id):
        row = data(self.call("albums_with_tracks", identifier(album_id)))
        if not row:
            raise ApiError(404, "Album not found")
        tracks = [t for volume in row.get("volumes") or [] for item in volume if (t := format_track(item))]
        self.metadata.remember(tracks)
        album = format_album(row)
        return {"title": album["title"], "artist": album["artist"], "cover": album["image"],
                "year": album["year"], "tracks": tracks}

    def new_session(self, seeds, queue):
        result = self.call("rotor_session_new", seeds, queue=queue, include_tracks_in_response=True)
        if result is None or not result.radio_session_id:
            raise ApiError(502, "Yandex did not create a radio session")
        return self._batch(result, result.radio_session_id)

    def more(self, session_id, queue):
        result = self.call("rotor_session_tracks", session_id, queue=queue)
        if result is None:
            raise ApiError(502, "Yandex returned no radio response")
        if result.unknown_session or result.terminated:
            raise ApiError(409, "Yandex radio session expired")
        return self._batch(result, session_id)

    def _batch(self, result, session_id):
        entries = []
        for item in result.sequence or []:
            track = format_track(item.track)
            if track:
                entries.append({"track": track, "session_id": session_id, "batch_id": result.batch_id})
        self.metadata.remember([entry["track"] for entry in entries])
        return {"session_id": session_id, "batch_id": result.batch_id, "entries": entries}

    def feedback(self, event):
        with self.lock:
            self._connected()
            if event.get("owner") and event["owner"] != self.uid:
                raise ApiError(409, "Radio feedback belongs to another account")
            result = self.call("rotor_session_feedback", event["session_id"],
                               SessionEvent(event["type"], event["timestamp"], track_id=event.get("track_id"),
                                            total_played_seconds=event.get("played")),
                               batch_id=event.get("batch_id"))
            if not result:
                raise ApiError(502, "Yandex did not acknowledge radio feedback")

    def direct_link(self, track_id):
        with self.lock:
            raw = self.call("tracks", [identifier(track_id)])
            if not raw or raw[0].available is False:
                raise ApiError(404, "Track is unavailable")
            self.metadata.remember([format_track(raw[0])])
            options = self._upstream(raw[0].get_download_info)
            mp3 = [option for option in options if option.codec == "mp3"]
            if not mp3:
                raise ApiError(404, "No MP3 audio is available for this track")
            best = max(mp3, key=lambda option: option.bitrate_in_kbps or 0)
            return self._upstream(best.get_direct_link)
