// Shared decorative glyphs. Callers supply accessible names on the control.
const icon = (body: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const browserIcons = {
  search: icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>'),
  home: icon('<path d="m3 10 9-7 9 7v10H3V10Zm6 10v-7h6v7"/>'),
  graph: icon('<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="19" r="2.5"/><path d="M7.5 6h9M6 8l5 9m7-9-5 9"/>'),
  settings: icon('<path d="m9 3-.6 2.4-2 .9L4 5.6 2.5 8.2 4.3 10v2l-1.8 1.8L4 16.4l2.4-.7 2 .9L9 19h3l.6-2.4 2-.9 2.4.7 1.5-2.6L16.7 12v-2l1.8-1.8L17 5.6l-2.4.7-2-.9L12 3H9Z" transform="translate(1.5 1)"/><circle cx="12" cy="12" r="3"/>'),
  feedback: icon('<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h7"/>'),
  refresh: icon('<path d="M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M4 16l2 3a8 8 0 0 0 13-3"/>'),
  close: icon('<path d="m6 6 12 12M18 6 6 18"/>'),
  edit: icon('<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>'),
  check: icon('<path d="m5 12 4 4L19 6"/>'),
  connect: icon('<path d="M7 3v5m10-5v5M5 8h14v3a7 7 0 0 1-14 0V8Zm7 10v4"/>'),
  remove: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7"/>'),
  dream: icon('<path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/><path d="M18 3v4m-2-2h4"/>'),
  filters: icon('<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
} as const;
