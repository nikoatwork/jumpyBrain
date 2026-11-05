export interface VersionChange { removed: string; added: string; }
export interface VersionChanges { equal: boolean; shortened: boolean; changes: VersionChange[]; }
const marker = "… passage shortened …";
const boundary = (text: string, at: number) => /[\uDC00-\uDFFF]/.test(text[at] ?? "") || text[at - 1] === "\r" && text[at] === "\n" ? at - 1 : at;
const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function excerpt(text: string, maxLines: number) {
  let shortened = text.length > 1200;
  let value = shortened
    ? text.slice(0, boundary(text, 600)) + "\n" + marker + "\n" + text.slice(boundary(text, text.length - 600))
    : text;
  const parts = lines(value);
  if (parts.length > maxLines) {
    shortened = true;
    const head = Math.ceil((maxLines - 1) / 2), tail = Math.floor((maxLines - 1) / 2);
    value = parts.slice(0, head).join("") + (parts[head - 1]?.endsWith("\n") ? "" : "\n") + marker + "\n" + parts.slice(-tail).join("");
  }
  return { value, shortened };
}

/** Presentation only: saved → candidate; never publish these excerpts. */
export function versionChanges(savedText: string, candidateText: string): VersionChanges {
  if (savedText === candidateText) return { equal: true, shortened: false, changes: [] };
  let changes: VersionChange[] = [], shortened = false;
  try {
    if (savedText.length > 100_000 || candidateText.length > 100_000) throw new Error();
    const before = lines(savedText), after = lines(candidateText), width = after.length + 1;
    // Bounded line alignment keeps unchanged Markdown out of Added/Removed.
    // The matrix never exceeds 100,000 cells; source and output have own caps.
    if ((before.length + 1) * width > 100_000) throw new Error();
    const match = new Uint32Array((before.length + 1) * width);
    for (let i = before.length - 1; i >= 0; i--) for (let j = after.length - 1; j >= 0; j--)
      match[i * width + j] = before[i] === after[j] ? 1 + match[(i + 1) * width + j + 1] : Math.max(match[(i + 1) * width + j], match[i * width + j + 1]);
    let i = 0, j = 0, change: VersionChange | undefined;
    while (i < before.length || j < after.length) {
      if (i < before.length && j < after.length && before[i] === after[j]) { i++; j++; change = undefined; }
      else {
        if (!change) { change = { removed: "", added: "" }; changes.push(change); }
        if (j < after.length && (i === before.length || match[i * width + j + 1] >= match[(i + 1) * width + j])) change.added += after[j++];
        else change.removed += before[i++];
      }
    }
    if (changes.length > 6) throw new Error();
  } catch {
    changes = [{ removed: savedText, added: candidateText }]; shortened = true;
  }
  const maxLines = Math.max(3, Math.floor(40 / (changes.length * 2)));
  changes = changes.map(change => {
    const removed = excerpt(change.removed, maxLines), added = excerpt(change.added, maxLines);
    shortened ||= removed.shortened || added.shortened;
    return { removed: removed.value, added: added.value };
  });
  return { equal: false, shortened, changes };
}

/** Text-only diff; colors and semantic labels supplement each other. */
export function renderVersionChanges(document: Document, container: HTMLElement, savedText: string, candidateText: string): void {
  const result = versionChanges(savedText, candidateText);
  container.replaceChildren(); container.classList.add("version-changes");
  if (result.equal || result.shortened) {
    const message = document.createElement("p");
    message.textContent = result.equal ? "No text differences." : "Change summary shortened for this large or complex comparison; it may include unchanged text. Full versions remain available under More options.";
    container.append(message);
  }
  for (const change of result.changes) {
    const passage = document.createElement("div"); passage.className = "version-change";
    for (const [kind, text] of [["Removed", change.removed], ["Added", change.added]] as const) {
      if (!text) continue;
      const label = document.createElement("div"); label.className = "version-change-label";
      label.textContent = kind + (/^[\r\n]+$/.test(text) ? " blank line" : "");
      const content = document.createElement(kind === "Removed" ? "del" : "ins"), pre = document.createElement("pre");
      content.className = "version-change-" + kind.toLowerCase(); pre.textContent = text;
      content.append(pre); passage.append(label, content);
    }
    container.append(passage);
  }
}
