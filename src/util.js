/** 跳脫使用者輸入，避免插入 HTML */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export async function copy(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      const old = button.innerHTML;
      button.textContent = '已複製 ✓';
      setTimeout(() => { button.innerHTML = old; }, 1500);
    }
  } catch {
    prompt('請手動複製：', text);
  }
}

export function formatTime(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 菜單範本：data/menus/*.json，底線開頭的是開發用假菜單 */
const modules = import.meta.glob('../data/menus/*.json', { eager: true, import: 'default' });
export const MENU_TEMPLATES = Object.entries(modules)
  .map(([path, menu]) => ({ key: path.split('/').pop().replace('.json', ''), menu }))
  .sort((a, b) => a.key.startsWith('_') - b.key.startsWith('_'));

/** 切換整頁的底色與主色（見 style.css 的 body[data-page]） */
export function setPage(name) {
  document.body.dataset.page = name;
}
