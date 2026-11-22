// Okuma önerisi: özgün parçalar + gizli kaynak okumaları (seviye/okuma hızına göre, dönüşümlü)
import * as store from './store.js';
import { passages } from './data.js';
import { getPack } from './pack.js';

// Okuma hızı + doğruluk → önerilen seviye (saf)
export function suggestLevel(recs, maxL = 3) {
  const r = recs.filter(x => x.total).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 3);
  if (!r.length) return { level: 1, wpm: 0, acc: null };
  const wpm = Math.round(r.reduce((s, x) => s + (x.wpm || 0), 0) / r.length);
  const acc = r.reduce((s, x) => s + x.right, 0) / r.reduce((s, x) => s + x.total, 0);
  let level = r[0].level || 1;
  if (acc >= 0.8 && wpm >= 110) level++;
  else if (acc < 0.5) level--;
  return { level: Math.min(maxL, Math.max(1, level)), wpm, acc };
}
export const readRecs = () => store.all('progress').filter(x => x.kind === 'read');

// Fen dışı ("diğer") gizli okumalar öneriye girmez
export const isOther = r => /^di[gğ]er/i.test(String(r?.topic || '').trim());

// Saf: sıradaki parça. ps: özgün, rs: gizli; done: Set (özgün id / 'r:'+gizli id); lastGizli: son okuma gizli miydi
export function pickReading({ ps = [], rs = [], done = new Set(), recs = [], lastGizli = false }) {
  const maxL = Math.max(1, ...ps.map(p => p.level || 1), ...rs.map(r => +r.level || 1));
  const sg = suggestLevel(recs, maxL);
  const near = list => list.find(x => (+x.level || 1) === sg.level) || [...list].sort((a, b) => Math.abs((+a.level || 1) - sg.level) - Math.abs((+b.level || 1) - sg.level))[0] || null;
  const p = near(ps.filter(x => !done.has(x.id)));
  const r = near(rs.filter(x => !isOther(x) && !done.has('r:' + x.id)));
  const P = p && { href: '#/okuma/p/' + p.id, title: p.title, level: p.level || null, gizli: false, id: p.id };
  const R = r && { href: '#/okuma/g/' + encodeURIComponent(r.id), title: r.title || r.id, level: r.level || null, gizli: true, id: 'r:' + r.id };
  return { next: (lastGizli ? P || R : R || P) || null, sg };
}

export async function readingDone() {
  const done = new Set();
  for (const l of store.all('grammarLog')) if (l.kind === 'okuma' && l.q) done.add(l.q.startsWith('r:') ? l.q.slice(0, l.q.lastIndexOf(':')) : l.q.split('#')[0]);
  for (const r of readRecs()) if (r.id?.startsWith('read:r:')) done.add(r.id.slice(5));
  return done;
}

export async function nextReading() {
  const [ps, pack] = await Promise.all([passages(), getPack().catch(() => null)]);
  const recs = readRecs();
  const last = [...recs].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  return pickReading({ ps, rs: pack?.readings || [], done: await readingDone(), recs, lastGizli: !!last?.gizli }).next;
}
