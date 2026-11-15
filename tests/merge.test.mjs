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


// --- v3: mezuniyet, biliyorum, otomatik kart, boşluk oyunu, okuma önerisi
const V = await import('../js/vocab.js');
const A = await import('../js/autocard.js');
const G = await import('../js/views/gap.js');
const R = await import('../js/views/reading.js');

t('Mezuniyet: aralık ≥ 45 g ve son 3 tekrarda "Tekrar" yok', () => {
  assert.equal(V.isGraduated({ state: 'review', interval: 45, hist: ['g', 'g', 'e'] }), true);
  assert.equal(V.isGraduated({ state: 'review', interval: 44, hist: ['g', 'g', 'g'] }), false);
  assert.equal(V.isGraduated({ state: 'review', interval: 60, hist: ['a', 'g', 'g', 'g'] }), true);
  assert.equal(V.isGraduated({ state: 'review', interval: 60, hist: ['g', 'a', 'g'] }), false);
  assert.equal(V.isGraduated({ state: 'review', interval: 60, hist: ['g', 'g'] }), false);
  assert.equal(V.isGraduated({ state: 'relearn', interval: 60, hist: ['g', 'g', 'g'] }), false);
  assert.equal(V.isGraduated({ state: 'review', interval: 50 }), true); // eski kayıt (hist yok)
  assert.equal(V.level({ state: 'known' }), 'known');
  assert.equal(V.level({ state: 'review', interval: 25, hist: ['g', 'g', 'g'] }), 'mature');
  assert.equal(V.level({ state: 'review', interval: 50, hist: ['g', 'g', 'g'] }), 'grad');
});

t('Mezuniyet: Tekrar ile geri döner; schedule hist tutar', () => {
  const now = Date.now();
  let c = { state: 'review', interval: 50, ease: 2.5, hist: ['g', 'g', 'g'] };
  assert.ok(V.isGraduated(c));
  c = { ...c, ...schedule(c, 'again', now) };
  assert.equal(c.state, 'relearn'); assert.deepEqual(c.hist.slice(-1), ['a']);
  assert.equal(V.isGraduated(c), false);
  assert.equal(schedule({ state: 'new', hist: ['a', 'a', 'a', 'a', 'a'] }, 'good', now).hist.length, 5);
});

t('Haftalık kontrol: en fazla 5, bu hafta tekrar edilen hariç, haftaya göre sabit', () => {
  const wk = '2026-11-16';
  const ws = new Date(2026, 10, 16).getTime();
  const cards = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, state: 'review', interval: 60, hist: ['g', 'g', 'g'], lastReview: ws - 1000 }));
  cards.push({ id: 'done', state: 'review', interval: 60, hist: ['g', 'g', 'g'], lastReview: ws + 1000 });
  cards.push({ id: 'young', state: 'review', interval: 10, hist: ['g', 'g', 'g'], lastReview: 0 });
  const p = V.pickChecks(cards, wk);
  assert.equal(p.length, 5);
  assert.ok(!p.includes('done') && !p.includes('young'));
  assert.deepEqual(V.pickChecks(cards, wk), p);
  assert.equal(V.weekStart('2026-11-19'), '2026-11-16');
  assert.equal(V.weekStart('2026-11-22'), '2026-11-16');
});

t('Sayaç: bildiğin = known + öğrenildi + olgun', () => {
  const c = V.counts([{ state: 'known' }, { state: 'known' }, { state: 'review', interval: 50, hist: ['g', 'g', 'g'] },
    { state: 'review', interval: 30 }, { state: 'learning' }, { state: 'new' }, {}]);
  assert.equal(c.knowTotal, 4); assert.equal(c.new, 2); assert.equal(c.learning, 1);
});

t('Otomatik kart: aday şık, kelime ağırlıklı soru, bağlam', () => {
  assert.equal(A.candidate('efficacy'), 'efficacy');
  assert.equal(A.candidate('the'), null);
  assert.equal(A.candidate('has been developed'), null);
  assert.equal(A.candidate('in terms of', x => x === 'in terms of'), 'in terms of');
  assert.equal(A.candidate('a long sentence with many words'), null);
  assert.ok(A.wordy({ options: ['efficacy', 'scarcity', 'ambiguity', 'uniformity', 'hostility'], info: { topic: 'kelime' } }));
  assert.ok(!A.wordy({ options: ['The study was long and hard to read.', 'b c d e', 'x', 'y', 'z'], info: { dtype: 'cumle-tamamlama' } }));
  assert.equal(A.fillContext({ q: 'Trials test the ---- of a drug.', options: ['a', 'efficacy'], answer: 1 }), 'Trials test the efficacy of a drug.');
  assert.equal(A.fillContext({ q: '(2)', stem: 'Steel is strong (1) light. It is protected (2) rust. End.', options: ['from'], answer: 0 }), 'It is protected from rust.');
});

t('Boşluk oyunu: tam kelime boşaltılır', () => {
  assert.equal(G.blankOut('The efficacy of the drug was low.', 'efficacy'), 'The ---- of the drug was low.');
  assert.equal(G.blankOut('Efficacy matters.', 'efficacy'), '---- matters.');
  assert.equal(G.blankOut('The efficacious drug.', 'efficacy'), null);
});

t('Okuma önerisi: hız + doğruluğa göre seviye', () => {
  assert.equal(R.suggestLevel([]).level, 1);
  assert.equal(R.suggestLevel([{ at: 1, level: 1, wpm: 130, right: 3, total: 3 }]).level, 2);
  assert.equal(R.suggestLevel([{ at: 1, level: 2, wpm: 80, right: 1, total: 3 }]).level, 1);
  assert.equal(R.suggestLevel([{ at: 1, level: 3, wpm: 200, right: 3, total: 3 }]).level, 3);
  assert.equal(R.suggestLevel([{ at: 1, level: 2, wpm: 90, right: 2, total: 3 }]).level, 2);
});

t('Birleştirme: known durumu ve yeni alanlar updatedAt ile korunur', () => {
  const a = { cards: { x: { id: 'x', state: 'known', knownAt: 5, updatedAt: 10 } } };
  const b = { cards: { x: { id: 'x', state: 'new', front: 3, updatedAt: 8 } }, progress: { 'gradcheck:2026-11-16': { id: 'gradcheck:2026-11-16', ids: ['x'], updatedAt: 2 } } };
  const m = mergeState(a, b);
  assert.equal(m.cards.x.state, 'known'); assert.ok(m.progress['gradcheck:2026-11-16']);
});

console.log(`\n${n} test geçti`);
