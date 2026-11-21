// Yanlış cevaptan otomatik kart: kelime ağırlıklı sorularda doğru şık + seçilen yanlış şık
import * as store from './store.js';
import { uid, toast, lemmas } from './util.js';
import { wordIndex, enrich } from './data.js';
import { STOP as STOP0, isFunctionWord, sameLemma } from './vocab.js';
// Gramer şıklarında çıkan işlev kelimeleri karta eklenmesin
const STOP = new Set([...STOP0, ...'either neither both whether such own other others another itself themselves himself herself whom whose whatever whichever whoever whenever wherever yet still even ever never been being having having done doing'.split(' ')]);


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
export function wordy(it, idx) {
  const t = it.info?.topic, d = it.info?.dtype;
  const opts = (it.options || []).map(o => Array.isArray(o) ? o.join(' / ') : String(o).trim());
  if (it.double || opts.some(o => o.includes('/'))) return false; // çift boşluk: dilbilgisi
  if (t === 'kelime') return true;
  if (!opts.length || !opts.every(o => o.split(/\s+/).length <= 3)) return false;
  // Şıklar işlev kelimesi ya da aynı kökün biçimleri (eat / eating / eaten) → gramer sorusu, kart açılmaz
  if (opts.filter(o => isFunctionWord(o, idx)).length >= 2) return false;
  for (let i = 0; i < opts.length; i++) for (let j = i + 1; j < opts.length; j++) if (sameLemma(opts[i], opts[j])) return false;
  return true;
}

// Saf: soru cümlesinde boşluğa doğru şıkkı yerleştir (cloze: (n) işaretli cümle)
export function fillContext(it) {
  const o = it.options?.[it.answer];
  const ans = (Array.isArray(o) ? o.join(' / ') : String(o ?? '')).trim();
  const q = String(it.q || '');
  const m = q.match(/^\s*\((\d+)\)\s*$/);
  if (m && it.stem) {
    const mark = `(${m[1]})`;
    const sents = String(it.stem).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || [];
    const s = sents.find(x => x.includes(mark)) || '';
    return s.replace(mark, ans).replace(/\(\d+\)/g, '____').replace(/\s*-{2,}\s*/g, ' ').trim();
  }
  // Çift boşluk: "x / y" → ilk boşluğa x, ikinciye y
  const parts = ans.split(/\s*\/\s*/);
  const nBlank = (q.match(new RegExp(BLANK.source, 'g')) || []).length;
  if (nBlank >= 2 && parts.length === nBlank) { let k = 0; return q.replace(new RegExp(BLANK.source, 'g'), () => parts[k++]).replace(/\s+/g, ' ').trim(); }
  if (BLANK.test(q)) return q.replace(BLANK, ans).replace(/\s+/g, ' ').trim();
  return '';
}

// Kök + anlam: words.json (lemma) → forms.json. Kök bulunamazsa çekimli biçim olduğu gibi kalır (inflected=true)
async function meaning(word) {
  const idx = await wordIndex();
  for (const l of word.includes(' ') ? [word] : lemmas(word)) if (idx.has(l)) return { entry: idx.get(l), lemma: l };
  const en = await enrich(word).catch(() => null);
  if (en?.core) return { entry: en.core, lemma: en.core.word.toLowerCase() };
  if (en?.key) {
    const f = en.family?.find(x => (x.w || '').toLowerCase() === en.key) || null;
    return { entry: null, lemma: en.key, tr: f?.tr || en.tr || '' };
  }
  return { entry: null, lemma: word, tr: '', inflected: lemmas(word).length > 1 };
}

// Yanlış cevap: kartı olmayan kelimeleri ekle. Döner: eklenen kart sayısı. (Sıralı çalışır → çift kart olmaz)
let chain = Promise.resolve();
export function fromWrong(it, chosen, opts) {
  const p = chain.then(() => addFromWrong(it, chosen, opts));
  chain = p.catch(() => 0);
  return p;
}

async function addFromWrong(it, chosen, { quiet = false } = {}) {
  if (store.settings().autoAdd === false) return 0;
  const idx = await wordIndex();
  if (!wordy(it, idx)) return 0;
  const wordTopic = it.info?.topic === 'kelime';
  const picks = [[it.answer, true], [chosen, false]];
  // Çıkmış (telifli) soru metni karta/senkrona girmez
  const ctx = it.info?.kind === 'cikmis' ? '' : fillContext(it);
  const correctW = String(it.options?.[it.answer] ?? '').trim();
  let n = 0;
  const cards = store.all('cards');
  for (const [k, isRight] of picks) {
    const w = candidate(it.options?.[k], x => idx.has(x), wordTopic);
    if (!w || isFunctionWord(w, idx)) continue;
    const m = await meaning(w);
    const word = m.entry ? m.entry.word : m.lemma || w;
    const low = word.toLowerCase();
    if (isFunctionWord(low, idx)) continue;
    // Aynı kökten kart varsa (eat ↔ eating) yenisi açılmaz
    const ex = cards.find(c => (c.word || '').toLowerCase() === low || (m.entry && c.wid === m.entry.id) ||
      (!low.includes(' ') && c.word && !c.word.includes(' ') && (lemmas(low).includes(c.word.toLowerCase()) || lemmas(c.word).includes(low))));
    if (ex) {
      // "Biliyorum" dediği kelimede hata: kuyruğa geri al
      if (ex.state === 'known') { store.put('cards', { ...ex, state: 'new', front: Date.now(), ctx: ex.ctx || (isRight ? ctx : ''), tags: [...new Set([...(ex.tags || []), 'hata'])] }); n++; }
      continue;
    }
    const e = m.entry;
    const tr0 = e?.tr || m.tr || '';
    if (!tr0) continue; // anlamı bulunamayan kelime / çekim biçimi kart olmaz
    const card = {
      id: e ? 'w:' + e.id : uid('c'), wid: e?.id || null, word, pos: e?.pos || '', tr: tr0,
      syn: e?.syn || [], coll: e?.coll || '', ex: e?.ex || '', tags: ['hata'], source: 'Hata',
      ctx: isRight ? ctx : '', note: isRight ? '' : `Karıştırdın; doğrusu: ${correctW}`,
      state: 'new', createdAt: Date.now(), front: Date.now()
    };
    store.put('cards', card);
    cards.push(card);
    n++;
  }
  if (n && !quiet) toast(`+${n} kelime karta eklendi`);
  return n;
}

