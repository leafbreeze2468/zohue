// 本機版儲存：資料放在 localStorage，用 storage 事件做跨分頁即時同步。
// 介面與之後的 Firestore 版相同，權限檢查也比照 Security Rules 的規則（見 ADR 0001），
// 這樣換成 Firestore 時畫面不用改。

const KEY = (id) => `zohue:group:${id}`;
const listeners = new Map(); // groupId -> Set<callback>

function randomId(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join('');
}

/** 這台裝置的識別碼（Firestore 版會換成匿名登入的 uid） */
export function deviceId() {
  let id = localStorage.getItem('zohue:device');
  if (!id) {
    id = randomId(16);
    localStorage.setItem('zohue:device', id);
  }
  return id;
}

function load(id) {
  const raw = localStorage.getItem(KEY(id));
  return raw ? JSON.parse(raw) : null;
}

function save(id, data) {
  localStorage.setItem(KEY(id), JSON.stringify(data));
  notify(id); // storage 事件只會通知「其他」分頁，自己這頁要手動通知
}

function notify(id) {
  const data = load(id);
  for (const cb of listeners.get(id) || []) cb(data);
}

window.addEventListener('storage', (e) => {
  if (e.key?.startsWith('zohue:group:')) notify(e.key.slice('zohue:group:'.length));
});

function isAdmin(data, adminKey) {
  return Boolean(adminKey) && adminKey === data.adminKey;
}

function assertCanEditLine(data, line, adminKey, locked) {
  if (isAdmin(data, adminKey)) return;
  if (locked) throw new Error('已截止，不能再修改點單');
  if (line.deviceId !== deviceId()) throw new Error('只能修改自己的點單');
}

/**
 * 開團。兩種起點：
 *   直接點單：傳 shopName + menu，phase = 'order'
 *   先投票選店：傳 candidates [{ key, shop }] + pollDeadline，phase = 'poll'；投票結束後由團長用 updateGroup 設定店家與菜單
 */
export async function createGroup({ shopName = null, menu = null, deadline, organizer, candidates = null, pollDeadline = null }) {
  const id = randomId();
  const adminKey = randomId(20);
  const phase = candidates ? 'poll' : 'order';
  save(id, {
    group: {
      id, phase, shopName, menu, deadline, organizer, candidates, pollDeadline, votes: {},
      manualLock: null, adjustments: [], promotions: [], paid: {}, createdAt: Date.now(),
    },
    adminKey,
    lines: [],
  });
  return { id, adminKey };
}

/** 訂閱揪團資料；回傳取消訂閱的函式。callback 收到 { group, lines } 或 null（找不到） */
export function subscribe(id, callback) {
  const wrapped = (data) => callback(data && { group: data.group, lines: data.lines });
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(wrapped);
  wrapped(load(id));
  return () => listeners.get(id).delete(wrapped);
}

export async function addLine(id, line, { locked }) {
  const data = load(id);
  if (locked) throw new Error('已截止，不能再點單');
  data.lines.push({ ...line, id: randomId(), deviceId: deviceId(), createdAt: Date.now() });
  save(id, data);
}

export async function deleteLine(id, lineId, { adminKey, locked }) {
  const data = load(id);
  const line = data.lines.find((l) => l.id === lineId);
  if (!line) return;
  assertCanEditLine(data, line, adminKey, locked);
  data.lines = data.lines.filter((l) => l.id !== lineId);
  save(id, data);
}

/** 店家投票：每台裝置一票，可以改投；投票階段結束後不能再投 */
export async function vote(id, candidateKey) {
  const data = load(id);
  if (data.group.phase !== 'poll') throw new Error('投票已經結束');
  data.group.votes = { ...data.group.votes, [deviceId()]: candidateKey };
  save(id, data);
}

/** 團長專用：修改揪團設定（鎖單、額外費用、付款狀態、揪團菜單） */
export async function updateGroup(id, patch, adminKey) {
  const data = load(id);
  if (!isAdmin(data, adminKey)) throw new Error('需要團長的管理連結');
  data.group = { ...data.group, ...patch };
  save(id, data);
}

export async function init() {}

/** 本機版：管理金鑰正確才算團長 */
export async function claimAdmin(id, adminKey) {
  const data = load(id);
  return Boolean(data) && isAdmin(data, adminKey);
}
