// Shared decorative glyphs. Callers supply accessible names on the control.
const icon = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/*!
 * Lucide pin and refresh-cw shapes: https://lucide.dev (ISC License).
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
// Mirrored in the separately serialized native update control.
const refreshIconPath = 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5';

export const browserPinIcon = icon('<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>');

export const browserEditorIcons = {
  human: icon('<circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>'),
  agent: icon('<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M1 12v5m22-5v5M9 17h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>'),
  unknown: icon('<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3h.01"/>'),
};

// Keep server-only glyph construction out of bundles that need only the pin.
export const browserIcons = /* @__PURE__ */ (() => ({
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  forward: icon('<path d="m14 5 7 7-7 7M21 12H3"/>'),
  back: icon('<path d="m10 5-7 7 7 7M3 12h18"/>'),
  appearance: icon('<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>'),
  extensions: icon('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/>'),
  search: icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'),
  home: icon('<path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7"/>'),
  graph: icon('<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M7.5 6h9M6 8l5 9m7-9-5 9"/>'),
  settings: icon('<path d="m9 3-.6 2.4-2 .9L4 5.6 2.5 8.2 4.3 10v2l-1.8 1.8L4 16.4l2.4-.7 2 .9L9 19h3l.6-2.4 2-.9 2.4.7 1.5-2.6L16.7 12v-2l1.8-1.8L17 5.6l-2.4.7-2-.9L12 3H9Z" transform="translate(1.5 1)"/><circle cx="12" cy="12" r="3"/>'),
  feedback: icon('<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/>'),
  refresh: icon(`<path d="${refreshIconPath}"/>`),
  close: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
  edit: icon('<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>'),
  check: icon('<path d="m5 12 4 4L19 6"/>'),
  connect: icon('<path d="M7 3v5m10-5v5M5 8h14v3a7 7 0 0 1-14 0V8Zm7 10v4"/>'),
  remove: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>'),
  dream: icon('<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/><path d="M18 3v4m-2-2h4"/>'),
  filters: icon('<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
} as const))();
