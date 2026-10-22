export function nativeUpdateAction(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'jumpybrain-update:' && !parsed.username && !parsed.password && !parsed.port && !parsed.pathname && !parsed.search && !parsed.hash
      && ['check', 'update', 'app-only', 'cancel', 'restart', 'recover', 'log'].includes(parsed.hostname) ? parsed.hostname : null;
  } catch { return null; }
}

// Serialized into the sandboxed editor. Only fixed native navigations leave it.
export function mountInlineUpdates() {
  if (document.getElementById('desktop-update-panel')) return;
  const utilities = document.querySelector('.nav-utilities') || document.querySelector('.nav-preferences');
  if (!utilities) return;
  const parent = document.querySelector('.nav-preferences') || utilities.parentElement;
  const panel = document.createElement('div'); panel.id = 'desktop-update-panel'; panel.hidden = true;
  const style = document.createElement('style');
  style.nonce = document.querySelector('style[nonce]')?.nonce || '';
  style.textContent = `
    #desktop-updates[hidden], #desktop-update-panel[hidden], #desktop-update-panel [hidden] { display: none !important; }
    #desktop-updates { flex: 0 0 auto; width: var(--control-compact, 32px); height: var(--control-compact, 32px); min-height: var(--control-compact, 32px); padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    #desktop-updates svg { width: var(--icon-size, 16px); height: var(--icon-size, 16px); }
    #desktop-updates[data-working=true] svg { animation: desktop-update-spin 1.2s linear infinite; }
    #desktop-update-panel { grid-column: 1 / -1; width: 100%; min-width: 0; font: inherit; font-size: var(--text-caption, 12px); }
    #desktop-update-status { color: var(--ink-soft); margin: var(--space-2, 8px) 0; overflow-wrap: anywhere; }
    #desktop-update-status:empty { display: none; }
    #desktop-update-panel[data-error=true] #desktop-update-status { color: var(--danger, var(--ink)); }
    #desktop-update-details { color: var(--ink-soft); }
    #desktop-update-details summary { cursor: pointer; width: fit-content; }
    #desktop-update-details button { margin-top: var(--space-2, 8px); font: inherit; }
    #desktop-update-info, #desktop-update-notes { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; max-height: 180px; overflow-y: auto; }
    @keyframes desktop-update-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { #desktop-updates[data-working=true] svg { animation: none; } }
  `;
  document.head.append(style);
  const primary = document.createElement('button'); primary.id = 'desktop-updates'; primary.className = 'icon-button'; primary.type = 'button'; primary.hidden = true;
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) glyph.setAttribute(name, value);
  const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path'); glyph.append(stroke); primary.append(glyph); utilities.append(primary);
  const status = document.createElement('p'); status.id = 'desktop-update-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const details = document.createElement('details'); details.id = 'desktop-update-details';
  const summary = document.createElement('summary'); summary.textContent = 'Update details';
  const info = document.createElement('p'); info.id = 'desktop-update-info';
  const notes = document.createElement('p'); notes.id = 'desktop-update-notes';
  const appOnly = document.createElement('button'); appOnly.id = 'desktop-update-app-only'; appOnly.className = 'quiet-button'; appOnly.textContent = 'Update app only'; appOnly.hidden = true;
  const log = document.createElement('button'); log.id = 'desktop-update-log'; log.className = 'quiet-button'; log.textContent = 'Show update log'; log.hidden = true;
  const cancel = document.createElement('button'); cancel.id = 'desktop-update-cancel'; cancel.className = 'quiet-button'; cancel.textContent = 'Cancel preparation'; cancel.hidden = true;
  details.append(summary, info, notes, appOnly, cancel, log); panel.append(status, details); parent.append(panel);
  let state = { phase: 'idle', actions: [] }, pending = false, verifiedTimer, verifiedExpired = false;
  function request(action) {
    if (pending || !state.actions?.includes(action)) return;
    pending = true;
    for (const button of [primary, appOnly, log, cancel]) button.disabled = true;
    location.href = 'jumpybrain-update://' + action;
  }
  primary.addEventListener('click', () => request(state.phase === 'ready' ? 'restart' : state.canRecover ? 'recover' : state.actions?.includes('update') ? 'update' : 'check'));
  appOnly.addEventListener('click', () => request('app-only'));
  log.addEventListener('click', () => request('log'));
  cancel.addEventListener('click', () => request('cancel'));
  document.addEventListener('jumpybrain-update-state', event => {
    const next = event.detail;
    if (!next || typeof next.phase !== 'string' || !Array.isArray(next.actions)) return;
    const phaseChanged = next.phase !== state.phase;
    if (phaseChanged) verifiedExpired = false;
    const enteringFailure = next.phase === 'failed' && phaseChanged;
    state = next; pending = false;
    const working = ['preparing', 'updating', 'checking'].includes(state.phase);
    const exception = state.actions.includes('app-only');
    const preservesCli = !!state.installed?.cliPolicy && state.installed.cliPolicy.kind !== 'managed';
    const failed = state.phase === 'failed' || !!state.restartError;
    const quiet = ['idle', 'current', 'success', 'recovered', 'canceled'].includes(state.phase);
    const label = state.phase === 'ready' ? 'Relaunch to apply update' : state.canRecover ? 'Recover interrupted update'
      : working ? (state.phase === 'preparing' ? 'Preparing update' : state.phase === 'checking' ? 'Checking for updates' : 'Applying update')
        : state.phase === 'failed' ? 'Retry update' : exception ? 'App update available; review CLI policy below' : 'Download update';
    primary.hidden = quiet;
    primary.disabled = working || exception || !state.actions.some(action => ['restart', 'recover', 'update', 'check'].includes(action));
    primary.setAttribute('aria-label', label); primary.setAttribute('aria-busy', String(working)); primary.title = label + (state.detail ? ': ' + state.detail : ''); primary.dataset.working = String(working);
    stroke.setAttribute('d', working ? 'M20 12a8 8 0 1 1-5.5-7.6' : state.phase === 'ready' || state.canRecover ? 'M20 4v6h-6 M20 10a8 8 0 1 0 .1 4' : 'M12 3v12 M7 10l5 5 5-5 M5 16v4h14v-4');
    const message = state.phase === 'ready' ? (state.restartError ? 'Relaunch paused: ' + state.restartError + ' Resolve pending saves, then retry.' : 'Update prepared. Relaunch when ready to apply it.')
      : state.phase === 'failed' ? state.detail
        : state.phase === 'success' ? (preservesCli ? 'App update installed and verified. Your CLI stays unchanged.' : 'Update installed and verified.')
          : state.phase === 'recovered' ? (preservesCli ? 'Previous app installation recovered and verified. Your CLI stays unchanged.' : 'Previous installation recovered and verified.')
            : state.phase === 'preparing' ? 'Preparing update. You can keep working.'
              : state.phase === 'available' && exception ? 'Your CLI stays unchanged. Choose Update app only below.' : '';
    // Preserve live-region nodes and text between polls so editing/focus and announcements remain stable.
    if (status.textContent !== message && !verifiedExpired) status.textContent = message || '';
    panel.hidden = verifiedExpired || (!message && !failed && !exception);
    panel.dataset.error = String(failed);
    details.hidden = !failed && !exception && !['preparing', 'ready'].includes(state.phase);
    info.textContent = [state.detail, state.installed?.cliPolicy?.detail,
      state.installed ? 'App ' + state.installed.app + ' · Runtime ' + state.installed.runtime + ' · CLI ' + (state.installed.cli || 'unavailable') : '',
      state.available ? 'Target release: ' + state.available : ''].filter(Boolean).join('\n');
    notes.textContent = state.notes || '';
    appOnly.hidden = !exception; appOnly.disabled = !state.actions.includes('app-only');
    log.hidden = !state.actions.includes('log'); log.disabled = false;
    cancel.hidden = !state.actions.includes('cancel'); cancel.disabled = false;
    if (enteringFailure || (phaseChanged && exception)) details.open = true;
    if (phaseChanged) {
      clearTimeout(verifiedTimer);
      if (['success', 'recovered'].includes(state.phase)) verifiedTimer = setTimeout(() => { verifiedExpired = true; status.textContent = ''; panel.hidden = true; }, 8000);
    }
  });
}
