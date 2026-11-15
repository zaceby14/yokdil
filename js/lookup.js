// Kelime önerisi: words.json + kartlar, sonra çevrimiçi kaynaklar (hata → sessiz)
import { wordIndex } from './data.js';
import * as store from './store.js';
import { lemmas } from './util.js';

export async function local(word) {
  const idx = await wordIndex();
  const cands = word.includes(' ') ? [word.toLowerCase()] : lemmas(word);
  const cards = store.all('cards');
  for (const c of cands) {
    const card = cards.find(x => (x.word || '').toLowerCase() === c);
    if (card) return { kind: 'card', lemma: c, card, entry: idx.get(c) || null };
  }
  for (const c of cands) if (idx.has(c)) return { kind: 'word', lemma: c, entry: idx.get(c) };
  return null;
}

async function getJSON(url, ms = 5000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}

export async function online(word) {
  if (!navigator.onLine) return {};
  const q = encodeURIComponent(word.toLowerCase());
  const [mm, dict] = await Promise.all([
    getJSON(`https://api.mymemory.translated.net/get?q=${q}&langpair=en|tr`),
    word.includes(' ') ? null : getJSON(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`)
  ]);
  const out = {};
  const tr = mm?.responseData?.translatedText;
  if (tr && !/MYMEMORY|QUERY LENGTH/i.test(tr) && tr.toLowerCase() !== word.toLowerCase()) out.tr = tr.toLowerCase();
  if (Array.isArray(dict) && dict[0]) {
    const m = dict[0].meanings || [];
    out.def = m.slice(0, 2).map(x => `(${x.partOfSpeech}) ${x.definitions?.[0]?.definition || ''}`).join(' · ');
    const syn = new Set();
    for (const x of m) { (x.synonyms || []).forEach(s => syn.add(s)); for (const d of x.definitions || []) (d.synonyms || []).forEach(s => syn.add(s)); }
    out.syn = [...syn].slice(0, 5);
  }
  return out;
}
