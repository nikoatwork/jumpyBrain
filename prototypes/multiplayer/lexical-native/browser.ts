import { createNoteEditor } from "../../../src/adapters/http-server/lexical-editor.ts";
import { $getRoot, $isTextNode, $isElementNode, $createParagraphNode, $createTextNode, UNDO_COMMAND, REDO_COMMAND, COMMAND_PRIORITY_HIGH } from "lexical";
import { createYjsBinding, createUndoManager, syncLexicalUpdateToYjs, syncYjsChangesToLexical } from "@lexical/yjs";
import * as Y from "yjs";

const clients = new Map<string, any>();
const errors: string[] = [];
const tick = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

function provider() {
  let local: any = null;
  return {
    awareness: { getLocalState: () => local, getStates: () => new Map(), setLocalState: (value: any) => { local = value; },
      setLocalStateField: (key: string, value: unknown) => { local = { ...local, [key]: value }; }, on() {}, off() {} },
    connect() {}, disconnect() {}, on() {}, off() {},
  };
}

function add(id: string) {
  const element = document.createElement("div");
  element.id = "editor-" + id;
  element.style.cssText = "white-space:pre-wrap;border:1px solid #ccc;padding:12px";
  document.body.append(element);
  const api = createNoteEditor(element, { onChange() {}, onError: (error) => errors.push(id + ": " + error.message) }) as any;
  const editor = api.__m1.editor;
  const doc = new Y.Doc();
  const awareness = provider();
  const binding = createYjsBinding({ editor, id, doc, docMap: new Map([[id, doc]]) });
  const undo = createUndoManager(binding, binding.root._xmlText);
  const queue: number[][] = [];
  doc.on("update", (update, origin) => { if (origin !== "network") queue.push(Array.from(update)); });
  binding.root._xmlText.observeDeep((events, transaction) => {
    if (transaction.origin !== binding) syncYjsChangesToLexical(binding, awareness as any, events as any, transaction.origin === undo, () => {});
  });
  const dispose = editor.registerUpdateListener(({ prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags }: any) => {
    syncLexicalUpdateToYjs(binding, awareness as any, prevEditorState, editorState, dirtyElements, dirtyLeaves, normalizedNodes, tags);
  });
  editor.registerCommand(UNDO_COMMAND, () => { undo.undo(); return true; }, COMMAND_PRIORITY_HIGH);
  editor.registerCommand(REDO_COMMAND, () => { undo.redo(); return true; }, COMMAND_PRIORITY_HIGH);
  clients.set(id, { api, editor, doc, binding, undo, queue, element, dispose });
  return id;
}

function leafAt(block: any, offset: number) {
  const leaves = block.getAllTextNodes();
  for (const leaf of leaves) {
    if (offset <= leaf.getTextContentSize()) return { leaf, offset };
    offset -= leaf.getTextContentSize();
  }
  throw new Error("Text offset is outside a leaf");
}

function insertAfter(editor: any, needle: string, text: string) {
  editor.update(() => {
    const matches: any[] = [];
    for (const block of $getRoot().getChildren()) {
      if (!$isElementNode(block)) continue;
      let offset = block.getTextContent().indexOf(needle);
      while (offset >= 0) { matches.push({ block, offset: offset + needle.length }); offset = block.getTextContent().indexOf(needle, offset + 1); }
    }
    if (matches.length !== 1) throw new Error("Probe anchor is missing or ambiguous");
    const position = leafAt(matches[0].block, matches[0].offset);
    position.leaf.spliceText(position.offset, 0, text);
  }, { discrete: true });
}

Object.assign(window, {
  nativePrototype: {
    async reset() {
      for (const client of clients.values()) { client.dispose(); client.undo.destroy(); client.api.destroy(); client.doc.destroy(); client.element.remove(); }
      clients.clear(); errors.length = 0;
    },
    add,
    async seed(id: string, source: string) {
      const client = clients.get(id);
      client.binding.isBootstrapping = true;
      client.api.setMarkdown(source, true);
      client.binding.isBootstrapping = false;
      await tick(); client.undo.clear();
    },
    async sync(from: string, to: string) {
      const source = clients.get(from), destination = clients.get(to);
      Y.applyUpdate(destination.doc, Y.encodeStateAsUpdate(source.doc), "network");
      await tick();
    },
    async deliver(from: string, to: string, duplicate = false) {
      const updates = clients.get(from).queue.splice(0);
      for (const update of updates) {
        Y.applyUpdate(clients.get(to).doc, new Uint8Array(update), "network");
        if (duplicate) Y.applyUpdate(clients.get(to).doc, new Uint8Array(update), "network");
      }
      await tick(); return updates.length;
    },
    clearQueue(id: string) { clients.get(id).queue.length = 0; },
    async edit(id: string, block: number, start: number, deleted: number, text: string) {
      const client = clients.get(id);
      client.undo.stopCapturing();
      client.editor.update(() => {
        const node = $getRoot().getChildAtIndex(block);
        if (!$isElementNode(node)) throw new Error("Expected an editable text block");
        const position = leafAt(node, start);
        if (deleted > position.leaf.getTextContentSize() - position.offset) throw new Error("Prototype replacement must fit one leaf");
        position.leaf.spliceText(position.offset, deleted, text);
      }, { discrete: true });
      await tick();
    },
    async insertAfter(id: string, needle: string, text: string) {
      const client = clients.get(id); client.undo.stopCapturing();
      insertAfter(client.editor, needle, text); await tick();
    },
    async controlProbe(source: string, needle: string, text: string) {
      const element = document.createElement("div"); document.body.append(element);
      const api = createNoteEditor(element, { onChange() {}, onError: (error) => errors.push("control: " + error.message) }) as any;
      try { api.setMarkdown(source, true); insertAfter(api.__m1.editor, needle, text); await tick(); return api.getMarkdown(); }
      finally { api.destroy(); element.remove(); }
    },
    async appendBlock(id: string, text: string) {
      const client = clients.get(id);
      client.undo.stopCapturing();
      client.editor.update(() => $getRoot().append($createParagraphNode().append($createTextNode(text))), { discrete: true });
      await tick();
    },
    async removeBlock(id: string, index: number) {
      const client = clients.get(id);
      client.undo.stopCapturing();
      client.editor.update(() => $getRoot().getChildAtIndex(index)?.remove(), { discrete: true });
      await tick();
    },
    async undo(id: string) { clients.get(id).undo.undo(); await tick(); },
    markdown(id: string) { return clients.get(id).api.getMarkdown(); },
    snapshot(id: string) {
      const client = clients.get(id);
      return client.editor.getEditorState().read(() => ({
        markdown: client.api.getMarkdown(),
        blocks: $getRoot().getChildren().map((node: any) => ({ type: node.getType(), text: node.getTextContent() })),
        sourceEntries: client.api.__m1.sources.size,
        stateBytes: Y.encodeStateAsUpdate(client.doc).byteLength,
      }));
    },
    errors: () => errors,
  },
});
