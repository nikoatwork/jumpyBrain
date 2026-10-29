/* Packaged first-run page only. No direct network or filesystem access. */
const $ = (id) => document.getElementById(id);
let selected = null, busy = false;
function message(text, error = false) {
  $('message').textContent = text; $('message').dataset.error = String(error);
  if (error) $('message').focus();
}
function lock(value) {
  busy = value;
  for (const id of ['choose', 'continue', 'remote-choice', 'back', 'connect', 'remote-url', 'remote-key', 'retry']) $(id).disabled = value;
  $('open').disabled = value || !selected;
  $('local-panel').setAttribute('aria-busy', String(value));
  $('remote-form').setAttribute('aria-busy', String(value));
}
async function action(callback) {
  if (busy) return;
  lock(true); message('');
  try { const result = await callback(); if (result?.error) throw new Error(result.error); return result; }
  catch (error) { message(error.message || 'Could not complete setup. Try again.', true); }
  finally { lock(false); }
}
function showFolder(result) {
  selected = result;
  $('folder-state').textContent = result ? 'Ready for you' : 'Choose a folder';
  $('folder-path').textContent = result?.root || ''; $('folder-path').hidden = !result;
  $('folder-description').textContent = !result ? 'Choose a folder for your notes.'
    : result.existing ? 'Your notes are already here. Make yourself at home.' : 'We’ll get this folder ready when you start.';
  $('open').innerHTML = (result?.existing ? 'Open my notes' : 'Start writing') + ' <span aria-hidden="true">→</span>';
}
$('choose').addEventListener('click', async () => {
  const result = await action(async () => {
    const result = await window.desktopSetup.choose();
    if (result?.error) { showFolder(null); throw new Error(result.error); }
    if (result) showFolder(result);
    return result;
  });
  if (result && selected) $('open').focus();
});
$('open').addEventListener('click', () => action(async () => {
  message(selected?.existing ? 'Opening your notes…' : 'Creating a home for your notes…');
  return window.desktopSetup.open();
}));
$('continue').addEventListener('click', () => action(() => window.desktopSetup.continue()));
$('remote-choice').addEventListener('click', () => {
  if (busy) return;
  message(''); $('local-panel').hidden = true; $('remote-panel').hidden = false;
  $('continue').hidden = true; $('remote-url').focus();
});
$('back').addEventListener('click', () => {
  if (busy) return;
  message(''); $('remote-key').value = ''; $('remote-panel').hidden = true; $('local-panel').hidden = false;
  $('continue').hidden = !$('continue').textContent; $('remote-choice').focus();
});
$('remote-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!$('remote-form').reportValidity()) return;
  void action(async () => {
    message('Connecting to your brain…');
    const result = await window.desktopSetup.remote($('remote-url').value.trim(), $('remote-key').value);
    if (!result?.error) $('remote-key').value = '';
    return result;
  });
});
async function loadStatus() {
  const result = await action(async () => {
    $('retry').hidden = true;
    const result = await window.desktopSetup.status();
    for (const id of ['choose', 'open', 'remote-choice']) $(id).hidden = !!result?.error;
    if (result?.error) {
      showFolder(null); $('continue').hidden = true;
      $('retry').hidden = !result.retryable;
      throw new Error(result.error);
    }
    showFolder(result.selected);
    if (result.folderError) message(result.folderError, true);
    $('continue').textContent = result.active?.kind === 'remote' ? 'Open ' + result.active.name + ' (remote)' : '';
    $('continue').hidden = !$('continue').textContent;
    return result;
  });
  if (result?.selected) $('open').focus();
}
$('retry').addEventListener('click', loadStatus);
void loadStatus();
