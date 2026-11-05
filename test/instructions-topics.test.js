import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { agentInstructions } from '../dist/cli/instructions.js';
import { parseArgs } from '../dist/cli/args.js';
import { commandUsage } from '../dist/cli/usage.js';
import { renderIntegration } from '../integrations/electron/managed-integrations.mjs';

const topics = ['recall', 'expand', 'write', 'maintenance', 'feedback', 'board', 'setup'];
test('short CLI and installed skill entry points discover every operation topic and retain prerequisites', async () => {
  const skill = await readFile(new URL('../skills/jumpybrain-memory/SKILL.md', import.meta.url), 'utf8');
  const initial = agentInstructions();
  assert.ok(Buffer.byteLength(initial) < 4000);
  assert.ok(Buffer.byteLength(skill) < 5500);
  for (const text of [initial, skill]) {
    for (const topic of topics) assert.match(text, new RegExp(topic));
    for (const rule of [/before.*(?:save|write)/i, /explicit destination authorization/, /year was not specified/, /created_at.*updated_at/, /saved:true/, /same hash/, /expansion\.id/, /expansion\.expectedContentHash/, /TTY is not authorship evidence/, /stay[s]? unknown/, /session summary/, /secrets/]) assert.match(text, rule);
  }
  for (const topic of topics) {
    const text = agentInstructions(topic);
    for (const paragraph of text.split('\n\n').slice(1)) assert.ok(agentInstructions('all').includes(paragraph));
    for (const command of ['instructions', 'agent-hint']) {
      const result = spawnSync(process.execPath, ['dist/cli.js', command, '--topic', topic], {
        encoding: 'utf8', env: { ...process.env, HOME: '/nonexistent-instructions-home', JUMPYBRAIN_CLI_CONFIG: '', JUMPYBRAIN_API_KEY: '', JUMPYBRAIN_REMOTE_URL: 'https://must-not-contact.invalid' }, timeout: 5000,
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, text + '\n');
    }
  }
  assert.match(agentInstructions('recall'), /JUMPYBRAIN_API_KEY/);
  assert.match(agentInstructions('write'), /saved:true/);
  assert.match(agentInstructions('write'), /Shared\/global\/team\/remote/);
  for (const rule of [/collaborate open/, /UTF-16/, /actual --epoch and --base-revision/, /Never relabel old offsets/, /replay uncertain writes/, /whole note per chunk/]) assert.match(agentInstructions('write'), rule);
  assert.match(agentInstructions('expand'), /same hash/);
  assert.match(agentInstructions('maintenance'), /--preview/);
});

test('topic and preview flags are discoverable, strict and help stays side-effect free', () => {
  assert.match(commandUsage(['instructions']), /--topic.*all/);
  assert.match(commandUsage(['process']), /--preview/);
  assert.match(commandUsage(['run', 'memory:process']), /--preview/);
  for (const command of ['instructions', 'agent-hint']) for (const flags of [['--topic'], ['--topic', '--json'], ['--topic', 'recall', '--topic', 'write'], ['--topc', 'write'], ['surprise']]) assert.throws(() => parseArgs([command, ...flags]), /requires a value|repeated|Unknown|Unexpected/);
  assert.throws(() => agentInstructions('typo'), /Unknown instructions topic/);
});

test('emitted guidance makes authorized concurrent editing normal at every entry point', async () => {
  const skill = await readFile(new URL('../skills/jumpybrain-memory/SKILL.md', import.meta.url), 'utf8');
  const docs = await readFile(new URL('../docs/agent-workflows.md', import.meta.url), 'utf8');
  const hint = docs.split('## Agent MD hint')[1].match(/```text\n([\s\S]*?)```/)[1];
  // Use the installer's renderer with fictional paths; never modify installed integrations.
  const rendered = renderIntegration(skill, { memoryRoot: '/fixture/brain', cliPath: '/fixture/bin/jumpybrain', asset: 'skill' });
  assert.doesNotMatch(rendered, /__JUMPYBRAIN_/);
  for (const text of [agentInstructions(), agentInstructions('write'), rendered, hint, commandUsage(['collaborate'])]) {
    assert.match(text, /(?:authorized|authorization)[\s\S]*concurrent/i);
    assert.match(text, /active editor needs no extra permission/i);
    assert.match(text, /collaborate open/);
  }
  const write = agentInstructions('write');
  assert.ok(write.indexOf('collaborate open') < write.indexOf('jumpybrain show'), 'prefer source operations before whole-note replacement');
  assert.match(write, /intentional whole-note replacement/i);
  assert.match(write, /resync[\s\S]*reconcil/i);
  assert.match(write, /stable --client-id/);
  assert.match(write, /rejected overlaps or expired bases require collaborate resync/);
  for (const command of [[], ['--topic', 'write']]) {
    const result = spawnSync(process.execPath, ['dist/cli.js', 'instructions', ...command], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, agentInstructions(command.length ? 'write' : undefined) + '\n');
  }
  const help = spawnSync(process.execPath, ['dist/cli.js', 'collaborate', '--help'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(help.status, 0, help.stderr);
  assert.equal(help.stdout.trim(), commandUsage(['collaborate']));
});
