// session.js - MCP session state machine
//
// MCP is stateful. Before any tools, resources, or prompts can be used, the
// client and server complete a three-step handshake:
//
//   1. Client → Server:  initialize (request)
//   2. Server → Client:  initialize result (response)
//   3. Client → Server:  notifications/initialized (notification)
//
// Until step 3 completes, the session is not READY. The server must reject
// normal requests; the client must not send them.
//
// This module tracks that state explicitly so the rules are visible in code
// rather than buried in if-statements scattered across server.js and client.js.

export const SessionState = {
    CREATED: "CREATED", // connection open, handshake not started
    INITIALIZING: "INITIALIZING", // initialize exchanged, awaiting notifications/initialized
    READY: "READY", // handshake complete, normal operation allowed
    CLOSED: "CLOSED", // session ended
};

// ─── Protocol version ─────────────────────────────────────────────────────────

// This repository teaches spec version 2025-11-25. We also accept 2025-06-18
// so clients using the older string still connect during learning exercises.

export const PROTOCOL_VERSION = "2025-11-25";

export const SUPPORT_PROTOCOL_VERSIONS = [PROTOCOL_VERSION, "2025-11-18"];

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Tracks MCP lifecycle state for one side of a connection.
 *
 * @param {'server'|'client'} role - Which party owns this session object.
 */

export class Session {
    constructor(role = "server") {
        this.role = role;
        this.state = SessionState.CREATED;

        // Populated during initialize (both sides store what they learned).
        this.neogotiatedProtocolVersion = null;
        this.clientCapabilities = null;
        this.clientInfo = null;
        this.serverCapabilities = null;
        this.serverInfo = null;
    }

    // ─── Queries ────────────────────────────────────────────────────────────────

    isReady() {
        return this.state === SessionState.READY;
    }

    /**
     * Whether an incoming request may be handled right now.
     * Used by the server before dispatching to a handler.
     *
     * @param {string} method
     * @returns {boolean}
     */
    canAcceptRequests(method) {
        if (this.state === SessionState.CLOSED) return false;

        if (method === "ping") return true; // ping is always allowed

        if (this.role === "server") {
            switch (this.state) {
                case SessionState.CREATED:
                    return method === "initialize";
                case SessionState.INITIALIZING:
                    return false; // Waiting for the client's notifications/initialized - no other requests.

                case SessionState.READY:
                    return true; // Normal operation.
                default:
                    return false; // CLOSED or unknown state.
            }
        }
    }


    /**
     * Whether an incoming notification may be handled right now.
     *
     * @param {string} method
     * @returns {boolean}
     * 
     */
    canAcceptNotification(method) {
        if (this.state === SessionState.CLOSED) return false;

        if (this.role === 'server') {
            if (this.state === SessionState.INITIALIZING) {
                return method === 'notifications/initialized';
            }
            if (this.state === SessionState.READY) {
                return true;
            }
            return false;
        }

        return false;
    }

    /**
   * Whether the client may send a request in the current state.
   *
   * @param {string} method
   * @returns {boolean}
   */
    canSendRequest(method) {
        if (this.state === SessionState.CLOSED) return false;
        if (method === 'ping') return this.state !== SessionState.CLOSED;

        switch (this.state) {
            case SessionState.CREATED:
                return method === 'initialize';
            case SessionState.INITIALIZING:
                return false;
            case SessionState.READY:
                return true;
            default:
                return false;
        }
    }


    /**
    * Build a JSON-RPC error object for a rejected request.
    *
    * @param {string} method
    * @returns {{ code: number, message: string }}
    */
    rejectionForRequest(method) {
        if (this.state === SessionState.CLOSED) {
            return { code: -32600, message: 'Session closed' };
        }
        if (this.state === SessionState.CREATED && method !== 'initialize') {
            return { code: -32600, message: 'Server not initialized: send initialize first' };
        }
        if (this.state === SessionState.INITIALIZING) {
            return { code: -32600, message: 'Server not ready: waiting for notifications/initialized' };
        }
        return { code: -32600, message: `Request not allowed in state ${this.state}` };
    }

    // ─── Server transitions ─────────────────────────────────────────────────────

    /**
     * Server recieves an initialize request from the client. 
     * This is the first step of the handshake
     * .
     * @param {*} params 
     * @param {*} negocitaedVersion 
     * 
     */
    onInitializeRequest(params, negocitaedVersion) {

        if (this.state !== SessionState.CREATED) {
            throw { code: -32600, message: 'Initialize already called' };
        }

        this.negotiatedProtocolVersion = negocitaedVersion;
        this.clientCapabilities = params.capabilities ?? {};
        this.clientInfo = params.clientInfo ?? {};
        this.state = SessionState.INITIALIZING;
    }

    /**
     * Handle the notifications/initialized notification from the client.
     * This is second step of the handshake. The server is now ready to accept normal requests.
     */
    onInitializedNotification() {

        if (this.state !== SessionState.INITIALIZING) {
            throw { code: -32600, message: 'notifications/initialized received in invalid state' };
        }
        this.state = SessionState.READY;
    }

    close() {
        this.state = SessionState.CLOSED;
    }
    // ─── Client transitions ─────────────────────────────────────────────────────

    /** Client is about to send initialize. 
     * This is the first step of the handshake.
    */
    onInitializeSent() {
        if (this.state !== SessionState.CREATED) {
            throw { code: -32600, message: 'initialize sent in unexpected state ${this.state}' };
        }
        this.state = SessionState.INITIALIZING;
    }

    /**
     * Client receives the initialize result from the server. 
     * This is the second step of the handshake.
     * @param {*} result 
     */
    onInitializeResultReceived(result) {
        if (this.state !== SessionState.INITIALIZING) {
            throw new Error(`initialize result in unexpected state ${this.state}`);
        }
        this.negotiatedProtocolVersion = result.protocolVersion;
        this.serverCapabilities = result.capabilities ?? {};
        this.serverInfo = result.serverInfo ?? {};
        // Still INITIALIZING until we send notifications/initialized.
    }

    /**
     * Client sends the notifications/initialized notification to the server.
     * This is the third step of the handshake.
     */
    onInitializedNotificationSent() {
        if (this.state !== SessionState.INITIALIZING) {
            throw { code: -32600, message: 'notifications/initialized sent in unexpected state ${this.state}' };
        }
        this.state = SessionState.READY;
    }
}
// ─── Protocol negotiation ─────────────────────────────────────────────────────


export function negotiateProtocolVersion(clientVersion) {

    if (typeof clientVersion !== 'string' || clientVersion === '') {
        throw { code: -32602, message: 'Invalid params: protocolVersion is required' };
    }

    if (SUPPORT_PROTOCOL_VERSIONS.includes(clientVersion)) {
        return clientVersion;
    }

    throw { code: -32602, message: `Unsupported protocol version: ${clientVersion}`, data: { supportedVersions: SUPPORT_PROTOCOL_VERSIONS } };
}


