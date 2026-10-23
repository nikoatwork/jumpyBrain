#!/usr/bin/env node
// Read-only support inbox access. Credentials never enter command arguments or output.
import { loadEnvFile } from 'node:process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const inbox = 'jumpybrain@agentmail.to';
const base = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inbox)}/messages`;

export function parseOptions(args) {
  const options = { limit: 50, maxPages: 10, includeTests: false, includeSpam: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--include-tests') options.includeTests = true;
    else if (arg === '--include-spam') options.includeSpam = true;
    else if (arg === '--help') options.help = true;
    else {
      const names = { '--since': 'since', '--before': 'before', '--message': 'message', '--key-file': 'keyFile', '--page-token': 'pageToken', '--limit': 'limit', '--max-pages': 'maxPages' };
      const name = names[arg], value = args[++i];
      if (!name || !value || value.startsWith('--')) throw new Error(`Unknown or incomplete option: ${arg}`);
      options[name] = ['limit', 'maxPages'].includes(name) ? Number(value) : value;
    }
  }
  for (const name of ['limit', 'maxPages']) if (!Number.isInteger(options[name]) || options[name] < 1 || options[name] > 100) throw new Error(`${name} must be between 1 and 100`);
  for (const name of ['since', 'before']) if (options[name]) {
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(options[name]) || !Number.isFinite(Date.parse(options[name]))) throw new Error(`${name} needs an ISO timestamp with a timezone`);
    options[name] = new Date(options[name]).toISOString();
  }
  if (options.since && options.before && options.since >= options.before) throw new Error('since must precede before');
  return options;
}

export async function queryFeedback(options, { key, fetchImpl = fetch, now = () => new Date() } = {}) {
  if (!key?.trim()) throw new Error('Set AGENTMAIL_READ_API_KEY, AGENTMAIL_API_KEY or AGENTMAIL in the ignored root .env, or pass --key-file PATH.');
  async function get(url) {
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${key.trim()}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`AgentMail returned HTTP ${response.status}${[401, 403].includes(response.status) ? '; use a key authorized to read this inbox' : ''}.`);
    }
    return response.json();
  }
  if (options.message) {
    const message = await get(`${base}/${encodeURIComponent(options.message)}`);
    return { checkedAt: now().toISOString(), inbox, message: { id: message.message_id, thread: message.thread_id, date: message.timestamp,
      from: message.from, subject: message.subject, text: message.text ?? message.extracted_text ?? message.preview ?? '',
      attachments: message.attachments ?? [], labels: message.labels ?? [] } };
  }
  const messages = [], seenTokens = new Set();
  let token = options.pageToken, pages = 0, scanned = 0, excludedTests = 0;
  do {
    if (token && seenTokens.has(token)) throw new Error('AgentMail repeated a page token; coverage is incomplete.');
    if (token) seenTokens.add(token);
    const url = new URL(base);
    url.searchParams.set('limit', String(options.limit));
    url.searchParams.set('labels', 'received');
    if (token) url.searchParams.set('page_token', token);
    if (options.since) url.searchParams.set('after', options.since);
    if (options.before) url.searchParams.set('before', options.before);
    if (options.includeSpam) url.searchParams.set('include_spam', 'true');
    const packet = await get(url);
    if (!Array.isArray(packet.messages)) throw new Error('AgentMail returned an invalid message list.');
    for (const message of packet.messages) {
      scanned++;
      const test = /^\s*\[TEST(?:\s|[\]—:-])/i.test(message.preview ?? '');
      if (test && !options.includeTests) { excludedTests++; continue; }
      messages.push({ id: message.message_id, thread: message.thread_id, date: message.timestamp, from: message.from,
        subject: message.subject, preview: message.preview, test, attachments: message.attachments ?? [],
        url: `https://console.agentmail.to/dashboard/inboxes/${encodeURIComponent(inbox)}?thread=${encodeURIComponent(message.thread_id)}` });
    }
    pages++; token = packet.next_page_token || undefined;
  } while (token && pages < options.maxPages);
  return { checkedAt: now().toISOString(), inbox, scope: { since: options.since ?? null, before: options.before ?? null, receivedOnly: true, includeSpam: options.includeSpam },
    complete: !token, nextPageToken: token ?? null, pages, scanned, excludedTests, messages };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log('npm run feedback:inbox -- [--since ISO_TIMESTAMP] [--before ISO_TIMESTAMP] [--include-tests] [--include-spam]\n  [--message MESSAGE_ID] [--key-file PATH] [--limit 1..100] [--max-pages 1..100] [--page-token TOKEN]\nRead-only JSON output; bounded pagination reports complete:false when more pages remain.');
    return;
  }
  // Load only the repository's ignored file. The app/relay never imports this operator script.
  try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Cannot load the ignored root .env file.'); }
  const key = options.keyFile ? (await readFile(options.keyFile, 'utf8')).trim()
    : process.env.AGENTMAIL_READ_API_KEY || process.env.AGENTMAIL_API_KEY || process.env.AGENTMAIL;
  console.log(JSON.stringify(await queryFeedback(options, { key }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
