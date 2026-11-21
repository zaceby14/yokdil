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

console.log(`\n${n} test geçti`);
