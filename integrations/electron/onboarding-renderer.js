/* Packaged first-run page only. No network, credential or filesystem APIs. */
const $ = (id) => document.getElementById(id);
let selected = null, busy = false;
function message(text, error = false) { $('message').textContent = text; $('message').dataset.error = String(error); }
function lock(value) { busy = value; $('choose').disabled = value; $('open').disabled = value || !selected; $('continue').disabled = value; }
async function action(callback) {
  if (busy) return;
  lock(true); message('');
  try { const result = await callback(); if (result?.error) throw new Error(result.error); return result; }
  catch (error) { message(error.message || 'Could not complete setup. Try again.', true); }
  finally { lock(false); }
}
$('choose').addEventListener('click', () => action(async () => {
  const result = await window.desktopSetup.choose();
  if (result?.error) { selected = null; $('folder-path').hidden = true; throw new Error(result.error); }
  if (!result) return;
  selected = result;
  $('folder-path').textContent = result.root; $('folder-path').hidden = false;
  $('choose').textContent = 'Change folder…';
  $('open').textContent = result.existing ? 'Open my local brain →' : 'Create my local brain →';
  $('setup-detail').textContent = (result.existing ? 'Your existing Markdown stays in place. This folder becomes the active brain in the app.' : 'Ready to create your brain here. We’ll add Markdown folders and a small configuration file.') + ' Your agents keep their current folder setting; choose the same folder to share notes.';
}));
$('open').addEventListener('click', () => action(async () => {
  message(selected?.existing ? 'Opening your brain…' : 'Creating your local brain…');
  return window.desktopSetup.open();
}));
$('continue').addEventListener('click', () => action(() => window.desktopSetup.continue()));
void action(async () => {
  const result = await window.desktopSetup.status();
  if (result?.error) { $('choose').hidden = true; $('open').hidden = true; throw new Error(result.error); }
  if (result?.active) {
    $('continue').hidden = false;
    $('continue').textContent = 'Continue with ' + result.active.name + (result.active.kind === 'remote' ? ' (remote)' : '');
  }
});
