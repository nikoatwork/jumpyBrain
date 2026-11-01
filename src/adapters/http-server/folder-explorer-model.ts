import { isValidMemoryDocumentId } from "../../core/document-id-format.js";

export interface ExplorerFile { id: string | null; file: string; title?: string }
export interface ExplorerNode {
  kind: "folder" | "file"; path: string; name: string; id: string | null; title: string; children: ExplorerNode[];
}
export interface ExplorerRow {
  node: ExplorerNode; label: string; level: number; parent: string | null;
  expanded: boolean; position: number; siblings: number;
}
const naturalOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Only root-relative Markdown metadata enters the presentation tree. */
export function explorerFiles(packet: unknown): ExplorerFile[] {
  const files = (packet as { files?: unknown })?.files;
  if (!Array.isArray(files)) throw new Error("Invalid folder list");
  const seen = new Set<string>();
  return files.flatMap(value => {
    if (!value || typeof value.file !== "string") return [];
    const file = value.file as string;
    if (!file.toLowerCase().endsWith(".md") || file.includes("\\") || /[\u0000-\u001f]/.test(file)
      || file.split("/").some(part => !part || part === "." || part === "..") || seen.has(file)) return [];
    seen.add(file);
    return [{ file, id: isValidMemoryDocumentId(value.id) ? value.id : null,
      ...(typeof value.title === "string" ? { title: value.title } : {}) }];
  });
}

export function buildExplorerTree(files: ExplorerFile[]): ExplorerNode[] {
  const root: ExplorerNode = { kind: "folder", path: "", name: "", id: null, title: "", children: [] };
  const folders = new Map<string, ExplorerNode>([["", root]]);
  for (const file of files) {
    const parts = file.file.split("/");
    let parent = root;
    for (let index = 0; index < parts.length - 1; index++) {
      const path = parts.slice(0, index + 1).join("/");
      let folder = folders.get(path);
      if (!folder) {
        folder = { kind: "folder", path, name: parts[index]!, id: null, title: "", children: [] };
        folders.set(path, folder); parent.children.push(folder);
      }
      parent = folder;
    }
    parent.children.push({ kind: "file", path: file.file, name: parts.at(-1)!.replace(/\.md$/i, ""),
      id: file.id, title: file.title || "", children: [] });
  }
  for (const folder of folders.values()) folder.children.sort((a, b) =>
    Number(b.kind === "folder") - Number(a.kind === "folder") || naturalOrder.compare(a.name, b.name) || a.path.localeCompare(b.path));
  return root.children;
}

/** Search opens matching ancestry without mutating the user's ordinary disclosure state. */
export function explorerRows(tree: ExplorerNode[], expanded: ReadonlySet<string>, query = "", searchCollapsed: ReadonlySet<string> = new Set()): ExplorerRow[] {
  const needle = query.trim().toLocaleLowerCase();
  const matches = new Set<string>();
  function match(node: ExplorerNode): boolean {
    let result = (node.path + " " + node.title).toLocaleLowerCase().includes(needle);
    for (const child of node.children) if (match(child)) result = true;
    if (result) matches.add(node.path);
    return result;
  }
  if (needle) for (const node of tree) match(node);
  const rows: ExplorerRow[] = [];
  function visit(nodes: ExplorerNode[], level: number, parent: string | null) {
    const visible = needle ? nodes.filter(node => matches.has(node.path)) : nodes;
    visible.forEach((initial, index) => {
      let node = initial, label = node.name;
      // Preserve top-level type folders; only compact real single-directory chains.
      while (level > 1 && node.kind === "folder" && node.children.length === 1 && node.children[0]!.kind === "folder") {
        node = node.children[0]!; label += "/" + node.name;
      }
      const open = node.kind === "folder" && (needle ? !searchCollapsed.has(node.path) : expanded.has(node.path));
      rows.push({ node, label, level, parent, expanded: open, position: index + 1, siblings: visible.length });
      if (open) visit(node.children, level + 1, node.path);
    });
  }
  visit(tree, 1, null);
  return rows;
}

export function revealExplorerFile(tree: ExplorerNode[], file: string, expanded: Set<string>): void {
  function visit(nodes: ExplorerNode[]) {
    for (const node of nodes) if (node.kind === "folder" && file.startsWith(node.path + "/")) {
      expanded.add(node.path); visit(node.children);
    }
  }
  visit(tree);
}
