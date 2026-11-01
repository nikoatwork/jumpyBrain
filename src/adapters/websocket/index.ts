// Shared third-party transport only. scripts/build-editor.mjs bundles this
// boundary once so clients, live RPC and native gateways need no node_modules.
export { WebSocket, WebSocketServer } from "ws";
export type { RawData } from "ws";
