# MCP Demo

This repository is a minimal demo implementing a simple Model Context Protocol (MCP) stack in Node.js. It contains core framing, dispatch, and JSON-RPC components used by a basic server and client.

Status (current point)
- Core files live in src/ and implement framing, dispatching, and a small JSON-RPC layer.
- Example entry points: src/server.js and src/client.js (both currently run with `node` but earlier runs exited with code 1 — check the runtime logs when debugging).

Current files
- package.json
- src/
  - client.js
  - dispatcher.js
  - framing.js
  - jsonrpc.js
  - server.js
  - session.js


Quick start
1. Install dependencies (if any):

Status (current point)
- Core files live in src/ and implement framing, dispatching, and a minimal JSON-RPC layer.

Current files
- package.json
- src/
  - client.js
  - dispatcher.js
  - framing.js
  - jsonrpc.js
  - server.js
  - session.js

File descriptions
- `src/client.js`: Example client; establishes a transport to the server, sends requests and notifications, and prints responses. Useful as a runnable example of how the MCP client drives the protocol.
- `src/server.js`: Server entrypoint; accepts connections, wires the transport framing to the dispatcher, bootstraps session state, and registers message handlers.
- `src/dispatcher.js`: Core routing layer; inspects decoded messages and routes them to the correct handler or resolves pending requests. Manages request IDs, responses, and notification dispatch.
- `src/framing.js`: Wire framing utilities; implements message boundary detection (length-prefix, newline-delimited JSON, or similar), serialization and deserialization, and streaming concerns.
- `src/jsonrpc.js`: JSON-RPC helper layer; builds and validates JSON-RPC requests, notifications, responses, and error objects. Encapsulates protocol semantics above raw frames.
- `src/session.js`: Per-connection session manager; tracks client capabilities, outstanding calls, cancellation tokens, lifecycle events (init/shutdown), and per-session metadata.
