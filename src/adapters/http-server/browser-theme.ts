// Ember palette: https://embertheme.com/ and https://github.com/ember-theme/ember
// Neutral control ramps follow ember-theme/zed. MIT notice: docs/licenses/ember.txt.
// Secondary text is lifted/darkened for readable UI contrast, rather than syntax-comment contrast.
const darkColors = String.raw`
      color-scheme: dark;
      --ink: #d8d0c0;
      --ink-soft: #aaa294;
      --ink-faint: #9a9387;
      --surface: #1c1b19;
      --control-fill: #252422;
      --surface-hover: #2e2d2a;
      --focus-ring: #e08060;
      --accent: #e08060;
      --selection-fill: #e0806040;
      --error-ink: #d69999;
      --error-fill: #322827;
      --error-line: #b07878;
      --line: #3e3c38;
      --line-strong: #585550;
      --edge: #7890a0;
      --edge-link: #988090;
      --edge-end: #80a090;
      --node-page: #7890a0;
      --node-decision: #c8b468;
      --node-finding: #988090;
      --node-preference: #b07878;
      --node-session: #8a9868;
      --node-note: #80a090;
      --node-unresolved: #c09058;
      --map-wash: .1;
      --edge-shadow: #151412;
      --edge-highlight: #d8d0c0;
      --node-light: #d8d0c0;
      --node-shade: #151412;
      --backdrop: rgba(0, 0, 0, .55);
      --shadow-sm: 0 1px 3px rgba(0, 0, 0, .2);
      --shadow-lg: 0 16px 48px rgba(0, 0, 0, .4), 0 2px 8px rgba(0, 0, 0, .2);
`;

export const themeStyles = String.raw`
    :root {
      color-scheme: light;
      --ink: #282418;
      --ink-soft: #504a40;
      --ink-faint: #565044;
      --surface: #e6dac4;
      --control-fill: #d8ccb0;
      --surface-hover: #cec2a8;
      --focus-ring: #b84c30;
      --accent: #b84c30;
      --selection-fill: #b84c3033;
      --error-ink: #783c3c;
      --error-fill: #d9c5b2;
      --error-line: #905050;
      --line: #cec2a8;
      --line-strong: #b8ac96;
      --edge: #3a6080;
      --edge-link: #706070;
      --edge-end: #386858;
      --node-page: #3a6080;
      --node-decision: #7a6820;
      --node-finding: #706070;
      --node-preference: #905050;
      --node-session: #4a6830;
      --node-note: #386858;
      --node-unresolved: #946030;
      --map-wash: .08;
      --edge-shadow: #282418;
      --edge-highlight: #e6dac4;
      --node-light: #e6dac4;
      --node-shade: #282418;
      --backdrop: rgba(40, 36, 24, .24);
      --shadow-sm: 0 1px 3px rgba(40, 36, 24, .08);
      --shadow-lg: 0 16px 48px rgba(40, 36, 24, .16), 0 2px 8px rgba(40, 36, 24, .08);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme="light"]) { ${darkColors} }
    }
    :root[data-theme="dark"] { ${darkColors} }
    ::selection { background: var(--selection-fill); }
    .theme-control { display: flex; align-items: center; }
    #color-theme { display: grid; place-items: center; width: var(--control-height); min-width: var(--control-height); height: var(--control-height); padding: var(--space-2); border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--control-fill); color: var(--ink-soft); font: inherit; cursor: pointer; }
    #color-theme svg { width: var(--icon-size); height: var(--icon-size); pointer-events: none; }
    #color-theme:hover { background: var(--surface-hover); color: var(--ink); }
    #color-theme:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
    #color-theme .theme-moon { display: none; }
    :root[data-theme="light"] #color-theme .theme-sun { display: none; }
    :root[data-theme="light"] #color-theme .theme-moon { display: block; }
`;

// Runs in the head, before any visible content, under the shell's existing CSP nonce.
export const themeBootstrap = String.raw`
const colorTheme = (() => {
  const key = "jumpybrain.theme";
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const normalize = (value) => ["light", "dark"].includes(value) ? value : "system";
  let preference = "system";
  try { preference = normalize(localStorage.getItem(key)); } catch { /* Storage may be disabled. */ }
  function apply() {
    root.dataset.theme = preference === "system" ? (media.matches ? "dark" : "light") : preference;
    root.dataset.themePreference = preference;
    const control = document.getElementById("color-theme");
    if (control) {
      const action = root.dataset.theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
      control.setAttribute("aria-label", action);
      control.title = action;
    }
  }
  media.addEventListener("change", apply);
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = normalize(event.newValue);
    apply();
  });
  apply();
  return {
    syncControl: apply,
    toggle() { this.setPreference(root.dataset.theme === "dark" ? "light" : "dark"); },
    setPreference(value) {
      preference = normalize(value);
      try {
        if (preference === "system") localStorage.removeItem(key);
        else localStorage.setItem(key, preference);
      } catch { /* The choice still works for this tab. */ }
      apply();
    },
  };
})();
`;

export const themeMarkup = String.raw`
  <span class="theme-control">
    <button id="color-theme" type="button" aria-label="Switch color theme" title="Switch color theme">
      <svg class="theme-sun" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.5"/></svg>
      <svg class="theme-moon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.7 13a8.8 8.8 0 0 1-9.7-9.7A9 9 0 1 0 20.7 13Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
    </button>
  </span>
`;

export const themeScript = String.raw`
colorTheme.syncControl();
$("color-theme").addEventListener("click", () => colorTheme.toggle());
`;
