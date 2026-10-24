import type { ExtensionUIFactory, Json } from "jumpybrain/extensions.js";

type Result = { id: string; title: string; snippet: string };
function object(value: Json): Record<string, Json> { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
const activate: ExtensionUIFactory = api => {
  api.registerPanel("results", (container, initial, context) => {
    const doc = container.ownerDocument;
    const form = doc.createElement("form");
    const label = doc.createElement("label"); label.textContent = "Find related notes";
    const input = doc.createElement("input"); input.type = "search"; input.maxLength = 240; input.autocomplete = "off";
    label.append(input);
    const submit = doc.createElement("button"); submit.type = "submit"; submit.className = "quiet-button"; submit.textContent = "Search";
    const status = doc.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
    const list = doc.createElement("ul"); list.setAttribute("aria-label", "Related notes");
    form.append(label, submit); container.append(form, status, list);
    let sequence = 0;
    const live = () => !context.signal.aborted;
    function render(data: Json) {
      if (!live()) return;
      const packet = object(data);
      input.value = typeof packet.query === "string" ? packet.query : "";
      list.replaceChildren();
      const results: Result[] = Array.isArray(packet.results) ? packet.results.flatMap(item => {
        const value = object(item);
        return typeof value.id === "string" && typeof value.title === "string" && typeof value.snippet === "string"
          ? [{ id: value.id, title: value.title, snippet: value.snippet }] : [];
      }).slice(0, 8) : [];
      status.textContent = typeof packet.message === "string" ? packet.message :
        (packet.stale || packet.partial ? "Search coverage is still updating. Results may be incomplete. " : "") +
        (results.length ? "Showing " + results.length + " related notes." : "No related notes found. Try another query.");
      for (const result of results) {
        const item = doc.createElement("li");
        const open = doc.createElement("button"); open.type = "button"; open.className = "quiet-button"; open.textContent = result.title || "Untitled";
        const snippet = doc.createElement("p"); snippet.textContent = result.snippet;
        open.addEventListener("click", async () => {
          if (!live()) return;
          open.disabled = true;
          try { if (!await context.openNote(result.id) && live()) status.textContent = "This note could not open. Save your draft or check the connection, then try again."; }
          catch { if (live()) status.textContent = "This note could not open. Please try again."; }
          finally { if (live()) open.disabled = false; }
        });
        item.append(open, snippet); list.append(item);
      }
    }
    render(initial);
    const search = async (event: Event) => {
      event.preventDefault();
      if (!live()) return;
      const request = ++sequence;
      submit.disabled = true; status.textContent = "Searching…"; list.setAttribute("aria-busy", "true");
      try {
        const result = await context.execute("open", { query: input.value });
        if (live() && request === sequence && result?.panel?.id === "results") render(result.panel.data);
      } catch { if (live() && request === sequence) status.textContent = "Search is unavailable. Check the connection and try again."; }
      finally { if (live() && request === sequence) { submit.disabled = false; list.setAttribute("aria-busy", "false"); } }
    };
    form.addEventListener("submit", search);
    return () => { sequence++; form.removeEventListener("submit", search); container.replaceChildren(); };
  });
};
export default activate;
