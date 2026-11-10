import assert from 'node:assert/strict';
import test from 'node:test';
import { explorerFiles, explorerFolders, buildExplorerTree, explorerRows, revealExplorerFile, explorerAge, isExplorerSort } from '../dist/adapters/http-server/folder-explorer-model.js';
const id = n => `mem_a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const file = (path, n = 1, title) => ({ file: path, id: id(n), title });

test('folder metadata rejects unsafe paths, retains unavailable notes and deduplicates exact paths', () => {
  const packet = { files: [file('notes/a.md'), file('notes/a.md', 2), file('/absolute.md'), file('../outside.md'),
    file('notes/../outside.md'), file('notes//a.md'), file('notes\\a.md'), file('notes/a.txt'),
    { file: 'notes/no-id.md', id: null }, { file: 'notes/bad-id.md', id: 'invalid' }, file('notes/UPPER.MD', 3), null] };
  assert.deepEqual(explorerFiles(packet).map(item => [item.file, item.id]), [
    ['notes/a.md', id(1)], ['notes/no-id.md', null], ['notes/bad-id.md', null], ['notes/UPPER.MD', id(3)],
  ]);
  assert.throws(() => explorerFiles({ files: null }), /Invalid folder list/);
});

test('root folders stay distinct, folders sort first and file ordering is natural', () => {
  const tree = buildExplorerTree([file('notes/z10.md'), file('notes/Z2.md'), file('notes/projects/current/a.md'), file('decisions/b.md')]);
  const rows = explorerRows(tree, new Set(['notes']));
  assert.deepEqual(rows.map(row => row.label), ['decisions', 'notes', 'projects/current', 'Z2', 'z10']);
  assert.deepEqual(rows.map(row => row.level), [1, 1, 2, 2, 2]);
  assert.equal(rows[2].node.path, 'notes/projects/current');
  assert.equal(rows[2].parent, 'notes');
  assert.deepEqual(rows.slice(2).map(row => [row.position, row.siblings]), [[1, 3], [2, 3], [3, 3]]);
});

test('compaction stops at files and directory branching', () => {
  const tree = buildExplorerTree([file('notes/projects/a/leaf/one.md'), file('notes/projects/b/two.md'), file('notes/projects/root.md')]);
  const rows = explorerRows(tree, new Set(['notes', 'notes/projects']));
  assert.deepEqual(rows.map(row => row.label), ['notes', 'projects', 'a/leaf', 'b', 'root']);
  assert.equal(rows[3].parent, 'notes/projects');
});

test('search matches titles and paths with ancestry, preserving distinct same-named notes', () => {
  const tree = buildExplorerTree([file('notes/projects/alpha/shared.md', 1, 'Unique first title'),
    file('notes/projects/beta/shared.md', 2, 'Second choice'), file('pages/travel.md', 3, 'Holiday')]);
  assert.deepEqual(explorerRows(tree, new Set(), 'UNIQUE FIRST').map(row => row.node.path), [
    'notes', 'notes/projects', 'notes/projects/alpha', 'notes/projects/alpha/shared.md',
  ]);
  assert.equal(explorerRows(tree, new Set(), 'shared').filter(row => row.node.kind === 'file').length, 2);
  assert.deepEqual(explorerRows(tree, new Set(), 'projects/beta').filter(row => row.node.kind === 'file').map(row => row.node.id), [id(2)]);
  assert.deepEqual(explorerRows(tree, new Set(), 'not present'), []);
});

test('search disclosure is independent and clearing search restores manual tree state', () => {
  const tree = buildExplorerTree([file('notes/work/a.md'), file('notes/work/b.md')]);
  const expanded = new Set(['notes']), original = [...expanded];
  assert.deepEqual(explorerRows(tree, expanded).map(row => row.label), ['notes', 'work']);
  assert.deepEqual(explorerRows(tree, expanded, 'work').map(row => row.label), ['notes', 'work', 'a', 'b']);
  assert.deepEqual(explorerRows(tree, expanded, 'work', new Set(['notes/work'])).map(row => row.label), ['notes', 'work']);
  assert.deepEqual([...expanded], original);
  assert.deepEqual(explorerRows(tree, expanded).map(row => row.label), ['notes', 'work']);
});

test('active reveal opens only ancestors, including compacted chains', () => {
  const tree = buildExplorerTree([file('notes/work/project/one.md'), file('notes/other/two.md'), file('pages/three.md')]);
  const expanded = new Set(); revealExplorerFile(tree, 'notes/work/project/one.md', expanded);
  assert.deepEqual([...expanded], ['notes', 'notes/work', 'notes/work/project']);
  assert.deepEqual(explorerRows(tree, expanded).map(row => row.label), ['notes', 'other', 'work/project', 'one', 'pages']);
});


test('explicit empty folders merge with inferred ancestry and remain searchable', () => {
  const folders = explorerFolders({ folders: ['notes/empty', 'notes/empty', 'pages', '../escape', 'notes/.hidden', '/absolute', null] });
  assert.deepEqual(folders, ['notes/empty', 'pages']);
  const tree = buildExplorerTree([file('notes/existing/a.md')], folders);
  assert.deepEqual(explorerRows(tree, new Set(['notes'])).map(row => row.node.path), ['notes', 'notes/empty', 'notes/existing', 'pages']);
  assert.deepEqual(explorerRows(tree, new Set(), 'empty').map(row => row.node.path), ['notes', 'notes/empty']);
  assert.deepEqual(explorerFolders({ files: [] }), []);
});

test('date orders sort notes newest first inside each folder while folders stay alphabetical', () => {
  const dated = (path, n, updatedAt, createdAt) => ({ ...file(path, n), ...(updatedAt ? { updatedAt } : {}), ...(createdAt ? { createdAt } : {}) });
  const files = explorerFiles({ files: [
    dated('notes/a.md', 1, '2026-11-01T10:00:00Z', '2026-01-05T00:00:00Z'),
    dated('notes/b.md', 2, '2026-11-09T10:00:00Z', '2026-01-01T00:00:00Z'),
    dated('notes/c.md', 3, undefined, '2026-03-01T00:00:00Z'),
    dated('notes/d.md', 4),
    dated('notes/z-folder/x.md', 5, '2026-11-10T00:00:00Z'),
    dated('notes/e.md', 6, 'not a date', 'also bad'),
  ] });
  assert.equal(files.find(item => item.file === 'notes/e.md').updatedAt, undefined, 'invalid packet dates are dropped');
  const labels = sort => explorerRows(buildExplorerTree(files, ['notes/a-empty'], sort), new Set(['notes'])).map(row => row.label);
  assert.deepEqual(labels('name'), ['notes', 'a-empty', 'z-folder', 'a', 'b', 'c', 'd', 'e']);
  // Edited falls back to creation; undated notes keep natural order after dated ones.
  assert.deepEqual(labels('edited'), ['notes', 'a-empty', 'z-folder', 'b', 'a', 'c', 'd', 'e']);
  assert.deepEqual(labels('created'), ['notes', 'a-empty', 'z-folder', 'c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(labels('edited'), labels('edited'), 'deterministic');
});

test('date captions reuse compact ages and name order has none', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const node = { updatedAt: '2026-11-07T12:00:00Z', createdAt: '2026-11-10T11:30:00Z' };
  assert.equal(explorerAge(node, 'edited', now).label, '3d');
  assert.match(explorerAge(node, 'edited', now).details, /^Last edited /);
  assert.equal(explorerAge(node, 'created', now).label, '30m');
  assert.match(explorerAge(node, 'created', now).details, /^Created /);
  assert.deepEqual(explorerAge(node, 'name', now), { label: '', details: '' });
  assert.deepEqual(explorerAge({}, 'created', now), { label: '', details: 'No creation date' });
  assert.equal(explorerAge({ createdAt: '2026-11-07T12:00:00Z' }, 'edited', now).label, '3d', 'edit order falls back to creation');
  assert.equal(isExplorerSort('edited'), true);
  assert.equal(isExplorerSort('size'), false);
  assert.equal(isExplorerSort(null), false);
});
