// Public routing configuration only. Never load mail credentials into builds.
export function resolveFeedbackUrl(pkg, env = process.env) {
  const value = env.JUMPYBRAIN_FEEDBACK_URL ?? pkg.jumpybrain?.feedbackUrl;
  if (typeof value !== 'string') throw new Error('A default public feedback URL is required; set JUMPYBRAIN_FEEDBACK_URL to override it or explicitly set it empty to disable delivery.');
  if (value) {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Feedback URL must use HTTPS without credentials or a fragment.');
  }
  return value;
}

export function validatePackFeedbackConfig(config, pkg, env = process.env) {
  const expected = resolveFeedbackUrl(pkg, env);
  if (config?.url !== expected || (!expected && env.JUMPYBRAIN_FEEDBACK_URL !== '')) {
    throw new Error('Package feedback configuration differs from the intended endpoint or is unexpectedly disabled.');
  }
  return { configured: Boolean(expected) };
}
