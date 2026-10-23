# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
import http.client
from http.server import ThreadingHTTPServer
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
from threading import Thread
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).parents[1]))
from yandex_audio import AudioCache, byte_range
from yandex_client import ApiError

spec = importlib.util.spec_from_file_location("wave_yandex_http", Path(__file__).parents[1] / "yandex-music.py")
yandex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(yandex)


def response(body=b"audio-data", status=200, **headers):
    result = MagicMock(status_code=status, headers={"Content-Length": str(len(body)), **headers})
    result.__enter__.return_value = result
    result.iter_content.return_value = [body]
    return result


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.catalog = Mock()
        self.catalog.direct_link.return_value = "https://cdn.storage.yandex.net/get-mp3/signed-token"
        self.fetch = Mock(return_value=response())
        self.audio = AudioCache(self.temp.name, self.catalog, self.fetch)

    def test_download_is_private_complete_and_cached(self):
        path = self.audio.prepare("123")
        self.assertEqual(path.read_bytes(), b"audio-data")
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        self.audio.prepare("123")
        self.catalog.direct_link.assert_called_once_with("123")
        self.assertEqual(len(list(Path(self.temp.name).glob("*.part"))), 0)

    def test_incomplete_or_empty_audio_never_enters_cache(self):
        for reply in (response(b"short", **{"Content-Length": "1000"}), response(b""), response(status=403)):
            self.fetch.return_value = reply
            with self.subTest(reply=reply), self.assertRaises(ApiError):
                self.audio.prepare("123")
            self.assertFalse((Path(self.temp.name) / "123.mp3").exists())
            self.assertEqual(list(Path(self.temp.name).glob("*.part")), [])

    def test_network_exception_never_leaks_signed_url(self):
        self.fetch.side_effect = requests.RequestException("https://signed.example/secret-token")
        with self.assertRaises(ApiError) as caught:
            self.audio.prepare("123")
        self.assertNotIn("secret-token", str(caught.exception))

    def test_redirect_cannot_fetch_a_local_or_non_yandex_address(self):
        self.fetch.return_value = response(status=302, Location="http://127.0.0.1/private")
        with self.assertRaises(ApiError):
            self.audio.prepare("123")
        self.assertEqual(self.fetch.call_count, 1)
        self.catalog.direct_link.return_value = "https://attacker.example/file"
        with self.assertRaises(ApiError):
            self.audio.prepare("456")
        self.assertEqual(self.fetch.call_count, 1)

    def test_cache_is_bounded_and_an_open_file_survives_eviction(self):
        self.fetch.side_effect = lambda *_args, **_kw: response(b"1234")
        self.audio.max_bytes = 8
        first = self.audio.prepare("1")
        with self.audio.open("1") as stream:
            os.utime(first, (1, 1))
            self.audio.prepare("2")
            self.audio.prepare("3")
            self.assertFalse(first.exists())
            self.assertEqual(stream.read(), b"1234")
        self.assertLessEqual(sum(p.stat().st_size for p in Path(self.temp.name).glob("*.mp3")), 8)

    def test_file_count_remains_bounded_after_a_system_clock_correction(self):
        self.fetch.side_effect = lambda *_args, **_kw: response(b"1234")
        for tid in range(1, 9):
            path = self.audio.prepare(str(tid))
            os.utime(path, (4_000_000_000, 4_000_000_000))
        self.audio.prepare("9")
        self.assertEqual(len(list(Path(self.temp.name).glob("*.mp3"))), 8)
        self.assertTrue((Path(self.temp.name) / "9.mp3").exists())

    def test_download_size_is_bounded_from_headers_and_streamed_bytes(self):
        for headers in ({"Content-Length": "6"}, {}, {"Content-Length": "5"}):
            reply = response()
            reply.headers = headers
            reply.iter_content.return_value = [b"123", b"456"]
            self.fetch.return_value = reply
            with self.subTest(headers=headers), patch("yandex_audio.MAX_TRACK_BYTES", 5):
                with self.assertRaises(ApiError) as caught:
                    self.audio.prepare("123")
                self.assertEqual(caught.exception.status, 502 if headers.get("Content-Length") == "6" else 504)
                self.assertEqual(list(Path(self.temp.name).iterdir()), [])

    def test_identifier_cannot_escape_cache_directory(self):
        for value in ("../token", "123/../../token", "1\nclear", ""):
            with self.subTest(value=value), self.assertRaises(ApiError):
                self.audio.prepare(value)
        self.fetch.assert_not_called()

    def test_range_forms(self):
        self.assertEqual(byte_range(None, 100), (0, 99, False))
        self.assertEqual(byte_range("bytes=10-19", 100), (10, 19, True))
        self.assertEqual(byte_range("bytes=90-", 100), (90, 99, True))
        self.assertEqual(byte_range("bytes=-10", 100), (90, 99, True))
        self.assertEqual(byte_range("bytes=10-1000", 100), (10, 99, True))
        for value in ("bytes=100-", "bytes=20-10", "bytes=-0", "bytes=-", "bytes=0-1,3-4", "other=0-5"):
            with self.subTest(value=value), self.assertRaises(ApiError):
                byte_range(value, 100)


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.catalog = Mock()
        self.audio = AudioCache(self.temp.name, self.catalog)
        (Path(self.temp.name) / "123.mp3").write_bytes(b"0123456789")
        self.bridge = SimpleNamespace(audio=self.audio, dispatch=Mock(return_value={"backend": "python"}))
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), yandex.Handler)
        self.server.bridge = self.bridge
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.shutdown)

    def shutdown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, path, body, headers or {})
        result = connection.getresponse()
        payload = result.read()
        code, response_headers = result.status, dict(result.getheaders())
        connection.close()
        return code, response_headers, payload

    def test_full_range_suffix_and_head_audio(self):
        code, headers, body = self.request("GET", "/yandex/stream/123")
        self.assertEqual((code, body), (200, b"0123456789"))
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        code, headers, body = self.request("GET", "/yandex/stream/123", headers={"Range": "bytes=3-6"})
        self.assertEqual((code, body), (206, b"3456"))
        self.assertEqual(headers["Content-Range"], "bytes 3-6/10")
        code, headers, body = self.request("HEAD", "/yandex/stream/123", headers={"Range": "bytes=-2"})
        self.assertEqual((code, body), (206, b""))
        self.assertEqual(headers["Content-Length"], "2")
        self.catalog.direct_link.assert_not_called()

    def test_unsatisfiable_range_has_a_valid_content_range(self):
        code, headers, body = self.request("GET", "/yandex/stream/123", headers={"Range": "bytes=99-"})
        self.assertEqual(code, 416)
        self.assertEqual(headers["Content-Range"], "bytes */10")
        self.assertEqual(body, b"")

    def test_api_requires_proxy_header_and_json_object(self):
        payload = json.dumps({"action": "get_state", "params": {}, "method": "GET"})
        code, _, _ = self.request("POST", "/api", payload, {"Content-Type": "application/json"})
        self.assertEqual(code, 403)
        self.bridge.dispatch.assert_not_called()
        headers = {"Content-Type": "application/json", "X-Wave-Proxy": "1"}
        code, _, body = self.request("POST", "/api", payload, headers)
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body), {"backend": "python"})
        for body in ("[]", "not json", '{"action":3}'):
            code, _, _ = self.request("POST", "/api", body, headers)
            self.assertEqual(code, 400)

    def test_unknown_stream_does_not_reach_an_upstream_host(self):
        for path in ("/token", "/yandex/stream/../../token", "/yandex/stream/not-a-number", "/api"):
            code, _, _ = self.request("GET", path)
            self.assertEqual(code, 404)
        self.catalog.direct_link.assert_not_called()


if __name__ == "__main__":
    unittest.main()
