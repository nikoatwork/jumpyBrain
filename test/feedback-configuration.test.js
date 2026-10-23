import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveFeedbackUrl, validatePackFeedbackConfig } from '../scripts/feedback-config.mjs';

const pkg = { jumpybrain: { feedbackUrl: 'https://support.example.com/support/feedback' } };
test('default feedback survives an ordinary build without shell configuration', () => {
  assert.equal(resolveFeedbackUrl(pkg, {}), pkg.jumpybrain.feedbackUrl);
  assert.deepEqual(validatePackFeedbackConfig({ url: pkg.jumpybrain.feedbackUrl }, pkg, {}), { configured: true });
  assert.throws(() => validatePackFeedbackConfig({ url: '' }, pkg, {}), /unexpectedly disabled/);
  assert.throws(() => validatePackFeedbackConfig({}, pkg, {}));
  assert.throws(() => resolveFeedbackUrl({}, {}), /default public feedback URL/);
});
test('custom hosts and explicit disabled builds remain deliberate overrides', () => {
  assert.equal(resolveFeedbackUrl(pkg, { JUMPYBRAIN_FEEDBACK_URL: 'https://custom.example.com/feedback' }), 'https://custom.example.com/feedback');
  assert.equal(resolveFeedbackUrl(pkg, { JUMPYBRAIN_FEEDBACK_URL: '' }), '');
  assert.deepEqual(validatePackFeedbackConfig({ url: '' }, pkg, { JUMPYBRAIN_FEEDBACK_URL: '' }), { configured: false });
  for (const url of ['http://example.com', 'https://user:secret@example.com', 'https://example.com/#fragment']) assert.throws(() => resolveFeedbackUrl(pkg, { JUMPYBRAIN_FEEDBACK_URL: url }));
});
