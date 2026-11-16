// 只存在這台裝置的個人資料：老樣子（每家店上次點的內容）與團長的成員名單。
// 不經過 store，因為它們不屬於任何揪團，也不會給別人看到。

const USUAL = 'zohue:usual';
const ROSTER = 'zohue:roster';
const ROSTER_IGNORED = 'zohue:roster-ignored';

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

/** 記住我在這家店這一團點的內容（只留重新點單需要的欄位） */
export function rememberUsual(shopName, myLines) {
  if (!myLines.length) return;
  const all = read(USUAL, {});
  all[shopName] = myLines.map(({ item, size, sugar, ice, toppings, qty, note }) => ({
    item, size, sugar, ice, toppings: toppings.map((t) => t.name), qty, note,
  }));
  localStorage.setItem(USUAL, JSON.stringify(all));
}

/**
 * 依「這一團的菜單」重建老樣子的點單：價格用這團的價格；
 * 品項、尺寸、加料或客製選項已經不在菜單上的，就跳過並回報。
 */
export function usualFor(shopName, menu) {
  const saved = read(USUAL, {})[shopName];
  if (!saved) return null;
  const items = new Map(menu.categories.flatMap((c) => c.items).map((it) => [it.name, it]));
  const lines = [];
  const skipped = [];
  for (const u of saved) {
    const item = items.get(u.item);
    const size = item?.sizes.find((s) => s.size === u.size);
    const toppings = u.toppings.map((name) => menu.toppings.find((t) => t.name === name));
    const sugarOk = item?.fixedSugar ? u.sugar === '固定' : menu.sugar.includes(u.sugar);
    if (!size || toppings.includes(undefined) || !sugarOk || !menu.ice.includes(u.ice)) {
      skipped.push(u.item);
      continue;
    }
    lines.push({ item: u.item, size: u.size, sizePrice: size.price, sugar: u.sugar, ice: u.ice, toppings, qty: u.qty, note: u.note });
  }
  return { lines, skipped };
}

export function loadRoster() {
  return read(ROSTER, []);
}

export function saveRoster(names) {
  localStorage.setItem(ROSTER, JSON.stringify(names));
}

/** 團長從名單刪掉的名字：之後點單也不會被自動加回來 */
export function loadRosterIgnored() {
  return read(ROSTER_IGNORED, []);
}

/** 團長手動編輯名單：刪掉的人記進忽略清單，重新加回的人移出忽略清單 */
export function editRoster(names) {
  const removed = loadRoster().filter((n) => !names.includes(n));
  const ignored = [...new Set([...loadRosterIgnored(), ...removed])].filter((n) => !names.includes(n));
  localStorage.setItem(ROSTER_IGNORED, JSON.stringify(ignored));
  saveRoster(names);
}
