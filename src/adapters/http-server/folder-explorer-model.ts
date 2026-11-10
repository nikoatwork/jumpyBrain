import { isValidMemoryDocumentId } from "../../core/document-id-format.js";
import { metadataDate } from "../../core/canonical/metadata-date.js";
import { resultEditContext } from "./search-presentation.js";

export interface ExplorerFile { id: string | null; file: string; title?: string; updatedAt?: string; createdAt?: string }
export interface ExplorerNode {
  kind: "folder" | "file"; path: string; name: string; id: string | null; title: string; children: ExplorerNode[];
  updatedAt?: string; createdAt?: string;
}
/** Folders always stay first and alphabetical; only notes inside each folder follow the chosen order. */
export type ExplorerSort = "name" | "edited" | "created";
export const explorerSorts: readonly ExplorerSort[] = ["name", "edited", "created"];
export function isExplorerSort(value: unknown): value is ExplorerSort {
  return typeof value === "string" && (explorerSorts as readonly string[]).includes(value);
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
    const updatedAt = metadataDate(value.updatedAt), createdAt = metadataDate(value.createdAt);
    return [{ file, id: isValidMemoryDocumentId(value.id) ? value.id : null,
      ...(typeof value.title === "string" ? { title: value.title } : {}),
      ...(updatedAt ? { updatedAt } : {}), ...(createdAt ? { createdAt } : {}) }];
  });
}

/** Empty directories are optional for compatibility with older read-only catalogs. */
export function explorerFolders(packet: unknown): string[] {
  const folders = (packet as { folders?: unknown })?.folders;
  if (folders === undefined) return [];
  if (!Array.isArray(folders)) throw new Error("Invalid folder list");
  return [...new Set(folders.filter((value): value is string => typeof value === "string" && !value.includes("\\") && !/[\u0000-\u001f]/.test(value) && !value.split("/").some(part => !part || part.startsWith("."))))];
}

/** Timestamp used by a date order; edits fall back to creation like the Pages list. */
export function explorerSortDate(node: Pick<ExplorerNode, "updatedAt" | "createdAt">, sort: ExplorerSort): string | undefined {
  return sort === "edited" ? node.updatedAt ?? node.createdAt : sort === "created" ? node.createdAt : undefined;
}

/** Compact row caption for date orders, reusing the search/sidebar relative-age rules. */
export function explorerAge(node: Pick<ExplorerNode, "updatedAt" | "createdAt">, sort: ExplorerSort, now = new Date()): { label: string; details: string } {
  const date = explorerSortDate(node, sort);
  if (!date) return { label: "", details: sort === "name" ? "" : sort === "created" ? "No creation date" : "No edit date" };
  const context = resultEditContext({ metadataStatus: "current", updatedAt: date }, now);
  return { label: context.label, details: sort === "created" ? context.details.replace(/^Last edited/, "Created") : context.details };
}

export function buildExplorerTree(files: ExplorerFile[], directories: string[] = [], sort: ExplorerSort = "name"): ExplorerNode[] {
  const root: ExplorerNode = { kind: "folder", path: "", name: "", id: null, title: "", children: [] };
  const folders = new Map<string, ExplorerNode>([["", root]]);
  for (const directory of [...directories].sort()) {
    const parts = directory.split("/");
    let parent = root;
    for (let index = 0; index < parts.length; index++) {
      const path = parts.slice(0, index + 1).join("/");
      let folder = folders.get(path);
      if (!folder) { folder = { kind: "folder", path, name: parts[index]!, id: null, title: "", children: [] }; folders.set(path, folder); parent.children.push(folder); }
      parent = folder;
    }
  }
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
      id: file.id, title: file.title || "", children: [],
      ...(file.updatedAt ? { updatedAt: file.updatedAt } : {}), ...(file.createdAt ? { createdAt: file.createdAt } : {}) });
  }
  // Newest first; undated notes follow dated ones; ties and name order stay natural and deterministic.
  const time = (node: ExplorerNode) => { const date = explorerSortDate(node, sort); return date ? Date.parse(date) : Number.NEGATIVE_INFINITY; };
  for (const folder of folders.values()) folder.children.sort((a, b) =>
    Number(b.kind === "folder") - Number(a.kind === "folder")
    || (a.kind === "file" && sort !== "name" ? Math.sign(time(b) - time(a)) || 0 : 0)
    || naturalOrder.compare(a.name, b.name) || a.path.localeCompare(b.path));
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
