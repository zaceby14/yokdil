// Kısa deneme (#/deneme): özgün sorulardan 20 / 40 soruluk sınav taklidi. Motor: çıkmış deneme ekranı (exams.js)
import * as store from '../store.js';
import { h, uid, fmtDate, dayKey, optText } from '../util.js';
import { grammar, drills, passages } from '../data.js';
import { KISA, KISA_SIZES, poolsOf, buildKisa, lastSeenOf, recentUnits } from '../kisa.js';
import { SEC_ORDER } from '../strategy.js';
import { gItem } from '../qbank.js';
import { runExam, examResult, examWrong } from './exams.js';
import { soruTabs } from './hub.js';

const DEF = 'kisadef:';
export const kisaDefs = () => store.all('progress').filter(p => p.id?.startsWith(DEF));
// Yarım kalan kısa deneme (boyuta göre)
export const openKisa = size => store.all('progress').filter(p => p.id?.startsWith('exam:kisa') && p.kisa && p.startedAt && !p.done && (!size || p.kisa === size))
  .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
export const kisaName = size => `Kısa deneme · ${KISA[size]?.label || 'Mini'} (${KISA[size]?.n || 20} soru)`;
const SHORT = { bosluk: 'boşluk', cloze: 'cloze', tamamlama: 'cümle tamamlama', 'en-tr': 'çeviri', 'tr-en': 'çeviri', paragraf: 'paragraf', ilgisiz: 'ilgisiz', okuma: 'okuma' };
export function breakdown(size) {
  const m = {};
  for (const s of KISA[size].plan) { const k = SHORT[s.sec]; m[k] = (m[k] || 0) + s.units * s.w; }
  return Object.entries(m).map(([k, n]) => `${n} ${k}`).join(' · ');
}

async function content() {
  const [g, d, p] = await Promise.all([grammar(), drills(), passages()]);
  return { grammar: g, drills: d, passages: p };
}

// Yeni kısa deneme tanımı (yalnız birim kimlikleri; senkrona girer, metin yok)
export async function createKisa(size = 'mini') {
  const pools = poolsOf(await content());
  const lastSeen = lastSeenOf(store.all('grammarLog'), store.all('progress').filter(x => x.kind === 'read'));
  const b = buildKisa(pools, size, { lastSeen, recent: recentUnits(kisaDefs()) });
  const id = uid('kisa-');
  store.put('progress', { id: DEF + id, kind: 'kisadef', examId: id, size, units: b.units.map(u => ({ sec: u.sec, id: u.id })), createdAt: Date.now(), day: dayKey() });
  return id;
}

// Tanım → sanal sınav nesnesi (exams.js motoru için)
export async function kisaExam(id) {
  const def = store.get('progress', DEF + id);
  if (!def || !KISA[def.size]) return null;
  const c = await content();
  const G = new Map(c.grammar.map(x => [x.id, x])), D = new Map(c.drills.map(x => [x.id, x])), P = new Map(c.passages.map(x => [x.id, x]));
  const units = [...(def.units || [])].sort((a, b) => SEC_ORDER.indexOf(a.sec) - SEC_ORDER.indexOf(b.sec));
  const questions = [], groups = [];
  let n = 0;
  for (const u of units) {
    if (G.has(u.id)) {
      const q = G.get(u.id), it = gItem(q);
      questions.push({ n: ++n, type: 'bosluk', q: it.q, options: it.options, answer: it.answer, explain: it.explain || '', topic: q.topic || '', key: it.key, info: it.info });
    } else if (D.has(u.id)) {
      const d = D.get(u.id);
      const info = { kind: 'drill', topic: d.topic || '', dtype: d.type };
      if (d.type === 'cloze') {
        groups.push({ id: d.id, text: d.stem });
        d.items.forEach((x, i) => questions.push({ n: ++n, type: 'cloze', group: d.id, q: x.q, options: (x.options || []).map(optText), answer: x.answer, explain: x.explain || '', topic: d.topic || '', key: `${d.id}#${i}`, info }));
      } else {
        const x = d.items[0];
        questions.push({ n: ++n, type: d.type, q: d.stem, options: (x.options || []).map(optText), answer: x.answer, explain: x.explain || '', topic: d.topic || '', key: `${d.id}#0`, info });
      }
    } else if (P.has(u.id)) {
      const p = P.get(u.id);
      groups.push({ id: p.id, text: p.text });
      p.questions.forEach((x, k) => questions.push({ n: ++n, type: 'paragraf', group: p.id, q: x.q, options: (x.options || []).map(optText), answer: x.answer, explain: x.explain || '', topic: p.topic || '',
        key: `${p.id}#${k}`, info: { kind: 'okuma', topic: p.topic || '', dtype: 'paragraf' } }));
    }
  }
  if (!questions.length) return null;
  return { id, title: kisaName(def.size), kisa: { size: def.size }, durationMin: KISA[def.size].min, full: true, questions, groups, date: def.day };
}

export default async function render(root, [mode, id, arg]) {
  if (mode === 'yeni') {
    const size = KISA[id] ? id : 'mini';
    const o = openKisa(size);
    // Yanlışlıkla dokununca süre başlamasın: yeni denemede tek onay (Kısa deneme ekranındaki "Başla" doğrudan gelir)
    if (!o && arg !== 'basla' && arg !== 'bastan') {
      const c = KISA[size];
      root.append(h('a.btn.small', { href: '#/deneme' }, '‹ Deneme'), h('h2', kisaName(size)),
        h('section.card.kisa-confirm', h('p', h('b', `${c.n} soru · ${c.min} dk`), ' · ipucu yok'), h('p.small.muted', 'Başlayınca süre işler; sayfadan çıkınca durur.'),
          h('a.btn.primary.wide.big-btn.kisa-go', { href: `#/deneme/yeni/${size}/basla` }, 'Başla')));
      return;
    }
    if (o && arg === 'bastan') store.del('progress', o.id);
    const nid = o && arg !== 'bastan' ? o.examId : await createKisa(size);
    location.replace('#/deneme/sinav/' + encodeURIComponent(nid));
    return;
  }
  if (mode === 'sinav' || mode === 'sonuc' || mode === 'yanlis') {
    const e = await kisaExam(id);
    if (e) return mode === 'sinav' ? runExam(root, e, arg) : mode === 'sonuc' ? examResult(root, e) : examWrong(root, e, arg);
  }
  return home(root);
}

function home(root) {
  const mocks = store.all('mocks').filter(m => m.kind === 'kisa').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0));
  root.append(soruTabs('deneme'), h('h2', 'Kısa deneme'),
    h('p.small.muted', 'Özgün sorular (çıkmış değil) · YÖKDİL oranında · ipucu yok'),
    ...KISA_SIZES.map(size => {
      const c = KISA[size], o = openKisa(size), n = o ? Object.keys(o.answers || {}).length : 0;
      return h('section.card.kisa-card', { 'data-size': size },
        h('b', `${c.label} · ${c.n} soru · ${c.min} dk`), h('div.small.muted', breakdown(size)),
        h('div.row',
          h('a.btn.primary.grow.kisa-start', { href: '#/deneme/yeni/' + size + (o ? '' : '/basla') }, o ? `Devam et (${n} cevap)` : 'Başla'),
          o ? h('a.btn', { href: `#/deneme/yeni/${size}/bastan`, onclick: ev => { if (!confirm('Yarım kalan deneme silinsin, yenisi başlasın mı?')) ev.preventDefault(); } }, 'Yeni') : null));
    }),
    h('p.small.muted', 'Süre bitince kendiliğinden biter. Sonuç: doğru / soru (sınav puanı değil). Aynı soru son 3 kısa denemede tekrar gelmez.'),
    mocks.length ? h('h3', 'Geçmiş') : null,
    mocks.length ? h('ul.list.compact.kisa-hist', mocks.slice(0, 10).map(m => {
      const done = store.get('progress', 'exam:' + m.examId)?.done && store.get('progress', DEF + m.examId);
      return h('li', done ? h('a.grow', { href: '#/deneme/sonuc/' + encodeURIComponent(m.examId) }, `${fmtDate(m.date)} · ${KISA[m.size]?.label || ''}`) : h('span.grow', `${fmtDate(m.date)} · ${KISA[m.size]?.label || ''}`),
        h('b', `${m.right ?? '?'}/${m.n ?? '?'}`), h('span.small.muted', ` %${m.score || 0}`));
    })) : null);
}
