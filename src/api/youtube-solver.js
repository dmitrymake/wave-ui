// SPDX-License-Identifier: MIT
// Copyright (c) 2026 dmitrymake
// Only public player code/challenges enter this worker. No account credentials.
import {Script, createContext, runInContext} from 'node:vm';

const compiledPlayers = new Map();
let solverScript;
let solverKey;
let pending = '';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const buffer = new Uint8Array(65536);
while (true) {
  const count = await Deno.stdin.read(buffer);
  if (count === null) break;
  pending += decoder.decode(buffer.subarray(0, count), {stream: true});
  if (pending.length > 32 * 1024 * 1024) throw new Error('Solver request exceeds limit');
  let end;
  while ((end = pending.indexOf('\n')) !== -1) {
    const line = pending.slice(0, end);
    pending = pending.slice(end + 1);
    let output;
    try {
      const message = JSON.parse(line);
      if (!solverScript || solverKey !== message.key) {
        compiledPlayers.clear();
        solverScript = new Script(message.lib + '\nObject.assign(globalThis, lib);\n' + message.core + '\njsc;');
        solverKey = message.key;
      }
      // YouTube modifies globals. Each request needs a new realm, even when
      // the player function itself is executed again with fresh arguments.
      const context = createContext({});
      const solver = solverScript.runInContext(context);
      const NativeFunction = runInContext('Function', context);
      context.Function = new Proxy(NativeFunction, {
        apply(target, receiver, args) {
          if (args.length !== 2 || args[0] !== '_result') return Reflect.apply(target, receiver, args);
          const code = args[1];
          let compiled = compiledPlayers.get(code);
          if (compiled) compiledPlayers.delete(code);
          else compiled = new Script('(function(_result){\n' + code + '\n})');
          compiledPlayers.set(code, compiled);
          if (compiledPlayers.size > 2) compiledPlayers.delete(compiledPlayers.keys().next().value);
          return compiled.runInContext(context);
        }
      });
      output = solver(message.data);
    } catch {
      compiledPlayers.clear();
      output = {type: 'error', error: 'JavaScript solver failed'};
    }
    const encoded = encoder.encode(JSON.stringify(output) + '\n');
    let written = 0;
    while (written < encoded.length) written += await Deno.stdout.write(encoded.subarray(written));
  }
}
