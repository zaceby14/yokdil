// Birim testleri: node tests/merge.test.mjs
import assert from 'node:assert/strict';
import { mergeState, mergeCollection, pickRecord, sameState } from '../js/merge.js';

// Tarayıcı globalleri için küçük taklitler (srs/mistakes içe aktarımı için)
globalThis.addEventListener = () => {};
const mem = {};
globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };

let n = 0;
const t = (name, f) => { f(); n++; console.log('ok -', name); };

t('yeni olan kazanır', () => {
  assert.equal(pickRecord({ id: 'a', v: 1, updatedAt: 5 }, { id: 'a', v: 2, updatedAt: 9 }).v, 2);
  assert.equal(pickRecord({ id: 'a', v: 1, updatedAt: 9 }, { id: 'a', v: 2, updatedAt: 5 }).v, 1);
});

t('eşitlikte tombstone kazanır', () => {
  assert.equal(pickRecord({ id: 'a', v: 1, updatedAt: 5 }, { id: 'a', deleted: true, updatedAt: 5 }).deleted, true);
});

t('silme daha yeniyse kayıt silinir; daha eskiyse düzenleme kalır', () => {
  const a = { cards: { x: { id: 'x', word: 'yield', updatedAt: 10 } } };
  const b = { cards: { x: { id: 'x', deleted: true, updatedAt: 20 } } };
  assert.equal(mergeState(a, b).cards.x.deleted, true);
  const c = { cards: { x: { id: 'x', word: 'yield2', updatedAt: 30 } } };
  assert.equal(mergeState(b, c).cards.x.word, 'yield2');
});

t('birleşim: iki taraftaki farklı kayıtlar korunur, simetrik', () => {
  const a = { cards: { x: { id: 'x', updatedAt: 1 } }, texts: { t1: { id: 't1', updatedAt: 3 } } };
  const b = { cards: { y: { id: 'y', updatedAt: 2 } }, mocks: { m: { id: 'm', updatedAt: 4 } } };
  const ab = mergeState(a, b), ba = mergeState(b, a);
  assert.deepEqual(Object.keys(ab.cards).sort(), ['x', 'y']);
  assert.ok(ab.texts.t1 && ab.mocks.m);
  assert.ok(sameState(ab, ba));
  for (const c of ['grammarLog', 'mistakes', 'notes', 'days', 'settings']) assert.ok(ab[c]);
});

t('idempotent ve seed (ts=1) her zaman ilerlemeye yenilir', () => {
  const remote = { cards: { 's:hence': { id: 's:hence', state: 'review', interval: 3, updatedAt: 1700000000000 } } };
  const freshSeed = { cards: { 's:hence': { id: 's:hence', state: 'new', updatedAt: 1 } } };
  const m = mergeState(freshSeed, remote);
  assert.equal(m.cards['s:hence'].state, 'review');
  assert.ok(sameState(mergeState(m, m), m));
});

t('sameState farkı yakalar', () => {
  assert.ok(!sameState({ cards: { a: { id: 'a', updatedAt: 1 } } }, { cards: { a: { id: 'a', updatedAt: 2 } } }));
  assert.ok(!sameState({ cards: {} }, { cards: { a: { id: 'a', updatedAt: 2 } } }));
  assert.equal(mergeCollection(undefined, { a: { id: 'a' } }).a.id, 'a');
});

// SRS ve hata kutusu kuralları
const { schedule } = await import('../js/srs.js');
const { nextMistake } = await import('../js/mistakes.js');

t('SRS ilk aralıklar: 10 dk, 1 g, 3 g', () => {
  const now = Date.now();
  assert.equal(schedule({ state: 'new' }, 'again', now).due - now, 600000);
  assert.equal(schedule({ state: 'new' }, 'good', now).interval, 1);
  assert.equal(schedule({ state: 'new' }, 'easy', now).interval, 3);
  const r = schedule({ state: 'review', interval: 3, ease: 2.5 }, 'again', now);
  assert.equal(r.state, 'relearn'); assert.equal(r.lapses, 1); assert.equal(r.ease, 2.3);
  assert.equal(schedule({ state: 'review', interval: 1, ease: 2.5 }, 'good', now).interval, 3);
});

t('Hata kutusu: yanlış → 1 g; 2 ardışık doğru → çözüldü', () => {
  let m = nextMistake(null, false, '2026-11-16');
  assert.equal(m.due, '2026-11-17'); assert.equal(m.streak, 0);
  assert.equal(nextMistake(null, true), null);
  m = nextMistake(m, true, '2026-11-17');
  assert.equal(m.due, '2026-11-20'); assert.equal(m.streak, 1);
  const w = nextMistake(m, false, '2026-11-20');
  assert.equal(w.streak, 0); assert.equal(w.due, '2026-11-21');
  const c = nextMistake(nextMistake(w, true, '2026-11-21'), true, '2026-11-28');
  assert.equal(c.solved, true);
  const c1 = nextMistake(w, true, '2026-11-21'); assert.equal(c1.due, '2026-11-28'); // 7 gün
});

console.log(`\n${n} test geçti`);
