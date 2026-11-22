// Oturum içi anlık uyum (saf karar + küçük durum). Denemelerde kullanılmaz.
// - Yanlış → aynı kuraldan bir pekiştirme sorusu 2 soru sonra (aynı ya da daha kolay seviye)
// - Üst üste 3 doğru → sıradaki soru (aynı konuda daha zor soru varsa) bir seviye zor
// - Oturumda en fazla 3 ek soru; her uyarlama ekranda kısa bir notla görünür
import { keyOf } from './warm.js';
import { topicName } from './util.js';

export const ADAPT_MAX = 3, ADAPT_GAP = 2, STREAK_UP = 3;

// Saf: havuzdan soru seç. pool: [{key, k, level, make}] · used: Set(key) · seen: Map(key→son doğru mu)
export function pickFrom(pool, k, { minLv = 1, maxLv = 9, used = new Set(), seen = new Map() } = {}) {
  const c = (pool || []).filter(p => p.k === k && !used.has(p.key) && (p.level || 1) >= minLv && (p.level || 1) <= maxLv);
  if (!c.length) return null;
  // önce hiç görülmemiş, sonra yanlış yapılmış, en son doğru bilinen; seviye yakın olan önce
  const r = p => (seen.has(p.key) ? (seen.get(p.key) ? 2 : 1) : 0);
  return c.sort((a, b) => r(a) - r(b) || Math.abs((a.level || 1) - maxLv) - Math.abs((b.level || 1) - maxLv) || String(a.key).localeCompare(String(b.key)))[0];
}

// Uyarlayıcı: pool + seen + levels() (cevaptan sonra konu seviyeleri) → after(items, i, ok) mutasyonu + not
export function makeAdapter(pool, { seen = new Map(), levels = null, keyFn = it => keyOf(it?.info) } = {}) {
  let streak = 0, extras = 0;
  const lv0 = levels ? { ...levels() } : {};
  const sum = { up: new Set(), wrong: new Set() };
  const levelOfItem = it => it?.info?.level || pool.find(p => p.key === it?.key)?.level || 1;
  return {
    sum,
    after(items, i, ok) {
      const it = items[i];
      const k = keyFn(it);
      const used = new Set(items.map(x => x.key));
      const notes = [];
      if (levels && k) {
        const now = levels()[k] || 1;
        if (now > (lv0[k] || 1)) { lv0[k] = now; sum.up.add(k); notes.push(`Seviye ${now}/3'e geçtin: ${topicName(k)} — sorular zorlaşıyor.`); }
      }
      if (!ok) {
        streak = 0;
        if (k) sum.wrong.add(k);
        if (k && extras < ADAPT_MAX) {
          const lv = levelOfItem(it);
          const p = pickFrom(pool, k, { maxLv: lv, used, seen }) || pickFrom(pool, k, { maxLv: lv + 1, used, seen });
          if (p) {
            const pos = Math.min(i + 1 + ADAPT_GAP, items.length);
            items.splice(pos, 0, { ...p.make(), adapt: 'pekistir' });
            extras++;
            notes.push(pos < i + 1 + ADAPT_GAP ? 'Bu kuraldan bir pekiştirme sorusu sonda gelecek.' : 'Bu kuraldan bir pekiştirme sorusu 2 soru sonra gelecek.');
          }
        }
      } else {
        streak++;
        if (streak >= STREAK_UP && i + 1 < items.length) {
          const nx = items[i + 1], nk = keyFn(nx), nl = levelOfItem(nx);
          const p = nk && !nx.adapt ? pickFrom(pool, nk, { minLv: nl + 1, maxLv: 3, used, seen }) : null;
          if (p) { items[i + 1] = { ...p.make(), adapt: 'zor' }; streak = 0; notes.push(`${STREAK_UP} doğru üst üste: sıradaki soru bir seviye zor.`); }
        }
      }
      return notes.join(' ');
    }
  };
}

// Set sonu tek satır: "Yarın: …"
export function tomorrowLine(sum) {
  const parts = [...sum.wrong].slice(0, 2).map(k => topicName(k) + ' tekrar');
  for (const k of sum.up) if (!sum.wrong.has(k)) parts.push(topicName(k) + ' daha zor');
  return parts.length ? 'Yarın: ' + parts.slice(0, 3).join(' · ') : '';
}
