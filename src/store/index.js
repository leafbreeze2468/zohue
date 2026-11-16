// 有 Firebase 設定（.env.local）就用 Firestore，否則用只在本機瀏覽器的 localStorage 版（開發用）
import * as local from './local.js';
import * as firestore from './firestore.js';

const store = import.meta.env.VITE_FIREBASE_PROJECT_ID && import.meta.env.VITE_STORE !== 'local' ? firestore : local;

export const { init, deviceId, createGroup, claimAdmin, subscribe, addLine, deleteLine, vote, updateGroup } = store;
