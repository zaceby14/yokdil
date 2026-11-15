// Alıştırma: tüm soru tipleri tek menüde (özgün içerik), tip başına ilerleme
import * as store from '../store.js';
import { drills, grammar, passages, seedUser } from '../data.js';
import { h, shuffle, TYPES } from '../util.js';
import { week } from '../plan.js';
import { answer, dueMistakes } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { dItem, gItem, pItem } from '../qbank.js';
import { soruTabs, lessonLink } from './hub.js';

// Tip → tüm öğe anahtarları
async function bank() {
  const out = {};
  const add = (t, key, make) => (out[t] ||= []).push({ key, make });
  for (const q of await grammar()) add('bosluk', q.id, () => gItem(q));
  for (const p of await passages()) (p.questions || []).forEach((_, i) => add('paragraf', `${p.id}#${i}`, () => pItem(p, i)));
  for (const d of await drills()) (d.items || []).forEach((_, i) => add(d.type, `${d.id}#${i}`, () => dItem(d, i)));
  return out;
}

export default async function render(root, [type]) {
  const b = await bank();
  const log = store.all('grammarLog');
  const seen = new Set(log.map(l => l.q));
  if (type) return session(root, type, b[type] || [], seen);
  const w = await week();
  const thisWeek = new Set(w.drills || []);
  const weak = new Set((await seedUser()).weakDrills || []);
  const due = dueMistakes().length;
  root.append(
    soruTabs('alistirma'),
    h('h2', 'Alıştırma'),
    due ? h('a.btn.wide', { href: '#/gramer/hata' }, `Hata kutusu · ${due} bekliyor`) : null,
    h('ul.list', Object.entries(TYPES).filter(([k]) => k !== 'diyalog').map(([k, v]) => {
      const items = b[k] || [];
      const done = items.filter(i => seen.has(i.key)).length;
      const pct = items.length ? Math.round(done / items.length * 100) : 0;
      return h('li' + (items.length ? '' : '.dim'), h('a', { href: items.length ? '#/alistirma/' + k : null },
        h('b', v), thisWeek.has(k) ? h('span.chip.ok.small', 'bu hafta') : null, weak.has(k) ? h('span.chip.bad.small', 'zayıf') : null,
        h('span.small.muted', `${done}/${items.length} · %${pct}`),
        h('span.prog', h('i', { style: `width:${pct}%` }))));
    }))
  );
}

function session(root, type, items, seen) {
  let pick;
  if (type === 'paragraf') {
    // Bir parça: henüz çözülmemiş ilk parça
    const groups = {};
    for (const i of items) (groups[i.key.split('#')[0]] ||= []).push(i);
    const gs = Object.values(groups);
    pick = gs.find(g => g.some(i => !seen.has(i.key))) || gs[0] || [];
  } else {
    const fresh = items.filter(i => !seen.has(i.key)), old = items.filter(i => seen.has(i.key));
    // Çok maddeli setleri (cloze) bölmeden sırayla al
    const ordered = type === 'bosluk' ? [...shuffle(fresh), ...shuffle(old)] : [...fresh, ...old];
    pick = ordered.slice(0, type === 'bosluk' ? 8 : 6);
    if (type !== 'bosluk' && pick.length) {
      const last = pick.at(-1).key.split('#')[0];
      pick.push(...ordered.slice(pick.length).filter(i => i.key.split('#')[0] === last));
    }
  }
  const el = h('div');
  root.append(h('a.btn.small', { href: '#/alistirma' }, '‹ Alıştırma'), h('h2', TYPES[type] || type), el);
  if (!pick.length) { el.append(h('p.muted', 'Soru yok')); return; }
  runQuiz(el, pick.map(i => i.make()), {
    extra: lessonLink,
    onAnswer: (it, ok) => answer(it.key, ok, it.info),
    onEnd: (_, box) => box.append(h('a.btn.wide', { href: '#/alistirma/' + type, onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Devam'))
  });
}
