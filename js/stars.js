// Kelime yıldızı (1–5): data/stars.json → { v, method, words: { lemma: n } }. Dosya yoksa özellik gizli.
import { loadData } from './data.js';
import { h, toast, lemmas } from './util.js';

export const STAR_TIP = 'Sınavda ne sık çıktığı (çıkmış YDS/YÖKDİL sorularına göre; 5 = çok sık)';
let map = null;
let loading = null;

const norm = w => String(w || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();

// Saf: veri → Map (bozuk / eksik veri → boş Map)
export function parseStars(d) {
  const m = new Map();
  const ws = d && typeof d === 'object' && d.words && typeof d.words === 'object' ? d.words : null;
  if (ws) for (const [k, v] of Object.entries(ws)) { const n = Math.round(+v); if (n >= 1 && n <= 5) m.set(norm(k), n); }
  return m;
}

export function loadStars() {
  return loading ||= loadData('stars', null).then(d => (map = parseStars(d)));
}

// Test / node için: haritayı doğrudan ver
export function setStars(d) { map = d instanceof Map ? d : parseStars(d); loading = Promise.resolve(map); }

export const hasStars = () => !!map?.size;

// Kelimenin yıldızı; bilinmiyorsa null. Önce tam eşleşme, sonra basit kök (studies → study)
export function starOf(word, m = map) {
  if (!m?.size) return null;
  const w = norm(word);
  if (!w) return null;
  if (m.has(w)) return m.get(w);
  if (w.includes(' ')) return null;
  for (const l of lemmas(w)) if (m.has(l)) return m.get(l);
  return null;
}

// ★★★★☆ — tap: kısa açıklama. tag 'button' (dokunulabilir) ya da 'span' (link içinde)
export function starsEl(word, { tag = 'button' } = {}) {
  const n = starOf(word);
  if (n == null) return null;
  const label = `${n}/5 yıldız: ${STAR_TIP}`;
  const kids = [1, 2, 3, 4, 5].map(i => h('i' + (i <= n ? '.on' : ''), '★'));
  if (tag !== 'button') return h('span.stars', { title: label, 'aria-label': label, 'data-n': n }, kids);
  return h('button.stars', {
    type: 'button', title: label, 'aria-label': label, 'data-n': n,
    onclick: e => { e.preventDefault(); e.stopPropagation(); toast(STAR_TIP); }
  }, kids);
}

// Tek satır (kart ön yüzü, tarama): yıldız yoksa null
export const starRow = word => { const s = starsEl(word); return s ? h('div.starrow', s) : null; };
