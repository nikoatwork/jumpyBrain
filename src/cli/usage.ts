// Presentation metadata only: validation and operation policy stay with their owners.
interface CommandHelp {
  summary: string;
  syntax: string;
  details?: string[];
  children?: Record<string, string>;
  target?: boolean;
  recipe?: boolean;
  recipeHelp?: { summary: string; syntax: string; details?: string[]; target?: boolean };
}

const targetHelp = 'Target: --root <memory-root> OR --target-url <url> (--remote-url is an alias). Remote operations use JUMPYBRAIN_API_KEY.';
const actorHelp = 'Writer: --actor human|agent|unknown [--actor-id <id>] [--actor-name <name>]. Omitted edits remain unknown.';
const readHelp = [
  '--limit <positive integer> (recall: 5, search: 10); --depth shallow|normal|deep (normal).',
  '--compact [--max-bytes <1024..65536>] [--diagnostics]: bounded JSON + LF (default 8192 bytes), even without --json.',
  '--no-refresh skips local repair; --read-only forbids derived writes (lexical-only, closed published generation required). Hosted reads never repair.',
  '--from <date> --to <date> --reference-date <YYYY-MM-DD> --order relevance|chronological. Relative t-Nd requires the explicit reference date.',
  'Evidence-date filters scope documents, rather than individual event times; missing dates remain unknown. Date-only upper bounds include the day; timestamp uppers exclude it.',
  'Rich results: --recognition [--last-editor human|agent|unknown|you] [--editor-id <id>] [--edited-from YYYY-MM-DD] [--edited-to YYYY-MM-DD]',
  '  [--date-field edited|created] [--time-zone <IANA>] [--sort relevance|edited] [--offset <n>]. Cannot combine recognition with --compact.',
];

export const commandHelp: Record<string, CommandHelp> = {
  recall: { summary: 'Recall relevant evidence for a topic or question.', syntax: '[--topic <text> | --query <text>] [--limit 5] [--depth shallow|normal|deep] [--json]', details: readHelp, target: true, recipe: true },
  search: { summary: 'Search memory for a question or phrase.', syntax: '--query <text> [--limit 10] [--depth shallow|normal|deep] [--json]', details: readHelp, target: true, recipe: true },
  show: { summary: 'Read a whole Markdown document and its content hash.', syntax: '--id <mem_id> [--json]', details: ['Whole-document read for editing or broader context; use expand for bounded evidence.'], target: true, recipe: true },
  expand: { summary: 'Read bounded evidence guarded by its source hash.', syntax: '--id <mem_id> --if-match sha256:<hash> [--start-line <n> --end-line <n> | --section-line <n>] [--max-bytes <n>] [--json]', details: ['Always compact JSON + LF; max-bytes: 1024..65536 (default 8192), including metadata.', 'Lines are inclusive and 1-based. Section and line bounds cannot combine.', 'On partial output, continue at continuationLine with the same hash; on stale hash, recall again. No full-read fallback.'], target: true, recipe: true },
  remember: { summary: 'Save explicitly authorized memory from body-only stdin.', syntax: '--title <title> [--type note|finding|decision|preference|session|page] [--date <ISO-date>] [--tag <tag> ...] [--dream] [--json]', details: ['Pipe Markdown body on stdin. --dream marks a page as a dream synthesis; explicit true/false is supported.', 'Preserve uncertain dates; do not infer an event year from the writing date.', actorHelp, 'A saved result with pending/failed indexing is success: repair indexing, never repeat creation.'], target: true, recipe: true },
  update: { summary: 'Update the CLI installation, or replace a hash-checked memory document.', syntax: '[--dry-run] [--install-root <path>] [--home <path>] [--source <source>] [--ref <ref>]', details: ['Installation update uses the managed installer; --dry-run previews its plan.', 'Document update (with --root/--target-url, --id or --if-match):', '  cat revised.md | jumpybrain update --root <memory-root>|--target-url <url> --id <mem_id> --if-match <contentHash> [--json]', 'Read with show first; stdin replaces the whole document. A stale hash requires a fresh read.', actorHelp], recipe: true, recipeHelp: { summary: 'Replace a hash-checked Markdown document from stdin.', syntax: '--id <mem_id> --if-match <contentHash> [--json]', target: true, details: ['Read with show first; stdin replaces the whole document. A stale hash requires a fresh read.', actorHelp] } },
  delete: { summary: 'Preview or explicitly delete one canonical Markdown file.', syntax: '--id <mem_id> [--apply --if-match <contentHash>] [--json]', details: ['Preview is the default. --apply with a prior content hash authorizes permanent removal.', 'No Trash/Undo or cascade; surviving links stay unchanged. Keep backups.'], target: true, recipe: true },
  wrapup: { summary: 'Save an authorized session wrapup from stdin.', syntax: '--title <title> [--topic <text>] [--limit 5] [--tag <tag> ...] [--json]', details: ['Use Markdown sections: Findings, Decisions, Conflicts / Corrections, Open Questions.', '--topic runs a related-memory preflight. Saved memory may still have pending indexing.'], target: true, recipe: true },
  status: { summary: 'Inspect root compatibility and index readiness.', syntax: '[--json]', target: true, recipe: true },
  index: { summary: 'Refresh derived search state explicitly.', syntax: '[--rebuild] [--lexical | --semantic-model <absolute-local-path>] [--json]', details: ['Routine indexing is incremental. --rebuild explicitly regenerates derived state.', 'Index policy flags are mutually exclusive and server-local; remote targets accept --rebuild only.'], target: true, recipe: true },
  tree: { summary: 'Show a bounded memory overview without full note bodies.', syntax: '[--connections] [--show-files] [--limit 10] [--json]', details: ['overview is an alias; --showFiles remains supported.'], target: true, recipe: true },
  process: { summary: 'Preview local lint or apply an authorized processing pass.', syntax: '--mode lint|synthesize|ensure-ids [--topic <text>] [--since <date>] [--limit <n>] [--if-match <hash>] [--preview | --apply] [--json]', details: ['Lint --preview observes without reports, ID repairs, indexes or backend startup; --preview cannot combine with --apply.', 'Local-only: --root <memory-root>. --apply accepts a bare flag or explicit true/false; false does not authorize writes.', 'Synthesis is an extractive source map. Human/dream pages are protected.'], recipe: true },
  dream: { summary: 'Read stateless UTC context windows or check living-page sources.', syntax: '[--from t-0d|YYYY-MM-DD] [--days 3] [--date-basis evidence|modified] [--offset 0] [--out <private-file>] [--json]', details: ['Limits: --max-files <n> --bytes-per-file <n> --max-total-bytes <n>. Human stdout omits full bodies; --out writes a private context packet.', 'Saved source check: --check-sources --id <dream-page-id> [--json].', 'Draft source check: pipe stdin with --check-sources --draft --page-file pages/topic.md [--json].', 'Read-only; no completion or automatic writing. Apply authorized synthesis with remember/update.'], target: true },
  init: { summary: 'Initialize a local Markdown memory root.', syntax: '--root <memory-root> [--force] [--json]' },
  doctor: { summary: 'Inspect local CLI, engine and root readiness.', syntax: '[--root <memory-root>] [--json] [--check]', details: ['Observational probes only. --check exits 1 when required checks fail; otherwise an unhealthy report retains exit 0.'] },
  serve: { summary: 'Host one local memory root.', syntax: '[--root <memory-root>] [--host <host>] [--port <port>] [--api-key <key> ...] [--public-base-url <url>] [--init]', details: ['Defaults/configuration and secure hosting: docs/cloud-shared-memory.md. --init explicitly initializes the selected root.'] },
  identity: { summary: 'Inspect or set the optional device-local display name.', syntax: '[--name <name>] [--json]', details: ['Shared with Mac Settings. Use --name "" to clear it.'] },
  instructions: { summary: 'Print agent memory guidance.', syntax: '[--topic recall|expand|write|maintenance|feedback|board|setup|all]', details: ['Default: short prerequisites and topic directory. Read the relevant topic before operations; all prints full guidance.', 'agent-hint is an alias. No root, credentials or running app required. Recall and shared writes remain explicit.'] },
  version: { summary: 'Print the installed CLI version.', syntax: '', details: ['Aliases: --version, -v.'] },
  run: { summary: 'Run a compatible memory:* recipe.', syntax: '<memory:command> [flags]', children: {}, details: [targetHelp, 'Recipes may discover a local memory root from the current directory. process remains local-only.', 'Use run <memory:command> --help for target flags and operation details.'] },
  migrate: { summary: 'Preview or apply a local vault import.', syntax: '<obsidian|logseq> --source <vault> --root <memory-root> [--apply] [--fail-on-conflict] [--json]', children: { obsidian: 'Import Markdown, preserving source body/YAML bytes.', logseq: 'Import pages/journals; --body-format readable|preserve (readable default).' }, details: ['Local-only, both paths required. Preview is the default; --apply writes the destination.', 'Booleans accept explicit true/false. Source and indexing remain separate.'] },
  backend: { summary: 'Manage the shared local root backend.', syntax: '<start|status|stop> --root <memory-root> [--json]', children: { start: 'Start or join the authenticated root owner.', status: 'Inspect its status.', stop: 'Stop the root owner.' } },
  access: { summary: 'Manage independently revocable root credentials.', syntax: '<issue|list|revoke> --root <memory-root> [--json]', children: { issue: 'Issue with --name <name> [--role reader|writer|admin] (writer default). Output contains the new secret.', list: 'List credential metadata.', revoke: 'Revoke with --id <credential-id>.' } },
  collaborate: { summary: 'Read or publish live source operations.', syntax: '<open|watch|edit|stream|status|cancel|finish|undo|resync> --id <mem_id> [--client-id <agent>] [--json]', target: true, children: { open: 'Read the document and its epoch/revision.', watch: 'Watch published changes.', edit: 'Pipe replacement text; --start <UTF-16 offset> --delete <count> --epoch <read-epoch> --base-revision <read-revision>.', stream: 'Pipe UTF-8 chunks; optional --stream-id <id>. Without --start, append to the latest saved document.', status: 'Inspect a stream with --stream-id <id>.', cancel: 'Cancel with --stream-id <id>.', finish: 'Finish with --stream-id <id>.', undo: 'Undo this client\'s operations.', resync: 'Read the latest source snapshot.' }, details: ['Positioned edit/stream requires --epoch and --base-revision from the actual read used to calculate offsets.', 'A lost publishing acknowledgement is never retried automatically.'] },
  board: { summary: 'Manage optional JSON boards over existing Markdown notes.', syntax: '<list|show|status|create|update|add|remove|delete> [flags] [--json]', target: true, children: { list: 'List layouts and hashes, including settled boards.', show: '--board <ID-or-exact-name>: read layout and hash.', status: '--board <board> [--limit 1..50]: fresh note evidence (12 cards default).', create: '--name <name> [--column <name> (three times)] OR --file <board.json>.', update: '--board <board> --if-match <hash> plus --name, --archived true|false, three --column names, OR --file.', add: '--board <board> --page <mem_id> --column <1|2|3> --if-match <hash>: place/move a note.', remove: '--board <board> --page <mem_id> --if-match <hash>: remove a card; preserve the note.', delete: '--board <board> --if-match <hash>: remove a board; preserve notes.' }, details: ['Files contain a name, optional archived, and three columns [{name,pages:[memory IDs]}].', 'Use --file or individual fields. Local boards work without the Mac app.'] },
  extensions: { summary: 'Manage trusted desktop-local extension packages.', syntax: '<check|install|link|list|enable|disable|remove|reload> [--directory <path>] [--json]', children: { check: '--source <local-package>: compile in disposable storage, without registration/activation.', install: '--source <local-package>: prepare/register a trusted local directory.', link: 'Alias for install; --source <local-package>.', list: 'List packages or live-host status.', enable: '--id <extension-id>: enable a package.', disable: '--id <extension-id>: disable a package.', remove: '--id <extension-id>: unregister; preserve its state.', reload: 'Prepare changes for the matching live host or next start.' }, details: ['No npm/git fetching. Default: ~/Library/Application Support/jumpyBrain Companion/extensions.', 'The companion owns activation; offline preparation never executes factories.', 'No memory-root or remote-target flags. Use extensions/disabled for safe startup.'] },
  feedback: { summary: 'Send explicitly authorized developer feedback.', syntax: '[--message <text>] [--dry-run] [--id <UUID-v4>] [--json]', details: ['Omit --message to read bounded stdin (up to 4000 characters). --dry-run sends nothing.', 'No memory root/key/app required. Supplied text only; remove private content yourself.', 'Agents: send only with user authorization; include version, reproduction, expected and actual behavior.', 'Acceptance confirms relay receipt. Never automatically retry uncertain delivery.'] },
};

// Recipes are advertised from the same command entries, without importing operation modules.
const recipeNames = Object.entries(commandHelp).filter(([, help]) => help.recipe).map(([name]) => `memory:${name}`);
commandHelp.run!.children = Object.fromEntries(recipeNames.map(name => [name, commandHelp[name.slice(7)]!.summary]));
const aliases: Record<string, string> = { overview: 'tree', 'agent-hint': 'instructions', '-v': 'version', '--version': 'version' };

export function usage(): string {
  return [
    'Usage: jumpybrain <command> [flags]',
    '',
    'Memory:  recall, search, expand, show, remember, update, delete, wrapup',
    'Local:   init, status, index, tree (overview), process, dream',
    'Tools:   doctor, serve, backend, access, collaborate, board, extensions, migrate',
    'Other:   identity, feedback, instructions (agent-hint), run, version (--version, -v)',
    '',
    'Help: jumpybrain <command> --help | -h | jumpybrain help <command>',
    'Nested help: jumpybrain board create --help; jumpybrain run memory:recall --help',
    'Reference: docs/cli-commands.md',
  ].join('\n');
}

export function commandUsage(path: string[]): string {
  const requested = path[0]!;
  const name = aliases[requested] ?? requested;
  const help = commandHelp[name];
  if (!Object.hasOwn(commandHelp, name)) throw new Error(`Unknown help command '${requested}'. Use jumpybrain --help.`);
  const child = path[1];
  if (name === 'run' && child) {
    if (path.length !== 2 || !Object.hasOwn(help.children!, child)) throw new Error(`Unknown recipe '${path.slice(1).join(' ')}'. Use jumpybrain run --help.`);
    const operation = child.slice(7);
    const recipe = commandHelp[operation]!;
    return renderUsage(`run ${child}`, recipe.recipeHelp ?? recipe);
  }
  if (path.length > 2 || (child && !Object.hasOwn(help.children ?? {}, child))) throw new Error(`Unknown help command '${path.join(' ')}'. Use jumpybrain ${name} --help.`);
  return renderUsage(requested, help, child);
}

function renderUsage(requested: string, help: CommandHelp, child?: string): string {
  const children = help.children ? Object.entries(help.children).filter(([key]) => !child || key === child).map(([key, detail]) => {
    if (requested === 'run') {
      const operation = commandHelp[key.slice(7)]!;
      return `  jumpybrain run ${key} ${(operation.recipeHelp ?? operation).syntax}`.trimEnd();
    }
    return `  ${key}: ${detail}`;
  }) : [];
  return [
    `Usage: jumpybrain ${requested} ${child ? help.syntax.replace(/^<[^>]+>/u, child) : help.syntax}`.trimEnd(),
    help.summary,
    ...(help.target ? [targetHelp] : []),
    ...children,
    ...(help.details ?? []),
    'See docs/cli-commands.md for examples and advanced contracts.',
  ].join('\n');
}

// Exact help tokens dominate all other flags, including invalid/missing values.
// Resolve only the leading command path; never parse arguments or load an operation.
export function helpForArgv(argv: string[]): string | undefined {
  if (!argv.length) return usage();
  const requested = argv[0] === 'help' || argv.includes('--help') || argv.includes('-h') || argv[1] === 'help';
  if (!requested) return undefined;
  const path: string[] = [];
  for (const token of argv) {
    if (token === 'help' || token === '--help' || token === '-h') continue;
    if (token.startsWith('-') && !Object.hasOwn(aliases, token)) break;
    path.push(token);
  }
  return path.length ? commandUsage(path) : usage();
}

export function runUsage(): string { return commandUsage(['run']); }
export function extensionsUsage(): string { return commandUsage(['extensions']); }
