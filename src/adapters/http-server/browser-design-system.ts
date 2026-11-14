// Shared browser presentation tokens. Roles and usage: docs/design-system.md#primitives.
// Color tokens remain in browser-theme.ts/browser-palettes.ts; neither module owns app behavior.
// The :root block is generated from these objects so scripts can share the same values.

/** Viewport widths in px. CSS variables cannot be used in media queries; interpolate `media.*` instead. */
export const breakpoints = { compact: 480, narrow: 680, wide: 1180, explorerOverlay: 1000, explorerBeside: 1500 } as const;

/** Media query strings shared by CSS (`@media ${media.narrow}`) and scripts (`matchMedia(media.narrow)`). */
export const media = /* @__PURE__ */ (() => ({
  narrow: `(max-width: ${breakpoints.narrow}px)`,
  aboveNarrow: `(min-width: ${breakpoints.narrow + 1}px)`,
  compact: `(max-width: ${breakpoints.compact}px)`,
  wide: `(min-width: ${breakpoints.wide}px)`,
  shortNarrow: `(max-width: ${breakpoints.narrow}px) and (max-height: ${breakpoints.narrow}px)`,
  explorerOverlay: `(max-width: ${breakpoints.explorerOverlay}px) and (min-width: ${breakpoints.narrow + 1}px)`,
  explorerBeside: `(max-width: ${breakpoints.explorerBeside}px) and (min-width: ${breakpoints.narrow + 1}px)`,
  touch: "(hover: none)",
  hover: "(hover: hover)",
  coarse: "(pointer: coarse)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const))();

/** Durations in ms; mirrored by --duration-* tokens (the test keeps them equal). tooltipDelay is the control-label pointer dwell. */
export const motion = { fast: 120, base: 160, slow: 240, tooltipDelay: 350 } as const;

/** Minimum px gap between script-positioned floating UI and the viewport edge. */
export const viewportMargin = 8;

export const designTokens = {
  // Type
  "font-ui": `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`,
  "font-writing": `Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif`,
  "font-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
  "text-caption": "12px",
  "text-ui": "13px",
  "text-body": "14px",
  "text-section": "16px",
  "text-heading": "20px",
  "text-display": "clamp(24px, 4vw, 30px)",
  "leading-ui": "1.5",
  "leading-heading": "1.25",
  "leading-code": "1.6",
  "weight-regular": "400",
  "weight-semibold": "600",
  "weight-writing-bold": "700",
  "tracking-tight": "-.025em",
  "tracking-brand": "-.035em",
  // Writing surface: content typography, not interface scale (narrow override below).
  "writing-text": "19px",
  "writing-leading": "1.8",
  "writing-title": "clamp(30px, 4vw, 40px)",
  "weight-writing-title": "500",
  "writing-h1": "32px",
  "writing-h2": "27px",
  "writing-h3": "23px",
  "writing-h4": "20px",
  "writing-heading-leading": "1.35",
  // Space
  "space-0-5": "2px",
  "space-1": "4px",
  "space-2": "8px",
  "space-3": "12px",
  "space-4": "16px",
  "space-5": "20px",
  "space-6": "24px",
  "space-8": "32px",
  "space-10": "40px",
  "space-12": "48px",
  "space-16": "64px",
  // Controls, icons and layout sizes
  "control-compact": "32px",
  "control-height": "36px",
  "control-touch": "40px",
  "icon-size-sm": "12px",
  "icon-size": "16px",
  "icon-size-lg": "20px",
  "dot-size": "6px",
  "header-height": "48px",
  "sidebar-min-width": "224px",
  "panel-width": "320px",
  "card-width": "224px",
  "width-tooltip": "300px",
  "width-popover": "320px",
  "width-toast": "360px",
  "width-dialog-sm": "440px",
  "width-dialog-md": "600px",
  "width-dialog-lg": "760px",
  "measure": "760px",
  "measure-narrow": "560px",
  "viewport-gutter": "var(--space-8)",
  // Rows
  "row-height": "var(--control-height)",
  "row-inset": "var(--space-3)",
  "row-indent": "var(--space-4)",
  "row-meta-gap": "var(--space-3)",
  // Shape
  "radius-xs": "4px",
  "radius-sm": "6px",
  "radius-md": "10px",
  "radius-lg": "14px",
  "radius-round": "50%",
  // Borders and focus
  "border-accent": "3px",
  "focus-outline": "2px solid var(--focus-ring)",
  "focus-offset": "3px",
  "focus-offset-inset": "-2px",
  // Motion
  "duration-fast": "120ms",
  "duration-base": "160ms",
  "duration-slow": "240ms",
  "ease": "cubic-bezier(.2, .8, .2, 1)",
  // Layers (literal -1..4 stay allowed for stacking inside one component)
  "z-sticky": "10",
  "z-overlay": "20",
  "z-panel": "30",
  "z-modal": "40",
  "z-popover": "50",
  "z-toast": "100",
  "z-menu": "1000",
  // Opacity
  "opacity-disabled": ".5",
  "opacity-muted": ".6",
  "opacity-done": ".8",
  // Palette-derived interaction colors (follow the active palette and extension overrides)
  "hover-fill": "color-mix(in srgb, var(--ink) 5%, transparent)",
  "control-hover": "color-mix(in srgb, var(--control-fill) 96%, var(--ink))",
  "hover-line": "color-mix(in srgb, var(--line-strong) 80%, var(--ink-faint))",
  "focus-line": "color-mix(in srgb, var(--focus-ring) 45%, var(--line-strong))",
  "ring-selected": "inset 0 0 0 1px var(--accent)",
  "accent-wash": "color-mix(in srgb, var(--accent) 12%, transparent)",
  "accent-wash-strong": "color-mix(in srgb, var(--accent) 18%, transparent)",
} as const;

/** Tokens redefined at `media.narrow`. */
export const narrowDesignTokens = { "writing-text": "18px" } as const;

const declarations = (tokens: Readonly<Record<string, string>>, indent: string) =>
  Object.entries(tokens).map(([name, value]) => `${indent}--${name}: ${value};`).join("\n");

// Pure IIFEs keep these server-side strings out of browser bundles that import only `media`/`motion`.
export const designSystemStyles = /* @__PURE__ */ (() => String.raw`
    :root {
${declarations(designTokens, "      ")}
    }
    @media ${media.narrow} {
      :root {
${declarations(narrowDesignTokens, "        ")}
      }
    }
`)();
