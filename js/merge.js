// Saf birleştirme fonksiyonları (DOM yok — node ile test edilir)

export const COLLECTIONS = ['cards', 'texts', 'grammarLog', 'mistakes', 'mocks', 'notes', 'days', 'settings', 'progress', 'sessions'];

// İki kaydı birleştir: updatedAt büyük olan kazanır; eşitlikte silinmiş (tombstone) kazanır, sonra a.
export function pickRecord(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = a.updatedAt || 0, tb = b.updatedAt || 0;
  if (tb > ta) return b;
  if (ta > tb) return a;
  if (b.deleted && !a.deleted) return b;
  return a;
}

export function mergeCollection(a = {}, b = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out[id] = pickRecord(a[id], b[id]);
  }
  return out;
}

// Tüm durumu birleştir. Bilinmeyen koleksiyonlar da korunur.
export function mergeState(a = {}, b = {}) {
  const out = {};
  const names = new Set([...COLLECTIONS, ...Object.keys(a), ...Object.keys(b)]);
  for (const n of names) {
    if (n.startsWith('_')) continue;
    out[n] = mergeCollection(a[n], b[n]);
  }
  return out;
}

// İki durum eşit mi? (gönderme gerekli mi kontrolü için)
export function sameState(a, b) {
  for (const n of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a?.[n] || {}, y = b?.[n] || {};
    const ids = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const id of ids) {
      if (!x[id] || !y[id]) return false;
      if ((x[id].updatedAt || 0) !== (y[id].updatedAt || 0) || !!x[id].deleted !== !!y[id].deleted) return false;
    }
  }
  return true;
}
