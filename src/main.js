import { renderHome } from './views/home.js';
import { renderGroup } from './views/group.js';
import { claimAdmin, init } from './store/index.js';
import { ICON_SPRITE } from './icons.js';
import { registerServiceWorker } from './install.js';

document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
registerServiceWorker();

// 路由（hash）：
//   #/                      首頁：開團
//   #/g/<id>                團員：點單
//   #/g/<id>?admin=<key>    團長：管理連結
let cleanup = null;

const app = document.getElementById('app');
let routeSeq = 0;

async function route() {
  cleanup?.();
  cleanup = null;
  const seq = ++routeSeq;
  const [path, query = ''] = location.hash.slice(1).split('?');
  const match = path.match(/^\/g\/([a-z0-9]+)$/);
  if (match) {
    let adminKey = new URLSearchParams(query).get('admin');
    // 管理連結：先向資料庫驗證金鑰，把這台裝置登記成團長
    if (adminKey && !(await claimAdmin(match[1], adminKey))) {
      alert('管理連結無效，先用團員身分打開');
      adminKey = null;
    }
    if (seq !== routeSeq) return; // 驗證期間又換了頁
    cleanup = renderGroup(app, match[1], adminKey);
  } else {
    renderHome(app);
  }
}

app.innerHTML = '<p class="muted" style="text-align:center">載入中…</p>';
init()
  .then(() => {
    window.addEventListener('hashchange', route);
    route();
  })
  .catch((err) => {
    app.innerHTML = `<div class="card"><h2>連線失敗</h2><p class="muted">${err.message}</p><p>請檢查網路後重新整理。</p></div>`;
  });
