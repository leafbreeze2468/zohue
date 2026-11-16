import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shopSlip, bill, isLocked, reminderText, linePrice, missingMembers, mergeRoster, promotionDiscount, promotionLabel, pollResult, pollClosed } from './domain.js';

const pearl = { name: '珍珠', price: 10 };
const coconut = { name: '椰果', price: 10 };
const line = (participant, item, extra = {}) => ({
  participant, item, size: 'L', sizePrice: 50, sugar: '半糖', ice: '少冰', toppings: [], qty: 1, ...extra,
});

test('單價含加料', () => {
  assert.equal(linePrice(line('A', '紅茶', { toppings: [pearl, coconut] })), 70);
});

test('彙總單：相同品項與客製選項合併，加料順序不影響', () => {
  const slip = shopSlip([
    line('A', '紅茶', { toppings: [pearl, coconut] }),
    line('B', '紅茶', { toppings: [coconut, pearl] }),
    line('C', '紅茶', { sugar: '無糖' }),
  ]);
  assert.equal(slip.length, 2);
  const merged = slip.find((r) => r.sugar === '半糖');
  assert.equal(merged.qty, 2);
  assert.equal(merged.unitPrice, 70);
});

test('彙總單：備註保留並標示是誰的', () => {
  const slip = shopSlip([line('A', '紅茶', { note: '分開裝' }), line('B', '紅茶')]);
  assert.deepEqual(slip[0].notes, ['A：分開裝']);
});

test('每人應付：無額外費用', () => {
  const r = bill([line('A', '紅茶'), line('A', '綠茶'), line('B', '紅茶', { qty: 2 })]);
  assert.deepEqual(r.people.map((p) => [p.participant, p.due]), [['A', 100], ['B', 100]]);
  assert.equal(r.grandTotal, 200);
  assert.equal(r.roundingDiff, 0);
});

test('外送費依杯數分攤', () => {
  const r = bill([line('A', '紅茶'), line('B', '紅茶', { qty: 2 })], [{ label: '外送費', amount: 60, split: 'perCup' }]);
  assert.deepEqual(r.people.map((p) => p.due), [70, 140]);
  assert.equal(r.grandTotal, 210);
});

test('折扣平均分攤，零頭回報給團長', () => {
  const r = bill(
    [line('A', '紅茶'), line('B', '紅茶'), line('C', '紅茶')],
    [{ label: '滿額折', amount: -10, split: 'equal' }],
  );
  // 每人 50 - 3.33 = 46.67 → 47，共收 141，實際 140，多收 1
  assert.deepEqual(r.people.map((p) => p.due), [47, 47, 47]);
  assert.equal(r.roundingDiff, 1);
});

test('鎖單：截止後鎖住，團長可手動解鎖或提前鎖', () => {
  const deadline = 1000;
  assert.equal(isLocked({ deadline }, 999), false);
  assert.equal(isLocked({ deadline }, 1000), true);
  assert.equal(isLocked({ deadline, manualLock: 'unlocked' }, 2000), false);
  assert.equal(isLocked({ deadline, manualLock: 'locked' }, 0), true);
  assert.equal(isLocked({ deadline: null }, 2000), false);
});

test('催款文字只列未付款的人', () => {
  const r = bill([line('A', '紅茶'), line('B', '紅茶')]);
  const text = reminderText({ shopName: '50嵐' }, r, { A: true });
  assert.match(text, /B \$50/);
  assert.doesNotMatch(text, /A \$/);
});

test('誰還沒點：比對成員名單，忽略前後空白', () => {
  assert.deepEqual(missingMembers(['A', ' B ', 'C', ''], [line('A', '紅茶'), line('B ', '紅茶')]), ['C']);
});

const priced = (p, qty = 1) => line('X', `飲料${p}`, { sizePrice: p, qty });

test('買五送一：每 6 杯送最便宜的 1 杯', () => {
  const lines = [priced(60, 3), priced(50, 2), priced(40)];
  assert.equal(promotionDiscount(lines, { type: 'buyNgetM', n: 5, m: 1 }), 40);
  assert.equal(promotionDiscount(lines.slice(0, 2), { type: 'buyNgetM', n: 5, m: 1 }), 0); // 只有 5 杯
});

test('第二杯半價：兩兩一組，較便宜的半價', () => {
  assert.equal(promotionDiscount([priced(60), priced(50), priced(41)], { type: 'secondHalf' }), 25);
});

test('打折與標籤', () => {
  assert.equal(promotionDiscount([priced(50, 2)], { type: 'percent', off: 10 }), 10);
  assert.equal(promotionLabel({ type: 'percent', off: 10 }), '9折');
  assert.equal(promotionLabel({ type: 'percent', off: 15 }), '8.5折');
});

test('優惠依消費金額比例分攤', () => {
  const r = bill([line('A', '紅茶', { sizePrice: 60 }), line('B', '紅茶', { sizePrice: 40, qty: 4 })], [],
    [{ type: 'buyNgetM', n: 4, m: 1 }]);
  // 5 杯送最便宜的 40，A 消費 60、B 消費 160，折扣 40 依 60:160 分攤
  assert.deepEqual(r.people.map((p) => p.due), [49, 131]);
  assert.equal(r.grandTotal, 180);
});

test('店家投票：計票、平手時前面的勝出、截止判斷', () => {
  const group = { candidates: [{ key: 'a', shop: 'A' }, { key: 'b', shop: 'B' }], votes: { d1: 'b', d2: 'a' }, pollDeadline: 100 };
  const r = pollResult(group);
  assert.deepEqual(r.counts.map((c) => c.votes), [1, 1]);
  assert.equal(r.winner.key, 'a');
  assert.equal(pollResult({ ...group, votes: { d1: 'b' } }).winner.key, 'b');
  assert.equal(pollClosed(group, 99), false);
  assert.equal(pollClosed(group, 100), true);
});

test('點過單的人自動加入成員名單，刪掉過的不加回', () => {
  const lines = [{ participant: '小明' }, { participant: ' 阿華 ' }, { participant: '阿華' }, { participant: '路人' }];
  const roster = ['小明', '小美'];
  assert.deepEqual(mergeRoster(roster, lines, ['路人']), ['小明', '小美', '阿華']);
  assert.equal(mergeRoster(roster, [{ participant: '小美' }]), roster); // 沒新人回傳原陣列
});
