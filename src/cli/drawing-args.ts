import type { ParsedCliArgs } from './args.js';
import { commandUsage } from './usage.js';

export function drawingsUsage(): string { return commandUsage(['drawings']); }

const FIELDS: Record<string, string[]> = { list: [], show: ['drawing'], update: ['drawing', 'if-match', 'file'] };

export function parseDrawingArgs(argv: string[]): ParsedCliArgs {
  const command = argv[1];
  if (!command || ['help', '--help'].includes(command)) {
    if (argv.length > (command ? 2 : 1)) throw new Error('Unexpected drawings help argument.');
    return { _: ['drawings'], help: true };
  }
  if (!Object.hasOwn(FIELDS, command)) throw new Error(`Unknown drawings command.\n${drawingsUsage()}`);
  const args: ParsedCliArgs = { _: ['drawings', command] };
  const values = new Set(['root', 'target-url', 'remote-url', ...FIELDS[command]!]);
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith('--')) throw new Error('Unexpected drawings argument. Boolean flags take no value.');
    const equal = token.indexOf('='), key = token.slice(2, equal < 0 ? undefined : equal);
    if (Object.hasOwn(args, key)) throw new Error(`--${key} must not be repeated.`);
    if (['help', 'json'].includes(key)) {
      if (equal >= 0) throw new Error(`--${key} takes no value.`);
      args[key] = true;
    } else if (values.has(key)) {
      const value = equal >= 0 ? token.slice(equal + 1) : argv[++i];
      if (!value || value.startsWith('--') || !value.trim()) throw new Error(`--${key} requires a value.`);
      args[key] = value;
    } else throw new Error(`Unknown drawings flag --${key}.`);
  }
  if (args.help) return args;
  if (command !== 'list' && !args.drawing) throw new Error('--drawing <name> is required.');
  if (typeof args.drawing === 'string') args.drawing = args.drawing.replace(/\.excalidraw$/iu, '');
  if (command === 'update') {
    if (args['if-match'] === undefined) throw new Error('--if-match <contentHash> from drawings show is required.');
    if (!/^sha256:[0-9a-f]{64}$/.test(String(args['if-match']))) throw new Error('--if-match requires the prior drawing content hash.');
    if (!args.file) throw new Error('--file <scene.excalidraw> is required.');
  }
  if (['root', 'target-url', 'remote-url'].filter(key => args[key] !== undefined).length > 1) throw new Error('Use only one target selector: --root, --target-url or --remote-url.');
  return args;
}
