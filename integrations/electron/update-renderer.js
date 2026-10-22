const $ = id => document.getElementById(id);
let pending = false, polling = false, revision = 0, lastPhase;
const labels = { idle:'Updates', checking:'Checking for updates', current:'Up to date', available:'Update available', preparing:'Preparing update', ready:'Ready to restart', updating:'Updating', success:'Update complete', recovered:'Recovery complete', failed:'Update needs attention' };
const hints = { preparing:'You can keep working.', ready:'Restart when you’re ready.', updating:'jumpyBrain will reopen automatically.', failed:'See Details for help.' };
function render(value) {
  for (const key of ['app', 'runtime', 'cli']) $(key + '-version').textContent = value.installed?.[key] || 'Not installed / unknown';
  $('available-version').textContent = value.available || 'Not checked';
  $('phase').textContent = labels[value.phase] || 'Updates'; $('detail').textContent = value.detail;
  $('phase').title = value.detail || '';
  const app = value.installed?.app;
  const changing = ['available', 'preparing', 'ready', 'updating'].includes(value.phase);
  $('version-summary').textContent = app ? (changing && value.available && value.available !== app ? `${app} → ${value.available}` : `Version ${app}`) : '';
  $('hint').textContent = hints[value.phase] || '';
  const appOnly = value.installed?.cliPolicy?.kind && value.installed.cliPolicy.kind !== 'managed';
  const mismatch = ['runtime', 'cli'].some(key => value.installed?.[key] && app && value.installed[key] !== app);
  $('scope').textContent = appOnly && (changing || value.canPrepare) ? 'App only. Your CLI stays unchanged.' : mismatch ? 'Component versions differ. See Details.' : '';
  $('scope').hidden = !$('scope').textContent;
  if (value.phase === 'failed' && lastPhase !== 'failed') $('details').open = true;
  lastPhase = value.phase;
  $('cli-policy').textContent = value.installed?.cliPolicy?.detail || '';
  if (value.notes) $('notes').textContent = value.notes;
  const active = ['preparing','ready','updating'].includes(value.phase);
  $('check').hidden = active || value.canRecover || (value.canPrepare && value.phase !== 'failed');
  $('prepare').hidden = !value.canPrepare || value.installed?.cliPolicy?.kind !== 'managed';
  $('app-only').hidden = !value.canPrepare || value.installed?.cliPolicy?.kind === 'managed';
  $('restart').hidden = value.phase !== 'ready'; $('defer').hidden = value.phase !== 'ready';
  $('recover').hidden = !value.canRecover;
  $('cancel').hidden = !['preparing','ready'].includes(value.phase);
  $('cancel').textContent = value.phase === 'ready' ? 'Discard update' : 'Cancel';
  $('log').hidden = !value.logAvailable;
}
async function act(name) {
  const read = name === 'status';
  if (pending || (read && polling)) return;
  const request = ++revision;
  if (read) polling = true; else pending = true;
  if (name === 'check') { $('phase').textContent = labels.checking; $('hint').textContent = ''; $('detail').textContent = 'Checking public releases, including beta releases…'; }
  if (name !== 'status') for (const button of document.querySelectorAll('.actions button')) button.disabled = true;
  try { const value = await window.jumpyBrainUpdate.action(name); if (request === revision) render(value); }
  catch { if (request === revision) { $('phase').textContent = 'Update unavailable'; $('hint').textContent = 'Close and reopen Updates to retry.'; $('detail').textContent = 'The desktop updater did not respond.'; $('details').open = true; } }
  finally { if (read) polling = false; else { pending = false; for (const button of document.querySelectorAll('.actions button')) button.disabled = false; } }
}
for (const id of ['check','prepare','app-only','restart','recover','cancel','log']) $(id).addEventListener('click', () => act(id));
$('defer').addEventListener('click', () => window.close());
void act('status'); setInterval(() => act('status'), 1000);
