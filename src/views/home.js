import { createGroup } from '../store/index.js';
import { esc, MENU_TEMPLATES, setPage } from '../util.js';
import { forgetVisit, loadHistory } from '../history.js';
import { icon, LOGO } from '../icons.js';
import { renderInstall } from '../install.js';

/** 把 "HH:MM" 轉成今天（已過則明天）的時間戳；空字串回傳 null */
function timeToday(value) {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export function renderHome(app) {
  const name = localStorage.getItem('zohue:name') || '';
  const shops = MENU_TEMPLATES.map((t, i) => ({ i, shop: t.menu.shop }));
  setPage('home');
  app.innerHTML = `
    <header class="hero">
      <div class="brand">${LOGO}<b>做伙飲</b></div>
      <p>貼一個連結，大家自己點，自動算好彙總單和每人金額。</p>
    </header>
    <div id="install"></div>
    <form id="create" class="sec">
      <h2>開一團</h2>
      <label>你的名字（團長）
        <input name="organizer" required maxlength="20" value="${esc(name)}" placeholder="例如：小明" />
      </label>
      <fieldset>
        <legend>怎麼決定喝哪家？</legend>
        <label class="chip"><input type="radio" name="mode" value="direct" checked />我直接選</label>
        <label class="chip"><input type="radio" name="mode" value="poll" />大家投票</label>
      </fieldset>
      <div id="direct">
        <label>店家
          <select name="shop">${shops.map((s) => `<option value="${s.i}">${esc(s.shop)}</option>`).join('')}</select>
        </label>
      </div>
      <div id="poll" hidden>
        <fieldset><legend>候選店家（至少 2 家）</legend>
          ${shops.map((s) => `<label class="chip"><input type="checkbox" name="candidates" value="${s.i}" />${esc(s.shop)}</label>`).join('')}
        </fieldset>
        <label>投票截止
          <input name="pollDeadline" type="time" />
        </label>
        <p class="hint">投票截止後，最高票的店家會自動成為這團的店家，接著開始點單。</p>
      </div>
      <label>點單截止（可不填）
        <input name="deadline" type="time" />
      </label>
      <p class="hint">菜單價格是參考價，開團後可以在管理頁修改成你那間分店的價格。</p>
      <button class="primary">開團</button>
    </form>
    <section id="history"></section>`;

  renderHistory(app.querySelector('#history'));
  renderInstall(app.querySelector('#install'));

  const form = app.querySelector('#create');
  form.addEventListener('change', (e) => {
    if (e.target.name !== 'mode') return;
    const poll = e.target.value === 'poll';
    form.querySelector('#direct').hidden = poll;
    form.querySelector('#poll').hidden = !poll;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const organizer = f.get('organizer').trim();
    localStorage.setItem('zohue:name', organizer);
    const deadline = timeToday(f.get('deadline'));
    let created;
    if (f.get('mode') === 'poll') {
      const picked = f.getAll('candidates').map(Number);
      if (picked.length < 2) return alert('投票至少要選 2 家店');
      const pollDeadline = timeToday(f.get('pollDeadline'));
      if (!pollDeadline) return alert('請設定投票截止時間');
      if (deadline && deadline <= pollDeadline) return alert('點單截止要晚於投票截止');
      const candidates = picked.map((i) => ({ key: MENU_TEMPLATES[i].key, shop: MENU_TEMPLATES[i].menu.shop }));
      created = await createGroup({ organizer, deadline, candidates, pollDeadline });
    } else {
      const template = MENU_TEMPLATES[Number(f.get('shop'))].menu;
      // 揪團菜單：從範本複製一份，之後的修改只影響這一團
      created = await createGroup({ shopName: template.shop, menu: structuredClone(template), deadline, organizer });
    }
    location.hash = `/g/${created.id}?admin=${created.adminKey}`;
  });
}

/** 我的揪團：這台裝置最近開過或參加過的團 */
function renderHistory(el) {
  const list = loadHistory();
  if (!list.length) {
    el.innerHTML = '';
    return;
  }
  const day = (ms) => new Date(ms).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
  el.innerHTML = `<div class="sec"><h2>${icon('history')}我的揪團</h2>
    ${list.map((h) => `<div class="line">
      <a href="#/g/${esc(h.id)}${h.adminKey ? `?admin=${esc(h.adminKey)}` : ''}">${esc(h.title)}</a>
      ${h.adminKey ? '<span class="badge milk">團長</span>' : ''}
      ${h.title === '今天喝哪家？' ? '<span class="badge taro">投票中</span>' : ''}
      <span class="muted small">${esc(h.organizer || '')}・${day(h.at)}</span>
      <button class="small ghost del" data-id="${esc(h.id)}" aria-label="從紀錄移除">✕</button>
    </div>`).join('')}
    <p class="hint">只存在這台裝置。移除紀錄不會刪掉揪團。</p></div>`;
  el.querySelectorAll('.del').forEach((b) => {
    b.onclick = () => { forgetVisit(b.dataset.id); renderHistory(el); };
  });
}
