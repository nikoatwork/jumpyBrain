export function usage(): string {
  return [
    "Usage:",
    "  jumpybrain --version",
    "  jumpybrain instructions",
    "  jumpybrain doctor [--root <memory-root>] [--json]",
    "  jumpybrain update [--dry-run] [--install-root <path>]",
    "  jumpybrain serve --root <memory-root> --host 127.0.0.1 --port 3787",
    "  jumpybrain run memory:remember --type finding --title \"...\"",
    "  jumpybrain run memory:recall --topic \"...\" --limit 5",
    "  jumpybrain init --root <memory-root>",
    "  jumpybrain status --root <memory-root> --json",
    "  jumpybrain tree --root <memory-root> [--connections] [--show-files] [--limit 25] [--json]",
    "  jumpybrain recall --root <memory-root> --topic \"...\" --limit 5 --depth shallow",
    "  jumpybrain recall --root <memory-root> --query \"...\" --limit 10 --depth normal --json",
    "  jumpybrain show --root <memory-root> --id <mem_id> [--json]",
    "  jumpybrain show --target-url <url> --id <mem_id> [--json]",
    "  jumpybrain dream --root <memory-root>|--target-url <url> [--out dream-batch.json] [--json]",
    "  jumpybrain dream --root <memory-root>|--target-url <url> --status|--complete <batch-id>|--abandon <batch-id>",
    "  jumpybrain dream --root <memory-root>|--target-url <url> --apply-manifest dream-manifest.json",
    "  cat revised.md | jumpybrain update --root <memory-root> --id <mem_id> --if-match <contentHash> [--json]",
    "  cat revised.md | jumpybrain update --target-url <url> --id <mem_id> --if-match <contentHash> [--json]",
    "  jumpybrain process --root <memory-root> --mode lint|synthesize|ensure-ids [--topic \"...\"] --apply",
    "  cat memory.md | jumpybrain remember --root <memory-root> --type finding --title \"...\"",
    "  cat wrapup.md | jumpybrain wrapup --root <memory-root> --title \"...\" --topic \"...\"",
  ].join("\n");
}

export function runUsage(): string {
  return [
    "Usage:",
    "  jumpybrain run memory:status [--root <memory-root>] [--json]",
    "  jumpybrain run memory:tree [--root <memory-root>] [--connections] [--show-files] [--limit 25] [--json]",
    "  jumpybrain run memory:remember --type finding --title \"...\" [--root <memory-root>]",
    "  jumpybrain run memory:recall --topic \"...\" [--root <memory-root>] [--limit 5] [--depth shallow|normal|deep]",
    "  jumpybrain run memory:recall --query \"...\" [--root <memory-root>] [--limit 10] [--depth shallow|normal|deep] [--json]",
    "  jumpybrain run memory:show --id <mem_id> [--root <memory-root>] [--target-url <url>] [--json]",
    "  cat revised.md | jumpybrain run memory:update --id <mem_id> --if-match <contentHash> [--root <memory-root>] [--target-url <url>] [--json]",
    "  jumpybrain run memory:process --mode lint|synthesize|ensure-ids [--topic \"...\"] [--root <memory-root>] --apply",
    "  cat memory.md | jumpybrain run memory:remember --type finding --title \"...\" [--root <memory-root>]",
    "  cat wrapup.md | jumpybrain run memory:wrapup --title \"...\" --topic \"...\" [--root <memory-root>]",
  ].join("\n");
}
