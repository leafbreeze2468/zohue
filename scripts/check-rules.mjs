// 對線上 Firestore 驗證 firestore.rules（本機沒有 Java 11，無法跑模擬器）。
// 用三個匿名使用者模擬團長 A、拿到管理連結的 B、一般團員 C。
// 執行：node scripts/check-rules.mjs   （會在資料庫留下兩個測試團，可忽略）
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, setDoc, updateDoc, writeBatch, FieldPath } from 'firebase/firestore';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l.startsWith('VITE_')).map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
};

async function user(name) {
  const app = initializeApp(config, name);
  const cred = await signInAnonymously(getAuth(app));
  return { db: getFirestore(app), uid: cred.user.uid };
}

let failed = 0;
async function expect(label, allowed, fn) {
  let ok;
  try { await fn(); ok = true; } catch (e) { if (e.code !== 'permission-denied') throw e; ok = false; }
  const pass = ok === allowed;
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}（預期${allowed ? '允許' : '拒絕'}，實際${ok ? '允許' : '拒絕'}）`);
}

const A = await user('A');
const B = await user('B');
const C = await user('C');
const rid = () => 'test' + Math.random().toString(36).slice(2, 10);

// ── 點單階段的團 ──
const gid = rid();
const key = rid() + rid();
const base = { id: gid, phase: 'order', shopName: '測試店', menu: null, deadline: null, organizer: 'A', candidates: null,
  pollDeadline: null, votes: {}, manualLock: null, adjustments: [], promotions: [], paid: {}, createdAt: Date.now() };

await expect('A 開團（團、金鑰、團長登記同一批）', true, () => {
  const b = writeBatch(A.db);
  b.set(doc(A.db, 'groups', gid), { ...base, ownerUid: A.uid });
  b.set(doc(A.db, 'secrets', gid), { adminKey: key });
  b.set(doc(A.db, 'groups', gid, 'admins', A.uid), { key });
  return b.commit();
});
await expect('C 讀揪團', true, () => getDoc(doc(C.db, 'groups', gid)));
await expect('C 讀管理金鑰', false, () => getDoc(doc(C.db, 'secrets', gid)));
await expect('C 改金鑰', false, () => setDoc(doc(C.db, 'secrets', gid), { adminKey: 'x' }));
await expect('C 改店名', false, () => updateDoc(doc(C.db, 'groups', gid), { shopName: '亂改' }));
await expect('C 用錯的金鑰當團長', false, () => setDoc(doc(C.db, 'groups', gid, 'admins', C.uid), { key: 'wrong' }));
await expect('C 替 B 登記團長', false, () => setDoc(doc(C.db, 'groups', gid, 'admins', B.uid), { key }));
await expect('B 用正確金鑰當團長', true, () => setDoc(doc(B.db, 'groups', gid, 'admins', B.uid), { key }));
await expect('B（團長）改店名', true, () => updateDoc(doc(B.db, 'groups', gid), { shopName: '改好了' }));
await expect('B（團長）改 ownerUid', false, () => updateDoc(doc(B.db, 'groups', gid), { ownerUid: B.uid }));

const line = { participant: '小C', item: '紅茶', size: 'L', sizePrice: 30, sugar: '微糖', ice: '少冰', toppings: [], qty: 1, createdAt: Date.now() };
await expect('C 點單', true, () => setDoc(doc(C.db, 'groups', gid, 'lines', 'c1'), { ...line, deviceId: C.uid }));
await expect('C 冒用 B 的身分點單', false, () => setDoc(doc(C.db, 'groups', gid, 'lines', 'c2'), { ...line, deviceId: B.uid }));
await expect('C 點 0 杯', false, () => setDoc(doc(C.db, 'groups', gid, 'lines', 'c3'), { ...line, qty: 0, deviceId: C.uid }));
await expect('C 修改已送出的點單', false, () => updateDoc(doc(C.db, 'groups', gid, 'lines', 'c1'), { qty: 5 }));
await expect('B（團長）以外的人刪 C 的點單', false, async () => {
  const D = await user('D');
  return deleteDoc(doc(D.db, 'groups', gid, 'lines', 'c1'));
});
await expect('A 鎖單', true, () => updateDoc(doc(A.db, 'groups', gid), { manualLock: 'locked' }));
await expect('鎖單後 C 點單', false, () => setDoc(doc(C.db, 'groups', gid, 'lines', 'c4'), { ...line, deviceId: C.uid }));
await expect('鎖單後 C 刪自己的點單', false, () => deleteDoc(doc(C.db, 'groups', gid, 'lines', 'c1')));
await expect('鎖單後團長刪點單', true, () => deleteDoc(doc(A.db, 'groups', gid, 'lines', 'c1')));
await expect('點單階段 C 投票', false, () => updateDoc(doc(C.db, 'groups', gid), new FieldPath('votes', C.uid), 'x'));
await expect('刪除揪團', false, () => deleteDoc(doc(A.db, 'groups', gid)));

// ── 投票階段的團 ──
const pid = rid();
await expect('A 開投票團', true, () => {
  const b = writeBatch(A.db);
  b.set(doc(A.db, 'groups', pid), { ...base, id: pid, phase: 'poll', ownerUid: A.uid });
  b.set(doc(A.db, 'secrets', pid), { adminKey: key });
  b.set(doc(A.db, 'groups', pid, 'admins', A.uid), { key });
  return b.commit();
});
await expect('C 投自己的票', true, () => updateDoc(doc(C.db, 'groups', pid), new FieldPath('votes', C.uid), 'a'));
await expect('C 改投', true, () => updateDoc(doc(C.db, 'groups', pid), new FieldPath('votes', C.uid), 'b'));
await expect('C 替別人投票', false, () => updateDoc(doc(C.db, 'groups', pid), new FieldPath('votes', B.uid), 'a'));
await expect('C 投票時順便改店名', false, () => updateDoc(doc(C.db, 'groups', pid), { shopName: 'x', [`votes.${C.uid}`]: 'a' }));
await expect('投票階段 C 點單', false, () => setDoc(doc(C.db, 'groups', pid, 'lines', 'c1'), { ...line, deviceId: C.uid }));
await expect('A 確認店家', true, () => updateDoc(doc(A.db, 'groups', pid), { phase: 'order', shopName: '測試店' }));
await expect('投票結束後 C 投票', false, () => updateDoc(doc(C.db, 'groups', pid), new FieldPath('votes', C.uid), 'a'));

// ── 搶建別人的金鑰 ──
await expect('C 替已存在的團建立新金鑰', false, () => setDoc(doc(C.db, 'secrets', gid), { adminKey: 'mine' }));

console.log(failed ? `\n${failed} 項不符預期` : '\n全部符合預期');
process.exit(failed ? 1 : 0);
