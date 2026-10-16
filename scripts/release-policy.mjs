// Stable release numbers; beta is a product/release label, not a fourth counter.
export function nextReleaseVersion(current, bump = "patch", approveMajor = false) {
  const parse = value => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw new Error(`Expected a stable major.minor.patch version: ${value}`);
    const parts = value.split(".").map(Number);
    if (parts.some(n => !Number.isSafeInteger(n))) throw new Error("Version component exceeds safe integer range");
    return parts;
  };
  const old = parse(current);
  let next;
  if (bump === "patch") next = [old[0], old[1], old[2] + 1];
  else if (bump === "minor") next = [old[0], old[1] + 1, 0];
  else if (bump === "major") next = [old[0] + 1, 0, 0];
  else next = parse(bump);
  parse(next.join("."));
  const firstDifference = next.findIndex((n, i) => n !== old[i]);
  if (firstDifference < 0 || next[firstDifference] < old[firstDifference]) throw new Error("Release version must increase");
  if (next[0] > old[0] && !approveMajor) throw new Error("Major releases, including 0.x → 1.0, require explicit user approval; only then pass --approve-major");
  return next.join(".");
}

export function releaseOptions(args) {
  let bump = "patch", selected = false, approveMajor = false, dryRun = false;
  for (const arg of args) {
    if (arg === "--approve-major") approveMajor = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("-") || selected) throw new Error(`Unknown or extra release argument: ${arg}`);
    else { bump = arg; selected = true; }
  }
  return { bump, approveMajor, dryRun };
}
