// Decimal bytes, with deliberate headroom over the measured October 2026 package.
// Change budgets only with a measured explanation in docs/build-footprint.md.
export const packageBudget = Object.freeze({
  archiveBytes: 1_300_000,
  unpackedBytes: 3_800_000,
  runtimeBytes: 2_500_000,
  files: 600,
});

export function validatePackageBudget(info) {
  if (!Array.isArray(info?.files)) throw new Error('npm pack must report its file manifest.');
  const metrics = {
    archiveBytes: info.size,
    unpackedBytes: info.unpackedSize,
    runtimeBytes: info.files.filter(file => file.path.startsWith('dist/')).reduce((sum, file) => sum + file.size, 0),
    files: info.entryCount,
  };
  for (const [name, limit] of Object.entries(packageBudget)) {
    const value = metrics[name];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid package metric: ${name}.`);
    if (value > limit) throw new Error(`Package budget exceeded: ${name} = ${value}, limit ${limit}. See docs/build-footprint.md.`);
  }
  return metrics;
}
