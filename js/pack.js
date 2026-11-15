// Çıkmış soru paketi: yalnızca bu cihazın IndexedDB'sinde. Senkrona/repoya GİRMEZ.
const DB = 'yokdil-pack', ST = 'packs', KEY = 'main';
let cache;

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ST);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, f) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(ST, mode);
    const req = f(t.objectStore(ST));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export async function getPack() {
  if (cache !== undefined) return cache;
  try { cache = (await tx('readonly', s => s.get(KEY))) || null; } catch { cache = null; }
  return cache;
}

// Doğrula: {version, exams:[{id, questions:[{n, q, options[5], answer}]}]}
export function validate(p) {
  if (!p || !Array.isArray(p.exams)) throw new Error('exams listesi yok');
  for (const e of p.exams) {
    if (!e.id || !Array.isArray(e.questions)) throw new Error('Sınav kimliği/soruları eksik');
    for (const q of e.questions) {
      if (q.n == null || !Array.isArray(q.options) || typeof q.answer !== 'number') throw new Error(`${e.id}: soru ${q.n ?? '?'} hatalı`);
    }
  }
  return p;
}

// Yeni paketi mevcutla birleştir (aynı sınav id → yenisi)
export async function savePack(p) {
  validate(p);
  const cur = (await getPack()) || { version: 1, exams: [] };
  const map = new Map(cur.exams.map(e => [e.id, e]));
  for (const e of p.exams) map.set(e.id, e);
  const next = { version: p.version || 1, exams: [...map.values()], savedAt: Date.now() };
  await tx('readwrite', s => s.put(next, KEY));
  cache = next;
  return next;
}

export async function clearPack() {
  await tx('readwrite', s => s.delete(KEY));
  cache = null;
}

export async function exam(id) { return (await getPack())?.exams.find(e => e.id === id) || null; }

// Grup metni (paragraf/cloze)
export const groupOf = (e, q) => q.group ? (e.groups || []).find(g => g.id === q.group) : null;
