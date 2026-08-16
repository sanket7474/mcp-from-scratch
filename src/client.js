// client.js - perform the MCP initialize handshake, then call demo methods
//
// This client demonstrates the full lifecycle from the client's perspective:
//   1. Prove that requests before initialize are rejected.
//   2. Send initialize and wait for the response.
//   3. Send notifications/initialized.
//   4. Call normal methods once the session is READY.
//
// Run with: node src/client.js

import { spawn } from 'child_process';
import { createFramer } from './core/framing.js';
import {
  encodeRequest,
  encodeNotification,
  decode,
  MessageType,
} from './core/jsonrpc.js';
import { fileURLToPath } from "node:url";
import { Session, PROTOCOL_VERSION } from './util/session.js';


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


// ─── Session + pending requests ───────────────────────────────────────────────
const session = new Session('client');
const pending = new Map(); // Maps request IDs to {resolve, reject} for pending requests.
let nextId = 1; // Incrementing request ID for each new request.


// ─── Session + pending requests ───────────────────────────────────────────────


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
    return;
  }

  if (msg.type === MessageType.Notification) {
    console.log('[client] received notification:', msg.method, msg.params);
  }
  // Server-sent notifications are covered in module 10.
});
/**
 * Send a request without enforcing client session rules.
 * Used to prove the server rejects messages the client should not send.
 */
function sendUnchecked(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(encodeRequest(id, method, params));
  });
}

function send(method, params = {}) {
  if (!session.canSendRequest(method)) {
    return Promise.reject(
      new Error(`Cannot send ${method} in state ${session.state}`)
    );
  }

  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(encodeRequest(id, method, params));
    if (method === 'initialize') {
      session.onInitializeSent();
    }
  });
}

function notify(method, params = {}) {
  const req = encodeNotification(method, params);
  child.stdin.write(req);
}

// ─── Handshake ────────────────────────────────────────────────────────────────

async function handshake() {
  console.log('[client] starting MCP handshake\n');

  // 1. Request before initialize - server must reject it.
  // We bypass client-side guards so the server is what rejects us.
  try {
    await sendUnchecked('echo', { message: 'too early' });
    console.log('echo before init → unexpected success');
  } catch (err) {
    console.log('echo before init → rejected (expected):', err.message);
  }

  // 2. initialize request
  const initResult = await send('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: {
      name: 'mcp-from-scratch-client',
      version: '0.1.0',
    },
  });
  session.onInitializeResultReceived(initResult);

  console.log('\ninitialize →');
  console.log('  protocolVersion:', initResult.protocolVersion);
  console.log('  serverInfo:     ', initResult.serverInfo);
  console.log('  capabilities:   ', JSON.stringify(initResult.capabilities));

  // 3. notifications/initialized - client tells server we are ready.
  notify('notifications/initialized', {});
  session.onInitializedNotification();

  console.log('\n[client] handshake complete, session state:', session.state);
}


// ─── Display tool results ─────────────────────────────────────────────────────

function printCallResult(toolName, args, result) {
  const blocks = result.content ?? [];
  const isError = result.isError === true;

  console.log(`  tools/call → ${toolName}`);
  console.log(`    arguments: ${JSON.stringify(args)}`);
  console.log(`    isError:   ${isError}`);

  for (const block of blocks) {
    if (block.type === 'text') {
      console.log(`    text:      ${block.text}`);
    } else {
      console.log(`    content:   ${JSON.stringify(block)}`);
    }
  }
  console.log();
}

function previewText(text, maxLen = 120) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

function printReadResult(label, result) {
  const contents = result.contents ?? [];

  console.log(`  ${label}`);
  for (const block of contents) {
    console.log(`    uri:      ${block.uri}`);
    if (block.mimeType) {
      console.log(`    mimeType: ${block.mimeType}`);
    }
    if (typeof block.text === 'string') {
      console.log(`    text:     ${previewText(block.text)}`);
    } else if (typeof block.blob === 'string') {
      console.log(`    blob:     (${block.blob.length} base64 chars)`);
    }
  }
  console.log();
}

function printResources(result) {
  const resources = result.resources ?? [];

  console.log(`\n[client] resources/list → ${resources.length} resource(s)\n`);

  for (const resource of resources) {
    console.log(`  • ${resource.uri}`);
    console.log(`    name:        ${resource.name}`);
    if (resource.title) {
      console.log(`    title:       ${resource.title}`);
    }
    if (resource.description) {
      console.log(`    description: ${resource.description}`);
    }
    if (resource.mimeType) {
      console.log(`    mimeType:    ${resource.mimeType}`);
    }
    console.log();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await handshake();

  console.log('\n--- requests after handshake ---\n');

  try {
    const toolsList = await send('tools/list', {});
    console.log('tools/list →', JSON.stringify(toolsList));
  } catch (err) {
    console.error('tools/list error:', err);
  }

   const calls = [

    { name: 'echo',     arguments: { message: 'hello from MCP' } },
    { name: 'getTime', arguments: {} },
  ];

  for (const params of calls) {
    try {
      const result = await send('tools/call', params);
      printCallResult(params.name, params.arguments, result);
    } catch (err) {
      console.error(`  tools/call → ${params.name} failed:`, err.message ?? err);
      console.log();
    }
  }

  console.log("------------------------ Resources --------------------------------");

  try {

    const resources = await send('resources/list', {});
    printResources(resources);
  } catch(err) {
    console.log('resource/list error: ', err)
  }


  console.log('\n[client] done, closing connection');
  session.close();
  child.stdin.end();
}

main().catch((err) => {
  console.error('[client] unhandled error:', err);

});