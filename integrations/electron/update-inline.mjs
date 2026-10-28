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
    #desktop-updates { position: relative; flex: 0 0 auto; width: var(--control-compact, 32px); height: var(--control-compact, 32px); min-height: var(--control-compact, 32px); padding: 0; display: inline-flex; align-items: center; justify-content: center; }
    #desktop-updates svg { width: var(--icon-size, 16px); height: var(--icon-size, 16px); }
    #desktop-updates[data-attention=true] { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); background: color-mix(in srgb, var(--accent) 10%, var(--control-fill)); box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 24%, transparent); }
    @property --desktop-update-angle { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
    /* Move the highlight inside a fixed border mask; rotating the outline would swing its corners outside the button. */
    #desktop-updates[data-attention=true]::after { content: ''; position: absolute; inset: -1px; box-sizing: border-box; padding: 1.5px; border-radius: inherit; background: conic-gradient(from var(--desktop-update-angle), transparent 0deg 235deg, color-mix(in srgb, var(--accent) 45%, transparent) 285deg, var(--accent) 330deg, transparent 360deg); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--accent) 65%, transparent)); pointer-events: none; animation: desktop-update-border 2.8s linear infinite; }
    #desktop-updates[data-error=true] { color: var(--error-ink); }
    #desktop-updates[data-working=true] svg { animation: desktop-update-spin 1.2s linear infinite; }
    @keyframes desktop-update-spin { to { transform: rotate(360deg); } }
    @keyframes desktop-update-border { to { --desktop-update-angle: 360deg; } }
    @media (prefers-reduced-motion: reduce) { #desktop-updates[data-working=true] svg, #desktop-updates[data-attention=true]::after { animation: none; } }
  `;
  document.head.append(style);
  const primary = document.createElement('button'); primary.id = 'desktop-updates'; primary.className = 'icon-button'; primary.type = 'button'; primary.disabled = true;
  primary.setAttribute('aria-label', 'Check for updates'); primary.title = 'Check for updates';
  const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [name, value] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) glyph.setAttribute(name, value);
  const stroke = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  /*!
   * Lucide refresh-cw (ISC License), mirrored from browser-icons.ts.
   * Copyright (c) 2026 Lucide Icons and Contributors
   * Permission to use, copy, modify, and/or distribute this software for any
   * purpose with or without fee is hereby granted, provided that the above
   * copyright notice and this permission notice appear in all copies.
   * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
   * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
   * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
   * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
   * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
   * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
   * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
   */
  const refreshIcon = 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5';
  stroke.setAttribute('d', refreshIcon); glyph.append(stroke); primary.append(glyph); utilities.append(primary);
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
        : selected === 'app-only' ? 'Update app only; CLI stays unchanged' : failed ? 'Retry update'
          : selected === 'update' ? 'Download update' : ['current', 'success'].includes(state.phase) ? 'Up to date; check for updates' : 'Check for updates';
    const detail = state.restartError ? 'Relaunch paused: ' + state.restartError + ' Resolve pending saves, then retry.'
      : failed ? state.detail : selected === 'app-only' ? state.installed?.cliPolicy?.detail : '';
    const notice = failed ? detail : state.phase === 'success' ? 'Update installed successfully.'
      : state.phase === 'recovered' ? 'Previous installation restored.' : '';
    const noticeKey = [state.phase, state.updatedAt, notice].join(':');
    if (notice && noticeKey !== lastNotice) {
      lastNotice = noticeKey;
      document.dispatchEvent(new CustomEvent('jumpybrain-system-message', { detail: { source: 'desktop-update', text: notice, severity: failed ? 'error' : 'success', scope: 'app', revision: [state.phase, state.updatedAt].join(':') } }));
    }
    primary.disabled = working || !state.actions.includes(selected);
    primary.setAttribute('aria-label', label + (detail ? ': ' + detail : ''));
    primary.setAttribute('aria-busy', String(working));
    primary.title = label + (detail ? ': ' + detail : '');
    primary.dataset.working = String(working);
    primary.dataset.error = String(failed);
    primary.dataset.attention = String(!failed && !working && !quiet && ['update', 'app-only', 'restart'].includes(selected) && state.actions.includes(selected));
    stroke.setAttribute('d', working ? 'M20 12a8 8 0 1 1-5.5-7.6' : state.phase === 'ready' || state.canRecover || failed ? refreshIcon
      : ['current', 'success'].includes(state.phase) ? 'M9 12l2 2 4-4 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'
        : ['update', 'app-only'].includes(selected) ? 'M12 3v12 M7 10l5 5 5-5 M5 16v4h14v-4' : refreshIcon);
  });
}
