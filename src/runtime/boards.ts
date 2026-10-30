// Explicit desktop organization seam; ordinary memory entrypoints do not load it.
export { validateBoards, type Board } from '../app/collections/index.js';
export { changeBoard, selectBoard, boardStatus, type BoardPacket, type BoardChange } from '../app/collections/operations.js';
