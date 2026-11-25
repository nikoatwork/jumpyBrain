// Presentation metadata only: validation and operation policy stay with their owners.
interface CommandHelp {
  summary: string;
  syntax: string;
  details?: string[];
  children?: Record<string, string>;
  /** Flags of a child whose syntax differs from the family's. */
  childSyntax?: Record<string, string>;
  target?: boolean;
  recipe?: boolean;
  recipeHelp?: { summary: string; syntax: string; details?: string[]; target?: boolean };
}

const targetHelp = 'Target: --root <memory-root> OR --target-url <url> (--remote-url alias). Defaults: JUMPYBRAIN_MEMORY_ROOT, then an approved project memory found from this directory (jumpybrain project status), then owning install manifest. Use one selector; remote key: JUMPYBRAIN_API_KEY, else the key the app saved for that URL, else JUMPYBRAIN_API_KEY in ~/.config/jumpybrain/.env. status --target-url shows which key is used (never the key).';
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
  status: { summary: 'Inspect root compatibility and index readiness.', syntax: '[--all [--directory <support-directory>]] [--json]', target: true, recipe: true, details: ['--all: one read-only overview for agents: the CLI target and its key source, every Mac app connection (local/remote, health, effective access from the server role) and local connections whose folder is missing. Changes no notes or connections and never prints keys.'], recipeHelp: { summary: 'Inspect root compatibility and index readiness.', syntax: '[--json]', target: true } },
  index: { summary: 'Refresh derived search state explicitly.', syntax: '[--rebuild] [--lexical | --semantic-model <absolute-local-path> | --setup-semantic [--download-model | --model-file <absolute-path>]] [--json]', details: ['Routine indexing is incremental. --rebuild explicitly regenerates derived state.', 'Index policy flags are mutually exclusive and server-local; remote targets accept --rebuild only.', '--setup-semantic reviews the pinned model cost/terms before any download. Explicit --download-model or --model-file provisions it. Status/recall never download.', 'jumpybrain smart-search on|off is the same consent flow under a discoverable name; --setup-semantic and --lexical keep working.'], target: true, recipe: true },
  'smart-search': { summary: 'Show, turn on or turn off smart search (finds notes that say the same thing in other words).', syntax: '[status | on [--download-model | --model-file <absolute-path>] [--rebuild] | off [--remove-model]] [--root <memory-root>] [--json]', children: { status: 'Default. Say whether this brain uses keyword search or smart search, and whether the model is on this computer.', on: 'Explain the one-time 334 MB model download; nothing is fetched until you repeat with --download-model (or --model-file). Then index this brain; --rebuild when it was indexed with another model.', off: 'Switch this brain back to keyword search. The model stays on disk for other brains unless you add --remove-model.' }, childSyntax: { status: '[--root <memory-root>] [--json]', on: '[--download-model | --model-file <absolute-path>] [--rebuild] [--root <memory-root>] [--json]', off: '[--remove-model] [--root <memory-root>] [--json]' }, details: ['Local brains only: run it on the computer that holds the brain. Same as index --setup-semantic [--download-model] and index --lexical.', 'The model runs only on this computer; no notes are uploaded. Recall, status and doctor never download it.'] },
  tree: { summary: 'Show a bounded memory overview without full note bodies.', syntax: '[--connections] [--show-files] [--limit 10] [--json]', details: ['overview is an alias; --showFiles remains supported.'], target: true, recipe: true },
  process: { summary: 'Preview local lint or apply an authorized processing pass.', syntax: '--mode lint|synthesize|ensure-ids [--topic <text>] [--since <date>] [--limit <n>] [--if-match <hash>] [--preview | --apply] [--json]', details: ['Lint --preview observes without reports, ID repairs, indexes or backend startup; --preview cannot combine with --apply.', 'Local-only: --root <memory-root>. --apply accepts a bare flag or explicit true/false; false does not authorize writes.', 'Synthesis is an extractive source map. Human/dream pages are protected.'], recipe: true },
  dream: { summary: 'Read stateless UTC context windows or check living-page sources.', syntax: '[--from t-0d|YYYY-MM-DD] [--days 3] [--date-basis evidence|modified] [--offset 0] [--out <private-file>] [--json]', details: ['Limits: --max-files <n> --bytes-per-file <n> --max-total-bytes <n>. Human stdout omits full bodies; --out writes a private context packet.', 'Saved source check: --check-sources --id <dream-page-id> [--json].', 'Draft source check: pipe stdin with --check-sources --draft --page-file pages/topic.md [--json].', 'Read-only; no completion or automatic writing. Apply authorized synthesis with remember/update.'], target: true },
  init: { summary: 'Initialize a local Markdown memory root.', syntax: '--root <memory-root> [--force] [--json]' },
  doctor: { summary: 'Inspect local CLI, engine and root readiness.', syntax: '[--root <memory-root>] [--probe-query <text>] [--json] [--check]', details: ['--probe-query tests bounded read-only lexical retrieval without printing matches; it does not test semantic or answer quality. --check exits 1 when required checks or the requested probe fail.'] },
  serve: { summary: 'Host one local memory root.', syntax: '[--root <memory-root>] [--host <host>] [--port <port>] [--api-key <key> ...] [--public-base-url <url>] [--init]', details: ['Defaults/configuration and secure hosting: docs/cloud-shared-memory.md. --init explicitly initializes the selected root.'] },
  project: { summary: 'Show which brain commands here use, and approve project memory on this device.', syntax: '<status|trust|untrust> [--json]', children: { status: 'Show the brain selected from this directory, any project memory found, its approval and capture policy.', trust: '[--root <memory-root>] [--allow-capture]: approve the project memory found here (or --root) on this device.', untrust: '[--root <memory-root>]: remove that approval, including capture.' }, details: ['Selection order: --root/--target-url, JUMPYBRAIN_MEMORY_ROOT, an approved project memory found from this directory, then the managed personal brain.', 'An unapproved project memory found here stops commands until it is approved or a brain is chosen explicitly.', 'Capture: agents may save durable project decisions/findings without asking only when the project jumpybrain.json sets "capture": "durable" and trust used --allow-capture. Never deletion or remote/team writes.', 'Approval is the user\'s decision; agents never run trust on their own.'] },
  identity: { summary: 'Inspect or set the optional device-local display name.', syntax: '[--name <name>] [--json]', details: ['Shared with Mac Settings. Use --name "" to clear it.'] },
  instructions: { summary: 'Print agent memory guidance.', syntax: '[--topic recall|expand|write|maintenance|feedback|board|setup|all]', details: ['Default: short prerequisites and topic directory. Read the relevant topic before operations; all prints full guidance.', 'agent-hint is an alias. No root, credentials or running app required. Recall and shared writes remain explicit.'] },
  version: { summary: 'Print the installed CLI version.', syntax: '', details: ['Aliases: --version, -v.'] },
  run: { summary: 'Run a compatible memory:* recipe.', syntax: '<memory:command> [flags]', children: {}, details: [targetHelp, 'Recipes may discover a local memory root from the current directory. process remains local-only.', 'Use run <memory:command> --help for target flags and operation details.'] },
  migrate: { summary: 'Preview or apply a vault import, or copy a local brain to a shared server.', syntax: '<obsidian|logseq|remote> [flags] [--json]', children: { obsidian: '--source <vault> --root <memory-root> [--apply] [--fail-on-conflict]: import Markdown, preserving source body/YAML bytes.', logseq: '--source <vault> --root <memory-root> [--apply] [--fail-on-conflict] [--body-format readable|preserve]: import pages/journals.', remote: '--root <local-brain> --target-url <server> [--dry-run | --apply]: copy notes and drawings missing on the server and push local edits newer than the server\'s.' }, details: ['Preview (dry run) is the default; --apply writes. Vault imports are local-only; source and indexing remain separate.', 'remote never deletes, never overwrites a newer or concurrently changed server note (If-Match), and lists what it skipped. Copied notes keep their path, ID and exact bytes.'] },
  diff: { summary: 'Compare a local brain with a shared server, note by note and drawing by drawing.', syntax: '--root <local-brain> --target-url <server> [--all] [--json]', details: ['Read only on both sides. Notes match by memory ID, else by path; drawings by name.', 'Status: same, metadata (same body, different frontmatter), local newer, remote newer, both changed (order unknown), local only, remote only. Newer uses each note\'s updated_at.', '--all also lists matching items. Next step: jumpybrain migrate remote with the same flags.'] },
  backend: { summary: 'Manage the shared local root backend.', syntax: '<start|status|stop|list> --root <memory-root> [--json]', children: { start: 'Start or join the authenticated root owner.', status: 'Inspect its status.', stop: 'Stop the root owner.', list: 'Inspect owned descriptors for 1..32 explicit --root values (repeatable); no machine scan.' } },
  access: { summary: 'Show what this CLI and the Mac app may do (whoami), or manage independently revocable access keys.', syntax: '<whoami|issue|list|revoke> (--root <memory-root> | --target-url <url>) [--json]', childSyntax: { whoami: '[--root <memory-root> | --target-url <url>] [--directory <support-directory>] [--json]' }, children: { whoami: 'Read-only check: the brain CLI commands here use, which access key is found and where (never the key), the server role and its capabilities (read, write, manage_access), what this device blocks, and the Mac app\'s own selection and role. Without a target flag it uses the normal CLI default. Nothing is sent when no key is found; an unconfirmed role is shown as not confirmed.', issue: 'Issue with --name <name> [--role reader|writer|admin] (writer default). Output contains the new secret.', list: 'List credential metadata.', revoke: 'Revoke with --id <credential-id>.' }, details: ['issue, list and revoke run on the server with --root, or remotely with an admin key and --target-url.'] },
  collaborate: { summary: 'Read or publish live source operations.', syntax: '<open|watch|edit|stream|status|cancel|finish|undo|resync> --id <mem_id> [--client-id <agent>] [--json]', target: true, children: { open: 'Read the document and its epoch/revision.', watch: 'Watch published changes.', edit: 'Pipe replacement text; --start <UTF-16 offset> --delete <count> --epoch <read-epoch> --base-revision <read-revision>.', stream: 'Pipe UTF-8 chunks; optional --stream-id <id>. Without --start, append to the latest saved document.', status: 'Inspect a stream with --stream-id <id>.', cancel: 'Cancel with --stream-id <id>.', finish: 'Finish with --stream-id <id>.', undo: 'Undo this client\'s operations.', resync: 'Read the latest source snapshot.' }, details: ['Authorized human/agent concurrent editing is normal; an active editor needs no extra permission or request to stop typing.', 'Use collaborate open --json, then edit or stream on the same authorized target/note with a stable --client-id (or JUMPYBRAIN_CLIENT_ID).', 'Calculate UTF-16 offsets from the returned body. Positioned edit/stream requires its actual --epoch and --base-revision; never relabel stale offsets with a newer revision.', 'For rejected overlaps/expired bases, resync --json and reconcile before calculating new offsets. Unpositioned stream appends to the latest saved source.', 'Short addition without positioning: printf "%s\\n" "<addition>" | jumpybrain collaborate stream --target-url <url> --id <mem_id> --json (no --start) appends at the latest saved body end.', 'Use show/update only for intentional whole-note replacement guarded by its content hash.', 'A lost publishing acknowledgement is uncertain and never retried automatically; a canonical save confirms the stored bytes only, not that anyone has viewed them.'] },
  attention: { summary: 'List resurfacing notes or explicitly change their attention.', syntax: '<list|settle|snooze|bring-back> [--json]', target: true, children: { list: 'List active/settled notes with visible totals and omissions (100 per group).', settle: '--id <mem_id> --if-match <contentHash>: settle until content changes.', snooze: '--id <mem_id> --if-match <contentHash> --until <future-ISO-timestamp>.', 'bring-back': '--id <mem_id> --if-match <contentHash>: restore normal resurfacing.' }, details: ['Read the current hash with show before a mutation. No automatic retries.', 'Settled does not mean read or approved. Pins remain device-local.'] },
  drawings: { summary: 'Read and update Excalidraw drawings in drawings/.', syntax: '<list|show|update> [flags] [--json]', target: true, children: { list: 'List drawing names, sizes and update times.', show: '--drawing <name>: text labels and content hash; --json returns the full scene.', update: '--drawing <name> --if-match <hash> --file <scene.excalidraw>: replace the scene.' }, details: ['A name is the drawings/ file name; a trailing .excalidraw is accepted.', 'update accepts a standard Excalidraw file or a saved show --json packet; a changed hash is refused.', 'Drawings are workspace files: not indexed, searched or recalled; tree lists them. Notes mention them as [[Name.excalidraw]].'] },
  board: { summary: 'Manage optional JSON boards over existing Markdown notes.', syntax: '<list|show|status|create|update|add|remove|delete> [flags] [--json]', target: true, children: { list: 'List layouts and hashes, including settled boards.', show: '--board <ID-or-exact-name>: read layout and hash.', status: '--board <board> [--limit 1..50]: fresh note evidence (12 cards default).', create: '--name <name> [--column <name> (three times)] OR --file <board.json>.', update: '--board <board> --if-match <hash> plus --name, --archived true|false, three --column names, OR --file.', add: '--board <board> --page <mem_id> --column <1|2|3> --if-match <hash>: place/move a note.', remove: '--board <board> --page <mem_id> --if-match <hash>: remove a card; preserve the note.', delete: '--board <board> --if-match <hash>: remove a board; preserve notes.' }, details: ['Files contain a name, optional archived, and three columns [{name,pages:[memory IDs]}].', 'Use --file or individual fields. Local boards work without the Mac app.'] },
  connections: { summary: 'Control the Mac app\'s connections; CLI targets stay independent.', syntax: '<list|add|remove|select|test> [--directory <support-directory>] [--json]', children: { list: 'List app connections, their revision, and local folders that are missing.', add: '--name <name> --revision <n> and --root <existing-brain>, or --url <origin> (--key-stdin | --key-env <VARIABLE>): register.', remove: '--id <profile-id> --revision <n>: remove an inactive connection (a remote one also loses its saved key).', select: '--id <local-profile-id> --revision <n>: guarded app selection.', test: '--id <profile-id>: check one connection and its effective access without selecting it.' }, details: ['Running companion required. Default: ~/Library/Application Support/jumpyBrain Companion.', 'Listed revision required. No retries/init/index.', 'Remote keys come from stdin or a named environment variable (else that variable in ~/.config/jumpybrain/.env), never an argument, and are never printed. A key already in the key file is referenced, not copied.', 'What a remote connection may do is its key\'s role on the server; see jumpybrain access whoami.'] },
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
    'Local:   init, status, index, smart-search, tree (overview), process, dream',
    'Tools:   doctor, project, serve, backend, access, collaborate, attention, board, drawings, connections, extensions, migrate, diff',
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
    `Usage: jumpybrain ${requested} ${child ? (help.childSyntax?.[child] !== undefined ? `${child} ${help.childSyntax[child]}` : help.syntax.replace(/^<[^>]+>/u, child)) : help.syntax}`.trimEnd(),
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
