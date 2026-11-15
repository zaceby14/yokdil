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
