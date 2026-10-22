const $ = id => document.getElementById(id);
let pending = false, polling = false, revision = 0;
const labels = { idle:'Updates', checking:'Checking for updates', current:'Up to date', available:'Update available', preparing:'Preparing update', ready:'Ready to restart', updating:'Updating', success:'Update complete', recovered:'Recovery complete', failed:'Update needs attention' };
function render(value) {
  for (const key of ['app', 'runtime', 'cli']) $(key + '-version').textContent = value.installed?.[key] || 'Not installed / unknown';
  $('available-version').textContent = value.available || 'Not checked';
  $('phase').textContent = labels[value.phase] || 'Updates'; $('detail').textContent = value.detail;
  $('cli-policy').textContent = value.installed?.cliPolicy?.detail || '';
  if (value.notes) $('notes').textContent = value.notes;
  const active = ['preparing','ready','updating'].includes(value.phase);
  $('check').hidden = active || value.canRecover;
  $('prepare').hidden = !value.canPrepare || value.installed?.cliPolicy?.kind !== 'managed';
  $('app-only').hidden = !value.canPrepare || value.installed?.cliPolicy?.kind === 'managed';
  $('restart').hidden = value.phase !== 'ready'; $('defer').hidden = value.phase !== 'ready';
  $('recover').hidden = !value.canRecover;
  $('cancel').hidden = !['preparing','ready'].includes(value.phase);
  $('log').hidden = !value.logAvailable;
}
async function act(name) {
  const read = name === 'status';
  if (pending || (read && polling)) return;
  const request = ++revision;
  if (read) polling = true; else pending = true;
  if (name === 'check') { $('phase').textContent = labels.checking; $('detail').textContent = 'Checking public releases, including beta releases…'; }
  if (name !== 'status') for (const button of document.querySelectorAll('.actions button')) button.disabled = true;
  try { const value = await window.jumpyBrainUpdate.action(name); if (request === revision) render(value); }
  catch { if (request === revision) { $('phase').textContent = 'Update unavailable'; $('detail').textContent = 'The desktop updater did not respond. Close and reopen Updates to retry.'; } }
  finally { if (read) polling = false; else { pending = false; for (const button of document.querySelectorAll('.actions button')) button.disabled = false; } }
}
for (const id of ['check','prepare','app-only','restart','recover','cancel','log']) $(id).addEventListener('click', () => act(id));
$('defer').addEventListener('click', () => window.close());
void act('status'); setInterval(() => act('status'), 1000);
