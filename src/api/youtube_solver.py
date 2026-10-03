# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
"""Reuse the verified EJS solver in a permission-restricted Deno process."""

import atexit
import json
import os
from pathlib import Path
import selectors
import subprocess
from threading import RLock
import time
from urllib.parse import unquote

from yt_dlp import YoutubeDL
from yt_dlp.extractor.youtube.jsc._builtin.deno import DenoJCP
from yt_dlp.extractor.youtube.jsc._builtin.ejs import ScriptVariant
from yt_dlp.extractor.youtube.jsc._director import initialize_jsc_director
from yt_dlp.extractor.youtube.jsc.provider import (
    JsChallengeProviderError, register_preference, register_provider,
)

WORKER_SCRIPT = Path(__file__).with_name("youtube-solver.js")


class SolverWorker:
    def __init__(self):
        self.lock = RLock()
        self.process = None
        self.path = None

    def close(self):
        with self.lock:
            process, self.process = self.process, None
            if process is None:
                return
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
            process.stdin.close()
            process.stdout.close()

    def exchange(self, path, message, timeout=35):
        with self.lock:
            try:
                if self.process is None or self.process.poll() is not None or self.path != path:
                    self.close()
                    # No filesystem, network, environment or subprocess permissions.
                    self.process = subprocess.Popen(
                        [path, "run", *DenoJCP._DENO_BASE_OPTIONS, "--no-npm", "--cached-only", str(WORKER_SCRIPT)],
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                    )
                    self.path = path
                    os.set_blocking(self.process.stdin.fileno(), False)
                    os.set_blocking(self.process.stdout.fileno(), False)
                payload = memoryview(message.encode() + b"\n")
                output = bytearray()
                deadline = time.monotonic() + timeout
                with selectors.DefaultSelector() as selector:
                    selector.register(self.process.stdin, selectors.EVENT_WRITE)
                    selector.register(self.process.stdout, selectors.EVENT_READ)
                    while not output.endswith(b"\n"):
                        remaining = deadline - time.monotonic()
                        if remaining <= 0:
                            raise TimeoutError
                        for key, _ in selector.select(remaining):
                            if key.fileobj is self.process.stdin:
                                written = os.write(key.fd, payload[:65536])
                                payload = payload[written:]
                                if not payload:
                                    selector.unregister(key.fileobj)
                            else:
                                chunk = os.read(key.fd, 65536)
                                if not chunk:
                                    raise BrokenPipeError
                                output.extend(chunk)
                                if len(output) > 32 * 1024 * 1024:
                                    raise ValueError
                result = output.decode()
                if json.loads(result).get("type") != "result":
                    raise ValueError
                return result
            except (OSError, ValueError, TimeoutError):
                self.close()
                # The director retries unresolved challenges with upstream DenoJCP.
                raise JsChallengeProviderError("Reusable JavaScript solver unavailable", expected=True) from None


worker = SolverWorker()
atexit.register(worker.close)


@register_provider
class WaveDenoJCP(DenoJCP):
    PROVIDER_NAME = "wave-deno"
    PROVIDER_VERSION = "1.0.0"

    def is_available(self):
        return WORKER_SCRIPT.is_file() and super().is_available()

    def _construct_stdin(self, player, preprocessed, requests):
        # These properties perform upstream version/hash verification first.
        if self._lib_script.variant not in (ScriptVariant.MINIFIED, ScriptVariant.UNMINIFIED):
            raise JsChallengeProviderError("Reusable solver requires the packaged EJS library", expected=True)
        data = {"type": "preprocessed", "preprocessed_player": player} if preprocessed else {
            "type": "player", "player": player, "output_preprocessed": True,
        }
        data["requests"] = [{"type": request.type.value, "challenges": request.input.challenges} for request in requests]
        return json.dumps({"lib": self._lib_script.code, "core": self._core_script.code,
                           "key": self._lib_script.hash + self._core_script.hash, "data": data})

    def _run_js_runtime(self, stdin):
        return worker.exchange(self.runtime_info.path, stdin)


@register_preference(WaveDenoJCP)
def prefer_reusable_solver(provider, requests):
    return 2000


def warm_player_cache(options):
    """Compile the most recently used player while the bridge starts serving."""
    try:
        directory = Path(options["cachedir"]) / "challenge-solver"
        files = sorted(directory.glob("player*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not files:
            return
        with YoutubeDL(options) as downloader:
            provider = initialize_jsc_director(downloader.get_info_extractor("Youtube")).providers["WaveDeno"]
            if not provider.is_available():
                return
            for path in files[:2]:
                key = unquote(path.stem.replace(",", "%"))
                player = downloader.cache.load("challenge-solver", key)
                if isinstance(player, str) and player:
                    provider._run_js_runtime(provider._construct_stdin(player, True, []))
    except Exception:
        pass  # Warming is optional; normal extraction and upstream fallback remain available.
