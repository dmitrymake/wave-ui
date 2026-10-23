# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Seekable MP3 cache in tmpfs. CDN credentials never enter MPD or the browser."""
from contextlib import contextmanager
import os
from pathlib import Path
from threading import Lock, RLock
import time
from urllib.parse import urlparse
import uuid

import requests

from yandex_client import ApiError, identifier

MAX_TRACK_BYTES = 32 * 1024 * 1024
MAX_CACHE_BYTES = 96 * 1024 * 1024


def byte_range(value, size):
    if not value:
        return 0, size - 1, False
    import re
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if not match or not any(match.groups()):
        raise ApiError(416, "Invalid audio range")
    left, right = match.groups()
    if not left:
        length = int(right)
        if length <= 0:
            raise ApiError(416, "Invalid audio range")
        start, end = max(0, size - length), size - 1
    else:
        start, end = int(left), min(int(right), size - 1) if right else size - 1
    if start >= size or start > end:
        raise ApiError(416, "Audio range is outside the track")
    return start, end, True


class AudioCache:
    def __init__(self, directory, catalog, fetch=None, max_bytes=MAX_CACHE_BYTES):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.catalog = catalog
        self.fetch = fetch or requests.get
        self.max_bytes = max_bytes
        self.lock = RLock()
        self.download_lock = Lock()  # also bounds concurrent tmpfs downloads
        for path in self.directory.glob("*.part"):
            path.unlink(missing_ok=True)

    @staticmethod
    def _validate_url(url):
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if parsed.scheme != "https" or not host.endswith((".yandex.net", ".yandex.ru", ".yandex.com")):
            raise ApiError(502, "Yandex returned an unsupported audio host")

    def _path(self, track_id):
        return self.directory / (identifier(track_id).split(":")[0] + ".mp3")

    def prepare(self, track_id):
        path = self._path(track_id)
        with self.download_lock:
            with self.lock:
                if path.exists() and path.stat().st_size:
                    path.touch()
                    return path
            url = self.catalog.direct_link(track_id)
            temporary = path.with_name(path.name + "." + uuid.uuid4().hex + ".part")
            started = time.monotonic()
            try:
                for _ in range(4):
                    self._validate_url(url)
                    response = self.fetch(url, stream=True, timeout=(5, 10), allow_redirects=False)
                    if response.status_code not in (301, 302, 303, 307, 308):
                        break
                    url = response.headers.get("Location", "")
                    response.close()
                else:
                    raise ApiError(502, "Too many Yandex audio redirects")
                with response:
                    if response.status_code != 200:
                        raise ApiError(502, "Yandex audio is temporarily unavailable")
                    expected = int(response.headers.get("Content-Length") or 0)
                    if expected > MAX_TRACK_BYTES:
                        raise ApiError(502, "Yandex audio exceeds the RAM cache limit")
                    size = 0
                    with temporary.open("xb") as stream:
                        os.chmod(temporary, 0o600)
                        for chunk in response.iter_content(64 * 1024):
                            size += len(chunk)
                            if size > MAX_TRACK_BYTES or time.monotonic() - started > 40:
                                raise ApiError(504, "Yandex audio download exceeded its limit")
                            stream.write(chunk)
                    if not size or (expected and size != expected):
                        raise ApiError(502, "Incomplete Yandex audio response")
                with self.lock:
                    temporary.replace(path)
                    self._prune(path)
                return path
            except (requests.RequestException, OSError, ValueError):
                # Never expose a requests exception: it can contain a signed URL.
                raise ApiError(502, "Could not cache Yandex audio") from None
            finally:
                temporary.unlink(missing_ok=True)

    def _prune(self, keep):
        files = sorted(self.directory.glob("*.mp3"), key=lambda p: p.stat().st_mtime)
        total = sum(path.stat().st_size for path in files)
        count = len(files)
        for path in files:
            if total <= self.max_bytes and count <= 8:
                break
            if path == keep:
                continue
            total -= path.stat().st_size
            count -= 1
            path.unlink(missing_ok=True)

    @contextmanager
    def open(self, track_id):
        self.prepare(track_id)
        with self.lock:
            # Once open, the fd remains valid even if another download evicts the file.
            stream = self._path(track_id).open("rb")
        try:
            yield stream
        finally:
            stream.close()
