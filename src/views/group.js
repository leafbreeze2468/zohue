import { addLine, deleteLine, deviceId, setReport, subscribe, updateGroup, updateLine, vote } from '../store/index.js';
import { recordVisit } from '../history.js';
import {
  bill, isLocked, lineTotal, mergeRoster, missingMembers, pollClosed, pollResult, promotionDiscount, promotionLabel, reminderText, shopSlip,
} from '../domain.js';
import { editRoster, loadRoster, loadRosterIgnored, rememberUsual, saveRoster, usualFor } from '../usual.js';
import { copy, esc, formatTime, MENU_TEMPLATES } from '../util.js';

/**
 * 揪團頁。團員與團長共用；帶 adminKey 時多出管理功能。
 * 畫面分成「不常變」（菜單、點單對話框）與「即時更新」（點單列表、彙總單）兩部分，
 * 即時更新時只重畫後者，避免別人點單時把你正在填的表單洗掉。
 */
export function renderGroup(app, id, adminKey) {
  const admin = Boolean(adminKey);
  const me = deviceId();
  let data = null;
  let menuJson = '';
  let editPrices = false;
  let autoConfirmed = false; // 投票截止只自動確認一次

  app.innerHTML = `
    <header id="head" class="group-head"></header>
    <section id="poll" hidden></section>
    <nav class="tabs">
      <button data-tab="order" class="active">點單</button>
      <button data-tab="slip">彙總單${admin ? '／收款' : ''}</button>
    </nav>
    <section id="tab-order">
      <label class="card name-row">你的名字
        <input id="who" maxlength="20" value="${esc(localStorage.getItem('zohue:name') || '')}" placeholder="點單前先填名字" />
      </label>
      <div id="usual"></div>
      ${admin ? '<div id="roster" class="card"></div>' : ''}
      <div id="menu"></div>
      <h3>大家點了什麼</h3>
      <div id="lines"></div>
    </section>
    <section id="tab-slip" hidden></section>
    <dialog id="dlg"></dialog>`;

  const $ = (sel) => app.querySelector(sel);
  const locked = () => data && isLocked(data.group);
  const fail = (err) => alert(err.message);

  $('#who').addEventListener('change', (e) => localStorage.setItem('zohue:name', e.target.value.trim()));
  app.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.dataset.tab;
    if (!t) return;
    app.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $('#tab-order').hidden = t !== 'order';
    $('#tab-slip').hidden = t !== 'slip';
  });

  // ── 標頭 ───────────────────────────────────────────────
  function renderHead() {
    const g = data.group;
    const share = `${location.origin}${location.pathname}#/g/${id}`;
    const polling = g.phase === 'poll';
    const status = polling ? `<span class="badge">${formatTime(g.pollDeadline)} 投票截止</span>`
      : locked() ? '<span class="badge closed">已截止</span>'
      : g.deadline ? `<span class="badge">${formatTime(g.deadline)} 截止</span>` : '<span class="badge">未設截止</span>';
    $('#head').innerHTML = `
      <h1>${polling ? '今天喝哪家？' : esc(g.shopName)} ${status}</h1>
      <p class="muted">團長：${esc(g.organizer)}</p>
      <div class="row">
        <button id="copy-share">複製點單連結</button>
        ${admin ? `<button id="copy-admin" class="ghost">複製管理連結</button>
          ${polling ? '' : `<button id="toggle-lock" class="ghost">${locked() ? '解鎖' : '提前截止'}</button>`}` : ''}
      </div>
      ${admin ? '<p class="hint">管理連結可以修改所有人的點單，請不要貼到群組。</p>' : ''}`;
    $('#copy-share').onclick = (e) => copy(share, e.target);
    if (admin) {
      $('#copy-admin').onclick = (e) => copy(`${share}?admin=${adminKey}`, e.target);
      if (!polling) $('#toggle-lock').onclick = () =>
        updateGroup(id, { manualLock: locked() ? 'unlocked' : 'locked' }, adminKey).catch(fail);
    }
  }

  // ── 店家投票 ───────────────────────────────────────────
  function confirmShop(key) {
    const template = MENU_TEMPLATES.find((t) => t.key === key)?.menu;
    if (!template) return alert('找不到這家店的菜單');
    updateGroup(id, { phase: 'order', shopName: template.shop, menu: structuredClone(template) }, adminKey).catch(fail);
  }

  function renderPoll() {
    const g = data.group;
    const { counts, winner } = pollResult(g);
    const mine = g.votes?.[me];
    const closed = pollClosed(g);
    const total = counts.reduce((s, c) => s + c.votes, 0);
    $('#poll').innerHTML = `
      <div class="card">
        <h2>${closed ? `投票結束：${esc(winner.shop)} 勝出` : '投一票吧'}</h2>
        ${counts.map((c) => `
          <button class="vote ${mine === c.key ? 'voted' : ''}" data-key="${esc(c.key)}" ${closed ? 'disabled' : ''}>
            <span>${esc(c.shop)}</span><span class="muted">${c.votes} 票</span>
            <span class="bar" style="width:${total ? (c.votes / total) * 100 : 0}%"></span>
          </button>`).join('')}
        <p class="hint">${closed ? (admin ? '' : '等團長確認後就可以開始點單。') : '可以改投，截止前都算數。'}</p>
        ${admin ? `<div class="row wrap">${counts.map((c) =>
          `<button class="small confirm" data-key="${esc(c.key)}">${closed && c.key === winner.key ? '✓ ' : ''}就喝${esc(c.shop)}</button>`).join('')}</div>
          <p class="hint">團長可以提前決定；投票截止時，若這個管理頁開著，會自動選最高票的店。</p>` : ''}
      </div>`;
    $('#poll').querySelectorAll('.vote').forEach((b) => { b.onclick = () => vote(id, b.dataset.key).catch(fail); });
    $('#poll').querySelectorAll('.confirm').forEach((b) => { b.onclick = () => confirmShop(b.dataset.key); });
    if (admin && closed && !autoConfirmed) { autoConfirmed = true; confirmShop(winner.key); }
  }

  function renderUsual() {
    const g = data.group;
    const usual = usualFor(g.shopName, g.menu);
    const ordered = data.lines.some((l) => l.deviceId === me);
    if (!usual?.lines.length || ordered || locked()) {
      $('#usual').innerHTML = '';
      return;
    }
    const text = usual.lines.map((l) => `${l.item}（${l.size}）${l.sugar}／${l.ice}${l.toppings.length ? `＋${l.toppings.map((t) => t.name).join('＋')}` : ''}${l.qty > 1 ? ` ×${l.qty}` : ''}`).join('、');
    $('#usual').innerHTML = `<div class="card usual">
      <div><b>老樣子？</b><br><span class="muted">${esc(text)}</span>
      ${usual.skipped.length ? `<br><span class="hint">${esc(usual.skipped.join('、'))} 菜單上找不到，已略過</span>` : ''}</div>
      <button id="usual-btn" class="primary">一鍵點</button></div>`;
    $('#usual-btn').onclick = async () => {
      const who = $('#who').value.trim();
      if (!who) { $('#who').focus(); return alert('先填你的名字喔'); }
      try {
        for (const line of usual.lines) await addLine(id, { ...line, participant: who }, { locked: locked() });
      } catch (err) { fail(err); }
    };
  }

  function renderRoster() {
    if (!admin) return;
    // 有人點單就自動加進名單（團長刪掉過的人除外）
    let roster = loadRoster();
    const merged = mergeRoster(roster, data.lines, loadRosterIgnored());
    if (merged !== roster) saveRoster((roster = merged));
    const missing = missingMembers(roster, data.lines);
    $('#roster').innerHTML = `
      <h2>誰還沒點 ${roster.length ? `<span class="muted small">${roster.length - missing.length}/${roster.length}</span>` : ''}</h2>
      ${roster.length ? (missing.length ? `<p>${missing.map(esc).join('、')}</p><button id="copy-missing" class="small">複製提醒訊息</button>`
        : '<p>大家都點了 🎉</p>') : '<p class="muted">點過單的人會自動加進名單，下次開團就能看到誰還沒點。</p>'}
      <details><summary class="small">編輯成員名單</summary>
        <textarea id="roster-input" rows="3" placeholder="一行一個名字，或用逗號分隔">${esc(roster.join('\n'))}</textarea>
        <button id="roster-save" class="small">儲存</button>
      </details>`;
    $('#roster-save').onclick = () => {
      editRoster($('#roster-input').value.split(/[\n,，、]/).map((n) => n.trim()).filter(Boolean));
      renderRoster();
    };
    const btn = $('#copy-missing');
    if (btn) {
      const g = data.group;
      btn.onclick = () => copy(`【${g.shopName}】還沒點的朋友：${missing.join('、')}${g.deadline ? `\n${formatTime(g.deadline)} 截止喔！` : ''}\n${location.origin}${location.pathname}#/g/${id}`, btn);
    }
  }

  // ── 菜單 ───────────────────────────────────────────────
  function renderMenu() {
    const menu = data.group.menu;
    $('#menu').innerHTML = `
      ${admin ? `<button id="edit-prices" class="ghost small">${editPrices ? '完成修改' : '修改價格（只影響這一團）'}</button>` : ''}
      ${menu.categories.map((c, ci) => `
        <details class="card" ${ci === 0 ? 'open' : ''}>
          <summary>${esc(c.name)}</summary>
          ${c.items.map((it, ii) => `
            <div class="menu-item" data-c="${ci}" data-i="${ii}">
              <span>${esc(it.name)}</span>
              <span class="prices">${it.sizes.map((s, si) => editPrices
                ? `${esc(s.size)} <input class="price" type="number" min="0" data-s="${si}" value="${s.price}" />`
                : `${esc(s.size)} $${s.price}`).join('　')}</span>
              ${editPrices ? '' : it.sizes.length ? '<button class="add">＋</button>' : '<span class="muted small">價格待補</span>'}
            </div>`).join('')}
        </details>`).join('')}
      ${menu.note ? `<p class="hint">${esc(menu.note)}</p>` : ''}`;

    if (admin) {
      $('#edit-prices').onclick = () => { editPrices = !editPrices; renderMenu(); };
      $('#menu').querySelectorAll('input.price').forEach((input) => {
        input.onchange = () => {
          const row = input.closest('.menu-item');
          const next = structuredClone(data.group.menu);
          next.categories[row.dataset.c].items[row.dataset.i].sizes[input.dataset.s].price = Number(input.value);
          updateGroup(id, { menu: next }, adminKey).catch(fail);
        };
      });
    }
    $('#menu').querySelectorAll('.add').forEach((btn) => {
      btn.onclick = () => {
        const row = btn.closest('.menu-item');
        openOrder(menu.categories[row.dataset.c].items[row.dataset.i]);
      };
    });
  }

  // ── 點單對話框 ─────────────────────────────────────────
  /** 用名稱在這團的菜單找品項 */
  const findItem = (name) => data.group.menu.categories.flatMap((c) => c.items).find((it) => it.name === name);

  /** 點單對話框；傳 existing 時是修改那筆點單 */
  function openOrder(item, existing = null) {
    const who = existing ? existing.participant : $('#who').value.trim();
    if (!who) { $('#who').focus(); return alert('先填你的名字喔'); }
    if (locked() && !admin) return alert('這團已經截止了');
    const menu = data.group.menu;
    const ice = item.noHot ? menu.ice.filter((x) => !/熱|溫/.test(x)) : menu.ice;
    const label = (o) => (typeof o === 'string' ? o : o.size);
    const radios = (name, options, current) => {
      const picked = Math.max(0, options.findIndex((o) => label(o) === current));
      return options.map((o, i) =>
        `<label class="chip"><input type="radio" name="${name}" value="${i}" ${i === picked ? 'checked' : ''} />${esc(typeof o === 'string' ? o : `${o.size} $${o.price}`)}</label>`).join('');
    };
    const hasTop = (t) => existing?.toppings.some((x) => x.name === t.name);
    const dlg = $('#dlg');
    dlg.innerHTML = `
      <form method="dialog" id="order-form">
        <h2>${esc(item.name)}${existing ? ` <span class="muted small">修改 ${esc(who)} 的點單</span>` : ''}</h2>
        <fieldset><legend>尺寸</legend>${radios('size', item.sizes, existing?.size)}</fieldset>
        ${item.fixedSugar ? '<p class="hint">這個品項甜度固定</p>' : `<fieldset><legend>甜度</legend>${radios('sugar', menu.sugar, existing?.sugar)}</fieldset>`}
        <fieldset><legend>冰塊</legend>${radios('ice', ice, existing?.ice)}</fieldset>
        ${menu.toppings.length ? `<fieldset><legend>加料</legend>${menu.toppings.map((t, i) =>
          `<label class="chip"><input type="checkbox" name="top" value="${i}" ${hasTop(t) ? 'checked' : ''} />${esc(t.name)} +$${t.price}</label>`).join('')}</fieldset>` : ''}
        <label>杯數 <input name="qty" type="number" min="1" max="20" value="${existing?.qty ?? 1}" /></label>
        <label>備註 <input name="note" maxlength="40" placeholder="例如：分開裝" value="${esc(existing?.note || '')}" /></label>
        <div class="row">
          <button value="cancel" class="ghost">取消</button>
          <button value="ok" class="primary">${existing ? '儲存' : '加入'}</button>
        </div>
      </form>`;
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue !== 'ok') return;
      const f = new FormData($('#order-form'));
      const size = item.sizes[Number(f.get('size'))];
      const line = {
        participant: who,
        item: item.name,
        size: size.size,
        sizePrice: size.price,
        sugar: item.fixedSugar ? '固定' : menu.sugar[Number(f.get('sugar'))],
        ice: ice[Number(f.get('ice'))],
        toppings: f.getAll('top').map((i) => menu.toppings[Number(i)]),
        qty: Math.max(1, Number(f.get('qty')) || 1),
        note: f.get('note').trim(),
      };
      (existing ? updateLine(id, existing.id, line, { adminKey, locked: locked() }) : addLine(id, line, { locked: locked() })).catch(fail);
    };
  }

  // ── 點單列表 ───────────────────────────────────────────
  function describe(l) {
    const tops = l.toppings.length ? `＋${l.toppings.map((t) => t.name).join('＋')}` : '';
    return `${esc(l.item)}（${esc(l.size)}）${esc(l.sugar)}／${esc(l.ice)}${esc(tops)}${l.qty > 1 ? ` ×${l.qty}` : ''}${l.note ? `｜${esc(l.note)}` : ''}`;
  }

  function renderLines() {
    if (!data.lines.length) {
      $('#lines').innerHTML = '<p class="muted">還沒有人點，當第一個吧！</p>';
      return;
    }
    $('#lines').innerHTML = data.lines.map((l) => {
      const canEdit = admin || (l.deviceId === me && !locked());
      return `<div class="line ${l.deviceId === me ? 'mine' : ''}">
        <b>${esc(l.participant)}</b> ${describe(l)} <span class="muted">$${lineTotal(l)}</span>
        <span class="actions">
          ${locked() ? '' : `<button class="follow small" data-id="${l.id}" title="點一杯一樣的">＋1 跟點</button>`}
          ${canEdit ? `<button class="edit small ghost" data-id="${l.id}">修改</button>
            <button class="del small ghost" data-id="${l.id}">刪除</button>` : ''}
        </span>
      </div>`;
    }).join('');
    const lineOf = (b) => data.lines.find((l) => l.id === b.dataset.id);
    $('#lines').querySelectorAll('.del').forEach((b) => {
      b.onclick = () => confirm('確定刪除這筆點單？') && deleteLine(id, b.dataset.id, { adminKey, locked: locked() }).catch(fail);
    });
    $('#lines').querySelectorAll('.edit').forEach((b) => {
      b.onclick = () => {
        const l = lineOf(b);
        const item = findItem(l.item);
        if (!item?.sizes.length) return alert('菜單上找不到這個品項，只能刪掉重點');
        openOrder(item, l);
      };
    });
    // 跟點：同樣的品項與客製選項，算我一杯（備註不跟）
    $('#lines').querySelectorAll('.follow').forEach((b) => {
      b.onclick = () => {
        const who = $('#who').value.trim();
        if (!who) { $('#who').focus(); return alert('先填你的名字喔'); }
        const { item, size, sizePrice, sugar, ice, toppings } = lineOf(b);
        addLine(id, { participant: who, item, size, sizePrice, sugar, ice, toppings, qty: 1, note: '' }, { locked: locked() })
          .catch(fail);
      };
    });
  }

  // ── 彙總單與收款 ───────────────────────────────────────
  function slipText(slip, result) {
    const rows = slip.map((r) => `${r.item} ${r.size} ${r.sugar}${r.ice}${r.toppings.length ? `＋${r.toppings.join('＋')}` : ''} ×${r.qty}${r.notes.length ? `（${r.notes.join('；')}）` : ''}`);
    return [`【${data.group.shopName}】共 ${result.totalCups} 杯`, ...rows].join('\n');
  }

  function renderSlip() {
    const g = data.group;
    const slip = shopSlip(data.lines);
    const result = bill(data.lines, g.adjustments, g.promotions || []);
    const paid = g.paid || {};
    $('#tab-slip').innerHTML = `
      <div class="card">
        <h2>給店家的彙總單 <button id="copy-slip" class="small">複製</button> <button id="clerk" class="small">店員模式</button></h2>
        ${slip.length ? `<table>${slip.map((r) => `<tr>
          <td>${esc(r.item)} ${esc(r.size)}<br><span class="muted">${esc(r.sugar)}／${esc(r.ice)}${r.toppings.length ? `＋${esc(r.toppings.join('＋'))}` : ''}</span>
          ${r.notes.length ? `<br><span class="note">${esc(r.notes.join('；'))}</span>` : ''}</td>
          <td class="num">×${r.qty}</td><td class="num">$${r.unitPrice * r.qty}</td></tr>`).join('')}</table>` : '<p class="muted">還沒有點單</p>'}
        <p class="total">共 ${result.totalCups} 杯，品項小計 $${result.itemsTotal}</p>
      </div>
      <div class="card">
        <h2>額外費用／折扣</h2>
        ${(g.adjustments || []).map((a, i) => `<div class="line">${esc(a.label)} ${a.amount > 0 ? '+' : ''}$${a.amount}
          <span class="muted">（${a.split === 'perCup' ? '依杯數' : '平均'}分攤）</span>
          ${admin ? `<button class="small ghost del-adj" data-i="${i}">刪除</button>` : ''}</div>`).join('') || '<p class="muted">沒有</p>'}
        ${admin ? `<form id="adj" class="row wrap">
          <input name="label" required placeholder="例如：外送費" maxlength="20" />
          <input name="amount" type="number" required placeholder="金額（折扣填負數）" />
          <select name="split"><option value="equal">平均分攤</option><option value="perCup">依杯數分攤</option></select>
          <button>新增</button></form>` : ''}
      </div>
      <div class="card">
        <h2>優惠</h2>
        ${(g.promotions || []).map((p, i) => `<div class="line">${esc(promotionLabel(p))}
          <span class="muted">折 $${promotionDiscount(data.lines, p)}，依消費金額分攤</span>
          ${admin ? `<button class="small ghost del-promo" data-i="${i}">刪除</button>` : ''}</div>`).join('') || '<p class="muted">沒有</p>'}
        ${admin ? `<form id="promo" class="row wrap">
          <select name="type"><option value="buyNgetM">買 N 送 M</option><option value="secondHalf">第二杯半價</option><option value="percent">打折</option></select>
          <input name="a" type="number" min="1" placeholder="N（或折扣 %）" />
          <input name="b" type="number" min="1" placeholder="M" />
          <button>新增</button></form>
          <p class="hint">買 N 送 M 會送最便宜的杯；第二杯半價由貴到便宜兩兩一組。店家規則不同時，請改用額外費用輸入。</p>` : ''}
      </div>
      ${payCard(result)}
      <div class="card">
        <h2>每人應付 <span class="muted small">總計 $${result.grandTotal}</span></h2>
        ${result.people.map((p) => {
          const r = reportFor(p.participant);
          return `<label class="line pay">
          ${admin ? `<input type="checkbox" data-p="${esc(p.participant)}" ${paid[p.participant] ? 'checked' : ''} />` : (paid[p.participant] ? '✅' : '⬜')}
          <b>${esc(p.participant)}</b> ${p.cups} 杯
          ${r && !paid[p.participant] ? `<span class="badge">已回報${r.ref ? `：${esc(r.ref)}` : ''}</span>` : ''}
          <span class="num">$${p.due}</span></label>`;
        }).join('')}
        ${admin ? '<p class="hint">團員回報付款後會標示「已回報」，確認收到再打勾。</p>' : ''}
        ${result.roundingDiff ? `<p class="hint">四捨五入後，團長${result.roundingDiff > 0 ? `會多收 $${result.roundingDiff}` : `要自己補 $${-result.roundingDiff}`}。</p>` : ''}
        ${admin ? '<button id="copy-remind">複製催款訊息</button>' : ''}
      </div>`;

    $('#copy-slip').onclick = (e) => copy(slipText(slip, result), e.target);
    $('#clerk').onclick = () => openClerk(slip, result);
    bindPay();
    if (!admin) return;
    $('#copy-remind').onclick = (e) => copy(reminderText(g, result, paid), e.target);
    $('#tab-slip').querySelectorAll('input[data-p]').forEach((cb) => {
      cb.onchange = () => updateGroup(id, { paid: { ...paid, [cb.dataset.p]: cb.checked } }, adminKey).catch(fail);
    });
    $('#tab-slip').querySelectorAll('.del-adj').forEach((b) => {
      b.onclick = () => updateGroup(id, { adjustments: g.adjustments.filter((_, i) => i !== Number(b.dataset.i)) }, adminKey).catch(fail);
    });
    $('#tab-slip').querySelectorAll('.del-promo').forEach((b) => {
      b.onclick = () => updateGroup(id, { promotions: g.promotions.filter((_, i) => i !== Number(b.dataset.i)) }, adminKey).catch(fail);
    });
    $('#promo').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const a = Number(f.get('a'));
      const b = Number(f.get('b'));
      const type = f.get('type');
      const promo = type === 'buyNgetM' ? { type, n: a, m: b } : type === 'percent' ? { type, off: a } : { type };
      if (type === 'buyNgetM' && !(a > 0 && b > 0)) return alert('請填 N 和 M');
      if (type === 'percent' && !(a > 0 && a < 100)) return alert('折扣 % 請填 1–99，例如打九折填 10');
      updateGroup(id, { promotions: [...(g.promotions || []), promo] }, adminKey).catch(fail);
    };
    $('#adj').onsubmit = (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const adj = { label: f.get('label').trim(), amount: Number(f.get('amount')), split: f.get('split') };
      updateGroup(id, { adjustments: [...(g.adjustments || []), adj] }, adminKey).catch(fail);
    };
  }

  /** 某位團員的付款回報（團長看得到全部，團員只看得到自己的） */
  function reportFor(participant) {
    return Object.values(data.reports || {}).find((r) => r.participant === participant);
  }

  function payCard(result) {
    const g = data.group;
    const mine = data.reports?.[me];
    const myNames = [...new Set(data.lines.filter((l) => l.deviceId === me).map((l) => l.participant))];
    const due = (name) => result.people.find((p) => p.participant === name)?.due ?? 0;
    const paid = g.paid || {};
    let report = '';
    if (mine) {
      report = paid[mine.participant] ? '<p>✅ 團長已確認收到</p>'
        : `<p>已回報 ${esc(mine.participant)} 付款${mine.ref ? `（${esc(mine.ref)}）` : ''}，等團長確認</p>
           <button id="report-undo" class="small ghost">撤回回報</button>`;
    } else if (myNames.length) {
      report = `<form id="report" class="row wrap">
        ${myNames.length > 1 ? `<select name="who">${myNames.map((n) => `<option>${esc(n)}</option>`).join('')}</select>`
          : `<input type="hidden" name="who" value="${esc(myNames[0])}" />`}
        <input name="ref" maxlength="30" placeholder="末五碼或付款方式（可不填）" />
        <button>我已付款${myNames.length > 1 ? '' : ` $${due(myNames[0])}`}</button>
      </form>`;
    }
    return `<div class="card">
      <h2>付款方式</h2>
      ${g.payInfo ? `<p class="pay-info">${esc(g.payInfo)}</p><button id="copy-payinfo" class="small">複製</button>`
        : `<p class="muted">${admin ? '填上收款方式，大家就知道要轉到哪裡。' : '團長還沒填收款方式。'}</p>`}
      ${admin ? `<details ${g.payInfo ? '' : 'open'}><summary class="small">${g.payInfo ? '修改' : '填寫'}收款方式</summary>
        <textarea id="payinfo-input" rows="2" maxlength="100" placeholder="例如：國泰 013 帳號 1234-5678-9012，或 LINE Pay 轉給我">${esc(g.payInfo || '')}</textarea>
        <button id="payinfo-save" class="small">儲存</button></details>` : ''}
      ${report}
    </div>`;
  }

  function bindPay() {
    const g = data.group;
    if ($('#copy-payinfo')) $('#copy-payinfo').onclick = (e) => copy(g.payInfo, e.target);
    if ($('#payinfo-save')) {
      $('#payinfo-save').onclick = () => updateGroup(id, { payInfo: $('#payinfo-input').value.trim() }, adminKey).catch(fail);
    }
    if ($('#report-undo')) $('#report-undo').onclick = () => setReport(id, null).catch(fail);
    if ($('#report')) {
      $('#report').onsubmit = (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        setReport(id, { participant: f.get('who'), ref: f.get('ref').trim() }).catch(fail);
      };
    }
  }

  // ── 店員模式：大字、可打勾，照著唸給店員或拿給店員看 ──
  function openClerk(slip, result) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<div class="clerk">
      <div class="row"><h2>${esc(data.group.shopName)}　共 ${result.totalCups} 杯</h2>
        <button id="clerk-close" class="ghost small">關閉</button></div>
      ${slip.map((r) => `<label class="clerk-row">
        <input type="checkbox" />
        <span class="clerk-qty">${r.qty}</span>
        <span><b>${esc(r.item)}</b> ${esc(r.size)}<br>${esc(r.sugar)}／${esc(r.ice)}${r.toppings.length ? `＋${esc(r.toppings.join('＋'))}` : ''}
        ${r.notes.length ? `<br><span class="note">${esc(r.notes.join('；'))}</span>` : ''}</span>
      </label>`).join('') || '<p class="muted">還沒有點單</p>'}
      <p class="hint">點完一項就打勾，避免漏點。</p></div>`;
    dlg.classList.add('full');
    dlg.onclose = () => dlg.classList.remove('full');
    dlg.showModal();
    $('#clerk-close').onclick = () => dlg.close();
  }

  // ── 即時更新 ───────────────────────────────────────────
  const unsubscribe = subscribe(id, onData, { admin });
  function onData(next) {
    if (!next) {
      app.innerHTML = '<div class="card"><h2>找不到這一團</h2><p>連結可能打錯了，或這團已經過期刪除。</p><a href="#/">自己開一團</a></div>';
      return;
    }
    data = next;
    recordVisit({ id, title: data.group.phase === 'poll' ? '投票中：今天喝哪家？' : data.group.shopName, organizer: data.group.organizer, adminKey });
    renderHead();
    const polling = data.group.phase === 'poll';
    $('#poll').hidden = !polling;
    app.querySelector('.tabs').hidden = polling;
    if (polling) {
      $('#tab-order').hidden = true;
      $('#tab-slip').hidden = true;
      renderPoll();
      return;
    }
    if (app.querySelector('.tabs .active').dataset.tab === 'order') $('#tab-order').hidden = false;
    const json = JSON.stringify(data.group.menu);
    if (json !== menuJson) { menuJson = json; renderMenu(); }
    renderUsual();
    renderRoster();
    renderLines();
    renderSlip();
    // 記住我在這家店點的內容，下次就能一鍵點老樣子
    rememberUsual(data.group.shopName, data.lines.filter((l) => l.deviceId === me));
  }

  // 截止時間到了要自動切成「已截止」，即使沒有人點單觸發更新
  const timer = setInterval(() => {
    if (!data) return;
    renderHead();
    if (data.group.phase === 'poll') renderPoll(); // 投票截止時切換成結果
  }, 30_000);
  return () => { unsubscribe(); clearInterval(timer); };
}
