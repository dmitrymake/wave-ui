# SPDX-License-Identifier: MIT
# Copyright (c) 2026 dmitrymake
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1]))
import youtube_solver as solver


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.worker = solver.SolverWorker()
        self.addCleanup(self.worker.close)
        self.popen = subprocess.Popen

    def fake_process(self, code):
        return lambda command, **kwargs: self.popen([sys.executable, "-u", "-c", code], **kwargs)

    def test_round_trips_share_a_process_and_close_reaps_it(self):
        code = "import sys,json\nfor line in sys.stdin:\n print(json.dumps({'type':'result','responses':[json.loads(line)]}),flush=True)"
        with patch.object(solver.subprocess, "Popen", self.fake_process(code)):
            first = json.loads(self.worker.exchange("runtime", '{"input":"one"}'))
            process = self.worker.process
            second = json.loads(self.worker.exchange("runtime", '{"input":"two"}'))
        self.assertIs(process, self.worker.process)
        self.assertEqual(first["responses"][0]["input"], "one")
        self.assertEqual(second["responses"][0]["input"], "two")
        self.worker.close()
        self.assertIsNotNone(process.poll())
        self.assertTrue(process.stdin.closed)
        self.assertTrue(process.stdout.closed)

    def test_timeout_kills_worker_and_next_request_can_restart(self):
        with patch.object(solver.subprocess, "Popen", self.fake_process("import time;time.sleep(10)")):
            with self.assertRaises(solver.JsChallengeProviderError):
                self.worker.exchange("runtime", "{}", timeout=0.05)
        self.assertIsNone(self.worker.process)
        code = "import sys\nfor line in sys.stdin:\n print('{\"type\":\"result\",\"responses\":[]}',flush=True)"
        with patch.object(solver.subprocess, "Popen", self.fake_process(code)):
            self.assertEqual(json.loads(self.worker.exchange("runtime", "{}"))["responses"], [])

    def test_bad_output_is_rejected_without_leaking_runtime_details(self):
        for code in ("print('secret-output',flush=True)", "print('{\"type\":\"error\",\"error\":\"secret-output\"}',flush=True)"):
            with self.subTest(code=code), patch.object(solver.subprocess, "Popen", self.fake_process(code)):
                with self.assertRaises(solver.JsChallengeProviderError) as error:
                    self.worker.exchange("runtime", "{}")
                self.assertNotIn("secret-output", str(error.exception))
                self.assertIsNone(self.worker.process)

    @unittest.skipUnless(shutil.which("deno"), "Deno integration runs on the moOde device")
    def test_cached_compilation_has_fresh_globals_and_accepts_solver_updates(self):
        packet = {
            "lib": "const lib = {};", "key": "version-one",
            "core": "function jsc(data){const result={};Function('_result',data.preprocessed_player)(result);return {type:'result',responses:[result.n()]};}",
            "data": {"preprocessed_player": "globalThis.counter=(globalThis.counter||0)+1;_result.n=()=>globalThis.counter;"},
        }
        for _ in range(3):
            output = json.loads(self.worker.exchange(shutil.which("deno"), json.dumps(packet)))
            self.assertEqual(output["responses"], [1])
        packet.update(key="version-two", core=packet["core"].replace("[result.n()]", "[result.n()+10]"))
        output = json.loads(self.worker.exchange(shutil.which("deno"), json.dumps(packet)))
        self.assertEqual(output["responses"], [11])
