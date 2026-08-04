// client.js - spawn the server as a child process and exchange one ping over stdio
//
// Steps 1 and 4 of the transport story:
//   1. Write a JSON-RPC request line to the child's stdin.
//   4. Match the response line back to the request by id.
//
// Run with: node src/client.js

import { spawn }        from 'child_process';
import { createFramer } from './core/framing.js';
import {
  encodeRequest,
  decode,
  MessageType,
} from './core/jsonrpc.js';
import { fileURLToPath } from "node:url";
// ─── Spawn the server ─────────────────────────────────────────────────────────

const serverPath = fileURLToPath(
  new URL("./server.js", import.meta.url)
);
const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

child.on('exit', (code, signal) => {
  if (code !== 0 && code !== null) {
    console.error(`[client] server exited with code ${code}`);
  } else if (signal) {
    console.error(`[client] server killed by signal ${signal}`);
  }
});

// ─── Response tracking (step 4) ───────────────────────────────────────────────

const pending = new Map();
let nextId = 1;

createFramer(child.stdout, (line) => {
  let msg;
  try {
    msg = decode(line);
  } catch (err) {
    console.error('[client] could not decode response:', line, err);
    return;
  }

  if (msg.type === MessageType.Response) {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.resolve(msg.result);
    }
    return;
  }

  if (msg.type === MessageType.Error) {
    const entry = pending.get(msg.id);
    if (entry) {
      pending.delete(msg.id);
      entry.reject(msg.error);
    }
  }
  // Server-sent notifications are covered in module 10.
});

// ─── send() helper ────────────────────────────────────────────────────────────

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(encodeRequest(id, method, params));
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[client] spawning server…');

  try {
    const result = await send('echo', { text: 'Good Morning!' });
    console.log('ping →', result);
  } catch (err) {
    console.error('ping error:', err);
    process.exit(1);
  }

  console.log('[client] closing connection');
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);
  process.exit(1);
});