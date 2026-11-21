// Bugünün görevleri (Bugün ekranı + bitiş ekranlarındaki "Sıradaki" düğmesi ortak)
import * as store from './store.js';
import { h } from './util.js';
import { week, dayRec, tick, taskList, newLimit, finalMode } from './plan.js';
import { dueCount, newQueue } from './srs.js';
import { mistakeToday } from './mistakes.js';

export const SEC_PER_CARD = 8;           // tekrar kartı ≈ 8 sn
export const NEW_VIEWS = 2;              // yeni kart ≈ 2 gösterim
export const cardMin = n => n ? Math.max(1, Math.ceil(n * SEC_PER_CARD / 60)) : 0;

const LABEL = { kart: 'Kart tekrarı', yeni: 'Yeni kelime', gramer: 'Gramer', hata: 'Hata tekrarı', okuma: 'Okuma', deneme: 'Deneme / kısa set' };

export async function todayTasks() {
  const w = await week();
  const r = dayRec();
  const busy = !!r.busy;
  const fin = await finalMode();
  const due = dueCount();
  const nl = busy ? 0 : await newLimit();
  const nq = busy ? 0 : (await newQueue()).length;
  const gN = busy ? 3 : store.settings().grammarCount;
  const hs = busy ? { ids: [], done: 0, total: 0 } : mistakeToday();
  if (hs.total && hs.done >= hs.total && !r.tasks?.hata) tick('hata');
  const tpl = Object.fromEntries((w.prog.daily?.normal || []).map(x => [x.key, x.min]).filter(([k]) => k));
  const min = { ...tpl, ...(w.min || {}) };
  const rr = dayRec();
  const T = {
    kart: { sub: due ? `${due} tekrar` : 'Bekleyen yok', go: '#/kartlar/calis', min: cardMin(due) },
    yeni: { sub: nq ? `${nq} yeni kart` : `bugünlük bitti (${rr.newDone || 0}/${nl})`, go: '#/kartlar/yeni', min: cardMin(nq * NEW_VIEWS) },
    gramer: { sub: `${gN} soru`, go: '#/gramer/gunluk', min: gN },
    hata: { label: `Hata tekrarı (${hs.done}/${hs.total})`, sub: 'eski yanlışlar · tüm bölümler', go: '#/gramer/hata', min: Math.max(1, Math.ceil(hs.total * 0.75)) },
    okuma: { sub: 'parça + bilinmeyen kelime', go: '#/okuma', min: min.okuma || 20 },
    deneme: { sub: w.mock?.title || 'çıkmış sınav ya da 8 soruluk set', go: mockHref(w.mock), min: 0 }
  };
  if (fin.on && rr.mock && !rr.tasks?.deneme) tick('deneme');
  const r3 = dayRec();
  return taskList(busy, fin.on).filter(k => k !== 'hata' || hs.total).filter(k => !(fin.on && k === 'yeni' && !nl)).map(k => ({
    key: k, label: T[k].label || LABEL[k], sub: T[k].sub, go: T[k].go, min: T[k].min, done: !!r3.tasks?.[k]
  }));
}

// Programdaki deneme bağlantısı (yarım → ilk 40 soru / 90 dk)
export const mockHref = m => !m?.exam ? '#/cikmis' : '#/cikmis/sinav/' + encodeURIComponent(m.exam) + (m.kind === 'tam' ? '' : '/yarim');

// Sıradaki görev düğmesi (bitiş ekranları için); yoksa Bugün
export async function nextTaskBtn(current) {
  const ts = await todayTasks().catch(() => []);
  const n = ts.find(t => !t.done && t.key !== current);
  return n ? h('a.btn.primary.wide.next-task', { href: n.go }, `Sıradaki: ${n.label} ›`) : h('a.btn.wide', { href: '#/bugun' }, 'Bugün ›');
}
