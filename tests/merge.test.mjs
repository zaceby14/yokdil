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
  assert.equal(r.state, 'relearn'); assert.equal(r.lapses, 1); assert.equal(r.ease, 2.3); assert.equal(r.ladder, 0);
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

// --- v4: merdiven, Zor, hafıza egzersizleri, notlar, odak, içerik güncelleme, oturum koleksiyonu
const S = await import('../js/srs.js');
const DAYMS = 86400000;
const dayOff = (c, now) => Math.round((new Date(c.due).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAYMS);

t('Merdiven: Tekrar → 10 dk, sonra 1-3-7-14 gün, sonra normal büyüme', () => {
  const now = new Date(2026, 10, 16, 20, 0).getTime();
  for (const start of [{ state: 'new' }, { state: 'learning' }, { state: 'review', interval: 30, ease: 2.5 }]) {
    let c = { ...start, ...schedule(start, 'again', now) };
    assert.equal(c.ladder, 0); assert.equal(c.due - now, 600000);
    const seen = [];
    for (let k = 0; k < 4; k++) { c = { ...c, ...schedule(c, 'good', now) }; seen.push(c.interval); assert.equal(dayOff(c, now), c.interval); }
    assert.deepEqual(seen, [1, 3, 7, 14]);
    assert.equal(c.ladder, null);
    c = { ...c, ...schedule(c, 'good', now) };
    assert.ok(c.interval > 14 && c.ladder == null, 'merdiven sonrası ease büyümesi');
  }
});

t('Merdiven: Kolay basamak atlamaz; merdivende Tekrar başa döner; Zor aynı basamak', () => {
  const now = Date.now();
  let c = { state: 'review', interval: 20, ease: 2.5, ...schedule({ state: 'review', interval: 20, ease: 2.5 }, 'again', now) };
  c = { ...c, ...schedule(c, 'easy', now) }; assert.equal(c.interval, 1); assert.equal(c.ladder, 1);
  c = { ...c, ...schedule(c, 'good', now) }; assert.equal(c.interval, 3);
  c = { ...c, ...schedule(c, 'hard', now) }; assert.equal(c.interval, 3); assert.equal(c.ladder, 2);
  c = { ...c, ...schedule(c, 'again', now) }; assert.equal(c.ladder, 0); assert.equal(c.state, 'relearn');
  c = { ...c, ...schedule(c, 'good', now) }; assert.equal(c.interval, 1);
  // Eski "relearn" kaydı (ladder yok): yarıya indirme yok, merdiven başı
  const old = schedule({ state: 'relearn', interval: 40, ease: 2.3 }, 'good', now);
  assert.equal(old.interval, 1); assert.equal(old.ladder, 1);
  assert.ok(S.inLadder({ ladder: 2 }) && S.inLadder({ state: 'relearn' }) && !S.inLadder({ state: 'review' }));
});

t('Zor (yeni/öğrenme): ertesi gün, 10 dk değil', () => {
  const now = new Date(2026, 10, 16, 9, 0).getTime();
  for (const st of ['new', 'learning']) {
    const c = schedule({ state: st }, 'hard', now);
    assert.equal(c.interval, 1); assert.equal(dayOff(c, now), 1); assert.equal(c.ladder, null);
  }
});

const M = await import('../js/memory.js');
t('Yazarak hatırla: küçük yazım toleransı', () => {
  assert.ok(M.typoOk('Efficacy', 'efficacy'));
  assert.ok(M.typoOk(' eficacy ', 'efficacy'));
  assert.ok(M.typoOk('consequnces', 'consequences'));
  assert.ok(!M.typoOk('effect', 'efficacy'));
  assert.ok(!M.typoOk('fan', 'fat'));
  assert.ok(!M.typoOk('', 'x'));
  assert.ok(M.typoOk('in terms of', 'in  terms of'));
});

t('Eş anlam ve kelime ailesi soruları', () => {
  const card = { id: 'c1', word: 'utilize', syn: ['make use of', 'employ'], tr: 'kullanmak' };
  const others = [{ word: 'reduce', syn: ['decrease'] }, { word: 'obtain', syn: ['acquire'] }, { word: 'assess', syn: ['evaluate'] }, { word: 'enhance', syn: ['improve'] }, { word: 'hinder', syn: ['impede'] }];
  const it = M.synItem(card, others);
  assert.equal(it.options.length, 5); assert.ok(['make use of', 'employ'].includes(it.options[it.answer]));
  assert.ok(!it.options.some((o, i) => i !== it.answer && card.syn.includes(o)));
  assert.equal(M.synItem({ id: 'x', word: 'a', syn: [] }, others), null);
  const fm = { analyse: { family: [{ w: 'analysis', pos: 'n' }, { w: 'analytical', pos: 'adj' }, { w: 'analytically', pos: 'adv' }], ex: [{ en: 'A detailed analysis of the samples was done.', tr: '' }] } };
  const f = M.familyItem({ id: 'c2', word: 'analyse', pos: 'v' }, fm);
  assert.equal(f.q, 'A detailed ---- of the samples was done.'); assert.equal(f.options[f.answer], 'analysis'); assert.equal(f.options.length, 4);
  assert.equal(M.familyItem({ id: 'c3', word: 'none' }, fm), null);
  assert.equal(M.blank('Rates lead to change.', 'lead'), 'Rates ---- to change.');
});

const N = await import('../js/notes.js');
t('Notlar: "kelime - anlam" satırları ve kelime adayları', () => {
  assert.deepEqual(N.parseLines('efficacy - etkinlik\nscarcity: kıtlık\nin terms of = açısından'),
    [{ word: 'efficacy', tr: 'etkinlik' }, { word: 'scarcity', tr: 'kıtlık' }, { word: 'in terms of', tr: 'açısından' }]);
  assert.equal(N.parseLines('which vs that farkını tekrar et\nefficacy - etkinlik'), null);
  assert.equal(N.parseLines(''), null);
  assert.deepEqual(N.noteWords('The efficacy of the method; efficacy again, ve hydrolysis'), ['efficacy', 'method', 'again', 'hydrolysis']);
});

const F = await import('../js/focus.js');
t('Odak: çalışma dakikaları ve mola geçişi', () => {
  const L = { work: 25, brk: 5 }, t0 = 1_000_000_000_000, MIN = 60000;
  let { s, credit } = F.advance({ phase: 'work', startedAt: t0, endsAt: t0 + 25 * MIN, credited: 0 }, t0 + 10.5 * MIN, L);
  assert.equal(credit, 10); assert.equal(s.phase, 'work');
  ({ s, credit } = F.advance(s, t0 + 26 * MIN, L));
  assert.equal(credit, 15); assert.equal(s.phase, 'break'); assert.equal(s.endsAt, t0 + 30 * MIN);
  ({ s, credit } = F.advance(s, t0 + 31 * MIN, L)); assert.equal(s.phase, 'idle'); assert.equal(credit, 0);
  // Uygulama kapalıyken bitmiş blok: tamamı yazılır, mola geçmişse boşta
  ({ s, credit } = F.advance({ phase: 'work', startedAt: t0, endsAt: t0 + 25 * MIN, credited: 3 }, t0 + 5 * 3600000, L));
  assert.equal(credit, 22); assert.equal(s.phase, 'idle');
});

const C = await import('../js/contentrev.js');
t('İçerik güncelleme: düzenlenmemiş seed/çekirdek kartlar tazelenir, SRS alanlarına dokunulmaz', () => {
  const srs = { state: 'review', due: 123, interval: 9, ease: 2.1, hist: ['g'], ladder: 2, reps: 4 };
  const cards = [
    { id: 's:utilize', word: 'utilize', tr: 'eski', syn: ['x'], note: '', ...srs },
    { id: 's:hence', word: 'hence', tr: 'benim anlamım', syn: [], userEdited: true, ...srs },
    { id: 'w:w1', wid: 'w1', word: 'efficacy', tr: 'eski', syn: [], coll: '', ex: '', pos: 'n', tags: [], ...srs },
    { id: 'w:w2', wid: 'w2', word: 'yield', tr: 'verim', syn: ['output'], coll: '', ex: 'e', pos: 'n', tags: ['fen'], ...srs },
    { id: 'c9', word: 'random', tr: 'r', ...srs }
  ];
  const seed = [{ word: 'utilize', tr: 'kullanmak', syn: ['make use of'] }, { word: 'hence', tr: 'bu nedenle', syn: [] }];
  const core = [{ id: 'w1', word: 'efficacy', tr: 'etkinlik', syn: ['effectiveness'], coll: 'the efficacy of', ex: 'ex', pos: 'n', tags: ['fen'] },
    { id: 'w2', word: 'yield', tr: 'verim', syn: ['output'], coll: '', ex: 'e', pos: 'n', tags: ['fen'] }];
  const p = C.plan(cards, seed, core);
  assert.deepEqual(p.map(x => x.id), ['s:utilize', 'w:w1']);
  assert.deepEqual(p[0].fields, { tr: 'kullanmak', syn: ['make use of'] });
  assert.equal(p[1].fields.tr, 'etkinlik'); assert.equal(p[1].fields.coll, 'the efficacy of');
  for (const x of p) for (const k of Object.keys(srs)) assert.ok(!(k in x.fields));
  assert.equal(C.seedId({ word: 'In terms of' }), 's:in-terms-of');
  assert.deepEqual(C.plan(cards.map(c => ({ ...c, ...(p.find(x => x.id === c.id)?.fields || {}) })), seed, core), []); // idempotent
});

t('Birleştirme: sessions ve hızlı notlar koleksiyonu', () => {
  const a = { sessions: { 'gunluk:2026-11-16': { id: 'gunluk:2026-11-16', i: 3, picks: { 0: 1 }, updatedAt: 5 } }, notes: { q1: { id: 'q1', kind: 'quick', text: 'a', updatedAt: 3 } } };
  const b = { sessions: { 'gunluk:2026-11-16': { id: 'gunluk:2026-11-16', deleted: true, updatedAt: 9 } }, notes: { q1: { id: 'q1', kind: 'quick', text: 'b', done: true, updatedAt: 4 } } };
  const m = mergeState(a, b);
  assert.equal(m.sessions['gunluk:2026-11-16'].deleted, true); assert.equal(m.notes.q1.text, 'b');
  assert.ok(mergeState({}, {}).sessions);
});

// ===== v6 =====
const MG = await import('../js/migrations.js');
const ST = await import('../js/store.js');
const AC = await import('../js/autocard.js');
const PL = await import('../js/plan.js');
const GP = await import('../js/gplan.js');
const SR = await import('../js/srs.js');
const MI = await import('../js/mistakes.js');
const NT = await import('../js/notes.js');
const U = await import('../js/util.js');
const idx = new Map([['eat', { word: 'eat', pos: 'v', tr: 'yemek' }], ['because', { word: 'because', pos: 'conj', tr: 'çünkü' }],
  ['so that', { word: 'so that', pos: 'conj', tr: 'böylece' }], ['amid', { word: 'amid', pos: 'prep', tr: 'ortasında' }], ['yield', { word: 'yield', pos: 'n', tr: 'verim' }]]);

t('İşlev kelimesi: bağlaç/edat (liste + pos conj/prep) kart olmaz', () => {
  for (const w of ['because', 'so that', 'in that', 'while', 'although', 'amid', 'despite']) assert.ok(V.isFunctionWord(w, idx), w);
  for (const w of ['yield', 'corrosion', 'eat']) assert.ok(!V.isFunctionWord(w, idx), w);
  assert.ok(V.sameLemma('eat', 'eating') && V.sameLemma('studies', 'study') && !V.sameLemma('eat', 'yield'));
});

t('Otomatik kart: gramer biçim sorusu (eat/eating/eaten) ve bağlaç şıkları kart açmaz', () => {
  assert.equal(AC.wordy({ info: { kind: 'gramer', topic: 'gerund-infinitive' }, options: ['eat', 'eating', 'to eat', 'eaten', 'ate'] }, idx), false);
  assert.equal(AC.wordy({ info: { kind: 'gramer', topic: 'baglac-zitlik' }, options: ['because', 'although', 'so that', 'in that', 'while'] }, idx), false);
  assert.equal(AC.wordy({ info: { kind: 'gramer', topic: 'kelime' }, options: ['yield', 'decay', 'shift', 'trait', 'bias'] }, idx), true);
  assert.equal(AC.wordy({ double: true, info: { topic: 'zaman-uyumu' }, options: ['a / b'] }, idx), false);
  assert.equal(AC.fillContext({ q: 'Since it ---- in 2021, it ---- by half.', options: ['was / has fallen', 'x / y'], answer: 0 }), 'Since it was in 2021, it has fallen by half.');
});

t('Göç: Hata kaynaklı, tekrar edilmemiş anlamsız/işlev/çekimli kartlar silinir; SRS geçmişi olana dokunulmaz', () => {
  const cards = [
    { id: 'a', word: 'because', tr: 'çünkü', source: 'Hata', state: 'new' },
    { id: 'b', word: 'eating', tr: '', source: 'Hata', state: 'new' },
    { id: 'c', word: 'eat', tr: 'yemek', source: 'Hata', state: 'new' },
    { id: 'd', word: 'so that', tr: 'böylece', source: 'Hata', state: 'review', reps: 2, lastReview: 5 },
    { id: 'e', word: 'yield', tr: 'verim', source: 'Hata', state: 'new' },
    { id: 'f', word: 'while', tr: 'iken', source: 'Okuma', state: 'new' },
    { id: 'g', word: 'eats', tr: 'yer', source: 'Hata', state: 'new' }
  ];
  assert.deepEqual(MG.badAutoCards(cards, idx).sort(), ['a', 'b', 'g']);
  // store.migrate: bir kez çalışır
  ST.load(); ST.resetAll();
  for (const c of cards) ST.put('cards', c);
  assert.deepEqual(ST.migrate(MG.MIGRATIONS, { idx }), ['v6-taktik-read', 'v6-autocards']);
  assert.deepEqual(ST.all('cards').map(c => c.id).sort(), ['c', 'd', 'e', 'f']);
  assert.ok(ST.raw('cards', 'a').deleted);
  ST.put('cards', { id: 'h', word: 'because', tr: 'x', source: 'Hata', state: 'new' });
  assert.deepEqual(ST.migrate(MG.MIGRATIONS, { idx }), []); // tekrar çalışmaz
  assert.ok(ST.get('cards', 'h'));
});

t('Göç: soru-tipi-taktikleri okundu → 7 taktik dersi okundu', () => {
  const r = MG.taktikProgress({ read: true, at: 7 }, { 'taktik-ceviri': { read: true } });
  assert.equal(r.length, 6); assert.ok(r.every(x => x.read && x.id.startsWith('ders:taktik-')));
  assert.deepEqual(MG.taktikProgress(null), []);
});

t('Yeni kuyruk: kendi eklediğin kelimeler önde, dünden kalanlar limiti aşar (en geç ertesi gün)', () => {
  const sod = 1000000;
  const cards = [
    ...Array.from({ length: 20 }, (_, i) => ({ id: 's:n' + i, word: 'note' + i, source: 'Notlarım', state: 'new', createdAt: i + 1 })),
    { id: 'h1', word: 'trait', source: 'Hata', tags: ['hata'], state: 'new', createdAt: 10, front: 50 },
    { id: 'm1', word: 'underneath', source: 'Okuma', state: 'new', createdAt: sod - 100, mine: sod - 100 },
    { id: 'm2', word: 'corrosion', source: 'Ikigai', state: 'new', createdAt: sod - 50 },
    { id: 'm3', word: 'today', source: 'Okuma', state: 'new', createdAt: sod + 5, mine: sod + 5 }
  ];
  const q = SR.orderNew(cards, 3, sod).map(c => c.id);
  assert.deepEqual(q.slice(0, 3), ['m1', 'm2', 'm3']);
  assert.equal(q[3], undefined);
  const q0 = SR.orderNew(cards, 0, sod).map(c => c.id); // limit dolu: dünden kalanlar yine gelir
  assert.deepEqual(q0, ['m1', 'm2']);
  assert.ok(SR.isMine({ source: 'Okuma' }) && !SR.isMine({ source: 'Hata', tags: ['hata'] }) && !SR.isMine({ id: 's:x', source: 'Notlarım' }));
});

t('Seri: deneme/odak/görev günü sayar; haftada 1 joker; bugün çalışılmadıysa bozulmaz', () => {
  const D = { '2026-11-23': { id: '2026-11-23', tasks: { kart: true } }, '2026-11-24': { id: '2026-11-24', focusMin: 12 },
    '2026-11-25': { id: '2026-11-25', tasks: { gramer: true } }, /* 26 atlandı */ '2026-11-27': { id: '2026-11-27', tasks: { okuma: true } } };
  const mocks = new Set(['2026-11-28']); // tam deneme günü
  let r = PL.streakCalc(k => D[k], '2026-11-28', mocks);
  assert.equal(r.n, 5); assert.equal(r.frozen.length, 1);
  r = PL.streakCalc(k => D[k], '2026-11-29', mocks); // bugün (Pazar) henüz yok
  assert.equal(r.n, 5);
  // aynı haftada ikinci boşluk: seri orada kırılır
  const D2 = { ...D }; delete D2['2026-11-24'];
  assert.equal(PL.streakCalc(k => D2[k], '2026-11-28', mocks).n, 3);
  assert.ok(!PL.activeDay({ id: 'x', focusMin: 5 }) && PL.activeDay({ id: 'x', mock: true }));
});

t('Hata tekrarı: günde en fazla 8, en eski vade + en çok yanlış önce, tüm kaynaklar', () => {
  const ms = Array.from({ length: 30 }, (_, i) => ({ id: 'q' + i, due: '2026-11-' + String(10 + (i % 10)).padStart(2, '0'), wrongs: i % 3, kind: ['gramer', 'drill', 'okuma', 'cikmis'][i % 4] }));
  ms.push({ id: 'solved', due: '2026-11-01', solved: true }, { id: 'future', due: '2026-12-30' });
  const ids = MI.pickMistakes(ms, '2026-11-25');
  assert.equal(ids.length, 8);
  assert.ok(!ids.includes('solved') && !ids.includes('future'));
  assert.equal(ms.find(m => m.id === ids[0]).due, '2026-11-10');
  assert.ok(new Set(ids.map(id => ms.find(m => m.id === id).kind)).size >= 2);
});

t('Gramer seviyesi: ilk görüşte L1, %70 doğruluk → L2 → L3; ipucuyla doğru sayılmaz', () => {
  const L = (lv, ok, hint) => ({ topic: 'relative', level: lv, correct: ok, hint });
  assert.deepEqual(GP.topicLevels([]), {});
  assert.equal(GP.topicLevels([L(1, 1), L(1, 1), L(1, 0)]).relative, 1); // %67
  assert.equal(GP.topicLevels([L(1, 1), L(1, 1), L(1, 1)]).relative, 2);
  assert.equal(GP.topicLevels([L(1, 1), L(1, 1), L(1, 1, true)]).relative, 1);
  assert.equal(GP.topicLevels([L(1, 1), L(1, 1), L(1, 1), L(2, 1), L(2, 1), L(2, 1), L(2, 0)]).relative, 3);
});

t('Günlük set: seviye kilidi, düşük getirili konulardan en fazla 1', () => {
  const qs = [];
  for (const t of ['baglac-zitlik', 'relative']) for (const lv of [1, 2, 3]) for (let i = 0; i < 4; i++) qs.push({ id: `${t}-${lv}-${i}`, topic: t, level: lv });
  for (const t of U.LOW_TOPICS) for (let i = 0; i < 5; i++) qs.push({ id: `${t}-${i}`, topic: t, level: 1 });
  let r = 1; const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let k = 0; k < 20; k++) {
    const ids = GP.pickDaily(qs, { cur: new Set(['baglac-zitlik']), n: 8, rnd, levels: {} });
    assert.equal(ids.length, 8);
    assert.ok(ids.filter(id => U.LOW_TOPICS.some(t => id.startsWith(t))).length <= 1);
    assert.ok(ids.every(id => /-1-\d$|^[a-z-]+-\d$/.test(id) && !/-[23]-\d$/.test(id)), ids.join());
  }
  const ids = GP.pickDaily(qs, { cur: new Set(['inversion']), n: 8, rnd, levels: {} }); // bu haftanın konusu ise sınır yok
  assert.ok(ids.filter(id => id.startsWith('inversion')).length >= 2);
  assert.deepEqual(GP.levelOrder([{ level: 3 }, { level: 1 }, { level: 2 }]).map(q => q.level), [1, 2, 3]);
});

t('Not → karta çevir: Türkçe kelimeler bölünmez', () => {
  const w = NT.noteWords('cümle Karıştırıyorum: whereas ile while farkı, hydrolysis yavaş');
  assert.deepEqual(w, ['whereas', 'while', 'hydrolysis']);
  assert.ok(!w.includes('mle') && !w.includes('kar') && !w.includes('yorum'));
});

t('Yardımcılar: açıklama "Cevap: X" sayılmaz, bilinmeyen konu adı, çift boşluk şıkkı', () => {
  assert.equal(U.realExplain('Cevap: B.'), ''); assert.equal(U.realExplain('Cevap: B) '), ''); assert.equal(U.realExplain('since → PP'), 'since → PP');
  assert.equal(U.topicName('hayvan-davranisi'), 'Hayvan davranışı'); assert.equal(U.topicName('tarim'), 'Tarım'); assert.equal(U.topicName('yeni-konu'), 'Yeni konu');
  assert.equal(U.optText(['was', 'has']), 'was / has');
  assert.equal(U.TYPE_LESSON['ceviri-tr-en'], 'taktik-ceviri');
});

// ===== v7: sınav stratejisi =====
const SG = await import('../js/strategy.js');
const GU = await import('../js/views/guess.js');
const { COLLECTIONS } = await import('../js/merge.js');

t('Senkron: yeni alanlar (reasons, bölüm süreleri, yarım deneme) birleşir; eski veri bozulmaz', () => {
  assert.ok(COLLECTIONS.includes('reasons'));
  const old = { cards: { a: { id: 'a', word: 'x', updatedAt: 1 } }, progress: { 'exam:e1': { id: 'exam:e1', answers: { 1: 0 }, updatedAt: 5 } }, settings: { main: { id: 'main', theme: 'dark', updatedAt: 2 } } };
  const neu = { progress: { 'exam:e1': { id: 'exam:e1', answers: { 1: 0, 2: 1 }, secTime: { bosluk: 300 }, updatedAt: 9 }, 'exam:e1~yarim': { id: 'exam:e1~yarim', half: true, updatedAt: 7 } },
    reasons: { 'e1:2': { id: 'e1:2', reason: 'kelime', updatedAt: 8 } }, mocks: { m1: { id: 'm1', times: { bosluk: 300 }, half: true, updatedAt: 9 } } };
  const ab = mergeState(old, neu), ba = mergeState(neu, old);
  assert.ok(sameState(ab, ba));
  assert.equal(ab.progress['exam:e1'].secTime.bosluk, 300);
  assert.equal(ab.reasons['e1:2'].reason, 'kelime');
  assert.equal(ab.cards.a.word, 'x'); assert.equal(ab.settings.main.theme, 'dark');
  assert.deepEqual(ab.reasons, mergeState(ab, old).reasons);
  // silinen neden (tombstone) geri gelmez
  assert.equal(mergeState(ab, { reasons: { 'e1:2': { id: 'e1:2', deleted: true, updatedAt: 20 } } }).reasons['e1:2'].deleted, true);
  // eski ayar kaydında yeni anahtarlar yok → varsayılanlar
  ST.load(); ST.put('settings', { id: 'main', theme: 'dark' });
  const set = ST.settings();
  assert.equal(set.secClock, true); assert.equal(set.finalMode, true); assert.equal(set.readGoal, 120); assert.equal(set.vocabGoal, 2000); assert.equal(set.theme, 'dark');
});

const TP = { total: 180, sections: [
  { type: 'paragraf', label: 'Okuma', count: 15, minutes: 60, order: 3 }, { type: 'bosluk', label: 'Boşluk', count: 20, minutes: 20, order: 1 },
  { type: 'ceviri', label: 'Çeviri', count: 12, minutes: 18, order: 2 }, { type: 'paragraf', label: 'Paragraf tamamlama', count: 6, minutes: 14, order: 4 }, { type: 'x', minutes: 0 }] };
t('Süre planı: sıralama, tip → bölüm eşlemesi, bölüm göstergesi', () => {
  const rows = SG.planRows(TP);
  assert.deepEqual(rows.map(r => r.label), ['Boşluk', 'Çeviri', 'Okuma', 'Paragraf tamamlama']);
  assert.deepEqual(rows[1].secs, ['en-tr', 'tr-en']);
  assert.deepEqual(rows[2].secs, ['okuma']); assert.deepEqual(rows[3].secs, ['paragraf']);
  assert.deepEqual(SG.secClock(TP, 'bosluk', { bosluk: 12 * 60 + 30 }), { label: 'Boşluk', used: 12, target: 20, over: false, secs: 750 });
  assert.equal(SG.secClock(TP, 'bosluk', { bosluk: 20 * 60 + 1 }).over, true);
  // birleşik satır: iki çeviri bölümünün süresi toplanır
  const c = SG.secClock(TP, 'tr-en', { 'en-tr': 600, 'tr-en': 500 });
  assert.equal(c.used, 18); assert.equal(c.target, 18); assert.equal(c.over, true);
  assert.equal(SG.secClock(TP, 'cloze', {}), null);
  assert.deepEqual(SG.planRows(null), []); assert.deepEqual(SG.planRows({ sections: 'x' }), []);
});

t('Hedef net: puana göre satır, son deneme ile fark, yarım deneme sayılmaz', () => {
  const targets = [{ score: 60, nets: { bosluk: 12, ceviri: 9, paragraf: 8 } }, { score: 80, nets: { bosluk: 16, 'ceviri-en-tr': 6, 'ceviri-tr-en': 5, okuma: 11, bilinmeyen: 3 } }];
  assert.equal(SG.targetFor(targets, 70).score, 60);
  assert.equal(SG.targetFor(targets, 40).score, 60);
  const t80 = SG.targetFor(targets, 85);
  assert.equal(t80.score, 80); assert.equal(t80.total, 38); assert.deepEqual(t80.rows.map(r => r.secs[0]), ['bosluk', 'en-tr', 'tr-en', 'okuma']);
  assert.equal(SG.targetFor([], 70), null); assert.equal(SG.targetFor(undefined, 70), null);
  const mocks = [{ id: 'a', date: '2026-12-01', sections: { bosluk: { d: 10 }, 'en-tr': { d: 5 }, 'tr-en': { d: 2 }, okuma: { d: 9 } } }, { id: 'h', date: '2026-12-05', half: true, sections: { bosluk: { d: 20 } } }];
  const last = SG.lastFullMock(mocks);
  assert.equal(last.id, 'a');
  const rows = SG.netRows(SG.targetFor(targets, 60), last);
  assert.deepEqual(rows.map(r => [r.need, r.mine, r.diff]), [[12, 10, -2], [9, 7, -2], [8, 9, 1]]);
  assert.equal(SG.netRows(SG.targetFor(targets, 60), null)[0].mine, null);
  assert.equal(SG.lastFullMock([]), null);
});

t('Hata nedenleri: dağılım (çoktan aza), bilinmeyen neden atlanır; analiz adımı biçimleri', () => {
  const reasons = [{ id: 'kelime', label: 'Kelime', advice: 'Kart ekle' }, { id: 'sure', label: 'Süre' }, { id: 'dikkat', label: 'Dikkat' }];
  const rows = SG.reasonCounts([{ reason: 'sure' }, { reason: 'kelime' }, { reason: 'sure' }, { reason: 'yok' }, {}], reasons);
  assert.deepEqual(rows.map(r => [r.id, r.n]), [['sure', 2], ['kelime', 1]]);
  assert.deepEqual(SG.reasonCounts([], reasons), []); assert.deepEqual(SG.reasonCounts([{ reason: 'x' }], null), []);
  assert.deepEqual(SG.stepOf('Yanlışları işaretle'), { title: 'Yanlışları işaretle', text: '', min: 0, end: 0 });
  assert.equal(SG.stepOf('19–20 dk: Tek hedef yaz.').end, 20);
  assert.equal(SG.targetFor([{ score: 60, total: 48, nets: { bosluk: 12, ceviri: 10 } }], 60).total, 48);
  assert.deepEqual(SG.planRows({ sections: [{ type: 'kontrol', label: '2. tur', count: 0, minutes: 20, order: 8 }] })[0], { label: '2. tur', secs: [], count: 0, minutes: 20, order: 8, tip: '' });
  assert.deepEqual(SG.stepOf({ title: 'A', text: 'b', min: 5 }), { title: 'A', text: 'b', min: 5 });
  assert.deepEqual(SG.stepOf({ text: 'Sadece metin', minutes: 3 }), { title: 'Sadece metin', text: '', min: 3 });
});

t('Son 14 gün: yeni kelime 0–5, sınav günü grubu, başvuru bandı', () => {
  assert.equal(SG.isFinal(14), true); assert.equal(SG.isFinal(15), false); assert.equal(SG.isFinal(0), true); assert.equal(SG.isFinal(-1), false);
  assert.equal(SG.finalNewLimit(15, 20), 15); assert.equal(SG.finalNewLimit(15, 14), 5); assert.equal(SG.finalNewLimit(3, 10), 3);
  assert.equal(SG.finalNewLimit(15, 3), 0); assert.equal(SG.finalNewLimit(0, 9), 0);
  const ed = [{ when: 'Son hafta', items: ['a'] }, { when: 'Bir gün önce', items: ['b'] }, { when: 'Sınav sabahı', items: ['c'] }, { when: 'Sınavda', items: ['d'] }, { when: 'Boş', items: [] }];
  assert.deepEqual(SG.examDayFor(ed, 12).map(g => g.when), ['Son hafta']);
  assert.deepEqual(SG.examDayFor(ed, 5).map(g => g.when), ['Son hafta']);
  assert.deepEqual(SG.examDayFor(ed, 1).map(g => g.when), ['Bir gün önce']);
  assert.deepEqual(SG.examDayFor(ed, 0).map(g => g.when), ['Sınav sabahı', 'Sınavda']);
  assert.deepEqual(SG.examDayFor(ed, 20), []); assert.deepEqual(SG.examDayFor(null, 3), []);
  assert.deepEqual(SG.examDayFor([{ when: 'A', days: 10, items: ['x'] }, { when: 'B', days: 2, items: ['y'] }], 2).map(g => g.when), ['B']);
  assert.equal(SG.whenDays({ when: '3 gün önce' }), 3); assert.equal(SG.whenDays({ when: '2 hafta kala' }), 14); assert.equal(SG.whenDays({ when: 'Genel' }), null);
  const ap = ['2027-01-12', '2027-01-20'];
  assert.equal(SG.applyState(ap, '2027-01-28', '2026-12-20'), null);
  assert.deepEqual(SG.applyState(ap, '2027-01-28', '2027-01-05'), { kind: 'soon', days: 7 });
  assert.deepEqual(SG.applyState(ap, '2027-01-28', '2027-01-12'), { kind: 'open', days: 8 });
  assert.deepEqual(SG.applyState(ap, '2027-01-28', '2027-01-20'), { kind: 'open', days: 0 });
  assert.deepEqual(SG.applyState(ap, '2027-01-28', '2027-01-21'), { kind: 'late', days: 7 });
  assert.equal(SG.applyState(ap, '2027-01-28', '2027-01-29'), null); assert.equal(SG.applyState(ap, null, '2027-01-21'), null); assert.equal(SG.applyState([], null, '2027-01-13'), null);
  // görev listesi: son 14 günde okuma yok, deneme var
  assert.deepEqual(PL.taskList(false, true), ['kart', 'hata', 'deneme', 'gramer', 'yeni']);
  assert.deepEqual(PL.taskList(false), ['kart', 'yeni', 'gramer', 'hata', 'okuma']);
  assert.deepEqual(PL.taskList(true, true), ['kart', 'gramer']);
  assert.equal(PL.dayDone({ final: true, tasks: { kart: true, gramer: true }, mock: true }), true);
  assert.equal(PL.dayDone({ final: true, tasks: { kart: true, gramer: true } }), false);
});

t('Kural kartı görevi: aynı kuraldan 2 yanlış → görev; "Okudum" sonrası sıfırlanır', () => {
  const rules = [{ topic: 'edat-esdizim', rule: 'at' }, { topic: 'relative', rule: 'which' }, { topic: 'edat-esdizim', rule: 'at 2' }];
  const L = (topic, correct, at, day = '2026-12-10') => ({ topic, correct, at, day });
  const logs = [L('edat-esdizim', false, 100), L('edat-esdizim', true, 150), L('edat-esdizim', false, 200), L('relative', false, 210), L('modal', false, 220), L('modal', false, 230)];
  assert.deepEqual(SG.ruleTasks(logs, rules, {}, '2026-12-10'), [{ topic: 'edat-esdizim', n: 2 }]);
  assert.deepEqual(SG.ruleTasks(logs, rules, { 'edat-esdizim': 150 }, '2026-12-10'), []); // onaydan sonra yalnız 1 yanlış
  assert.deepEqual(SG.ruleTasks([...logs, L('edat-esdizim', false, 300)], rules, { 'edat-esdizim': 150 }, '2026-12-10'), [{ topic: 'edat-esdizim', n: 2 }]);
  assert.deepEqual(SG.ruleTasks(logs, rules, {}, '2027-01-20'), []); // 14 günden eski yanlışlar sayılmaz
  assert.deepEqual(SG.ruleTasks(logs, null), []); assert.deepEqual(SG.ruleTasks(null, rules), []);
});

t('Okuma hızı: haftalık ortalama (pazartesi başlangıçlı), boş hafta null', () => {
  const at = k => new Date(k + 'T12:00:00').getTime();
  const recs = [{ wpm: 100, at: at('2026-12-07') }, { wpm: 120, at: at('2026-12-13') }, { wpm: 90, at: at('2026-12-01') }, { wpm: 0, at: at('2026-12-09') }, { wpm: 200 }];
  const w = SG.weeklyWpm(recs, '2026-12-10', 4);
  assert.deepEqual(w.map(x => x.wk), ['2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07']);
  assert.deepEqual(w.map(x => x.v), [null, null, 90, 110]);
  assert.equal(w[3].label, '7.12'); assert.equal(SG.weeklyWpm([], '2026-12-10').length, 8);
});

t('Çekirdek liste ilerlemesi + ders grupları + cümlede kelime bulma', () => {
  const words = [{ id: 'w1', word: 'yield' }, { id: 'w2', word: 'robust' }, { id: 'w3', word: 'decline' }, { id: 'w4', word: 'obtain' }];
  const cards = [{ id: 'w:w1', wid: 'w1', word: 'yield', state: 'review' }, { id: 'c2', word: 'Robust', state: 'known' }, { id: 'w:w3', wid: 'w3', word: 'decline', state: 'new' }, { id: 'x', word: 'obtain', state: 'review', deleted: true }];
  assert.deepEqual(SG.coreSeen(words, cards), { seen: 2, total: 4 });
  assert.deepEqual(SG.coreSeen([], []), { seen: 0, total: 0 });
  const g = (id, topic) => SG.lessonGroup({ id, topic: topic ?? id });
  assert.equal(g('baglac-zitlik'), 'baglac'); assert.equal(g('despite-although'), 'baglac'); assert.equal(g('edat-ving'), 'edat'); assert.equal(g('preposition-which'), 'edat');
  assert.equal(g('zaman-ifadeleri'), 'zaman'); assert.equal(g('cift-bosluk'), 'zaman'); assert.equal(g('relative'), 'yapi'); assert.equal(g('yepyeni-konu'), 'yapi');
  assert.equal(g('phrasal-verbs', 'kelime'), 'kelime'); assert.equal(g('taktik-kelime-tahmini', 'kelime-tahmini'), 'kelime');
  assert.equal(g('taktik-cloze', 'cloze'), 'taktik'); assert.equal(g('taktik-sure', 'strateji'), 'strateji'); assert.equal(g('yeni-strateji-dersi', 'strateji'), 'strateji');
  assert.deepEqual(SG.LESSON_GROUPS.map(x => x[1]), ['Bağlaçlar', 'Edatlar', 'Zaman', 'Cümle yapıları', 'Kelime', 'Soru tipi taktikleri', 'Strateji']);
  assert.equal(U.topicName('strateji'), 'Strateji'); assert.equal(U.topicName('kelime-tahmini'), 'Kelime tahmini');
  assert.deepEqual(SG.splitAt('The coating prevents corrosion.', 'prevent'), ['The coating ', 'prevents', ' corrosion.']);
  assert.deepEqual(SG.splitAt('Steel is coated with zinc.', 'coat'), ['Steel is ', 'coated', ' with zinc.']);
  assert.equal(SG.splitAt('They are reducing emissions.', 'reduce')[1], 'reducing');
  assert.equal(SG.splitAt('No match here.', 'yield'), null); assert.equal(SG.splitAt('', 'x'), null);
  assert.equal(SG.splitAt('The format is new.', 'form'), null); // başka kelime (format) vurgulanmaz
  assert.equal(SG.splitAt('It stopped; easily carried.', 'stop')[1], 'stopped'); assert.equal(SG.splitAt('It is easily carried.', 'carry')[1], 'carried');
});

t('Bağlamdan tahmin: 4 şık, doğru anlam içinde, çeldiriciler aynı türden ve farklı', () => {
  const pool = [{ word: 'yield', tr: 'verim; ürün vermek', pos: 'n' }, { word: 'layer', tr: 'katman', pos: 'n' }, { word: 'alloy', tr: 'alaşım', pos: 'n' }, { word: 'beam', tr: 'kiriş', pos: 'n' },
    { word: 'gear', tr: 'dişli', pos: 'n' }, { word: 'rapid', tr: 'hızlı', pos: 'adj' }, { word: 'copy', tr: 'verim', pos: 'n' }];
  const it = GU.buildGuess({ word: 'yield', tr: 'verim; ürün vermek', pos: 'n', cardId: 'c1' }, [{ en: 'No hit.' }, { en: 'The process yields pure iron.', tr: 'Süreç saf demir verir.' }], pool, () => 0.3);
  assert.equal(it.options.length, 4); assert.equal(new Set(it.options).size, 4);
  assert.equal(it.options[it.answer], 'verim'); assert.equal(it.hl, 'yields'); assert.equal(it.q, 'The process yields pure iron.');
  assert.ok(!it.options.includes('hızlı')); // farklı tür: aynı türden yeterince varken alınmaz
  assert.ok(it.explain.includes('Süreç saf demir verir.')); assert.equal(it.cardId, 'c1'); assert.equal(it.plainOpts, true);
  assert.equal(GU.buildGuess({ word: 'yield', tr: 'verim', pos: 'n' }, [{ en: 'No hit.' }], pool), null);       // cümlede yok
  assert.equal(GU.buildGuess({ word: 'yield', tr: '', pos: 'n' }, [{ en: 'It yields.' }], pool), null);            // anlam yok
  assert.equal(GU.buildGuess({ word: 'yield', tr: 'verim', pos: 'n' }, [{ en: 'It yields.' }], pool.slice(0, 2)), null); // çeldirici yetmez
});

const STR = await import('../js/stars.js');
t('Yıldız: veri okuma, kök eşleşmesi, bozuk veri', () => {
  const m = STR.parseStars({ v: 1, words: { yield: 5, study: 3, 'carry out': 4, bad: 9, zero: 0, 'Hand Down': 2 } });
  assert.equal(STR.starOf('Yield', m), 5); assert.equal(STR.starOf('yields', m), 5); assert.equal(STR.starOf('studies', m), 3);
  assert.equal(STR.starOf('carry  out', m), 4); assert.equal(STR.starOf('hand down', m), 2);
  assert.equal(STR.starOf('bad', m), null); assert.equal(STR.starOf('zero', m), null); assert.equal(STR.starOf('mitigate', m), null);
  assert.equal(STR.parseStars(null).size, 0); assert.equal(STR.parseStars({ words: 'x' }).size, 0);
  assert.equal(STR.starOf('yield', new Map()), null);
});

t('Yıldız sırası: kapalıyken sıklık sırası aynen; açıkken önce yıldız, eşitlikte sıklık', () => {
  const ws = [{ id: 'a', word: 'alpha', freq: 3 }, { id: 'b', word: 'beta', freq: 2 }, { id: 'c', word: 'gamma', freq: 3 }, { id: 'd', word: 'delta', freq: 1 }, { id: 'e', word: 'eps', freq: 2 }];
  assert.deepEqual(SR.coreOrder(ws).map(w => w.id), ['a', 'c', 'b', 'e', 'd']);
  const m = STR.parseStars({ words: { delta: 5, beta: 4, alpha: 2, gamma: 4 } });
  assert.deepEqual(SR.coreOrder(ws, m).map(w => w.id), ['delta', 'gamma', 'beta', 'alpha', 'eps'].map(x => ws.find(w => w.word === x).id));
});

// ---- v11: kısa deneme + gizli okumalar
const KS = await import('../js/kisa.js');
const { readFileSync } = await import('node:fs');
const J = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const CONTENT = { grammar: J('grammar.json'), drills: J('drills.json'), passages: J('passages.json') };
const SECQ = (u, content) => u.sec === 'cloze' ? 5 : u.sec === 'okuma' ? 3 : 1;
t('Kısa deneme: mini 20 / yarım 40, YÖKDİL oranı, çift boşluk, seviye karışık', () => {
  const pools = KS.poolsOf(CONTENT);
  const want = { mini: { bosluk: 5, cloze: 5, tamamlama: 3, 'en-tr': 1, 'tr-en': 1, paragraf: 1, ilgisiz: 1, okuma: 3 } };
  want.yarim = Object.fromEntries(Object.entries(want.mini).map(([k, v]) => [k, v * 2]));
  for (const size of ['mini', 'yarim']) {
    const b = KS.buildKisa(pools, size);
    const got = {};
    for (const u of b.units) got[u.sec] = (got[u.sec] || 0) + SECQ(u);
    assert.deepEqual(got, want[size], size);
    assert.equal(b.n, KS.KISA[size].n);
    assert.equal(new Set(b.units.map(u => u.id)).size, b.units.length, 'aynı birim iki kez yok');
    const G = new Map(CONTENT.grammar.map(q => [q.id, q]));
    const dbl = b.units.filter(u => u.sec === 'bosluk' && (G.get(u.id).double || (G.get(u.id).q.match(/-{2,}/g) || []).length >= 2)).length;
    assert.ok(dbl >= (size === 'mini' ? 1 : 2), 'çift boşluk ' + dbl);
    const pct = b.levels.map(x => x / b.n);
    assert.ok(Math.abs(pct[0] - 0.3) <= 0.11 && Math.abs(pct[1] - 0.45) <= 0.11 && Math.abs(pct[2] - 0.25) <= 0.11, 'seviye ' + b.levels);
  }
});
t('Kısa deneme: önce hiç görülmemiş, sonra en eski; son 3 denemede tekrar yok', () => {
  const pools = KS.poolsOf(CONTENT);
  const all = pools.g.map(u => u.id);
  // Biri hariç hepsi görülmüş → görülmemiş seçilir
  const seen = new Map(all.map((id, i) => [id, 1000 + i]));
  const fresh = all.filter(id => !CONTENT.grammar.find(q => q.id === id).double).at(-1);
  seen.delete(fresh);
  const b = KS.buildKisa(pools, 'mini', { lastSeen: seen });
  assert.ok(b.units.some(u => u.id === fresh), 'görülmemiş soru seçildi');
  assert.deepEqual(KS.lastSeenOf([{ q: 'g0001', at: 5 }, { q: 'd001#2', at: 7 }, { q: 'd001#0', at: 3 }, { q: 'ornek-1:2', at: 9 }], [{ id: 'read:p001', at: 4 }]),
    new Map([['g0001', 5], ['d001', 7], ['p001', 4]]));
  const defs = [];
  for (let i = 0; i < 5; i++) {
    const recent = KS.recentUnits(defs);
    const x = KS.buildKisa(pools, 'mini', { recent });
    for (const u of x.units) assert.ok(!recent.has(u.id), 'son 3 denemede çıkan tekrar etmedi: ' + u.id);
    defs.push({ createdAt: i + 1, units: x.units });
  }
  assert.equal(KS.recentUnits(defs).size, 3 * KS.buildKisa(pools, 'mini').units.length);
  assert.equal(KS.kisaScore(13, 20), 65); assert.equal(KS.kisaScore(0, 0), 0);
});
t('Kısa deneme: süre planı soru sayısına oranlanır; hedef net tam denemeyi esas alır', () => {
  const tp = J('aids.json').timePlan;
  const sp = KS.scalePlan(tp, { bosluk: 5, cloze: 5, tamamlama: 3, 'en-tr': 1, 'tr-en': 1, paragraf: 1, ilgisiz: 1, okuma: 3 }, SG.planRows);
  const rows = SG.planRows(sp);
  assert.ok(rows.length >= 6 && sp.total <= 45, 'mini toplam ' + sp.total);
  assert.equal(SG.planFor(sp, 'okuma').minutes, 12);
  assert.deepEqual(SG.planFor(sp, 'en-tr').secs, ['en-tr', 'tr-en']);
  const full = { date: '2026-12-01', sections: { bosluk: { d: 10 } } }, kisa = { date: '2026-12-05', kind: 'kisa', sections: { bosluk: { d: 4 } } };
  assert.equal(SG.lastFullMock([full, kisa]), full);
});
const PK = await import('../js/pack.js');
const RP = await import('../js/readpick.js');
t('Gizli okumalar: doğrulama (bozuk atlanır, tf) ve exams şeması', () => {
  const rs = PK.cleanReadings([{ id: 'a', text: 'x', questions: [{ type: 'tf', q: 'q', answer: false }, { type: 'mc', q: 'q2', options: ['a', 'b', 'c', 'd'], answer: 3 }, { type: 'mc', q: 'bad', options: ['a'], answer: 0 }] }, { id: 'b' }, null]);
  assert.equal(rs.length, 1);
  assert.deepEqual(rs[0].questions.map(q => [q.type, q.options.length, q.answer]), [['tf', 2, 1], ['mc', 4, 3]]);
  assert.deepEqual(PK.validate({ readings: [] }).exams, []);
  assert.throws(() => PK.validate({}));
  assert.equal(PK.validate({ exams: [{ id: 'e', questions: [] }], readings: [{ id: 'z', text: 't' }] }).exams.length, 1);
});
t('Okuma önerisi: özgün ↔ gizli dönüşümlü, "diğer" önerilmez, seviyeye yakın', () => {
  const ps = [{ id: 'p1', level: 1, title: 'P1' }, { id: 'p2', level: 2, title: 'P2' }];
  const rs = [{ id: 'o', topic: 'diğer', level: 1 }, { id: 'r2', topic: 'enerji', level: 2 }, { id: 'r1', topic: 'malzeme', level: 1, questions: [{}] }];
  assert.equal(RP.pickReading({ ps, rs }).next.id, 'r:r1');
  assert.equal(RP.pickReading({ ps, rs, lastGizli: true }).next.id, 'p1');
  assert.equal(RP.pickReading({ ps, rs, done: new Set(['r:r1', 'r:r2']) }).next.id, 'p1');
  assert.equal(RP.pickReading({ ps: [], rs: [rs[0]] }).next, null);
  assert.equal(RP.pickReading({ ps, rs, lastGizli: true, recs: [{ at: 1, level: 1, wpm: 150, right: 3, total: 3 }] }).next.id, 'p2');
});

const W = await import('../js/warm.js');
t('Isınma: zayıf konu seçimi (doğruluk < %70, ≥2 açık hata, kişisel kural), aynı gün ve erteleme', () => {
  const today = '2026-11-22';
  const L = (topic, correct, day = today, kind = 'gramer', dtype = 'bosluk') => ({ q: 'x', topic, correct, day, kind, dtype });
  const logs = [L('relative', false), L('relative', false), L('relative', true), L('passive', true), L('passive', true), L('passive', true),
    L('relative', false, '2026-10-01'), L('', false, today, 'drill', 'cloze'), L('', false, today, 'drill', 'cloze'), L('', true, today, 'drill', 'cloze')];
  const mistakes = [{ id: 'a', topic: 'modal', kind: 'gramer', dtype: 'bosluk' }, { id: 'b', topic: 'modal', kind: 'gramer', dtype: 'bosluk' }, { id: 'c', topic: 'passive', solved: true }];
  const rules = [{ topic: 'edat-esdizim' }];
  const ctx = { logs: [...logs, L('edat-esdizim', false)], mistakes, rules, today };
  assert.equal(W.weakInfo('relative', ctx).n, 3); // 14 günden eski sayılmaz
  assert.deepEqual(W.pickWarm(['relative', 'passive', 'modal', 'edat-esdizim', 'cloze'], ctx, {}, 9).map(x => x.key).sort(), ['cloze', 'edat-esdizim', 'modal', 'relative']);
  assert.equal(W.pickWarm(['relative', 'passive', 'modal'], ctx).length, 2);
  assert.deepEqual(W.pickWarm(['relative', 'modal'], ctx, { relative: { lastDay: today }, modal: { snoozeUntil: '2026-11-25' } }), []);
  assert.deepEqual(W.pickWarm(['modal'], ctx, { modal: { snoozeUntil: today } }).map(x => x.key), ['modal']);
  assert.deepEqual(W.pickWarm(['passive'], ctx), []);
  assert.equal(W.snoozeDay(today), '2026-11-29');
});
t('Isınma: konu anahtarı (alan adı değil soru tipi), deneme bölümü eşlemesi, ek kart', () => {
  assert.equal(W.keyOf({ kind: 'gramer', topic: 'relative', dtype: 'bosluk' }), 'relative');
  assert.equal(W.keyOf({ kind: 'drill', topic: 'biyoloji', dtype: 'ilgisiz' }), 'ilgisiz');
  assert.equal(W.keyOf({ kind: 'okuma', topic: 'saglik' }), 'paragraf');
  assert.equal(W.normKey('tamamlama'), 'cumle-tamamlama');
  assert.ok(W.matches({ kind: 'gramer', topic: 'x' }, 'bosluk') && W.matches({ kind: 'drill', dtype: 'cloze' }, 'cloze'));
  const a = { polarityCards: [{ group: 'Zıtlık', words: ['although'] }, { group: 'Z', words: ['despite'] }], cheatSheets: [{ id: 'fen-edat', title: 'F' }] };
  assert.equal(W.extraFor('baglac-zitlik', a).card.words[0], 'although');
  assert.equal(W.extraFor('despite-although', a).card.words[0], 'despite');
  assert.equal(W.extraFor('edat-esdizim', a).kind, 'sheet');
  assert.equal(W.extraFor('modal', a), null);
});
t('5 soru sırası: açık hata → önceki yanlış → seviyeye uygun yeni → üst seviye → doğru bilinen', () => {
  const pool = [{ key: 'ok', level: 1 }, { key: 'hi', level: 3 }, { key: 'new', level: 1 }, { key: 'wr', level: 1 }, { key: 'op', level: 1 }];
  const logs = [{ q: 'ok', correct: true, at: 1 }, { q: 'wr', correct: false, at: 2 }];
  assert.deepEqual(W.practicePick(pool, { logs, mistakes: [{ id: 'op', due: '2026-01-01' }], allowed: 1, n: 5, rnd: () => 0.5 }), ['op', 'wr', 'new', 'hi', 'ok']);
});
t('Kural kartından sonraki doğruluk + en çok kazandıracak 1 şey', () => {
  const r = W.afterCard([{ topic: 'r', correct: true, at: 5 }, { topic: 'r', correct: false, at: 1 }, { topic: 'r', correct: true, hint: true, at: 9 }], 'r', 3);
  assert.deepEqual([r.after.n, r.after.c, r.before.n], [2, 1, 1]);
  assert.equal(W.afterCard([], 'r', 0), null);
  assert.equal(W.bestOne([{ k: 'a', value: 0.6, n: 5 }, { k: 'b', value: 0.4, n: 2 }], [{ k: 'cloze', value: 0.1, n: 9 }]).key, 'a');
  assert.equal(W.bestOne([], [{ k: 'bosluk', value: 0.1, n: 9 }, { k: 'cloze', value: 0.5, n: 4 }]).key, 'cloze');
  assert.equal(W.bestOne([], [], ['relative']).key, 'relative');
});

const V14 = await import('../js/vocab.js'), MEM14 = await import('../js/memory.js'), PL14 = await import('../js/plan.js'), U14 = await import('../js/util.js'), ST14 = await import('../js/strategy.js'), TK14 = await import('../js/tasks.js');
t('Okuma: öneriye değmeyen gizli metin (seviye 1, sorusuz, çevirisiz) önerilmez; süre tahmini gerçekçi', () => {
  assert.equal(RP.useful({ level: 1 }), false);
  assert.equal(RP.useful({ level: 1, tr: ['x'] }), true);
  assert.equal(RP.useful({ level: 2 }), true);
  const rs = [{ id: 'kid', topic: 'bitki', level: 1 }];
  assert.equal(RP.pickReading({ ps: [{ id: 'p1', level: 1, title: 'P' }], rs }).next.id, 'p1');
  assert.equal(RP.readMin({ words: 240, questions: [1, 2, 3] }, 120), 5);
  assert.equal(RP.readMin({ words: 240, tr: ['a'] }, 120), 7);
  assert.equal(RP.readMin({ words: 60 }, 120), 3);
});
t('Okuma çipi: sözlükçe anlamı önce, çok anlamlı sözlük anlamı gösterilmez; found/left gibi çekimler eşleşmez', () => {
  const gm = V14.glossMap([{ w: 'seal (n)', tr: 'fok balığı' }, 'crust: yer kabuğu']);
  assert.equal(V14.chipMeaning({ word: 'seal', tr: 'sızdırmaz hâle getirmek, mühürlemek' }, gm), 'fok balığı');
  assert.equal(V14.chipMeaning({ word: 'crust', tr: 'kabuk' }, gm), 'yer kabuğu');
  assert.equal(V14.chipMeaning({ word: 'plant', tr: 'bitki; tesis, santral' }, gm), '');
  assert.equal(V14.chipMeaning({ word: 'surface', tr: 'yüzey' }, gm), 'yüzey');
  const idx = new Map([['found', { word: 'found' }], ['crust', { word: 'crust' }]]);
  const hits = V14.coreHits([{ t: 'found', w: true, i: 0 }, { t: 'crust', w: true, i: 1 }], idx, new Map());
  assert.deepEqual(hits.map(x => x.lemma), ['crust']);
});
t('Yazarak hatırla: eş anlamlı "yakın" olarak kabul', () => {
  assert.equal(MEM14.synHit('moreover', ['moreover', 'in addition']), 'moreover');
  assert.equal(MEM14.synHit('such as', ['for example']), null);
  assert.equal(MEM14.synHit('x', undefined), null);
});
t('Zayıf etiketi: %60 altı ve ≥5 soru; tohum konu doğruluk iyiyse düşer', () => {
  assert.deepEqual(PL14.weakFrom(['gerund-infinitive', 'relative', 'modal'], { 'gerund-infinitive': [2, 2], relative: [1, 6], passive: [1, 5], quantifier: [1, 4] }).sort(), ['modal', 'passive', 'relative']);
  assert.deepEqual(PL14.weakFrom(['x'], { x: [24, 25] }), []);
});
t('Kart notu: otomatik (Claude) kayıtları kısa gri satır', () => {
  assert.deepEqual(U14.noteParts('anlam Claude tarafından eklendi; anlam düzeltildi: a → b (Claude)'), { own: '', auto: 'anlam otomatik eklendi, düzeltildi' });
  assert.deepEqual(U14.noteParts('kendi notum'), { own: 'kendi notum', auto: '' });
  assert.equal(U14.noteParts('ipucu; anlam düzeltildi: x (Claude)').own, 'ipucu');
});
t('Senin kuralın: konu + anahtar sözcük eşleşmesi (ilgisiz kural çıkmaz)', () => {
  const rules = [{ topic: 'baglac-neden-amac', rule: '"to" testi: sonrasına isim koy (with a view to reducing)', right: 'with a view to reducing noise' }, { topic: 'ilgisiz', rule: '3 soru: Aynı konu mu?', right: 'Alt konu farklı → ilgisiz.' }];
  assert.equal(W.ruleMatch(rules, 'baglac-neden-amac', ['hence', 'however']), null);
  assert.ok(W.ruleMatch(rules, 'baglac-neden-amac', ['with a view to', 'so as to']));
  assert.ok(W.ruleMatch(rules, 'ilgisiz', ['IV']));
});
t('Kelime çerçevesi: çalıştığın / sağlam / bugünkü ara hedef / günlük gereken', () => {
  const v = ST14.vocabPlan({ learning: 150, mature: 30, grad: 2, known: 4, knowTotal: 36 }, 2000, 0.25, 90, 15);
  assert.deepEqual([v.studied, v.solid, v.todayGoal, v.proj, v.needPerDay], [186, 36, 500, 1536, 21]);
  assert.equal(ST14.vocabPlan({ learning: 1900, knowTotal: 0 }, 2000, 0.9, 10, 15).needPerDay, 0);
});
t('Deneme günü: ana liste deneme + kart, gerisi isteğe bağlı sonda', () => {
  assert.deepEqual(TK14.orderMockDay(['kart', 'yeni', 'gramer', 'hata', 'okuma', 'kisa'], true), ['kisa', 'kart', 'yeni', 'gramer', 'hata', 'okuma']);
  assert.deepEqual(TK14.orderMockDay(['kart', 'yeni'], false), ['kart', 'yeni']);
});

// ---- v15
const S15 = await import('../js/srs.js');
const W15 = await import('../js/warm.js');
const KS15 = await import('../js/kisa.js');
const AP15 = await import('../js/autoparts.js');
const PL15 = await import('../js/plan.js');
const RS15 = await import('../js/reasons.js');
const SC15 = await import('../js/views/scan.js');
const PN15 = await import('../js/views/panel.js');
const TK15 = await import('../js/tasks.js');
t('v15 yeni kartta Zor ≠ İyi: Zor "bugün + 1 g" (oturumda tekrar), İyi "1 g"', () => {
  const c = { state: 'new' };
  assert.equal(S15.previewLabel(c, 'hard'), 'bugün + 1 g');
  assert.equal(S15.previewLabel(c, 'good'), '1 g');
  assert.ok(S15.hardAgain(c) && !S15.hardAgain({ state: 'review', interval: 5 }) && !S15.hardAgain({ state: 'learning', ladder: 0 }));
  assert.notEqual(S15.previewLabel({ state: 'review', interval: 5, ease: 2.5 }, 'hard'), 'bugün + 1 g');
});
t('v15 neden çipleri: 3 ana (Kelime · Gramer · Süre) + Diğer, kimlikler aynı', () => {
  const L = ['kelime', 'gramer', 'dikkat', 'sure', 'iki-sik', 'metin'].map(id => ({ id, label: id }));
  const { main, more } = RS15.splitReasons(L);
  assert.deepEqual(main.map(r => r.id), ['kelime', 'gramer', 'sure']);
  assert.deepEqual(more.map(r => r.id), ['dikkat', 'iki-sik', 'metin']);
  assert.deepEqual(RS15.splitReasons(L.slice(2, 4)).main.map(r => r.id), ['sure']);
});
t('v15 joker yazısı yalnız kullanıldığı gün (dün atlanan gün)', () => {
  const T = '2026-11-25';
  const mk = act => k => act.includes(k) ? { id: k, tasks: { kart: true } } : null;
  const a = PL15.streakCalc(mk(['2026-11-25', '2026-11-23', '2026-11-22']), T);
  assert.equal(a.n, 3); assert.ok(a.jokerNow); assert.deepEqual(a.days, ['2026-11-24']);
  const b = PL15.streakCalc(mk(['2026-11-25', '2026-11-24', '2026-11-22', '2026-11-21']), T);
  assert.equal(b.n, 4); assert.ok(!b.jokerNow);
});
t('v15 "5 soru çöz" karışımı: çıkmış en fazla 2, özgün az ise çıkmışla dolar', () => {
  const own = [1, 2, 3, 4, 5, 6].map(i => ({ key: 'g' + i, level: 1 })), xs = [1, 2, 3].map(i => ({ key: 'x:' + i, level: 2 }));
  const r = W15.mixPractice(own, xs, { allowed: 1, n: 5, rnd: () => 0.5 });
  assert.equal(r.length, 5); assert.equal(r.filter(k => k.startsWith('x:')).length, 2);
  assert.equal(W15.mixPractice(own.slice(0, 1), xs, { n: 5, rnd: () => 0.5 }).length, 4);
  assert.deepEqual(W15.mixPractice(own, [], { n: 5, rnd: () => 0.5 }).length, 5);
  // açık hata önce kalır
  const r2 = W15.mixPractice(own, xs, { n: 5, mistakes: [{ id: 'g6', solved: false, due: '2026-01-01' }], rnd: () => 0.5 });
  assert.equal(r2[0], 'g6');
});
t('v15 kısa deneme: gizli okuma (≥3 mc) okuma birimine katılır; yoksa özgün', () => {
  const rs = [{ id: 'a', text: 'x', level: 2, topic: 'enerji', questions: [{ q: 1, options: ['a', 'b'], answer: 0 }, { q: 2, options: ['a', 'b'], answer: 0 }, { q: 3, options: ['a', 'b'], answer: 1 }] },
    { id: 'b', text: 'y', questions: [{ q: 1, type: 'tf', options: ['D', 'Y'], answer: 0 }] }, { id: 'c', text: 'z', topic: 'diğer', questions: [1, 2, 3].map(q => ({ q, options: ['a', 'b'], answer: 0 })) }];
  assert.deepEqual(KS15.privPool(rs).map(u => u.id), ['r:a']);
  const pools = { g: [], p: [{ id: 'p1', level: 2 }, { id: 'p2', level: 2 }], pr: KS15.privPool(rs) };
  const on = KS15.buildKisa(pools, 'yarim', { mixPriv: true, rand: () => 0.5 }).units.filter(u => u.sec === 'okuma').map(u => u.id);
  assert.ok(on.includes('r:a') && on.length === 2);
  const off = KS15.buildKisa(pools, 'mini', { rand: () => 0.5 }).units.filter(u => u.sec === 'okuma').map(u => u.id);
  assert.ok(!off.includes('r:a') && off.length === 1);
  const none = KS15.buildKisa({ ...pools, pr: [] }, 'mini', { mixPriv: true, rand: () => 0.5 }).units.filter(u => u.sec === 'okuma');
  assert.equal(none.length, 1);
});
t('v15 otomatik parçalama: virgül, bağlaç, edat; rol yok; kısa cümle tek blok', () => {
  const ps = AP15.autoParts('Although many metals corrode when exposed to moist air, stainless steel resists rust because it contains chromium.');
  assert.ok(ps.length >= 3 && ps.every(p => p.src && !p.role));
  assert.equal(ps.map(p => p.src).join(' '), 'Although many metals corrode when exposed to moist air, stainless steel resists rust because it contains chromium.');
  assert.ok(ps.some(p => /^because/.test(p.src)));
  assert.equal(AP15.autoParts('Water boils at 100 °C.').length, 1);
  assert.ok(AP15.autoParts('Paslanmaz çelik, krom içerdiği için, birçok metalin aksine paslanmaz.', 'tr').length >= 2);
});
t('v15 kelime tara: 50\'şer, 1–2★ atla', () => {
  assert.equal(SC15.BATCH, 50);
  const L = [{ word: 'a' }, { word: 'b' }, { word: 'c' }];
  const st = { a: 1, b: 3, c: 5 };
  assert.deepEqual(SC15.skipLow(L, true, w => st[w.word]).map(w => w.word), ['b', 'c']);
  assert.equal(SC15.skipLow(L, false, w => st[w.word]).length, 3);
});
t('v15 kural kartı etkisi: iki tarafta ≥5 soru → öncesi → sonrası', () => {
  assert.equal(PN15.effectText({ before: { n: 6, c: 3 }, after: { n: 5, c: 4 } }), 'Kural kartı: öncesi %50 → sonrası %80');
  assert.equal(PN15.effectText({ before: { n: 2, c: 1 }, after: { n: 5, c: 4 } }), 'Kural kartından sonra: %80 (5 soru)');
  assert.equal(PN15.effectText({ before: { n: 9, c: 1 }, after: { n: 0, c: 0 } }), '');
});
t('v15 tanı denemesi açıklaması', () => {
  assert.equal(TK15.mockNote({ title: 'Tanı: 2019-YDS/1 ilk 40' }), TK15.TANI_NOTE);
  assert.equal(TK15.mockNote({ title: 'x', note: 'not' }), 'not');
  assert.equal(TK15.mockNote({ title: '2019-YDS/2 ilk 40' }), '');
});

console.log(`\n${n} test geçti`);
