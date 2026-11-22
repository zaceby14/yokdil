// Hata nedeni: yanlış/boş soruya tek dokunuşla neden (aids.errorReasons). Kayıt: reasons koleksiyonu (id = soru anahtarı)
import * as store from './store.js';
import { aids } from './data.js';
import { h, dayKey } from './util.js';
import { reasonCounts } from './strategy.js';

export async function reasonList() {
  const a = await aids().catch(() => null);
  return (Array.isArray(a?.errorReasons) ? a.errorReasons : []).filter(r => r && r.id && r.label);
}

// Çiplerde kısa ad (veri kimlikleri aynı; uzun ad dokununca ipucu olarak)
export const REASON_SHORT = { kelime: 'Kelime', gramer: 'Gramer', sure: 'Süre', dikkat: 'Dikkat', 'iki-sik': 'İki şık', metin: 'Metin' };
export const REASON_MAIN = ['kelime', 'gramer', 'sure'];
// Saf: ana çipler (Kelime · Gramer · Süre) + "Diğer" altındakiler
export function splitReasons(list) {
  const main = REASON_MAIN.map(id => list.find(r => r.id === id)).filter(Boolean);
  return { main: main.length ? main : list.slice(0, 3), more: list.filter(r => !(main.length ? main : list.slice(0, 3)).includes(r)) };
}

// Çip satırı. list: errorReasons; meta: {src, dtype, topic}; onChange: seçim değişince
// Görünen: 3 ana çip + "Diğer ▸" (dikkat, iki şık, metin). Seçili neden "Diğer"deyse açık gelir.
export function reasonChips(list, key, meta = {}, onChange) {
  if (!list?.length) return null;
  const row = h('div.reasons', { role: 'group', 'aria-label': 'Hata nedeni' });
  const { main, more } = splitReasons(list);
  let showMore = false;
  const draw = () => {
    const cur = store.get('reasons', key)?.reason;
    if (more.some(r => r.id === cur)) showMore = true;
    row.innerHTML = '';
    const chip = r => h('button.chip.reason' + (cur === r.id ? '.on' : ''), {
      type: 'button', 'aria-pressed': cur === r.id ? 'true' : 'false', title: r.label, 'data-id': r.id,
      onclick: ev => {
        ev.stopPropagation();
        if (cur === r.id) store.del('reasons', key);
        else store.put('reasons', { id: key, reason: r.id, at: Date.now(), day: dayKey(), ...meta });
        draw(); onChange?.();
      }
    }, REASON_SHORT[r.id] || r.label);
    row.append(h('span.small.muted', 'Neden?'), ...main.map(chip),
      ...(more.length && !showMore ? [h('button.chip.reason-more', { type: 'button', onclick: ev => { ev.stopPropagation(); showMore = true; draw(); } }, 'Diğer ▸')] : []),
      ...(showMore ? more.map(chip) : []));
  };
  draw();
  return row;
}

// Sayım çubukları (dağılım) + en sık nedenin tavsiyesi. keys verilirse yalnız o sorular.
export function reasonSummary(list, keys) {
  const set = keys ? new Set(keys) : null;
  const recs = store.all('reasons').filter(r => !set || set.has(r.id));
  const rows = reasonCounts(recs, list);
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.n)), total = rows.reduce((a, r) => a + r.n, 0);
  const top = rows[0];
  return h('div.reason-sum',
    h('div.cbars', rows.map(r => h('div.cbar', h('span.cbar-l', r.label), h('span.cbar-t', h('i', { style: `width:${Math.max(6, r.n / max * 100).toFixed(0)}%` })), h('b.cbar-n', r.n)))),
    h('p.small.muted', `${total} işaretli hata`),
    top.advice ? h('div.note.reason-advice', h('b', `En sık: ${top.label}. `), top.advice) : null);
}
