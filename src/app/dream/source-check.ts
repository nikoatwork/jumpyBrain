import path from "node:path";
import { assertCompatibleMemoryRoot } from "../../core/memory-root/index.js";
import { findCanonicalMemoryDocumentById, hashMemoryDocumentContent, listCanonicalMemoryMarkdownFiles, MemoryDocumentLookupError, parseFrontmatter, readBoundedCanonicalSource, resolveMemoryRoot } from "../../core/canonical/markdown-store.js";
import { isDreamDocument } from "../../core/retrieval-policy/index.js";
import { checkSourceReference, pageSourceReferences, SOURCE_CHECK_LIMITS, type SourceCheckRequest, type SourceCheckResult, type SourceVersion } from "../../core/dream/source-references.js";

/** Explicit pre-publication/on-demand check. No persistence, truth claim, indexing or multi-file lock. */
export async function checkDreamSources(rootArg: string, request: SourceCheckRequest): Promise<SourceCheckResult> {
  const root = await resolveMemoryRoot(rootArg);
  await assertCompatibleMemoryRoot(root);
  const invalid = (message: string): never => { throw new MemoryDocumentLookupError("validation_failed", message); };
  if (!request || Object.keys(request).some(key => !["id", "content", "file"].includes(key))) invalid("Source checks accept id OR draft content and canonical file.");
  let content: string, file: string, id: string | undefined;
  if (request.id !== undefined) {
    if (typeof request.id !== "string" || request.content !== undefined || request.file !== undefined) invalid("Use id OR draft content and file.");
    const location = await findCanonicalMemoryDocumentById(root, request.id);
    let bytes: Buffer;
    try { bytes = await readBoundedCanonicalSource(root, location.absolutePath, SOURCE_CHECK_LIMITS.pageBytes); }
    catch { return invalid("Selected Dream page cannot be safely read within the 64 KiB budget; reread or narrow it before checking."); }
    content = bytes.toString("utf8"); file = location.file; id = location.id;
    const parsed = parseFrontmatter(content);
    if (parsed.frontmatter.id !== id) invalid("Selected page identity changed; reread before checking.");
    if (!isDreamDocument(parsed)) invalid("Select a dream: true page. Ordinary Dream authorization does not convert human pages.");
  } else {
    if (typeof request.content !== "string" || typeof request.file !== "string") invalid("Draft checks require content and a canonical root-relative file.");
    content = request.content!; file = request.file!;
    if (file.length > 1024 || !/^(notes|findings|decisions|preferences|sessions|pages)\/.+\.md$/.test(file) || file.split("/").some(part => !part || part === "." || part === "..") || /[\\\x00-\x1f\x7f]/.test(file)) invalid("Draft file must be an exact canonical root-relative Markdown path.");
  }
  if (Buffer.byteLength(content) > SOURCE_CHECK_LIMITS.pageBytes) invalid("Page exceeds the 64 KiB source-check budget.");
  const references = pageSourceReferences(parseFrontmatter(content).body);
  const selected = references.slice(0, SOURCE_CHECK_LIMITS.references);
  const documents: SourceVersion[] = [];
  let scannedFiles = 0, unreadFiles = 0, spent = 0;
  if (selected.some(ref => ref.expectedHash)) {
    const files = (await listCanonicalMemoryMarkdownFiles(root)).sort();
    unreadFiles = Math.max(0, files.length - SOURCE_CHECK_LIMITS.files);
    for (const absolutePath of files.slice(0, SOURCE_CHECK_LIMITS.files)) {
      if (spent >= SOURCE_CHECK_LIMITS.totalBytes) { unreadFiles++; continue; }
      const budget = Math.min(SOURCE_CHECK_LIMITS.fileBytes, SOURCE_CHECK_LIMITS.totalBytes - spent);
      try {
        const bytes = await readBoundedCanonicalSource(root, absolutePath, budget);
        spent += bytes.byteLength; scannedFiles++;
        documents.push({ relativePath: path.relative(root, absolutePath).split(path.sep).join("/"), frontmatter: parseFrontmatter(bytes.toString("utf8")).frontmatter, contentHash: hashMemoryDocumentContent(bytes) });
      } catch { unreadFiles++; spent += budget; }
    }
  }
  const sources = selected.map(ref => checkSourceReference(file, ref, documents, unreadFiles === 0));
  const omittedReferences = Math.max(0, references.length - selected.length);
  return { checkedAt: new Date().toISOString(), page: { file, contentHash: hashMemoryDocumentContent(content), ...(id ? { id } : {}) },
    coverage: unreadFiles || omittedReferences || !sources.length || sources.some(source => source.status === "not_checked") ? "partial" : "complete",
    omittedReferences, scannedFiles, unreadFiles, limits: SOURCE_CHECK_LIMITS, sources,
    warnings: ["Checks compare current file versions, not claim truth or complete evidence coverage. No retained revisions or atomic snapshot; sources can change after checking.",
      ...(unreadFiles ? ["Source scan incomplete; missing targets and unique identities cannot be established. Narrow the memory or inspect sources explicitly."] : []),
      ...(omittedReferences ? ["Reference budget exhausted; additional references were not checked."] : []),
      ...(!sources.length ? ["No checkable canonical references found; no evidence was verified."] : [])] };
}
