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

// Gizli okuma (paket.readings): {id, title, source, topic, level, text, tr?, glossary?[{w,tr}], questions?[{type:'mc'|'tf', q, options, answer, explain, keySource}]}
// Bozuk okuma/soru atlanır (sınavları bozmaz). tf: şık yoksa Doğru/Yanlış; answer true/false da olur.
export function cleanReadings(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (!r || !r.id || typeof r.text !== 'string' || !r.text.trim()) continue;
    const qs = (Array.isArray(r.questions) ? r.questions : []).map(q => {
      if (!q || !q.q) return null;
      const tf = q.type === 'tf';
      const options = Array.isArray(q.options) && q.options.length >= 2 ? q.options.slice(0, 5).map(String) : tf ? ['Doğru', 'Yanlış'] : null;
      const answer = typeof q.answer === 'boolean' ? (q.answer ? 0 : 1) : +q.answer;
      if (!options || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      return { ...q, type: tf ? 'tf' : 'mc', options, answer };
    }).filter(Boolean);
    out.push({ ...r, id: String(r.id), questions: qs });
  }
  return out;
}

// Doğrula: {version, exams:[{id, questions:[{n, q, options[5], answer}]}], readings?:[…]}
export function validate(p) {
  if (p && !Array.isArray(p.exams) && Array.isArray(p.readings)) p = { ...p, exams: [] };
  if (!p || !Array.isArray(p.exams)) throw new Error('exams listesi yok');
  for (const e of p.exams) {
    if (!e.id || !Array.isArray(e.questions)) throw new Error('Sınav kimliği/soruları eksik');
    for (const q of e.questions) {
      if (q.n == null || !Array.isArray(q.options) || typeof q.answer !== 'number') throw new Error(`${e.id}: soru ${q.n ?? '?'} hatalı`);
    }
  }
  return p;
}

// Yeni paketi mevcutla birleştir (aynı sınav/okuma id → yenisi).
// src='gizli': gizli repodan gelen paket; önceki gizli sınavların/okumaların yerini alır, elle yüklenenler kalır.
export async function savePack(p, src = 'dosya') {
  p = validate(p);
  const cur = (await getPack()) || { version: 1, exams: [] };
  const keep = src === 'gizli' ? cur.exams.filter(e => e._src !== 'gizli') : cur.exams;
  const map = new Map(keep.map(e => [e.id, e]));
  for (const e of p.exams) map.set(e.id, { ...e, _src: src });
  const rkeep = (cur.readings || []).filter(r => src !== 'gizli' || r._src !== 'gizli');
  const rmap = new Map(rkeep.map(r => [r.id, r]));
  for (const r of cleanReadings(p.readings)) rmap.set(r.id, { ...r, _src: src });
  const next = { version: p.version || 1, exams: [...map.values()], readings: [...rmap.values()], savedAt: Date.now() };
  await tx('readwrite', s => s.put(next, KEY));
  cache = next;
  return next;
}

export async function clearPack() {
  await tx('readwrite', s => s.delete(KEY));
  cache = null;
}

export async function reading(id) { return (await getPack())?.readings?.find(r => r.id === id) || null; }
export async function exam(id) { return (await getPack())?.exams.find(e => e.id === id) || null; }

// Grup metni (paragraf/cloze)
export const groupOf = (e, q) => q.group ? (e.groups || []).find(g => g.id === q.group) : null;
