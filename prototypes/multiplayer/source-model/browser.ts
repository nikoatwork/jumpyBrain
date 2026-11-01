import { createNoteEditor } from '../../../src/adapters/http-server/lexical-editor.ts';

declare global { interface Window { sourcePrototype: any; } }
const clients = new Map<string, any>();
window.sourcePrototype = {
  create(id: string, markdown: string) {
    const element = document.createElement('div'); element.id = id; element.setAttribute('role', 'textbox');
    element.style.cssText = 'white-space:pre-wrap;border:1px solid #ccc;padding:16px;margin:16px;';
    document.body.append(element);
    const changes: string[] = [], errors: string[] = [];
    const api: any = createNoteEditor(element, { onChange: (text) => changes.push(text), onError: (error) => errors.push(error.message) });
    api.setMarkdown(markdown);
    clients.set(id, { api, changes, errors, element });
    return this.snapshot(id);
  },
  snapshot(id: string) {
    const { api, changes, errors, element } = clients.get(id);
    return { markdown: api.getMarkdown(), changes: [...changes], errors: [...errors], text: element.textContent,
      keys: api.__m1.keys(), selection: api.__m1.selection() };
  },
  patch(id: string, patch: any) { return clients.get(id).api.__m1.sourcePatch(patch); },
  resetChanges(id: string) { clients.get(id).changes.length = 0; },
  focusAt(id: string, needle: string, offset: number) { return clients.get(id).api.__m1.focusAt(needle, offset); },
  destroy(id: string) { const client = clients.get(id); client.api.destroy(); client.element.remove(); clients.delete(id); },
};
