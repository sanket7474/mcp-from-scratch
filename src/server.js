// server.js - MCP server with lifecycle handshake
//
// This is the first file in the course that implements real MCP behaviour.
// It still uses the stdio transport and JSON-RPC stack from modules 02–03,
// but now enforces the initialization sequence before handling anything else.
//
// Run via the client: node src/client.js
// Or manually:       node src/server.js

import { createFramer } from "./core/framing.js";
import { Dispatcher } from "./core/dispatcher.js";
import { decode, encodeError, MessageType } from "./core/jsonrpc.js";
import { ToolRegistry } from "./util/registry.js";

// ─── Server identity (returned in initialize) ─────────────────────────────────

// server info (returned in initialize). This is a static object for now, but in a real server it could be dynamic,
// e.g. based on package.json or runtime state.
const SERVER_INFO = {
  name: "mcp-demo",
  version: "0.1.0",
  description: "Demo MCP server from scratch",
};
import {
  Session,
  negotiateProtocolVersion,
  PROTOCOL_VERSION,
} from './util/session.js';
// server capabilities (returned in initialize). This is a static object for now,
// but in a real server it could be dynamic, e.g. based on config or runtime state.
const SERVER_CAPABILITIES = {
  tools: { listChanged: true },
};

// ─── Session + dispatcher ─────────────────────────────────────────────────────

const session = new Session("server");
const dispatcher = new Dispatcher();
const handlers = new Map(); // Maps request IDs to {resolve, reject} for pending requests.

dispatcher.onOutput = (line) => {
  process.stdout.write(line);
};

// ─── Lifecycle gatekeeper ─────────────────────────────────────────────────────
//
// The dispatcher knows nothing about MCP session state. We decode each line
// first, check whether the message is allowed in the current state, and only
// then forward to the dispatcher.

createFramer(process.stdin, async (line) => {
  let msg;
  try {
    msg = decode(line);
  } catch (err) {
    // If the JSON is invalid, send a ParseError response.
    await dispatcher.dispatch(line);
    return;
  }
  if (msg.type === MessageType.Request) {
    // Check if the request is allowed in the current session state.
    // If not, send an error response and do not forward to the dispatcher.
    if (!session.canAcceptRequests(msg.method)) {
      const err = session.rejectionForRequest(msg.method);
      const response = encodeError(msg.id, err.code, err.message);
      // Send the error response to the client.
      dispatcher.onOutput(response);
      return;
    }
  }

  if (msg.type === MessageType.Notification) {
    if (!session.canAcceptNotification(msg.method)) {
      // Notifications don't have an id, so we can't send a response.
      // Just ignore it.
      return;
    }
  }

  await dispatcher.dispatch(line);

});


process.stdin.on('end', () => {
  session.close();
  process.exit(0);
});

// ─── Tool registry ─────────────────────────────────────────────────────────────

const registry = new ToolRegistry();


function registerTool(defination, handler) {

  registry.register(defination);

  handlers.set(defination.name, handler)

}


registerTool(

  {
    name: "echo",
    title: "Echo Tool",
    description: "Simply return the message you send",

    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "The message to echo back" },
      },
      required: ["message"]
    }
  }
  ,
  (params) => {
    if (typeof params !== "object" || params === null) {
      throw { code: -32602, message: "Invalid params: params must be an object" };
    }
    if (!params.message || typeof params.message !== "string") {
      throw {
        code: -32602,
        message:
          "Invalid params: params must have a message property of type string",
      };
    }

    return textResult(params.message);
  })

registerTool(
  {
    name: "getTime",
    title: "Get Time Tool",
    description: "Return the current time",

    inputSchema: {
      type: "object",
      additionalProperties: false
    }
  },

  () => {
    return textResult(new Date().toISOString());
  }
)
// ─── MCP lifecycle handlers ───────────────────────────────────────────────────

dispatcher.register("initialize", async (params) => {
  const version = negotiateProtocolVersion(params.protocolVersion);

  session.onInitializeRequest(params, version);

  return {
    protocolVersion: version,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
});

// ─── MCP lifecycle handlers ───────────────────────────────────────────────────

dispatcher.register("initialize", async (params) => {
  const version = negotiateProtocolVersion(params.protocolVersion);

  session.onInitializeRequest(params, version);

  return {
    protocolVersion: version,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
  };
});

dispatcher.register("notifications/initialized", async () => {
  session.onInitializedNotification();
});

dispatcher.register("tools/call", async (params) => {
  if (!params) {
    throw { code: -32602, message: "Invalid params: params must be an object" };
  }

  if (!params.name || typeof params.name !== "string") {
    throw { code: -32602, message: "Invalid params: params must have a name property of type string" };
  }

  const handler = handlers.get(params?.name)
  const args = params?.arguments;

  if (!handler) {
    throw { code: -32602, message: `Invalid params: tool with name '${params.name}' not found` };
  }

  if (typeof args !== 'object' || Array.isArray(args)) {
    throw { code: -32602, message: 'Invalid params: arguments must be an object' };
  }

  try {

    const res = await handler(args);

    if (!res?.content || !Array.isArray(res.content)) {
      throw new Error(`Handler for "${name}" did not return a valid CallToolResult`);
    }

    return {
      content: res.content,
      isError: res.isError === true,
    };

  } catch (err) {
    if (typeof err?.code === 'number') {
      throw err;
    }
    const message = err?.message ?? 'Tool execution failed';
    return textResult(message, true);
  }


})

// ─── Other  Handlers ──────────────────────────────────────────────────────────────────

dispatcher.register("ping", async () => ({ reply: "pong" }));

dispatcher.register("echo", async (params) => {
  if (typeof params !== "object" || params === null) {
    throw { code: -32602, message: "Invalid params: params must be an object" };
  }
  if (!params.message || typeof params.message !== "string") {
    throw {
      code: -32602,
      message:
        "Invalid params: params must have a message property of type string",
    };
  }

  return { reply: params.message };
});

dispatcher.register("getTime", async () => {
  return { time: new Date().toISOString() };
});

dispatcher.register("tools/list", async () => {
  return { tools: registry.list() };
  if (!params.text || typeof params.text !== "string") {
    throw {
      code: -32602,
      message:
        "Invalid params: params must have a text property of type string",
    };
  }

  return { reply: params.text };
});

// ─── Tool result helper ───────────────────────────────────────────────────────
//
// MCP tool results are always shaped as { content: [...], isError?: boolean }.
// This helper keeps handlers focused on the payload, not the wire format.

/**
 * @param {string} text
 * @param {boolean} [isError]
 * @returns {{ content: object[], isError: boolean }}
 */
function textResult(text, isError = false) {
  return {
    content: [{ type: 'text', text }],
    isError,
  };
}