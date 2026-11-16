// 做伙飲的核心規則：彙總單、每人應付、額外費用分攤、鎖單。純函式，不碰儲存與畫面。
// 詞彙定義見 CONTEXT.md。

/** 一筆點單的單價（尺寸價 + 加料） */
export function linePrice(line) {
  const toppings = (line.toppings || []).reduce((sum, t) => sum + t.price, 0);
  return line.sizePrice + toppings;
}

/** 點單小計 */
export function lineTotal(line) {
  return linePrice(line) * line.qty;
}

/** 彙總單的合併鍵：品項＋尺寸＋客製選項（加料排序後比較，順序不同視為相同） */
function slipKey(line) {
  const toppings = (line.toppings || []).map((t) => t.name).sort().join('+');
  return [line.item, line.size, line.sugar, line.ice, toppings].join('|');
}

/**
 * 彙總單：依「品項＋客製選項」合併計數。
 * 備註不合併（不同備註要讓店家看到），附在該列的 notes。
 */
export function shopSlip(lines) {
  const rows = new Map();
  for (const line of lines) {
    const key = slipKey(line);
    const row = rows.get(key) || {
      item: line.item, size: line.size, sugar: line.sugar, ice: line.ice,
      toppings: (line.toppings || []).map((t) => t.name).sort(),
      unitPrice: linePrice(line), qty: 0, notes: [],
    };
    row.qty += line.qty;
    if (line.note) row.notes.push(`${line.participant}：${line.note}`);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.item.localeCompare(b.item, 'zh-Hant') || a.size.localeCompare(b.size));
}

/** 成員名單中還沒點單的人（名字前後空白不計） */
export function missingMembers(roster, lines) {
  const ordered = new Set(lines.map((l) => l.participant.trim()));
  return roster.map((n) => n.trim()).filter((n) => n && !ordered.has(n));
}

/**
 * 點過單的人自動加入成員名單（附在最後）。團長刪掉過的名字（ignored）不會再被加回來。
 * 沒有新人時回傳原本的陣列，方便呼叫端判斷要不要存檔。
 */
export function mergeRoster(roster, lines, ignored = []) {
  const known = new Set([...roster.map((n) => n.trim()), ...ignored]);
  const added = [];
  for (const line of lines) {
    const name = line.participant.trim();
    if (name && !known.has(name)) {
      known.add(name);
      added.push(name);
    }
  }
  return added.length ? [...roster, ...added] : roster;
}

/** 每一杯的單價清單（數量拆開），由貴到便宜 */
function cupPrices(lines) {
  return lines.flatMap((l) => Array(l.qty).fill(linePrice(l))).sort((a, b) => b - a);
}

/**
 * 優惠折扣金額（正數）。
 *   { type: 'buyNgetM', n: 5, m: 1 }  買 N 送 M：每 N+M 杯送 M 杯，送最便宜的
 *   { type: 'secondHalf' }            第二杯半價：由貴到便宜兩兩一組，較便宜的半價
 *   { type: 'percent', off: 10 }      全部打折，off=10 代表折 10%
 * 各店實際規則可能不同（例如限同品項），團長可改用「額外費用」自行輸入。
 */
export function promotionDiscount(lines, promo) {
  const prices = cupPrices(lines);
  if (promo.type === 'buyNgetM') {
    const group = promo.n + promo.m;
    const free = Math.floor(prices.length / group) * promo.m;
    return free ? prices.slice(-free).reduce((s, p) => s + p, 0) : 0;
  }
  if (promo.type === 'secondHalf') {
    return Math.round(prices.filter((_, i) => i % 2 === 1).reduce((s, p) => s + p, 0) / 2);
  }
  if (promo.type === 'percent') {
    return Math.round(prices.reduce((s, p) => s + p, 0) * promo.off / 100);
  }
  return 0;
}

export function promotionLabel(promo) {
  if (promo.type === 'buyNgetM') return `買${promo.n}送${promo.m}`;
  if (promo.type === 'secondHalf') return '第二杯半價';
  if (promo.type === 'percent') return `${(100 - promo.off) / 10}折`.replace('.0', '');
  return '優惠';
}

/**
 * 每位團員應付金額。
 * adjustments：[{ label, amount, split: 'equal' | 'perCup' | 'perAmount' }]，amount 正為費用、負為折扣。
 * promotions：優惠會換算成依消費金額比例分攤的折扣（點得多的人分到的折扣多）。
 * 分攤先算精確值，最後四捨五入到整數元；團長要多收或少收的零頭以 roundingDiff 回報。
 */
export function bill(lines, adjustments = [], promotions = []) {
  adjustments = [
    ...adjustments,
    ...promotions.map((p) => ({ label: promotionLabel(p), amount: -promotionDiscount(lines, p), split: 'perAmount' })),
  ];
  const people = new Map();
  for (const line of lines) {
    const p = people.get(line.participant) || { participant: line.participant, cups: 0, items: 0, exact: 0 };
    p.cups += line.qty;
    p.items += lineTotal(line);
    people.set(line.participant, p);
  }
  const list = [...people.values()];
  const totalCups = list.reduce((s, p) => s + p.cups, 0);
  const totalItems = list.reduce((s, p) => s + p.items, 0);
  for (const adj of adjustments) {
    for (const p of list) {
      const share = adj.split === 'perCup' ? (totalCups ? adj.amount * (p.cups / totalCups) : 0)
        : adj.split === 'perAmount' ? (totalItems ? adj.amount * (p.items / totalItems) : 0)
        : adj.amount / list.length;
      p.exact += share;
    }
  }
  for (const p of list) {
    p.exact += p.items;
    p.due = Math.round(p.exact);
  }
  const itemsTotal = list.reduce((s, p) => s + p.items, 0);
  const adjTotal = adjustments.reduce((s, a) => s + a.amount, 0);
  const grandTotal = itemsTotal + adjTotal;
  const collected = list.reduce((s, p) => s + p.due, 0);
  return {
    people: list.map(({ participant, cups, items, due }) => ({ participant, cups, items, due })),
    totalCups, itemsTotal, grandTotal,
    adjustments, // 含優惠換算出的折扣，給畫面列出明細
    roundingDiff: collected - grandTotal, // 正：多收；負：團長要自己補
  };
}

/** 揪團是否已鎖單：截止時間已過且團長沒有手動解鎖，或團長手動鎖單 */
export function isLocked(group, now = Date.now()) {
  if (group.manualLock === 'locked') return true;
  if (group.manualLock === 'unlocked') return false;
  return group.deadline != null && now >= group.deadline;
}

/** 催款文字：列出尚未付款的人與金額，方便貼到 LINE */
export function reminderText(group, billResult, paid = {}) {
  const unpaid = billResult.people.filter((p) => !paid[p.participant]);
  if (!unpaid.length) return `【${group.shopName}】大家都付清了，謝謝！`;
  const lines = unpaid.map((p) => `・${p.participant} $${p.due}`);
  return [`【${group.shopName}】還沒付款的朋友：`, ...lines, '再麻煩大家了 🙏'].join('\n');
}

/** 店家投票結果：各候選店家票數，平手時排在前面的勝出 */
export function pollResult(group) {
  const counts = group.candidates.map((c) => ({ ...c, votes: 0 }));
  for (const key of Object.values(group.votes || {})) {
    const c = counts.find((x) => x.key === key);
    if (c) c.votes += 1;
  }
  const winner = counts.reduce((best, c) => (c.votes > best.votes ? c : best), counts[0]);
  return { counts, winner };
}

/** 投票是否已截止（時間到；團長確認店家後 phase 會變成 order） */
export function pollClosed(group, now = Date.now()) {
  return group.pollDeadline != null && now >= group.pollDeadline;
}
