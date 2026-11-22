// Eksiklerim: doğruluk grafikleri, unutulan kelimeler, ısı haritası, deneme sonuçları, en zayıf 3 alan
import * as store from '../store.js';
import { h, dayKey, uid, toast, topicName, typeName, TOPICS, fmtDate } from '../util.js';
import { stats } from '../srs.js';
import { seedUser, words, aids } from '../data.js';
import { hbars, heatmap, line, stacked, weekBars } from '../charts.js';
import { coreSeen, weeklyWpm, READ_GOAL } from '../strategy.js';
import { reasonSummary } from '../reasons.js';
import { daysToExam, newLimit } from '../plan.js';
import { loadStars, starOf } from '../stars.js';
import { isKnownLevel } from '../vocab.js';

// Bildiğin kelime: known + öğrenildi + olgun, hedef çizgisiyle
// Saf: çekirdek listedeki 5★ kelimelerden kaçını biliyor (biliyorum + öğrenildi + olgun)
export function topStarKnown(words, cards, m, known = isKnownLevel) {
  const top = (words || []).filter(w => w?.word && starOf(w.word, m) === 5);
  if (!top.length) return null;
  const k = new Set();
  for (const c of cards || []) if (c && !c.deleted && known(c)) { if (c.wid) k.add(c.wid); if (c.word) k.add(String(c.word).toLowerCase().trim()); }
  return { known: top.filter(w => k.has(w.id) || k.has(w.word.toLowerCase())).length, total: top.length };
}

function vocabBox(st, goal, left, limit, core, top5) {
  const scale = Math.max(goal * 1.15, st.knowTotal);
  const need = Math.max(0, goal - st.knowTotal);
  return h('div.vocab',
    h('div.row.between', h('div', h('span.big', st.knowTotal), h('span.muted', ` / ${goal} bildiğin kelime`)),
      h('a.btn.small', { href: '#/kartlar/tara' }, 'Tara')),
    h('div.goalbar', h('i', { style: `width:${(st.knowTotal / scale * 100).toFixed(1)}%` }),
      h('span.goal-line', { style: `left:${(goal / scale * 100).toFixed(1)}%`, title: 'hedef' })),
    h('div.small.muted', `Biliyorum ${st.known} · Öğrenildi ${st.grad} · Olgun ${st.mature}`),
    core?.total ? h('div.core-seen', h('div.small', 'Çekirdek liste: ', h('b', `${core.seen}/${core.total}`), ' görüldü'),
      h('div.goalbar.thin', h('i', { style: `width:${(core.seen / core.total * 100).toFixed(1)}%` }))) : null,
    top5 ? h('div.small.star5', '5★ kelimeler: ', h('b', `${top5.known}/${top5.total}`), ' biliyor') : null,
    need && left > 0 ? h('div.small.vocab-proj', `Günde ${limit} yeni kelimeyle sınavda ≈ ${st.knowTotal + limit * left} kelime`) : need ? null : h('div.small', 'Hedefe ulaştın'));
}

export const MOCK = [
  ['bosluk', 'Cümlede boşluk', 20], ['cloze', 'Cloze test', 10], ['tamamlama', 'Cümle tamamlama', 11],
  ['en-tr', 'Çeviri İng→Tr', 6], ['tr-en', 'Çeviri Tr→İng', 6], ['paragraf', 'Paragraf tamamlama', 6],
  ['ilgisiz', 'İlgisiz cümle', 6], ['okuma', 'Okuma', 15]
];
export const score = m => m.score ?? +(Object.values(m.sections || {}).reduce((s, x) => s + (+x?.d || 0), 0) * 1.25).toFixed(2);
const EXTRA = { yakin: 'Yakın anlam', diyalog: 'Diyalog', diger: 'Diğer' };
const typeOf = l => (l.kind === 'gramer' || l.kind === 'ders') ? 'bosluk' : l.kind === 'okuma' ? 'paragraf' : l.dtype;
const isX = l => l.kind === 'cikmis';

const TIP = {
  'baglac-zitlik': 'İki yarının anlamı ters mi? Önce zıtlık kutbunu bul.',
  'baglac-neden-amac': 'Neden mi sonuç mu amaç mı? Bağlaçtan sonra gelen yapıya (cümle/isim/Ving) bak.',
  'edat-esdizim': 'Eşdizim kartları aç: at a rate, lead to + isim gibi.',
  'zaman-uyumu': 'Cümledeki zaman ifadesini (since, by the time) işaretle.',
  'relative': 'Virgül ve edat varsa "that" olmaz; which/whom kullan.',
  'gerund-infinitive': 'Fiil + Ving / to V listesini kartla tekrar et.',
  'either-neither': 'Either…or, neither…nor, both…and eşlerini ezberle.',
  'kelime': 'Günlük kart tekrarını aksatma, yeni limitini koru.',
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
  bosluk: 'Günlük gramer setini ve hata kutusunu her gün bitir.'
};

function acc(filter, keyOf) {
  const m = {};
  for (const l of store.all('grammarLog')) {
    if (!filter(l)) continue;
    const k = keyOf(l); const a = m[k] ||= [0, 0]; a[1]++; if (l.correct && !l.hint) a[0]++; // ipucuyla doğru ayrı sayılır
  }
  return m;
}

const sec = (title, ...kids) => h('section.card', h('h3', title), ...kids);

export default async function render(root) {
  const seed = await seedUser();
  const st = stats();
  const gt = acc(l => (l.kind === 'gramer' || l.kind === 'ders' || isX(l)) && TOPICS[l.topic], l => l.topic);
  const types = acc(l => !!typeOf(l), typeOf);
  const rows = (m, nm) => Object.entries(m).map(([k, [c, n]]) => ({ k, label: nm(k), value: c / n, n, note: `(${n})` }))
    .sort((a, b) => a.value - b.value);
  const hinted = store.all('grammarLog').filter(l => l.hint && l.correct).length;
  const lapsed = store.all('cards').filter(c => c.lapses > 0).sort((a, b) => b.lapses - a.lapses).slice(0, 8);
  const days = Object.fromEntries(store.all('days').map(d => [d.id, d]));
  const act = k => { const d = days[k]; return d ? (d.reviews || 0) + (d.answered || 0) + Math.round((d.readSec || 0) / 60) + (d.focusMin || 0) : 0; };
  const focusWeek = Object.values(days).filter(d => d.id >= dayKey(new Date(Date.now() - 6 * 86400000))).reduce((a, d) => a + (d.focusMin || 0), 0);
  const mocks = store.all('mocks').sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // En zayıf 3 alan
  const areas = [
    ...rows(gt, topicName).filter(r => r.n >= 3).map(r => ({ ...r, label: r.label })),
    ...rows(types, typeName).filter(r => r.n >= 3 && r.k !== 'bosluk')
  ];
  const last = mocks.at(-1);
  // Çıkmış (kısa set / yarım deneme) kaydında olmayan bölüm %0 sayılmaz
  if (last) for (const [k, l, n0] of MOCK) { const s = last.sections?.[k]; if (!s && (last.src === 'cikmis' || last.kind === 'kisa')) continue; const n = s?.n ?? n0; if (n >= 3) areas.push({ k, label: 'Deneme: ' + l, value: (+s?.d || 0) / n }); }
  const weak = areas.sort((a, b) => a.value - b.value).filter((a, i, arr) => arr.findIndex(x => x.label === a.label) === i).slice(0, 3);

  const mockBox = h('div');
  const core = coreSeen(await words(), store.all('cards'));
  const top5 = topStarKnown(await words(), store.all('cards'), await loadStars());
  const A = await aids().catch(() => null);
  const reasonBox = A?.errorReasons?.length ? reasonSummary(A.errorReasons) : null;
  root.append(
    h('h2', 'Eksiklerim'),
    sec('En zayıf 3 alan', weak.length ? h('ol.weak', weak.map(w => h('li', h('b', w.label), ` %${Math.round(w.value * 100)}`, h('div.small', TIP[w.k] || 'Bu konuda günlük 5 soru çöz.')))) : h('div', h('p.small.muted', 'Notlarına göre (soru çözdükçe güncellenir):'),
      h('ol.weak', [...(seed.weakTopics || []).slice(0, 2), ...(seed.weakDrills || []).slice(0, 1)].map(k => h('li', h('b', topicName(k)), h('div.small', TIP[k] || 'Bu konuda günlük 5 soru çöz.')))))),
    sec('Kelimeler', vocabBox(st, +store.settings().vocabGoal || 2000, await daysToExam(), await newLimit(), core, top5), h('div.stats3', h('div', h('b', st.new), h('span', 'yeni')), h('div', h('b', st.learning), h('span', 'öğreniliyor')), h('div', h('b', st.mature), h('span', 'olgun')))),
    readLine(),
    sec('Gramer konu doğruluğu', h('div', { html: hbars(rows(gt, topicName)) }),
      hinted ? h('p.small.muted.hint-stat', `İpucuyla doğru: ${hinted} (doğruluğa katılmaz)`) : null),
    sec('Soru tipi doğruluğu', typeBox(rows)),
    A?.errorReasons?.length ? h('section.card.reasons-all', h('h3', 'Hata nedenleri'),
      reasonBox || h('p.small.muted', 'Yanlış bir sorunun altında "Neden?" çipine dokun; dağılım burada birikir.')) : null,
    sec('En çok unutulan', lapsed.length ? h('ul.list.compact', lapsed.map(c => h('li', h('a', { href: '#/kartlar/duzenle/' + encodeURIComponent(c.id) }, h('b', { lang: 'en' }, c.word), h('span.small.muted', c.tr || ''), h('span.chip.bad.small', c.lapses + '×'))))) : h('p.muted.small', 'Henüz yok')),
    sec('Son 8 hafta', h('div.center', { html: heatmap(act) }), h('p.small.muted.center', `Odak: son 7 günde ${focusWeek} dk`)),
    h('a.card.link', { href: '#/notlar' }, h('b', 'Notlarım'), h('span.small.muted', ` ${store.all('notes').filter(n => n.kind === 'quick' && !n.done).length} açık not`)),
    sec('Deneme sonuçları', mockBox)
  );
  drawMocks(mockBox);
}

// Tip doğruluğu: kaynak filtresi (hepsi / özgün / çıkmış)
function typeBox(rows) {
  const box = h('div'), chart = h('div');
  let f = 'all';
  const draw = () => {
    const m = acc(l => !!typeOf(l) && (f === 'all' || (f === 'x') === isX(l)), typeOf);
    chart.innerHTML = hbars(rows(m, typeName));
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.f === f));
  };
  const seg = h('div.seg.small', [['all', 'Hepsi'], ['own', 'Özgün'], ['x', 'Çıkmış']].map(([k, l]) => h('button', { 'data-f': k, onclick: () => { f = k; draw(); } }, l)));
  box.append(seg, chart); draw();
  return box;
}

function drawMocks(box) {
  box.innerHTML = '';
  const mocks = store.all('mocks').sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const last = mocks.at(-1);
  if (mocks.length) {
    box.append(
      h('div', { html: line(mocks.map(m => ({ label: fmtDate(m.date), v: score(m), cls: m.kind === 'kisa' ? 'kisa' : '' }))) }),
      mocks.some(m => m.kind === 'kisa') ? h('div.mock-legend', h('span', h('i'), 'Tam / yarım'), h('span', h('i.kisa'), 'Kısa (doğru/soru × 100)')) : null,
      h('p.small', h('b', 'Son: ' + score(last).toLocaleString('tr-TR')), ` puan · ${fmtDate(last.date)}${last.name ? ' · ' + last.name : ''}`),
      h('div', { html: stacked([...MOCK, ...Object.keys(EXTRA).map(k => [k, EXTRA[k], 0])]
        .filter(([k, , n]) => last.src === 'cikmis' || last.kind === 'kisa' ? last.sections?.[k] : (n || last.sections?.[k]))
        .map(([k, l, n]) => ({ label: l, n: last.sections?.[k]?.n ?? n, d: +last.sections?.[k]?.d || 0, y: +last.sections?.[k]?.y || 0 }))
        .filter(r => r.n)) }),
      h('ul.list.compact', mocks.slice().reverse().map(m => h('li', h('span.grow', `${fmtDate(m.date)} ${m.name || ''}`, m.kind === 'kisa' ? h('span.chip.small.kisa-chip', 'kısa') : m.src === 'cikmis' ? h('span.chip.small', 'çıkmış') : null), h('b', score(m).toLocaleString('tr-TR')),
        h('button.icon-x.small', { 'aria-label': 'sil', onclick: () => { if (confirm('Silinsin mi?')) { store.del('mocks', m.id); drawMocks(box); } } }, '×'))))
    );
  }
  box.append(h('button.btn.primary.wide', { onclick: () => form(box) }, 'Deneme sonucu gir'));
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
    h('p.small.muted', `Haftalık ortalama · kesik çizgi hedef: ${goal} kelime/dk`, lastW ? (lastW.v >= goal ? ' · son hafta hedefte' : ` · son hafta ${goal - lastW.v} eksik`) : ''));
}
