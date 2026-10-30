import type { ParsedCliArgs } from './args.js';
import { MEMORY_DOCUMENT_ID_PATTERN } from '../core/document-id-format.js';

export function boardUsage(): string {
  return [
    'Usage:',
    '  jumpybrain board list [--json]',
    '  jumpybrain board show|status --board <ID-or-exact-name> [--json]',
    '  jumpybrain board create --name <name> [--column <name> --column <name> --column <name>] [--json]',
    '  jumpybrain board create --file <board.json> [--json]',
    '  jumpybrain board update --board <board> --if-match <contentHash> [--name <name>] [--archived true|false] [--file <board.json>] [--column <name> (three times)]',
    '  jumpybrain board add --board <board> --page <mem_id> --column <1|2|3> --if-match <contentHash>',
    '  jumpybrain board remove --board <board> --page <mem_id> --if-match <contentHash>',
    '  jumpybrain board delete --board <board> --if-match <contentHash>',
    '',
    'All commands require --root <memory-root> or --target-url <url> and accept --json.',
    'Local boards work without the Mac app. Remote credentials use JUMPYBRAIN_API_KEY.',
    'status reads up to 12 cards; --limit 1..50 increases evidence coverage. Missing/omitted evidence is explicit.',
    'show returns layout and content hash without reading notes. list includes settled boards.',
    'add places or moves an existing note; remove/delete preserve Markdown notes.',
    'Files contain name, optional archived, and three columns [{name,pages:[memory IDs]}].',
    'Create/edit card contents with ordinary remember/update commands on the matching root/target.',
  ].join('\n');
}

export function parseBoardArgs(argv: string[]): ParsedCliArgs {
  const command = argv[1];
  if (!command || ['help', '--help'].includes(command)) {
    if (argv.length > (command ? 2 : 1)) throw new Error('Unexpected board help argument.');
    return { _: ['board'], help: true };
  }
  const fields: Record<string, string[]> = {
    list: [], show: ['board'], status: ['board', 'limit'], create: ['name', 'column', 'file'],
    update: ['board', 'if-match', 'name', 'column', 'archived', 'file'],
    delete: ['board', 'if-match'], add: ['board', 'if-match', 'page', 'column'], remove: ['board', 'if-match', 'page'],
  };
  if (!Object.hasOwn(fields, command)) throw new Error(`Unknown board command.\n${boardUsage()}`);
  const args: ParsedCliArgs = { _: ['board', command] };
  const values = new Set(['root', 'target-url', 'remote-url', ...fields[command]!]);
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) throw new Error('Unexpected board argument. Boolean flags take no value.');
    const equal = token.indexOf('='), key = token.slice(2, equal < 0 ? undefined : equal);
    const repeatedColumn = key === 'column' && ['create', 'update'].includes(command);
    if (Object.hasOwn(args, key) && !repeatedColumn) throw new Error(`--${key} must not be repeated.`);
    if (['help', 'json'].includes(key)) {
      if (equal >= 0) throw new Error(`--${key} takes no value.`);
      args[key] = true;
    } else if (values.has(key)) {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++i];
      if (!value || value.startsWith('--') || !value.trim()) throw new Error(`--${key} requires a value.`);
      if (repeatedColumn) args[key] = [...(args[key] as string[] ?? []), value];
      else args[key] = value;
    } else throw new Error(`Unknown board flag --${key}.`);
  }
  if (args.help) return args;
  if (!['list', 'create'].includes(command) && !args.board) throw new Error('--board is required.');
  if (['update', 'delete', 'add', 'remove'].includes(command) && args['if-match'] === undefined) throw new Error('--if-match <contentHash> from board list/show/status is required.');
  if (args['if-match'] !== undefined && !/^sha256:[0-9a-f]{64}$/.test(String(args['if-match']))) throw new Error('--if-match requires the prior board content hash.');
  const targets = ['root', 'target-url', 'remote-url'].filter(key => args[key] !== undefined);
  if (targets.length !== 1) throw new Error('Choose exactly one --root or --target-url.');
  for (const key of ['limit']) if (args[key] !== undefined && (!/^\d+$/.test(String(args[key])) || !Number.isSafeInteger(Number(args[key])))) throw new Error(`--${key} must be an integer.`);
  if (args.limit !== undefined && (Number(args.limit) < 1 || Number(args.limit) > 50)) throw new Error('--limit must be 1–50.');
  if (args.archived !== undefined && !['true', 'false'].includes(String(args.archived))) throw new Error('--archived must be true or false.');
  if (['add', 'remove'].includes(command) && !MEMORY_DOCUMENT_ID_PATTERN.test(String(args.page ?? ''))) throw new Error('--page requires a canonical memory ID.');
  if (command === 'add' && !/^[123]$/.test(String(args.column ?? ''))) throw new Error('--column must be 1, 2 or 3.');
  if (Array.isArray(args.column) && args.column.length !== 3) throw new Error('Supply exactly three --column names.');
  if (args.file && ['name', 'column', 'archived'].some(key => args[key] !== undefined)) throw new Error('Use --file or individual board fields, not both.');
  if (command === 'create' && !args.name && !args.file) throw new Error('Create requires --name or --file.');
  if (command === 'update' && !['name', 'column', 'archived', 'file'].some(key => args[key] !== undefined)) throw new Error('Update requires at least one board field.');
  return args;
}
