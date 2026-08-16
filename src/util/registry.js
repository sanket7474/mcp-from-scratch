/**
 * registry.js - store MCP tool definitions and provide lookup by name.
 *  
 * A tool has two parts that live in different places:
 * 
 *  1. Definition: name, description, inputSchema. This is what client see
 *     when they call tools/list. It tells the the model what the tool does and 
 *     what argunments ut accepts.
 *  
 *  2. Implementation: The actual code that executes when the tool is called.
 *     This is what the server uses to run the tool when the client calls it.
 * 
 *  Keeping definitions in a registry keeps server.js focused on protocol wiring.
 *  when you add a tool, you register its schema here once.
 */

// ───────────────────────── Validation ─────────────────────────────────────────────

const NAME_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;


function validateDefinition(tool) {

    if (typeof tool !== 'object' || tool === null || Array.isArray(tool)) {
        throw { code: -32602, message: "Invalid tool: must be an object" };
    }

    if (typeof tool.name !== 'string' || !NAME_PATTERN.test(tool.name)) {
        throw { code: -32602, message: "Invalid tool: name must be a string of 1-128 characters, containing only letters, numbers, '.', '_', or '-'." };
    }

    if (!tool.description || typeof tool.description !== 'string' || tool.description.length === 0 || tool.description.trim().length === '') {
        throw { code: -32602, message: "Invalid tool: description must be a non-empty string" };
    }


    const schema = tool.inputSchema;

    if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
        throw { code: -32602, message: "Invalid tool: inputSchema must be an object" };
    }

    if (schema.type !== 'object') {
        throw { code: -32602, message: "Invalid tool: inputSchema must be a JSON Schema object with type 'object'" };
    }
}

function validateResourceDefinition(resource) {
    if (typeof resource !== 'object' || resource === null || Array.isArray(resource)) {
        throw { code: -32602, message: 'Invalid resource: must be an object' };
    }

    if (typeof resource.uri !== 'string' || resource.uri.trim() === '') {
        throw { code: -32602, message: 'Invalid resource: uri is required' };
    }

    if (typeof resource.name !== 'string' || resource.name.trim() === '') {
        throw { code: -32602, message: 'Invalid resource: name is required' };
    }
}


// ---------------------- Registry ---------------------------------

/*
    In-memory store of tool definatyions keyed by name.
*/

export class ToolRegistry {

    constructor() {
        this._tools = new Map();
    }


    /**
     * Add or replace a tool definition in the registry.
     * 
     * @param {Object} definition - The tool definition to register.
     * @throws {Error} If the definition is invalid.
     */

    register(definition) {

        validateDefinition(definition);

        this._tools.set(definition.name, definition);
    }

    /**
     * Get all registered tool definitions in the registry.
     * @returns {Array} An array of all tool definitions.
     */
    list() {
        return [...this._tools.values()].sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Look up one tool by name. Returns undefined if not found.
     * @param {string} name 
     * @returns 
     */
    get(name) {
        return this._tools.get(name);
    }

    get size() {
        return this._tools.size;
    }
}

/**
 * In memory store of resource definations.
 */
export class ResourceRegistry {

    constructor() {
        this._definations = new Map();
        this._readers = new Map();
    }

    register(defination, read) {
        validateResourceDefinition(defination);

        if (typeof read !== 'function') {
            throw { code: -32602, message: 'Invalid resource: read handler must be a function' };
        }

        this._definations.set(defination.title, defination);
        this._readers.set(defination.title, read);
    }

    list() {
        return [...this._definations.values()].sort((a, b) => a.uri.localeCompare(b.uri))
    }

    get(uri) {
        return this._definations.get(uri);
    }

    async read(url) {
        const reader = this._readers.get(uri);

        if (!reader) {
            return null;
        }

        return reader();
    }

    get size() {
        return this._definations.size;
    }
}

