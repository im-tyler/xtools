const wrap = (path, opts = {}) => {
  const size = opts.size || 24;
  const fill = opts.fill ? "currentColor" : "none";
  const stroke = opts.fill ? "none" : "currentColor";
  const sw = opts.fill ? "0" : "1.6";
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
};

export const logo = (size = 24) =>
  `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="#e94560"/>
    <path d="M10 9.5 22 22.5M22 9.5 10 22.5" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/>
  </svg>`;

export const feed = (s) => wrap('<path d="M4 6h16M4 12h16M4 18h10"/>', { size: s });
export const queue = (s) => wrap('<path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M3 13l9 5 9-5"/>', { size: s });
export const voice = (s) => wrap('<path d="M12 20h8"/><path d="M16 4l4 4-10 10H6v-4L16 4Z"/>', { size: s });
export const gear = (s) => wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>', { size: s });
export const plus = (s) => wrap('<path d="M12 5v14M5 12h14"/>', { size: s });
export const spark = (s) => wrap('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/><path d="M12 8.5c.6 2 1.5 2.9 3.5 3.5-2 .6-2.9 1.5-3.5 3.5-.6-2-1.5-2.9-3.5-3.5 2-.6 2.9-1.5 3.5-3.5Z" fill="currentColor" stroke="none"/>', { size: s });
export const send = (s) => wrap('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>', { size: s });
export const remix = (s) => wrap('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v5h-5"/>', { size: s });
export const copy = (s) => wrap('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2"/>', { size: s });
export const trash = (s) => wrap('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/>', { size: s });
export const clock = (s) => wrap('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', { size: s });
export const check = (s) => wrap('<path d="M20 6 9 17l-5-5"/>', { size: s });
export const alert = (s) => wrap('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>', { size: s });
export const chevron = (s) => wrap('<path d="m6 9 6 6 6-6"/>', { size: s });
export const close = (s) => wrap('<path d="M18 6 6 18M6 6l12 12"/>', { size: s });
export const key = (s) => wrap('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 9-9M16 4l3 3M14 6l3 3"/>', { size: s });
export const external = (s) => wrap('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>', { size: s });
export const edit = (s) => wrap('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>', { size: s });
export const hash = (s) => wrap('<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>', { size: s });
export const sun = (s) => wrap('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', { size: s });
export const moon = (s) => wrap('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>', { size: s });
