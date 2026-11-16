// Firestore 版儲存：介面與 local.js 相同。權限由 firestore.rules 把關（見 ADR 0001），
// 這裡的檢查只是為了在畫面上提早給出好懂的錯誤訊息。
//
// 資料結構：
//   groups/{id}                 揪團（所有人可讀）
//   groups/{id}/lines/{lineId}  點單（所有人可讀）
//   groups/{id}/admins/{uid}    已用管理連結驗證過的團長裝置
//   secrets/{id}                管理金鑰（任何人都讀不到，只有規則能比對）

import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  collection, deleteDoc, doc, FieldPath, getDoc, initializeFirestore, onSnapshot,
  orderBy, query, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';

const env = import.meta.env;
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

function randomId(len = 10) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join('');
}

/** 匿名登入；同一個瀏覽器會沿用同一個 uid。畫面要等這個完成才開始畫 */
export function init() {
  return new Promise((resolve, reject) => {
    const stop = onAuthStateChanged(auth, (user) => {
      if (user) { stop(); resolve(); }
    });
    signInAnonymously(auth).catch(reject);
  });
}

export function deviceId() {
  return auth.currentUser.uid;
}

const groupRef = (id) => doc(db, 'groups', id);

function friendly(err) {
  if (err.code === 'permission-denied') return new Error('沒有權限：可能已截止，或需要團長的管理連結');
  return err;
}

export async function createGroup({ shopName = null, menu = null, deadline, organizer, candidates = null, pollDeadline = null }) {
  const id = randomId();
  const adminKey = randomId(20);
  const uid = deviceId();
  const batch = writeBatch(db);
  batch.set(groupRef(id), {
    id, phase: candidates ? 'poll' : 'order', shopName, menu, deadline, organizer, candidates, pollDeadline,
    votes: {}, manualLock: null, adjustments: [], promotions: [], paid: {},
    ownerUid: uid, createdAt: Date.now(),
  });
  batch.set(doc(db, 'secrets', id), { adminKey });
  batch.set(doc(db, 'groups', id, 'admins', uid), { key: adminKey });
  await batch.commit().catch((e) => { throw friendly(e); });
  return { id, adminKey };
}

/** 用管理連結把這台裝置登記成團長；金鑰錯誤時回傳 false */
export async function claimAdmin(id, adminKey) {
  const ref = doc(db, 'groups', id, 'admins', deviceId());
  try {
    if ((await getDoc(ref)).exists()) return true;
    await setDoc(ref, { key: adminKey });
    return true;
  } catch {
    return false;
  }
}

/** 訂閱揪團資料；callback 收到 { group, lines } 或 null（找不到） */
export function subscribe(id, callback) {
  let group;
  let lines;
  const emit = () => {
    if (group === null) callback(null);
    else if (group && lines) callback({ group, lines });
  };
  const offGroup = onSnapshot(groupRef(id), (snap) => {
    group = snap.exists() ? snap.data() : null;
    emit();
  }, () => callback(null));
  const offLines = onSnapshot(query(collection(db, 'groups', id, 'lines'), orderBy('createdAt')), (snap) => {
    lines = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    emit();
  }, () => {});
  return () => { offGroup(); offLines(); };
}

export async function addLine(id, line, { locked }) {
  if (locked) throw new Error('已截止，不能再點單');
  const ref = doc(collection(db, 'groups', id, 'lines'));
  await setDoc(ref, { ...line, deviceId: deviceId(), createdAt: Date.now() }).catch((e) => { throw friendly(e); });
}

export async function deleteLine(id, lineId) {
  await deleteDoc(doc(db, 'groups', id, 'lines', lineId)).catch((e) => { throw friendly(e); });
}

export async function vote(id, candidateKey) {
  await updateDoc(groupRef(id), new FieldPath('votes', deviceId()), candidateKey).catch((e) => { throw friendly(e); });
}

export async function updateGroup(id, patch) {
  await updateDoc(groupRef(id), patch).catch((e) => { throw friendly(e); });
}
