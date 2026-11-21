// İçerik dosyaları: data/X.json, yoksa data/dev-sample/X.json
const cache = {};
export const usedSample = new Set();

async function tryFetch(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

export function loadData(name, fallback) {
  return cache[name] ||= (async () => {
    try { return await tryFetch(`data/${name}.json`); }
    catch {
      try { const d = await tryFetch(`data/dev-sample/${name}.json`); usedSample.add(name); return d; }
      catch { return fallback; }
    }
  })();
}

export const words = () => loadData('words', []);
export const grammar = () => loadData('grammar', []);
export const passages = () => loadData('passages', []);
export const drills = () => loadData('drills', []);
export const seedUser = () => loadData('seed-user', { cards: [], weakTopics: [], grammarNotes: [] });
export const program = () => loadData('program', { start: '2026-11-16', exam: '2027-02-28', apply: ['2027-01-12', '2027-01-20'], weeks: [] });

export const lessons = () => loadData('lessons', []);
export const forms = () => loadData('forms', {});

// Gramer kolaylaştırıcıları (karar ağacı, kutup kartları…). Örnek dosya yalnız geliştirmede gösterilir.
const isDev = () => typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
export async function aids() {
  const a = await loadData('aids', null);
  if (!a || typeof a !== 'object' || (usedSample.has('aids') && !isDev())) return null;
  return a;
}

// Kelimenin örnekleri ve diğer halleri (forms.json + words.json), basit kök eşleştirme
export async function enrich(word) {
  const w = (word || '').trim().toLowerCase();
  if (!w) return null;
  const [fm, idx] = await Promise.all([forms(), wordIndex()]);
  const cands = [w];
  for (const [re, rep] of [[/ies$/, 'y'], [/es$/, ''], [/s$/, ''], [/ied$/, 'y'], [/ed$/, ''], [/ed$/, 'e'], [/ing$/, ''], [/ing$/, 'e'], [/ly$/, '']])
    if (re.test(w)) cands.push(w.replace(re, rep));
  for (const k of cands) {
    const f = fm[k], c = idx.get(k);
    if (f || c) return { key: k, ...(f || {}), core: c || null };
  }
  return null;
}

export function loadAll() {
  return Promise.all([words(), grammar(), passages(), drills(), seedUser(), program(), lessons()]);
}

// Kelime indeksi (küçük harf → kayıt)
let widx = null;
export async function wordIndex() {
  if (widx) return widx;
  const list = await words();
  widx = new Map();
  for (const w of list) if (w?.word) widx.set(w.word.toLowerCase(), w);
  return widx;
}
