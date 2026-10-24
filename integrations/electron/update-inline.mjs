export function nativeUpdateAction(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'jumpybrain-update:' && !parsed.username && !parsed.password && !parsed.port && !parsed.pathname && !parsed.search && !parsed.hash
      && ['check', 'update', 'app-only', 'cancel', 'restart', 'recover', 'log'].includes(parsed.hostname) ? parsed.hostname : null;
  } catch { return null; }
}

// Serialized into the sandboxed editor. Only fixed native navigations leave it.
export function mountInlineUpdates() {
  if (document.getElementById('desktop-updates')) return;
  const utilities = document.querySelector('.nav-utilities') || document.querySelector('.nav-preferences');
  if (!utilities) return;
  const style = document.createElement('style');
  style.nonce = document.querySelector('style[nonce]')?.nonce || '';
  style.textContent = `
    #desktop-updates[hidden] { display: none !important; }
    #desktop-updates { flex: 0 0 auto; width: var(--control-compact, 32px); height: var(--control-compact, 32px); min-height: var(--control-compact, 32px); padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    #desktop-updates svg { width: var(--icon-size, 16px); height: var(--icon-size, 16px); }
    #desktop-updates[data-attention=true] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, var(--control-fill)); box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 24%, transparent); }
    #desktop-updates[data-error=true] { color: var(--error-ink); }
    #desktop-updates[data-working=true] svg { animation: desktop-update-spin 1.2s linear infinite; }
    @keyframes desktop-update-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { #desktop-updates[data-working=true] svg { animation: none; } }
  `;
  document.head.append(style);
  const primary = document.createElement('button'); primary.id = 'desktop-updates'; primary.className = 'icon-button'; primary.type = 'button'; primary.hidden = true;
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) glyph.setAttribute(name, value);
  const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path'); glyph.append(stroke); primary.append(glyph); utilities.append(primary);
  let state = { phase: 'idle', actions: [] }, pending = false, lastNotice = '';
  function action() {
    return state.phase === 'ready' ? 'restart' : state.canRecover ? 'recover'
      : state.actions.includes('update') ? 'update' : state.actions.includes('app-only') ? 'app-only' : 'check';
  }
  primary.addEventListener('click', () => {
    const next = action();
    if (pending || !state.actions.includes(next)) return;
    pending = true;
    primary.disabled = true;
    location.href = 'jumpybrain-update://' + next;
  });
  document.addEventListener('jumpybrain-update-state', event => {
    const next = event.detail;
    if (!next || typeof next.phase !== 'string' || !Array.isArray(next.actions)) return;
    state = next; pending = false;
    const version = state.installed?.app;
    if (typeof version === 'string') {
      for (const element of document.querySelectorAll('[data-app-version]')) element.textContent = 'jumpyBrain · Version ' + version;
    }
    const working = ['preparing', 'updating', 'checking'].includes(state.phase);
    const failed = state.phase === 'failed' || !!state.restartError;
    const quiet = ['idle', 'current', 'success', 'recovered', 'canceled'].includes(state.phase);
    const selected = action();
    const label = state.phase === 'ready' ? 'Relaunch to apply update' : state.canRecover ? 'Recover interrupted update'
      : working ? (state.phase === 'preparing' ? 'Preparing update' : state.phase === 'checking' ? 'Checking for updates' : 'Applying update')
        : selected === 'app-only' ? 'Update app only; CLI stays unchanged' : failed ? 'Retry update' : 'Download update';
    const detail = state.restartError ? 'Relaunch paused: ' + state.restartError + ' Resolve pending saves, then retry.'
      : failed ? state.detail : selected === 'app-only' ? state.installed?.cliPolicy?.detail : '';
    const notice = failed ? detail : state.phase === 'success' ? 'Update installed successfully.'
      : state.phase === 'recovered' ? 'Previous installation restored.' : '';
    const noticeKey = [state.phase, state.updatedAt, notice].join(':');
    if (notice && noticeKey !== lastNotice) {
      lastNotice = noticeKey;
      document.dispatchEvent(new CustomEvent('jumpybrain-system-message', { detail: { source: 'desktop-update', text: notice, severity: failed ? 'error' : 'success', scope: 'app', revision: [state.phase, state.updatedAt].join(':') } }));
    }
    primary.hidden = quiet;
    primary.disabled = working || !state.actions.includes(selected);
    primary.setAttribute('aria-label', label + (detail ? ': ' + detail : ''));
    primary.setAttribute('aria-busy', String(working));
    primary.title = label + (detail ? ': ' + detail : '');
    primary.dataset.working = String(working);
    primary.dataset.error = String(failed);
    primary.dataset.attention = String(!failed && !working && !quiet && ['update', 'app-only', 'restart'].includes(selected) && state.actions.includes(selected));
    stroke.setAttribute('d', working ? 'M20 12a8 8 0 1 1-5.5-7.6' : state.phase === 'ready' || state.canRecover || failed ? 'M20 4v6h-6 M20 10a8 8 0 1 0 .1 4' : 'M12 3v12 M7 10l5 5 5-5 M5 16v4h14v-4');
  });
}
