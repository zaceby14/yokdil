// Hata nedeni: yanlış/boş soruya tek dokunuşla neden (aids.errorReasons). Kayıt: reasons koleksiyonu (id = soru anahtarı)
import * as store from './store.js';
import { aids } from './data.js';
import { h, dayKey } from './util.js';
import { reasonCounts } from './strategy.js';

export async function reasonList() {
  const a = await aids().catch(() => null);
  return (Array.isArray(a?.errorReasons) ? a.errorReasons : []).filter(r => r && r.id && r.label);
}

// Çip satırı. list: errorReasons; meta: {src, dtype, topic}; onChange: seçim değişince
export function reasonChips(list, key, meta = {}, onChange) {
  if (!list?.length) return null;
  const row = h('div.reasons', { role: 'group', 'aria-label': 'Hata nedeni' });
  const draw = () => {
    const cur = store.get('reasons', key)?.reason;
    row.innerHTML = '';
    row.append(h('span.small.muted', 'Neden?'), ...list.map(r => h('button.chip.reason' + (cur === r.id ? '.on' : ''), {
      type: 'button', 'aria-pressed': cur === r.id ? 'true' : 'false', title: r.advice || '',
      onclick: ev => {
        ev.stopPropagation();
        if (cur === r.id) store.del('reasons', key);
        else store.put('reasons', { id: key, reason: r.id, at: Date.now(), day: dayKey(), ...meta });
        draw(); onChange?.();
      }
    }, r.label)));
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
