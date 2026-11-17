// 「安裝做伙飲」提示：依瀏覽器給不同做法。只放在首頁與團長管理頁，不打擾來點一杯的團員。
//   Android／電腦 Chrome、Edge：瀏覽器會發 beforeinstallprompt，我們顯示「安裝」按鈕
//   iPhone／iPad：沒有安裝事件，只能教大家用分享選單「加入主畫面」
//   LINE 內建瀏覽器：不能安裝，請大家改用手機瀏覽器開啟
import { icon } from './icons.js';

const DISMISSED = 'zohue:install-dismissed';
let deferred = null;
const mounted = new Set();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  mounted.forEach((el) => renderInstall(el));
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  mounted.forEach((el) => { el.innerHTML = ''; });
});

const ua = navigator.userAgent;
const inLine = /\bLine\//i.test(ua);
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function dismissed() {
  try { return localStorage.getItem(DISMISSED) === '1'; } catch { return false; }
}

/** LINE 支援在網址加 openExternalBrowser=1，直接用手機預設瀏覽器打開 */
function externalUrl() {
  const u = new URL(location.href);
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}

export function renderInstall(el) {
  mounted.add(el);
  let body = '';
  if (installed() || dismissed()) body = '';
  else if (inLine) {
    body = `<p class="small">在 LINE 裡沒辦法安裝。用手機瀏覽器打開後，就能把做伙飲加到主畫面。</p>
      <div><a class="btn-link" href="${externalUrl()}">用瀏覽器開啟</a></div>`;
  } else if (deferred) {
    body = `<p class="small">裝到手機或電腦，下次揪團一點就開，不用再找連結。</p>
      <div><button id="install-btn" class="small">${icon('plus')}安裝</button></div>`;
  } else if (isIOS) {
    body = `<p class="small">點 Safari 下方的<b>分享</b>按鈕，選「<b>加入主畫面</b>」，下次揪團一點就開。</p>`;
  }
  if (!body) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `<div class="block milk install">
    <div class="row"><span class="head">${icon('cup')}把做伙飲加到主畫面</span>
      <button id="install-close" class="ghost small" aria-label="不再顯示">不用了</button></div>
    ${body}</div>`;
  el.querySelector('#install-close').onclick = () => {
    try { localStorage.setItem(DISMISSED, '1'); } catch { /* 無法儲存就只關這次 */ }
    el.innerHTML = '';
  };
  const btn = el.querySelector('#install-btn');
  if (btn) {
    btn.onclick = async () => {
      deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      renderInstall(el);
    };
  }
}

/** 正式版才註冊 service worker（開發時避免快取干擾） */
export function registerServiceWorker() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 不支援也不影響使用 */ });
  }
}
