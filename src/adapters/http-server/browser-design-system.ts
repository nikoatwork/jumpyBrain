// Shared browser presentation tokens. Roles and usage: docs/design-system.md.
// Color tokens remain in browser-theme.ts; neither module owns app behavior.
export const designSystemStyles = String.raw`
    #control-label {
      position: fixed; inset: auto; margin: 0; max-width: min(300px, calc(100vw - 16px));
      padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: var(--radius-sm);
      background: var(--surface); color: var(--ink); font: var(--text-caption)/var(--leading-ui) var(--font-ui);
      box-shadow: 0 3px 12px #0002; pointer-events: none; overflow-wrap: anywhere;
    }
    :root {
      --font-ui: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-writing: Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
      --font-mono: ui-monospace, monospace;
      --text-caption: 12px;
      --text-ui: 13px;
      --text-body: 14px;
      --text-section: 16px;
      --text-heading: 20px;
      --text-display: clamp(24px, 4vw, 30px);
      --leading-ui: 1.5;
      --leading-heading: 1.25;
      --weight-regular: 400;
      --weight-semibold: 600;
      --weight-writing-bold: 700;
      --space-0-5: 2px;
      --space-1: 4px;
      --space-2: 8px;
      --space-3: 12px;
      --space-4: 16px;
      --space-5: 20px;
      --space-6: 24px;
      --space-8: 32px;
      --space-10: 40px;
      --space-12: 48px;
      --space-16: 64px;
      --control-compact: 32px;
      --control-height: 36px;
      --control-touch: 40px;
      --icon-size: 16px;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 14px;
      --ease: cubic-bezier(.2, .8, .2, 1);
    }
`;
