export function stampMissingMemoryDocumentId(content: string, fields: { id: string; updatedAt: string }): { modified: boolean; content: string } {
  const block = frontmatterBlock(content);
  if (!block) {
    return {
      modified: true,
      content: [
        "---",
        `id: ${JSON.stringify(fields.id)}`,
        `updated_at: ${JSON.stringify(fields.updatedAt)}`,
        "---",
        "",
        content,
      ].join(detectLineEnding(content)),
    };
  }

  const lines = block.frontmatter.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.some((line) => /^id\s*:/.test(line.trimStart()))) return { modified: false, content };

  let updatedAtWritten = false;
  const stampedLines = lines.map((line) => {
    if (/^updated_at\s*:/.test(line.trimStart())) {
      updatedAtWritten = true;
      return `updated_at: ${JSON.stringify(fields.updatedAt)}`;
    }
    return line;
  });
  if (!updatedAtWritten) stampedLines.push(`updated_at: ${JSON.stringify(fields.updatedAt)}`);
  stampedLines.unshift(`id: ${JSON.stringify(fields.id)}`);

  return {
    modified: true,
    content: ["---", ...stampedLines, "---"].join(block.lineEnding) + block.lineEnding + block.body,
  };
}

function frontmatterBlock(content: string): { frontmatter: string; body: string; lineEnding: string } | undefined {
  const open = content.match(/^---[ \t]*(\r?\n)/);
  if (!open) return undefined;
  const lineEnding = open[1];
  let cursor = open[0].length;

  while (cursor < content.length) {
    const nextNewline = content.indexOf("\n", cursor);
    const lineEnd = nextNewline === -1 ? content.length : nextNewline + 1;
    const rawLine = content.slice(cursor, lineEnd);
    if (rawLine.replace(/\r?\n$/, "").trim() === "---") {
      return {
        frontmatter: content.slice(open[0].length, cursor),
        body: content.slice(lineEnd),
        lineEnding,
      };
    }
    cursor = lineEnd;
  }

  return undefined;
}

function detectLineEnding(content: string): string {
  return content.includes("\r\n") ? "\r\n" : "\n";
}
