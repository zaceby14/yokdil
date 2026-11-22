// Eksiklerim: doğruluk grafikleri, unutulan kelimeler, ısı haritası, deneme sonuçları, en zayıf 3 alan
import * as store from '../store.js';
import { h, add, dayKey, uid, toast, topicName, typeName, TOPICS, fmtDate } from '../util.js';
import { stats } from '../srs.js';
import { seedUser, words, aids, program } from '../data.js';
import { diffDays } from '../util.js';
const progFrac = async () => { const p = await program(); const T = diffDays(p.start, p.exam); return T > 0 ? diffDays(p.start, dayKey()) / T : 0; };
import { hbars, heatmap, line, stacked, weekBars } from '../charts.js';
import { coreSeen, weeklyWpm, READ_GOAL, vocabPlan, progVocab } from '../strategy.js';
import { reasonSummary } from '../reasons.js';
import { daysToExam, newLimit } from '../plan.js';
import { loadStars, starOf } from '../stars.js';
import { isKnownLevel } from '../vocab.js';
import { typeOf, normKey, matches, afterCard, isType } from '../warm.js';
import { priorities, keyStats, risers, trendText, RECENT_N } from '../priority.js';
import { openRule } from './warmup.js';
import { reasonCounts } from '../strategy.js';
import { estimate } from '../estimate.js';
import { lessons } from '../data.js';
import { TOPIC_LESSON, TYPE_LESSON } from '../util.js';
import { lessonTopic } from '../qbank.js';

// Bildiğin kelime: known + öğrenildi + olgun, hedef çizgisiyle
// Saf: çekirdek listedeki 5★ kelimelerden kaçını biliyor (biliyorum + öğrenildi + olgun)
export function topStarKnown(words, cards, m, known = isKnownLevel, minStar = 5) {
  const top = (words || []).filter(w => w?.word && starOf(w.word, m) >= minStar);
  if (!top.length) return null;
  const k = new Set();
  for (const c of cards || []) if (c && !c.deleted && known(c)) { if (c.wid) k.add(c.wid); if (c.word) k.add(String(c.word).toLowerCase().trim()); }
  return { known: top.filter(w => k.has(w.id) || k.has(w.word.toLowerCase())).length, total: top.length };
}

function vocabBox(st, goal, left, limit, core, top5, frac, top45) {
  const v = vocabPlan(st, goal, frac, left, limit);
  const scale = Math.max(goal, v.studied) * 1.05;
  const pc = x => (Math.min(x, scale) / scale * 100).toFixed(1);
  return h('div.vocab',
    top45 ? h('div.star45', h('span.small', 'Sınavda en çok çıkan (4–5★) kelimeler: '), h('b.big', `${top45.known}/${top45.total}`), h('span.small.muted', ' biliyorsun'),
      h('div.goalbar.thin', h('i', { style: `width:${(top45.known / Math.max(1, top45.total) * 100).toFixed(1)}%` }))) : null,
    h('div.row.between', h('div', h('span.big', v.studied), h('span.muted', ' çalıştığın kelime')),
      h('a.btn.small', { href: '#/kartlar/tara' }, 'Tara')),
    h('div.small.vocab-solid', 'Sağlam (iyi bildiğin): ', h('b', v.solid), ` · hedef ${goal}`),
    h('div.goalbar.two', h('i.studied', { style: `width:${pc(v.studied)}%` }), h('i', { style: `width:${pc(v.solid)}%` }),
      v.todayGoal ? h('span.goal-line', { style: `left:${pc(v.todayGoal)}%`, title: 'bugünün ara hedefi' }) : null),
    v.todayGoal ? h('div.small.muted.vocab-today', `Dikey çizgi: bugün olman gereken yer (${v.todayGoal} sağlam kelime)`) : null,
    h('div.small.muted', `Biliyorum ${st.known} · Öğrenildi ${st.grad} · Kalıcı ${st.mature} · Öğreniliyor ${st.learning}`),
    core?.total && false ? h('div.core-seen', h('div.small', 'Sık kelime listesi: ', h('b', `${core.seen}/${core.total}`), ' görüldü'),
      h('div.goalbar.thin', h('i', { style: `width:${(core.seen / core.total * 100).toFixed(1)}%` }))) : null,
    top5 && !top45 ? h('div.small.star5', '5★ kelimeler: ', h('b', `${top5.known}/${top5.total}`), ' biliyor') : null,
    left > 0 ? h('div.small.vocab-proj', `Günde ${limit} yeni kelimeyle sınavda ≈ ${v.proj} çalışılmış kelime`,
      v.needPerDay ? h('span', ' · hedefe yetişmek için günde ', h('b', v.needPerDay), ' yeni ya da ', h('a', { href: '#/kartlar/tara' }, 'Kelime tara')) : null) : null);
}

export const MOCK = [
  ['bosluk', 'Cümlede boşluk', 20], ['cloze', 'Cloze (boşluklu paragraf)', 10], ['tamamlama', 'Cümle tamamlama', 11],
  ['en-tr', 'Çeviri İng→Tr', 6], ['tr-en', 'Çeviri Tr→İng', 6], ['paragraf', 'Paragraf tamamlama', 6],
  ['ilgisiz', 'İlgisiz cümle', 6], ['okuma', 'Okuma', 15]
];
export const score = m => m.score ?? +(Object.values(m.sections || {}).reduce((s, x) => s + (+x?.d || 0), 0) * 1.25).toFixed(2);
const EXTRA = { yakin: 'Yakın anlam', diyalog: 'Diyalog', diger: 'Diğer' };
const isX = l => l.kind === 'cikmis';

const TIP = {
  'baglac-zitlik': 'İki yarının anlamı ters mi? Önce zıtlık kutbunu bul.',
  'baglac-neden-amac': 'Neden mi sonuç mu amaç mı? Bağlaçtan sonra gelen yapıya (cümle/isim/Ving) bak.',
  'edat-esdizim': 'Eşdizim kartları aç: at a rate, lead to + isim gibi.',
  'zaman-uyumu': 'Cümledeki zaman ifadesini (since, by the time) işaretle.',
  'relative': 'Virgül ve edat varsa "that" olmaz; which/whom kullan.',
  'gerund-infinitive': 'Fiil + Ving / to V listesini kartla tekrar et.',
  'either-neither': 'Either…or, neither…nor, both…and eşlerini ezberle.',
  'kelime': 'Günlük kart tekrarını aksatma, günlük yeni kelime sayını koru.',
  cloze: 'Boşluğun iki yanındaki cümleyi oku, bağlaç ve edat ipucunu ara.',
  'cumle-tamamlama': 'Önce bağlacın kutbunu belirle, sonra zaman uyumuna bak.',
  tamamlama: 'Önce bağlacın kutbunu belirle, sonra zaman uyumuna bak.',
  ilgisiz: 'Paragrafın ana konusunu tek kelimeyle yaz; kayan cümleyi bul.',
  paragraf: 'Boşluktan önceki ve sonraki cümle arasındaki bağı ara.',
  'paragraf-tamamlama': 'Boşluktan önceki ve sonraki cümle arasındaki bağı ara.',
  'ceviri-en-tr': 'Ana bağlacı ve zamanı eşleştir, sonra kelimeye bak.',
  'ceviri-tr-en': 'Ana bağlacı ve zamanı eşleştir, sonra kelimeye bak.',
  'en-tr': 'Ana bağlacı ve zamanı eşleştir, sonra kelimeye bak.',
  'tr-en': 'Ana bağlacı ve zamanı eşleştir, sonra kelimeye bak.',
  okuma: 'Günde bir parça oku; önce soruları, sonra metni.',
  'yakin-anlam': 'Ana bağlacı ve zamanı eşleştir; olumsuzluğu (neither, hardly) kaçırma.',
  bosluk: 'Günün gramer sorularını ve hata tekrarını her gün bitir.'
};

// Son 30 cevap üzerinden doğruluk (birikimli değil) + eğilim; toplam ayrıca tutulur
function acc(filter, keyOf) {
  const by = {};
  for (const l of [...store.all('grammarLog')].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    if (!filter(l)) continue;
    (by[keyOf(l)] ||= []).push(l.correct && !l.hint ? 1 : 0); // ipucuyla doğru ayrı sayılır
  }
  const m = {};
  for (const [k, xs] of Object.entries(by)) {
    const rec = xs.slice(-RECENT_N), prev = xs.slice(-2 * RECENT_N, -RECENT_N), sum = a => a.reduce((x, y) => x + y, 0);
    const v = sum(rec) / rec.length;
    m[k] = { c: sum(rec), n: rec.length, all: xs.length, allV: sum(xs) / xs.length, trend: rec.length >= 8 && prev.length >= 8 ? v - sum(prev) / prev.length : null };
  }
  return m;
}

const sec = (title, ...kids) => h('section.card', h('h3', title), ...kids);

// --- Eylemler: Kuralı oku (yan panel) · 5 soru çöz · ⋯ (Yanlışlarım, Dersi tam ekran)
const enc = encodeURIComponent;
const WEAK_AT = 0.7;
let LES = new Map(); // konu → ders id
const lessonId = k => LES.get(k) || LES.get(TOPIC_LESSON[k]) || LES.get(TYPE_LESSON[k]) || null;
const openN = k => store.all('mistakes').filter(m => !m.solved && matches(m, k)).length;
const ruleBtn = k => h('button.btn.small.act-rule', { type: 'button', onclick: () => openRule(k) }, 'Kuralı oku');
const practiceBtn = k => h('a.btn.small.act-5', { href: '#/gramer/pratik/' + enc(k) }, '5 soru çöz');
function moreMenu(k, { full = false } = {}) {
  const n = openN(k), lid = lessonId(k);
  const items = [
    full ? null : h('button.more-i', { type: 'button', onclick: () => openRule(k) }, 'Kuralı oku'),
    full ? null : h('a.more-i', { href: '#/gramer/pratik/' + enc(k) }, '5 soru çöz'),
    n ? h('a.more-i.act-wrongs', { href: '#/gramer/yanlis/' + enc(k) }, `Yanlışlarım (${n})`) : h('span.more-i.muted', 'Açık yanlış yok'),
    lid ? h('a.more-i', { href: '#/dersler/' + enc(lid) }, 'Dersi tam ekran aç') : null
  ];
  const d = h('details.more', h('summary', { 'aria-label': 'Diğer eylemler', title: 'Diğer' }, '⋯'), h('div.more-menu', items));
  d.addEventListener('toggle', () => { if (d.open) document.querySelectorAll('details.more[open]').forEach(x => x !== d && (x.open = false)); });
  return d;
}
const barCls = v => v >= 0.75 ? 'good' : v >= 0.5 ? 'mid' : 'bad';
// Satır: ad + çubuk + % · zayıfsa (< %70) 2 düğme; diğer eylemler ⋯
function actRow(r) {
  const k = normKey(r.k), weak = r.value < WEAK_AT && (r.n == null || r.n >= 3); // 1–2 soruyla zayıf denmez
  const kk = store.get('progress', 'kkart:' + k);
  const ac = kk?.firstAt && k !== 'paragraf' && k !== 'okuma' ? afterCard(store.all('grammarLog'), k, kk.firstAt) : null;
  return h('li.arow' + (weak ? '.weak' : ''), { 'data-key': k },
    h('div.arow-top', h('span.arow-l', r.label), h('span.arow-v', `%${Math.round(r.value * 100)}`, r.trend != null ? h('span.small.trend' + (r.trend >= 0.05 ? '.up' : r.trend <= -0.05 ? '.down' : ''), ' ' + trendText(r.trend)) : null, r.n ? h('span.small.muted', ` (son ${r.n})`) : null), moreMenu(k, { full: weak })),
    r.all > r.n ? h('div.small.muted.arow-all', `toplam %${Math.round(r.allV * 100)} · ${r.all} soru`) : null,
    h('div.arow-bar', h('i.' + barCls(r.value), { style: `width:${Math.max(2, r.value * 100).toFixed(0)}%` })),
    cardEffect(ac),
    weak ? h('div.arow-acts', ruleBtn(k), practiceBtn(k)) : null);
}
// Kural kartı etkisi: iki tarafta ≥5 soru varsa "kart öncesi %X → sonrası %Y"; yoksa yalnız sonrası
export const EFFECT_MIN = 5;
export function effectText(ac) {
  if (!ac?.after?.n) return '';
  const p = x => Math.round(x.c / x.n * 100);
  if (ac.after.n >= EFFECT_MIN && ac.before.n >= EFFECT_MIN) return `Kural kartı: öncesi %${p(ac.before)} → sonrası %${p(ac.after)}`;
  return `Kural kartından sonra: %${p(ac.after)} (${ac.after.n} soru)`;
}
const cardEffect = ac => { const t = effectText(ac); return t ? h('div.small.muted.after-card' + (/öncesi/.test(t) ? '.effect' : ''), t) : null; };
const actList = rs => rs.length ? h('ul.arows', rs.map(actRow)) : h('p.muted.small', 'Veri yok');

export default async function render(root) {
  const seed = await seedUser();
  const st = stats();
  const gt = acc(l => (l.kind === 'gramer' || l.kind === 'ders' || isX(l)) && TOPICS[l.topic], l => l.topic);
  const types = acc(l => !!typeOf(l), typeOf);
  const rows = (m, nm) => Object.entries(m).map(([k, x]) => ({ k, label: nm(k), value: x.c / x.n, n: x.n, all: x.all, allV: x.allV, trend: x.trend }))
    .sort((a, b) => a.value - b.value);
  const hinted = store.all('grammarLog').filter(l => l.hint && l.correct).length;
  const lapsed = store.all('cards').filter(c => c.lapses > 0).sort((a, b) => b.lapses - a.lapses).slice(0, 8);
  const days = Object.fromEntries(store.all('days').map(d => [d.id, d]));
  const act = k => { const d = days[k]; return d ? (d.reviews || 0) + (d.answered || 0) + Math.round((d.readSec || 0) / 60) + (d.focusMin || 0) : 0; };
  const focusWeek = Object.values(days).filter(d => d.id >= dayKey(new Date(Date.now() - 6 * 86400000))).reduce((a, d) => a + (d.focusMin || 0), 0);
  const mocks = store.all('mocks').sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Öncelik: sınav ağırlığı × eksiklik × güven (Bugün ekranıyla aynı kaynak). Az çıkan konular girmez.
  const pri = priorities({ logs: store.all('grammarLog'), mistakes: store.all('mistakes'), seed: [...(seed.weakTopics || []), ...(seed.weakDrills || [])] });
  const weak = pri.slice(0, 3).map(p => ({ k: p.k, label: topicName(p.k), value: p.value, n: p.n, trend: p.trend }));
  const ups = risers(keyStats(store.all('grammarLog')));
  const mockBox = h('div');
  const core = coreSeen(await words(), store.all('cards'));
  const top5 = topStarKnown(await words(), store.all('cards'), await loadStars());
  const A = await aids().catch(() => null);
  const reasonBox = A?.errorReasons?.length ? reasonSummary(A.errorReasons) : null;
  LES = new Map();
  for (const l of await lessons()) { LES.set(l.id, l.id); const t = lessonTopic(l); if (t && !LES.has(t)) LES.set(t, l.id); }
  const best = pri[0] ? { key: pri[0].k, value: pri[0].value, n: pri[0].n } : null;
  root.append(
    h('h2', 'Eksiklerim'),
    h('p.small.muted.screen-why', 'Nerede zorlanıyorsun, ne yapmalısın: tek bakışta.'),
    best ? h('div.card.best1', h('div.small.muted', 'Bugün en çok işine yarayacak 1 şey'),
      h('div.best1-row', h('b', topicName(normKey(best.key))), best.value != null ? h('span.chip.bad.small', `%${Math.round(best.value * 100)}`) : null),
      h('a.btn.primary.wide.best1-go', { href: '#/gramer/pratik/' + enc(normKey(best.key)) + '/kural' }, 'Kural kartı + 5 soru')) : null,
    sec('Öncelikli 3 alan', h('p.small.muted.pri-why', 'Sınavda çok çıkan ve son 30 cevabında zorlandığın konular. Her cevapla güncellenir.'),
      weak.length ? h('ol.weak', weak.map(w => h('li', h('b', w.label), w.value != null ? ` %${Math.round(w.value * 100)}` : '', w.trend != null ? h('span.small.trend' + (w.trend >= 0.05 ? '.up' : w.trend <= -0.05 ? '.down' : ''), ' ' + trendText(w.trend)) : null,
        h('div.small', TIP[w.k] || 'Bu konuda günlük 5 soru çöz.'), h('div.arow-acts', ruleBtn(normKey(w.k)), practiceBtn(normKey(w.k)))))) : h('p.small.muted', 'Biraz soru çözünce burada belirir.'),
      ups.length ? h('p.small.risers', '↑ Bu dönem güçlenenler: ', ups.map(u => `${topicName(u.k)} (+${Math.round(u.trend * 100)})`).join(' · ')) : null),
    sec('Kelimeler', vocabBox(st, +store.settings().vocabGoal || progVocab(await program()), await daysToExam(), await newLimit(), core, top5, await progFrac(), topStarKnown(await words(), store.all('cards'), await loadStars(), isKnownLevel, 4))),
    sec('Deneme sonuçları', mockBox),
    // İkincil bölümler: "Ayrıntı ▸" altında (kapalı)
    h('details.more-detail', h('summary.card', h('b', 'Ayrıntı ▸'), h('span.small.muted', ' konu konu doğruluk, hata nedenleri, unutulan kelimeler, okuma hızı, takvim')),
      sec('Gramer konu doğruluğu', actList(rows(gt, topicName)),
        hinted ? h('p.small.muted.hint-stat', `İpucuyla doğru: ${hinted} (doğruluğa katılmaz)`) : null),
      sec('Soru tipi doğruluğu', typeBox(rows)),
      A?.errorReasons?.length ? h('section.card.reasons-all', h('h3', 'Neden yanlış yaptın?'),
        reasonBox || h('p.small.muted', 'Yanlış bir sorunun altında "Neden?" çipine dokun; burada toplanır.'), reasonBox ? reasonAct(A.errorReasons, lapsed, best) : null) : null,
      sec('En çok unuttuğun kelimeler', lapsedBox(lapsed)),
      readLine(),
      sec('Son 8 hafta', h('div.center', { html: heatmap(act) }), h('p.small.muted.center', `Koyu kare = çok çalışılan gün · odak: son 7 günde ${focusWeek} dk`)),
      h('a.card.link', { href: '#/notlar' }, h('b', 'Notlarım'), h('span.small.muted', ` ${store.all('notes').filter(n => n.kind === 'quick' && !n.done).length} açık not`)))
  );
  drawMocks(mockBox);
}

// Tip doğruluğu: kaynak filtresi (hepsi / özgün / çıkmış)
function typeBox(rows) {
  const box = h('div'), chart = h('div');
  let f = 'all';
  const draw = () => {
    const m = acc(l => !!typeOf(l) && (f === 'all' || (f === 'x') === isX(l)), typeOf);
    chart.innerHTML = ''; chart.append(actList(rows(m, typeName)));
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  };
  const seg = h('div.seg.small', [['all', 'Hepsi'], ['own', 'Uygulama'], ['x', 'Çıkmış']].map(([k, l]) => h('button', { 'data-f': k, onclick: () => { f = k; draw(); } }, l)));
  box.append(seg, chart); draw();
  return box;
}

function drawMocks(box) {
  box.innerHTML = '';
  const mocks = store.all('mocks').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = mocks.at(-1);
  const goal = +store.settings().targetScore || 70;
  // Tahmini puan gidişi (her gün son cevaplardan; yüzde değil puan)
  const est = estimate(store.all('grammarLog'), mocks);
  const ests = store.all('days').filter(d => d.est != null).sort((a, b) => a.id.localeCompare(b.id)).slice(-60);
  add(box, h('div.est-box',
    est.enough ? h('div', h('span.small.muted', 'Tahmini puan '), h('b.big', `${est.lo}–${est.hi}`), h('span.small.muted', ` · hedef ${goal}` + (est.hi < goal ? ` · ${Math.max(0, Math.ceil((goal - est.mid) / 1.25))} soru daha` : ''))) : h('p.small.muted', 'Tahmini puan: biraz daha soru çözünce görünür.'),
    ests.length >= 2 ? h('div', { html: line(ests.map((d, i, a) => ({ label: i % Math.ceil(a.length / 5) === 0 || i === a.length - 1 ? fmtDate(d.id) : '', v: d.est })), { goal }) }) : null,
    h('p.small.muted', 'Tahmin: son 4 haftadaki cevaplarından, bölüm bölüm 80 soruya oranlanır. Çalışırken çözülen sorular sınavdan biraz kolay sayılır.')));
  if (mocks.length) {
    const pctOf = m => m.kind === 'kisa' || m.pct;
    const fulls = mocks.filter(m => !pctOf(m));
    add(box,
      fulls.length ? h('div', { html: line(fulls.map(m => ({ label: m.date ? fmtDate(m.date) : '–', v: score(m) })), { goal }) }) : null,
      fulls.length ? h('div.mock-legend', h('span', h('i'), 'Tam deneme (puan)'), h('span', h('i.goal'), `Hedef ${goal}`)) : null,
      h('p.small', pctOf(last) ? h('b', `Son: ${last.right ?? '?'}/${last.n ?? '?'} doğru`) : h('b', 'Son: ' + score(last).toLocaleString('tr-TR') + ' puan'), ` · ${last.date ? fmtDate(last.date) : ''}${last.name ? ' · ' + last.name : ''}`),
      h('div', { html: stacked([...MOCK, ...Object.keys(EXTRA).map(k => [k, EXTRA[k], 0])]
        .filter(([k, , n]) => last.src === 'cikmis' || last.kind === 'kisa' ? last.sections?.[k] : (n || last.sections?.[k]))
        .map(([k, l, n]) => ({ label: l.replace(/\s*\(.*\)$/, ''), n: last.sections?.[k]?.n ?? n, d: +last.sections?.[k]?.d || 0, y: +last.sections?.[k]?.y || 0 }))
        .filter(r => r.n)) }),
      mockWeak(last),
      h('ul.list.compact', mocks.slice().reverse().map(m => h('li', h('span.grow', `${fmtDate(m.date)} ${m.name || ''}`, m.kind === 'kisa' ? h('span.chip.small.kisa-chip', 'kısa') : m.src === 'cikmis' ? h('span.chip.small', 'çıkmış') : null), h('b', pctOf(m) ? `%${score(m)}` : score(m).toLocaleString('tr-TR')),
        h('button.icon-x.small', { 'aria-label': 'sil', onclick: () => { if (confirm('Silinsin mi?')) { store.del('mocks', m.id); drawMocks(box); } } }, '×'))))
    );
  }
  box.append(h('button.btn.primary.wide', { onclick: () => form(box) }, 'Deneme sonucu gir'));
}

// Son denemenin zayıf bölümleri (< %70, en az 3 soru): kural + 5 soru
function mockWeak(last) {
  const rs = [...MOCK, ...Object.keys(EXTRA).map(k => [k, EXTRA[k], 0])].map(([k, l, n0]) => {
    const s = last.sections?.[k]; if (!s) return null;
    const n = s.n ?? n0; return n >= 3 ? { k, label: l, value: (+s.d || 0) / n, n } : null;
  }).filter(r => r && r.value < WEAK_AT && !EXTRA[r.k]).sort((a, b) => a.value - b.value).slice(0, 3);
  return rs.length ? h('div.mock-weak', h('div.small.muted', 'Zayıf bölümler'), actList(rs)) : null;
}

// En sık hata nedenine göre tek bağlantı
function reasonAct(list, lapsed, best) {
  const top = reasonCounts(store.all('reasons'), list)[0];
  if (!top) return null;
  const wk = best ? normKey(best.key) : null;
  const go = {
    kelime: () => h('a.btn.wide.reason-go', { href: lapsed.length ? '#/kartlar/sec/' + enc(lapsed.map(c => c.id).join(',')) : '#/kartlar/calis' }, 'Kelime çalış ›'),
    gramer: () => wk ? h('button.btn.wide.reason-go', { type: 'button', onclick: () => openRule(wk) }, 'Kuralı oku: ' + topicName(wk) + ' ›') : null,
    sure: () => h('a.btn.wide.reason-go', { href: '#/dersler/arac/sure' }, 'Süre planı ›'),
    'iki-sik': () => h('a.btn.wide.reason-go', { href: '#/dersler/arac/eleme' }, 'Şık eleme taktikleri ›'),
    dikkat: () => h('a.btn.wide.reason-go', { href: '#/dersler/arac/eleme' }, 'Şık eleme taktikleri ›'),
    metin: () => h('a.btn.wide.reason-go', { href: '#/okuma' }, 'Okuma ›')
  }[top.id];
  return go ? go() : null;
}

// En çok unutulan: seç → "Bu kelimeleri çalış"
function lapsedBox(lapsed) {
  if (!lapsed.length) return h('p.muted.small', 'Henüz yok');
  const sel = new Set(lapsed.map(c => c.id));
  const btn = h('a.btn.primary.wide.study-sel');
  const upd = () => { btn.textContent = `Bu kelimeleri çalış (${sel.size})`; btn.href = sel.size ? '#/kartlar/sec/' + enc([...sel].join(',')) : 'javascript:void 0'; btn.classList.toggle('disabled', !sel.size); };
  const list = h('ul.list.compact.lapsed', lapsed.map(c => h('li.lap',
    h('input.lap-cb', { type: 'checkbox', checked: true, 'aria-label': c.word + ' seç', onchange: e => { e.target.checked ? sel.add(c.id) : sel.delete(c.id); upd(); } }),
    h('a', { href: '#/kartlar/duzenle/' + enc(c.id) }, h('b', { lang: 'en' }, c.word), h('span.small.muted', c.tr || ''), h('span.chip.bad.small', c.lapses + '×')))));
  upd();
  return h('div', list, btn);
}

function form(box) {
  box.innerHTML = '';
  const date = h('input', { type: 'date', value: dayKey() });
  const name = h('input', { placeholder: 'Ad (ör. 2024-YÖKDİL/1)' });
  const inputs = {};
  const total = h('b', '0');
  const upd = () => {
    let d = 0;
    for (const [k, , n] of MOCK) {
      const i = inputs[k];
      const dv = Math.min(n, Math.max(0, +i.d.value || 0)), yv = Math.min(n - dv, Math.max(0, +i.y.value || 0));
      i.b.textContent = n - dv - yv; d += dv;
    }
    total.textContent = (d * 1.25).toLocaleString('tr-TR');
  };
  const num = () => h('input.num', { type: 'number', min: 0, inputmode: 'numeric', oninput: upd });
  const table = h('table.mock', h('tr', h('th', 'Bölüm'), h('th', 'D'), h('th', 'Y'), h('th', 'B')),
    MOCK.map(([k, l, n]) => { inputs[k] = { d: num(), y: num(), b: h('span', n) }; return h('tr', h('td', l, h('span.small.muted', ` ${n}`)), h('td', inputs[k].d), h('td', inputs[k].y), h('td', inputs[k].b)); }));
  box.append(h('div.row', date, name), table, h('p', 'Tahmini puan: ', total),
    h('div.row',
      h('button.btn', { onclick: () => drawMocks(box) }, 'Vazgeç'),
      h('button.btn.primary.grow', {
        onclick: () => {
          const sections = {};
          for (const [k, , n] of MOCK) { const d = Math.min(n, +inputs[k].d.value || 0), y = Math.min(n - d, +inputs[k].y.value || 0); sections[k] = { d, y, b: n - d - y }; }
          store.put('mocks', { id: uid('m'), date: date.value || dayKey(), name: name.value.trim(), sections });
          toast('Kaydedildi'); drawMocks(box);
        }
      }, 'Kaydet')));
}

// Okuma hızı + doğruluk özeti + haftalık grafik (hedef hız çizgisi)
function readLine() {
  const r = store.all('progress').filter(x => x.kind === 'read' && x.wpm);
  if (!r.length) return null;
  const wpm = Math.round(r.reduce((a, x) => a + x.wpm, 0) / r.length);
  const q = r.filter(x => x.total), acc = q.length ? q.reduce((a, x) => a + x.right, 0) / q.reduce((a, x) => a + x.total, 0) : null;
  const goal = +store.settings().readGoal || READ_GOAL;
  const wk = weeklyWpm(r);
  const lastW = wk.filter(x => x.v != null).at(-1);
  return sec('Okuma', h('p', h('b', wpm), ' kelime/dk ortalama', acc != null ? ` · doğruluk %${Math.round(acc * 100)}` : '', h('span.small.muted', ` (${r.length} okuma)`)),
    h('div.readchart', { html: weekBars(wk.map(x => ({ label: x.label, v: x.v })), { goal, unit: ' kelime/dk' }) }),
    h('p.small.muted', `Haftalık ortalama hız · kesik çizgi = hedef (${goal} kelime/dk)`, lastW ? (lastW.v >= goal ? ' · son hafta hedefte' : ` · son hafta ${goal - lastW.v} eksik`) : ''));
}
