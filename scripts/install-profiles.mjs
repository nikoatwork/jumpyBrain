// Install profiles and add-ons: what someone wants to do, mapped onto the
// installer's existing mode flags. Pure functions plus one optional terminal
// prompt; imports only Node built-ins because install.sh downloads it as a helper.
import { lstatSync, unlinkSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_PROFILE = 'personal';

// Outcome first, details underneath. Sizes are approximate, measured on a Mac
// (macOS arm64, v0.3.27) and on Linux x64 (Ubuntu 24.04, v0.3.28, where the engine
// also installs CUDA and Vulkan builds); they are guidance, not guarantees.
export const PROFILES = Object.freeze({
  personal: {
    label: 'Personal memory for my agents',
    outcome: 'Your agents remember and recall notes on this computer, with keyword search.',
    details: [
      'Installs: the jumpyBrain CLI (about 20 MB), a local search engine (QMD, about 205 MB on a Mac, about 860 MB on Linux x64), a Markdown folder for your notes and skills for the agents it detects.',
      'Runs: on this computer, when you or an agent use jumpyBrain. Search reads your notes folder locally.',
      'Network: downloads the software once. Your notes stay in the folder on this computer; no account or server is needed.',
    ],
  },
  'mac-app': {
    label: 'Mac app, plus personal memory for my agents',
    outcome: 'Write and browse your brain in a Mac window; your agents use the same folder.',
    details: [
      'Installs: everything in personal memory, plus jumpyBrain.app in ~/Applications (about 310 MB, built on this Mac; needs macOS 13+, Python 3.9+ and Xcode command-line tools).',
      'Runs: the app and its local helper while it is open; closing the window keeps it in the menu bar until you quit it.',
      'Network: downloads the software and the app\'s build tools once. Your notes stay on this computer.',
    ],
  },
  remote: {
    label: 'Connect my agents to a team brain',
    outcome: 'Your agents read and write a shared brain on a jumpyBrain server. Nothing is stored or searched on this computer.',
    details: [
      'Installs: the CLI only (about 10 MB). No search engine, no local notes folder, no agent skills.',
      'Network: every recall and save goes to the server you name with --target-url, using the access key you were given.',
      'This choice is fixed for the installation; use a separate --install-root to also keep personal memory.',
    ],
  },
  browse: {
    label: 'Browse a team brain in the browser',
    outcome: 'Read a shared brain in your web browser. There is nothing to install.',
    details: [
      'Open the brain\'s web address (the person who runs the server gives it to you), choose Connect and paste the access key they gave you.',
      'Nothing is downloaded or written on this computer.',
    ],
  },
});
export const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));

// The pinned smart-search model (the CLI's SEMANTIC_MODEL; a test keeps them equal).
export const SMART_SEARCH_MODEL = Object.freeze({ sha256: 'b5ce9d77a3fc4b3b39ccb5643c36777911cc4eb46a66962eadfa3f5f60490d63', bytes: 333590944, host: 'huggingface.co' });
export const SMART_SEARCH = Object.freeze({
  label: 'Smart search',
  outcome: 'Also finds notes that say the same thing in other words, not only notes with matching words.',
  details: [
    'Downloads a 334 MB language model (EmbeddingGemma 300M) once, from Hugging Face, into ~/.jumpybrain/models. Allow up to twice that while downloading.',
    'Runs only on this computer, while indexing and searching; it uses extra memory then. None of your notes are sent anywhere.',
    'Optional and reversible: add it later with `jumpybrain smart-search on`, turn it off with `jumpybrain smart-search off`.',
  ],
});

/** Device-local model path, matching the CLI's model directory rule. */
export function smartSearchModelPath(home, env = process.env, modelId = `sha256:${SMART_SEARCH_MODEL.sha256}`) {
  if (!/^sha256:[a-f0-9]{64}$/.test(modelId)) throw new Error('Invalid device-local model identity.');
  const directory = env.JUMPYBRAIN_MODEL_DIRECTORY && path.isAbsolute(env.JUMPYBRAIN_MODEL_DIRECTORY) ? env.JUMPYBRAIN_MODEL_DIRECTORY : path.join(home, '.jumpybrain/models');
  return path.join(directory, `${modelId.slice(7)}.gguf`);
}

/**
 * Frees the downloaded model after the brain is back on keyword search. Only the
 * regular file named by the brain's managed SHA-256 identity inside a real (unlinked) model directory.
 */
export function removeSmartSearchModel(home, env = process.env, modelId) {
  const file = smartSearchModelPath(home, env, modelId);
  try {
    const directory = lstatSync(path.dirname(file));
    if (!directory.isDirectory() || directory.isSymbolicLink()) return { path: file, removed: false, reason: 'model directory is not a plain directory' };
    const info = lstatSync(file);
    if (!info.isFile()) return { path: file, removed: false, reason: 'not a regular file' };
    unlinkSync(file);
    return { path: file, removed: true, bytes: info.size };
  } catch (error) { if (error.code === 'ENOENT') return { path: file, removed: false }; throw error; }
}

const fail = message => { throw new Error(message); };

/**
 * Validates --profile/--smart-search against the older mode flags and maps the
 * profile onto them. Mutates and returns `options`. Older flags alone keep
 * working and imply their profile; nothing changes for runs without new flags.
 */
export function applyProfileFlags(options) {
  const { profile } = options;
  if (profile !== undefined && !PROFILE_NAMES.includes(profile)) fail(`--profile must be one of ${PROFILE_NAMES.join(', ')}.`);
  if (options.smartSearch !== undefined && options.provided?.has('no-smart-search') && options.provided?.has('smart-search')) fail('--smart-search and --no-smart-search cannot be combined.');
  if (profile === 'browse') {
    if (options.withApp || options.remoteOnly || options.smartSearch !== undefined) fail('--profile browse installs nothing; it cannot be combined with --with-app, --remote-only or --smart-search.');
    return options;
  }
  if (profile === 'remote') {
    if (options.withApp) fail('--profile remote (connect agents to a team brain) cannot include --with-app; the Mac app needs a local brain.');
    options.remoteOnly = true;
  }
  if (profile === 'mac-app') {
    if (options.remoteOnly) fail('--profile mac-app cannot be combined with --remote-only.');
    options.withApp = true;
  }
  if (profile === 'personal' && (options.withApp || options.remoteOnly)) fail(`--profile personal installs the CLI only; drop ${options.withApp ? '--with-app (or use --profile mac-app)' : '--remote-only (or use --profile remote)'}.`);
  if (options.remoteOnly && options.smartSearch === true) fail('Smart search runs on the computer that holds the brain. A remote-only CLI (connect agents to a team brain) has no local brain; ask the server operator to turn it on there.');
  return options;
}

/** The profile an older manifest implies; recorded profiles always win. */
export function recordedProfile(manifest, { appInstalled = false } = {}) {
  if (!manifest) return undefined;
  if (PROFILE_NAMES.includes(manifest.profile)) return manifest.profile;
  if (manifest.remoteOnly === true) return 'remote';
  return appInstalled ? 'mac-app' : 'personal';
}

/** The profile this run applies: explicit flag, then the recorded one, then what the old flags imply. */
export function effectiveProfile(options, previous) {
  if (options.profile) return options.profile;
  if (previous) return options.withApp && previous === 'personal' ? 'mac-app' : previous;
  return options.remoteOnly ? 'remote' : options.withApp ? 'mac-app' : DEFAULT_PROFILE;
}

/** The plan shown before installing and in --dry-run --json. */
export function describePlan({ profile, smartSearch, smartSearchAction, existing }) {
  const choice = PROFILES[profile];
  return {
    profile, label: choice.label, outcome: choice.outcome, details: choice.details,
    addOns: { smartSearch: Boolean(smartSearch) },
    smartSearch: { enabled: Boolean(smartSearch), action: smartSearchAction ?? 'none', ...(profile === 'remote' || profile === 'browse' ? { available: false } : { outcome: SMART_SEARCH.outcome, details: SMART_SEARCH.details, downloadBytes: SMART_SEARCH_MODEL.bytes }) },
    existing: Boolean(existing),
  };
}

export function formatPlan(plan) {
  const lines = [`Plan: ${plan.label}${plan.existing ? ' (recorded for this installation)' : ''}`, `  ${plan.outcome}`, ...plan.details.map(line => `  - ${line}`)];
  if (plan.smartSearch.available === false) return lines.join('\n');
  const state = { add: 'turning on', remove: 'turning off (the downloaded model is removed)', keep: 'on (kept)', none: 'off' }[plan.smartSearch.action] ?? 'off';
  lines.push(`Smart search: ${state}`, `  ${SMART_SEARCH.outcome}`, ...SMART_SEARCH.details.map(line => `  - ${line}`));
  return lines.join('\n');
}

/** Only a person at a terminal is asked; agents, --json, --yes and pipes never are. */
export function shouldPrompt({ stdinIsTTY, json, yes, dryRun }) {
  return Boolean(stdinIsTTY) && !json && !yes && !dryRun;
}

/**
 * Short menu with the default preselected: Enter accepts it. `ask` is an
 * injected `question => Promise<string>` so the menu is testable without a TTY.
 * Returns { profile, smartSearch } for a fresh install.
 */
export async function promptChoices(ask, { write = text => process.stderr.write(text) } = {}) {
  const order = ['personal', 'mac-app', 'remote', 'browse'];
  write('\nWhat do you want jumpyBrain for?\n');
  order.forEach((name, index) => {
    const choice = PROFILES[name];
    write(`  ${index + 1}) ${choice.label}${name === DEFAULT_PROFILE ? ' (default)' : ''}\n     ${choice.outcome}\n${choice.details.map(line => `       - ${line}\n`).join('')}`);
  });
  let profile;
  while (!profile) {
    const answer = (await ask(`Choose 1-${order.length} [1]: `)).trim();
    if (!answer) profile = DEFAULT_PROFILE;
    else if (/^[1-4]$/.test(answer)) profile = order[Number(answer) - 1];
    else if (PROFILE_NAMES.includes(answer)) profile = answer;
    else write('Please enter a number from the list, or press Enter for the default.\n');
  }
  let smartSearch = false;
  if (profile === 'personal' || profile === 'mac-app') smartSearch = await askSmartSearch(ask, { current: false, write });
  return { profile, smartSearch };
}

/** Yes/no for the add-on. The default keeps the current state (off for a fresh install). */
export async function askSmartSearch(ask, { current, write = text => process.stderr.write(text) }) {
  write(`\n${SMART_SEARCH.label} (${current ? 'on' : 'off'} now): ${SMART_SEARCH.outcome}\n${SMART_SEARCH.details.map(line => `  - ${line}\n`).join('')}`);
  for (;;) {
    const answer = (await ask(current ? 'Keep smart search on? [Y/n]: ' : 'Add smart search? [y/N]: ')).trim().toLowerCase();
    if (!answer) return current;
    if (['y', 'yes'].includes(answer)) return true;
    if (['n', 'no'].includes(answer)) return false;
    write('Please answer y or n, or press Enter to keep the default.\n');
  }
}

export function browseInstructions() {
  const choice = PROFILES.browse;
  return [`${choice.label}: ${choice.outcome}`, ...choice.details.map(line => `- ${line}`),
    'To let your agents use that brain too, rerun with --profile remote. For notes of your own, rerun without --profile.'].join('\n');
}
