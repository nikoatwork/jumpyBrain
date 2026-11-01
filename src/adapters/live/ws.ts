// Built into a self-contained Node module by scripts/build-editor.mjs so the
// packaged desktop runtime needs no checkout node_modules for its transport.
export { WebSocket, WebSocketServer } from "ws";
export type { RawData } from "ws";
