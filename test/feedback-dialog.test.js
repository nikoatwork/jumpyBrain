import assert from 'node:assert/strict';
import test from 'node:test';
import { installFeedback } from '../dist/adapters/http-server/feedback.js';

function harness() {
  const nodes = Object.fromEntries(['feedback-dialog', 'feedback-message', 'feedback-include-logs', 'feedback-status', 'feedback-send', 'feedback-close', 'open-feedback'].map(id => [id, Object.assign(new EventTarget(), { value: '', checked: false, dataset: {}, textContent: '', focus() { document.activeElement = this; } })]));
  const dialog = nodes['feedback-dialog'];
  Object.assign(dialog, { open: false, showModal() { this.open = true; }, close() { this.open = false; } });
  const document = { getElementById: id => nodes[id], querySelector: () => dialog.open ? dialog : null };
  const window = Object.assign(new EventTarget(), { crypto, navigator: { userAgent: 'fixture' }, location: { origin: 'https://fixture' }, setTimeout, clearTimeout });
  const calls = [], successes = [];
  const feedback = installFeedback({ document, window, diagnostics: { snapshot: () => '', event() {} }, context: () => ({}),
    submit(report) { return new Promise((resolve, reject) => calls.push({ report, resolve, reject })); }, onSubmitted: id => successes.push(id) });
  const click = name => nodes[name].dispatchEvent(new Event('click'));
  return { nodes, document, calls, successes, feedback, click, dialog };
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('confirmed send closes once, clears only submitted draft and restores focus; failures retry the frozen ID', async () => {
  const h = harness(); h.click('open-feedback'); h.nodes['feedback-message'].value = 'Synthetic feedback';
  h.click('feedback-send'); h.click('feedback-send'); h.click('feedback-close');
  assert.equal(h.calls.length, 1); assert.equal(h.dialog.open, true);
  h.calls[0].resolve({ accepted: true, id: 'wrong-id' }); await settle();
  assert.equal(h.dialog.open, true); assert.equal(h.nodes['feedback-message'].value, 'Synthetic feedback');
  assert.deepEqual(h.successes, []);
  h.click('feedback-close'); h.click('open-feedback'); h.click('feedback-send');
  assert.deepEqual(h.calls[1].report, h.calls[0].report);
  h.calls[1].resolve({ accepted: true, id: h.calls[1].report.id }); await settle();
  assert.equal(h.dialog.open, false); assert.equal(h.nodes['feedback-message'].value, '');
  assert.equal(h.document.activeElement, h.nodes['open-feedback']);
  assert.deepEqual(h.successes, [h.calls[0].report.id]);
  h.click('open-feedback'); assert.equal(h.nodes['feedback-message'].value, '');
});
test('forced session close suppresses late success and failure UI and prevents duplicate sends on reopen', async () => {
  for (const success of [true, false]) {
    const h = harness(); h.click('open-feedback'); h.nodes['feedback-message'].value = 'Synthetic feedback'; h.click('feedback-send');
    h.feedback.close(false); h.click('open-feedback'); h.click('feedback-send');
    assert.equal(h.dialog.open, false); assert.equal(h.calls.length, 1);
    if (success) h.calls[0].resolve({ accepted: true, id: h.calls[0].report.id }); else h.calls[0].reject(new Error('offline'));
    await settle(); assert.deepEqual(h.successes, []); assert.equal(h.dialog.open, false);
    h.click('open-feedback');
    assert.equal(h.nodes['feedback-message'].value, success ? '' : 'Synthetic feedback');
    assert.equal(h.nodes['feedback-status'].textContent, '');
  }
});
