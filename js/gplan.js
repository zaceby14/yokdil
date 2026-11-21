// Günlük gramer seti planlama (saf fonksiyonlar: node ile test edilir)
import { LOW_TOPICS, TOPIC_W } from './util.js';

export const LEVEL_UP = 0.7, LEVEL_MIN_N = 3;

// Saf: konu bazında açık seviye. İlk görüşte 1; o seviyede doğruluk ≥ %70 (en az 3 soru) → bir üst seviye.
// logs: [{topic, level, correct, hint}] (ipucuyla doğru, seviye atlatmaz)
export function topicLevels(logs) {
  const acc = {};
  for (const l of logs) {
    if (!l.topic || !l.level) continue;
    const t = acc[l.topic] ||= {};
    const a = t[l.level] ||= [0, 0];
    a[1]++; if (l.correct && !l.hint) a[0]++;
  }
  const out = {};
  for (const [t, by] of Object.entries(acc)) {
    let lv = 1;
    while (lv < 3) { const a = by[lv]; if (a && a[1] >= LEVEL_MIN_N && a[0] / a[1] >= LEVEL_UP) lv++; else break; }
    out[t] = lv;
  }
  return out;
}

// Saf: günlük set. ctx: {cur:Set, prev:Set, weak:Set, seen:Map(id→correct), open:Set, levels, n, rnd}
export function pickDaily(qs, ctx) {
  const { cur = new Set(), prev = new Set(), weak = new Set(), seen = new Map(), open = new Set(), levels = {}, n = 8, rnd = Math.random } = ctx;
  const minLv = {};
  for (const q of qs) minLv[q.topic] = Math.min(minLv[q.topic] ?? 9, q.level || 1);
  const allowed = t => Math.max(levels[t] || 1, minLv[t] || 1);
  const pool = [];
  for (const q of qs) {
    if (open.has(q.id)) continue;
    const lv = q.level || 1, al = allowed(q.topic);
    if (lv > al) continue;
    let wt = (TOPIC_W[q.topic] || (LOW_TOPICS.includes(q.topic) ? 0.5 : 1)) * (cur.has(q.topic) ? 4 : prev.has(q.topic) ? 1.3 : 0.6);
    if (weak.has(q.topic)) wt *= 1.5;
    if (q.double || (String(q.q || '').match(/-{2,}/g) || []).length >= 2) wt *= 1.5;
    if (lv === al) wt *= 1.3;
    if (seen.get(q.id) === true) wt *= 0.25; else if (!seen.has(q.id)) wt *= 1.5;
    pool.push({ q, k: Math.pow(rnd(), 1 / wt) });
  }
  pool.sort((a, b) => b.k - a.k);
  const out = [];
  let low = 0;
  for (const { q } of pool) {
    if (out.length >= n) break;
    const isLow = LOW_TOPICS.includes(q.topic) && !cur.has(q.topic);
    if (isLow && low >= 1) continue;
    if (isLow) low++;
    out.push(q.id);
  }
  return out;
}

// Saf: konu çalışması sırası: L1 → L2 → L3 (her seviyenin içi karışık)
export function levelOrder(qs, rnd = Math.random) {
  return qs.map(q => ({ q, k: (q.level || 1) + rnd() * 0.99 })).sort((a, b) => a.k - b.k).map(x => x.q);
}
