// Yanlış cevaptan otomatik kart: kelime ağırlıklı sorularda doğru şık + seçilen yanlış şık
import * as store from './store.js';
import { uid, toast, lemmas } from './util.js';
import { wordIndex, enrich } from './data.js';
import { online } from './lookup.js';
import { STOP } from './vocab.js';


const BLANK = /-{2,}|_{3,}|…{1,}|\.{4,}/;

// Saf: şık metni → aday kelime/öbek (ya da null)
export function candidate(opt, coreHas = () => false, wordTopic = false) {
  const s = String(opt || '').trim().replace(/^[("'“]+|[)"'”.,;:!?]+$/g, '').trim();
  if (!s || /\d/.test(s)) return null;
  const parts = s.split(/\s+/);
  if (parts.length > 3) return null;
  if (!parts.every(p => /^[A-Za-z][A-Za-z'’-]*$/.test(p))) return null;
  const low = s.toLowerCase();
  if (parts.length === 1) return STOP.has(low) || low.length < 3 ? null : low;
  // Öbek: sadece çekirdek listede ya da kelime konusunda; dilbilgisi biçimi (has been done) değil
  if (coreHas(low)) return low;
  if (wordTopic && parts.some(p => !STOP.has(p.toLowerCase()))) return low;
  return null;
}

// Saf: soru kelime ağırlıklı mı?
export function wordy(it) {
  const t = it.info?.topic, d = it.info?.dtype;
  if (t === 'kelime' || d === 'cloze') return true;
  const opts = it.options || []; // bosluk dahil: şıklar tek kelime / ≤3 kelimelik öbek
  return opts.length > 0 && opts.every(o => String(o).trim().split(/\s+/).length <= 3);
}

// Saf: soru cümlesinde boşluğa doğru şıkkı yerleştir (cloze: (n) işaretli cümle)
export function fillContext(it) {
  const ans = String(it.options?.[it.answer] ?? '').trim();
  const q = String(it.q || '');
  const m = q.match(/^\s*\((\d+)\)\s*$/);
  if (m && it.stem) {
    const mark = `(${m[1]})`;
    const sents = String(it.stem).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [];
    const s = sents.find(x => x.includes(mark)) || '';
    return s.replace(mark, ans).replace(/\(\d+\)/g, '____').replace(/\s*-{2,}\s*/g, ' ').trim();
  }
  if (BLANK.test(q)) return q.replace(BLANK, ans).replace(/\s+/g, ' ').trim();
  return '';
}

async function meaning(word) {
  const idx = await wordIndex();
  for (const l of word.includes(' ') ? [word] : lemmas(word)) if (idx.has(l)) return { entry: idx.get(l), lemma: l };
  const en = await enrich(word).catch(() => null);
  const f = en?.family?.find(x => (x.w || '').toLowerCase() === word) || en?.family?.[0];
  return { entry: en?.core || null, lemma: en?.core ? en.core.word.toLowerCase() : word, tr: f?.tr || '' };
}

// Yanlış cevap: kartı olmayan kelimeleri ekle. Döner: eklenen kart sayısı. (Sıralı çalışır → çift kart olmaz)
let chain = Promise.resolve();
export function fromWrong(it, chosen, opts) {
  const p = chain.then(() => addFromWrong(it, chosen, opts));
  chain = p.catch(() => 0);
  return p;
}

async function addFromWrong(it, chosen, { quiet = false } = {}) {
  if (store.settings().autoAdd === false || !wordy(it)) return 0;
  const idx = await wordIndex();
  const wordTopic = it.info?.topic === 'kelime';
  const picks = [[it.answer, true], [chosen, false]];
  // Çıkmış (telifli) soru metni karta/senkrona girmez
  const ctx = it.info?.kind === 'cikmis' ? '' : fillContext(it);
  const correctW = String(it.options?.[it.answer] ?? '').trim();
  let n = 0;
  const cards = store.all('cards');
  for (const [k, isRight] of picks) {
    const w = candidate(it.options?.[k], x => idx.has(x), wordTopic);
    if (!w) continue;
    const m = await meaning(w);
    const word = m.entry ? m.entry.word : w;
    const low = word.toLowerCase();
    const ex = cards.find(c => (c.word || '').toLowerCase() === low || (m.entry && c.wid === m.entry.id));
    if (ex) {
      // "Biliyorum" dediği kelimede hata: kuyruğa geri al
      if (ex.state === 'known') { store.put('cards', { ...ex, state: 'new', front: Date.now(), ctx: ex.ctx || (isRight ? ctx : ''), tags: [...new Set([...(ex.tags || []), 'hata'])] }); n++; }
      continue;
    }
    const e = m.entry;
    const card = {
      id: e ? 'w:' + e.id : uid('c'), wid: e?.id || null, word, pos: e?.pos || '', tr: e?.tr || m.tr || '',
      syn: e?.syn || [], coll: e?.coll || '', ex: e?.ex || '', tags: ['hata'], source: 'Hata',
      ctx: isRight ? ctx : '', note: isRight ? '' : `Karıştırdın; doğrusu: ${correctW}`,
      state: 'new', createdAt: Date.now(), front: Date.now()
    };
    store.put('cards', card);
    cards.push(card);
    n++;
    if (!card.tr) fillOnline(card.id, word);
  }
  if (n && !quiet) toast(`+${n} kelime karta eklendi`);
  return n;
}

// Anlam yoksa çevrimiçi öneri (sessiz)
function fillOnline(id, word) {
  if (!navigator.onLine) return;
  online(word).then(o => {
    const c = store.get('cards', id);
    if (c && !c.tr && o?.tr) store.put('cards', { ...c, tr: o.tr, trAuto: true, syn: c.syn?.length ? c.syn : (o.syn || []) });
  }).catch(() => {});
}
