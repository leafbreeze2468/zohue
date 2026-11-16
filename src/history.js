// 我的揪團紀錄：只存在這台裝置，首頁用來找回最近開過或參加過的團。

const KEY = 'zohue:history';
const MAX = 20;

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

/** 記錄（或更新）一次造訪；曾經用管理連結開過的，會保留管理金鑰 */
export function recordVisit({ id, title, organizer, adminKey }) {
  const list = loadHistory();
  const old = list.find((h) => h.id === id);
  const entry = { id, title, organizer, adminKey: adminKey || old?.adminKey || null, at: Date.now() };
  save([entry, ...list.filter((h) => h.id !== id)]);
}

export function forgetVisit(id) {
  save(loadHistory().filter((h) => h.id !== id));
}
