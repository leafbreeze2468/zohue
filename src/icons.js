// 細線圖示（顏色跟著文字顏色 currentColor）。sprite 在 main.js 插入一次，各處用 icon('名稱') 引用。

const PATHS = {
  cup: '<path d="M6.5 7h11l-1.3 13.2a1 1 0 0 1-1 .8H8.8a1 1 0 0 1-1-.8z"/><path d="M5.5 7h13"/><path d="M12.5 7l2.5-5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  repeat: '<path d="M4 11a7 7 0 0 1 12.5-4.3L19 9"/><path d="M19 4v5h-5"/><path d="M20 13a7 7 0 0 1-12.5 4.3L5 15"/><path d="M5 20v-5h5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18 14.2A6 6 0 0 1 21 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  wallet: '<path d="M4 7h15a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5z"/><path d="M4 7V6.5A1.5 1.5 0 0 1 5.5 5H16"/><circle cx="16.5" cy="13" r="1"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  vote: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M12 8v4l3 2"/>',
};

export const ICON_SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${
  Object.entries(PATHS).map(([name, d]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${d}</symbol>`).join('')}</svg>`;

export function icon(name) {
  return `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

/** 品牌標誌：兩個杯子輕碰 */
export const LOGO = `<svg class="logo-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <g transform="rotate(-14 16 28)"><path d="M9 16h14l-1.6 22a1.5 1.5 0 0 1-1.5 1.4h-7.8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M8 16h16"/><path d="M17 16l3-7"/></g>
  <g transform="rotate(14 32 28)"><path d="M25 16h14l-1.6 22a1.5 1.5 0 0 1-1.5 1.4h-7.8a1.5 1.5 0 0 1-1.5-1.4z"/><path d="M24 16h16"/><path d="M31 16l-3-7"/></g>
  <path d="M24 6V3M19.5 7.5l-1.5-2M28.5 7.5l1.5-2"/>
</svg>`;
