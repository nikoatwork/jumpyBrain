import { browserIcons } from "./browser-icons.js";
import { builtInPalettes } from "./browser-palettes.js";

const miniature = (mode: string) => `<span class="appearance-mini mini-${mode}"><span class="mini-sidebar"><i></i><i></i><i></i></span><span class="mini-content"><i></i><i></i><i></i><b></b></span></span>`;
const schemeChoice = (value: string, label: string) => `<label class="appearance-choice"><input type="radio" name="color-scheme" value="${value}" ${value === "system" ? "checked" : ""}/><span class="scheme-preview" aria-hidden="true">${value === "system" ? miniature("light") + miniature("dark") : miniature(value)}</span><span class="appearance-choice-name">${label}<span class="appearance-check" aria-hidden="true">${browserIcons.check}</span></span></label>`;
const paletteChoice = (value: string, label: string) => `<label class="appearance-choice palette-choice"><input type="radio" name="color-palette" value="${value}" ${value === "ember" ? "checked" : ""}/><span class="palette-preview palette-${value}" aria-hidden="true"><i></i><i></i></span><span class="appearance-choice-name">${label}<span class="appearance-check" aria-hidden="true">${browserIcons.check}</span></span></label>`;

export const appearanceMarkup = String.raw`
<div id="appearance-options">
  <fieldset class="appearance-group"><legend>Color scheme</legend><div class="appearance-grid">${schemeChoice("system", "System")}${schemeChoice("light", "Light")}${schemeChoice("dark", "Dark")}</div></fieldset>
  <fieldset class="appearance-group"><legend>Theme</legend><div class="appearance-grid">${paletteChoice("ember", "Ember")}${paletteChoice("ocean", "Ocean")}${paletteChoice("mono", "Mono")}${paletteChoice("pride", "Pride")}</div></fieldset>
</div>`;

export const appearanceStyles = String.raw`
  #appearance-options { --preview-light: #e6dac4; --preview-light-control: #d8ccb0; --preview-light-ink: #504a40; --preview-dark: #1c1b19; --preview-dark-control: #2e2d2a; --preview-dark-ink: #aaa294; }
  ${Object.entries(builtInPalettes).map(([name, modes]) => `:root[data-palette="${name}"] #appearance-options { --preview-light: ${modes.light.surface}; --preview-light-control: ${modes.light["control-fill"]}; --preview-light-ink: ${modes.light["ink-soft"]}; --preview-dark: ${modes.dark.surface}; --preview-dark-control: ${modes.dark["surface-hover"]}; --preview-dark-ink: ${modes.dark["ink-soft"]}; }`).join("\n")}
  .appearance-group { border: 0; padding: 0; margin: 0 0 var(--space-8); min-width: 0; }
  .appearance-group:last-child { margin-bottom: 0; }
  .appearance-group legend { padding: 0; margin-bottom: var(--space-3); font-size: var(--text-body); color: var(--ink-soft); }
  .appearance-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
  .appearance-choice { position: relative; display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; padding: var(--space-2); border: 1px solid var(--line); border-radius: var(--radius-md); cursor: pointer; background: var(--surface); }
  .appearance-choice:hover { background: var(--hover-fill); }
  .appearance-choice:has(input:checked) { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
  .appearance-choice:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 3px; }
  .appearance-choice input { position: absolute; width: 1px; height: 1px; padding: 0; opacity: 0; margin: 0; }
  .appearance-choice-name { display: flex; align-items: center; justify-content: space-between; gap: var(--space-1); padding: 0 var(--space-1) var(--space-1); color: var(--ink); font-size: var(--text-ui); }
  .appearance-check { display: flex; visibility: hidden; color: var(--accent); }
  .appearance-check svg { width: 16px; height: 16px; }
  .appearance-choice:has(input:checked) .appearance-check { visibility: visible; }
  .scheme-preview { position: relative; display: block; aspect-ratio: 1.65; overflow: hidden; border-radius: var(--radius-sm); border: 1px solid var(--line); }
  .appearance-mini { position: absolute; inset: 0; display: flex; background: var(--mini-bg); }
  .mini-light { --mini-bg: var(--preview-light); --mini-control: var(--preview-light-control); --mini-ink: var(--preview-light-ink); }
  .mini-dark { --mini-bg: var(--preview-dark); --mini-control: var(--preview-dark-control); --mini-ink: var(--preview-dark-ink); }
  input[value="system"] + .scheme-preview .mini-dark { clip-path: inset(0 0 0 50%); }
  .mini-sidebar { display: flex; flex-direction: column; gap: 8%; width: 25%; padding: 10% 4%; background: var(--mini-control); }
  .mini-sidebar i { height: 6%; min-height: 3px; border-radius: 8px; background: var(--mini-ink); opacity: .25; }
  .mini-sidebar i:first-child { opacity: .5; }
  .mini-content { display: flex; flex-direction: column; gap: 8%; flex: 1; padding: 12% 7%; }
  .mini-content i { width: 90%; height: 8%; min-height: 3px; background: var(--mini-ink); opacity: .25; border-radius: 8px; }
  .mini-content i:first-child { width: 60%; height: 12%; opacity: .65; }
  .mini-content i:nth-child(3) { width: 65%; }
  .mini-content b { margin-top: auto; width: 100%; height: 20%; border: 1px solid var(--mini-ink); opacity: .25; border-radius: 4px; }
  .palette-preview { display: flex; align-items: center; justify-content: center; gap: var(--space-4); padding-block: var(--space-5); }
  .palette-preview i { width: clamp(24px, 4vw, 52px); aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 0 0 1px #ffffff20; }
  .palette-ember i:first-child { background: radial-gradient(circle at 30% 25%, #f3ead7, #e6dac4 42%, #c07752); }
  .palette-ember i:last-child { background: radial-gradient(circle at 30% 25%, #c07752, #44322b 48%, #1c1b19); }
  .palette-ocean i:first-child { background: radial-gradient(circle at 30% 25%, #f0f7fc, #c0dce9 42%, #4d94b5); }
  .palette-ocean i:last-child { background: radial-gradient(circle at 30% 25%, #81bfde, #2b5068 48%, #16212b); }
  .palette-pride i { background: linear-gradient(150deg, #f6dfe7, #f7e7dc, #f5efd9, #e1eee2, #e0eaf5, #eadef3); }
  .palette-pride i:last-child { background: linear-gradient(150deg, #674554, #645044, #5b583f, #405c4e, #435570, #5b456e); }
  .palette-mono i:first-child { background: radial-gradient(circle at 30% 25%, #ffffff, #e5e5e5 42%, #a8a8a8); }
  .palette-mono i:last-child { background: radial-gradient(circle at 30% 25%, #686868, #292929 48%, #080808); }
  @media (max-width: 480px) {
    .appearance-grid { gap: var(--space-2); }
    .appearance-choice { gap: var(--space-2); padding: var(--space-1); }
    .appearance-choice-name { padding-inline: 0; gap: 0; }
    .appearance-check svg { width: 12px; height: 12px; }
    .palette-preview { gap: var(--space-2); padding-block: var(--space-4); }
  }
`;

export const appearanceScript = String.raw`
$("appearance-options").addEventListener("change", (event) => {
  const input = event.target;
  if (!input.matches("input[type=radio]")) return;
  if (input.name === "color-scheme") colorTheme.setPreference(input.value);
  else if (input.name === "color-palette") colorTheme.setPalette(input.value);
});
`;
