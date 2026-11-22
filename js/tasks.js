// Bugünün görevleri (Bugün ekranı + bitiş ekranlarındaki "Sıradaki" düğmesi ortak)
import * as store from './store.js';
import { h } from './util.js';
import { week, dayRec, tick, taskList, newLimit, finalMode } from './plan.js';
import { dueCount, newQueue } from './srs.js';
import { mistakeToday } from './mistakes.js';
import { kisaTitle, KISA } from './kisa.js';
import { dayKey, parseDay } from './util.js';
import { nextReading } from './readpick.js';

export const SEC_PER_CARD = 8;           // tekrar kartı ≈ 8 sn
export const NEW_VIEWS = 2;              // yeni kart ≈ 2 gösterim
export const cardMin = n => n ? Math.max(1, Math.ceil(n * SEC_PER_CARD / 60)) : 0;

const LABEL = { kart: 'Kart tekrarı', yeni: 'Yeni kelime', gramer: 'Gramer', hata: 'Hata tekrarı', okuma: 'Okuma', deneme: 'Deneme', kisa: 'Kısa deneme' };
const WD = { Paz: 0, Pzt: 1, Sal: 2, Çar: 3, Per: 4, Cum: 5, Cmt: 6 };
// Kısa deneme bağlantısı: yarım kalan varsa ona, yoksa yeni
const openKisa = size => store.all('progress').filter(p => p.id?.startsWith('exam:kisa') && p.kisa === size && p.startedAt && !p.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
export const kisaHref = size => { const o = openKisa(size); return o ? '#/deneme/sinav/' + encodeURIComponent(o.examId) : '#/deneme/yeni/' + size; };
// Bugün programda kısa deneme var mı? (haftanın "kisa" alanı + gün) → boyut
export function kisaToday(w, today = dayKey()) {
  const k = w?.kisa;
  if (!k || !KISA[k.size || 'mini']) return null;
  const wd = parseDay(today).getDay();
  return (k.day in WD ? WD[k.day] : 0) === wd ? (k.size || 'mini') : null;
}

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
  const kz = busy || fin.on ? null : kisaToday(w);
  const rd = busy ? null : await nextReading().catch(() => null);
  const T = {
    kart: { sub: due ? `${due} tekrar` : 'Bekleyen yok', go: '#/kartlar/calis', min: cardMin(due) },
    yeni: { sub: nq ? `${nq} yeni kart` : `bugünlük bitti (${rr.newDone || 0}/${nl})`, go: '#/kartlar/yeni', min: cardMin(nq * NEW_VIEWS) },
    gramer: { sub: `${gN} soru`, go: '#/gramer/gunluk', min: gN },
    hata: { label: `Hata tekrarı (${hs.done}/${hs.total})`, sub: 'eski yanlışlar · tüm bölümler', go: '#/gramer/hata', min: Math.max(1, Math.ceil(hs.total * 0.75)) },
    okuma: rr.tasks?.okuma && rr.readTitle ? { sub: rr.readTitle + ' · okundu', go: '#/okuma', min: rd?.min || min.okuma || 20 }
      : { sub: rd ? rd.title + (rd.gizli ? ' · kaynağım' : '') : 'parça + bilinmeyen kelime', go: rd?.href || '#/okuma', min: rd?.min || min.okuma || 20 },
    deneme: { sub: w.mock?.title || 'çıkmış sınav ya da 8 soruluk set', go: mockHref(w.mock), min: 0 },
    kisa: { label: kisaTitle(kz || 'mini'), sub: 'sınav gibi · çıkmış değil · ipucu yok', go: kisaHref(kz || 'mini'), min: KISA[kz || 'mini'].min }
  };
  // Son 14 gün: hafta içi deneme görevi = mini kısa deneme (programda o gün tam/yarım çıkmış yoksa)
  const wdN = parseDay(dayKey()).getDay();
  if (fin.on && wdN >= 1 && wdN <= 5 && !(w.mock && WD[w.mock.day] === wdN)) Object.assign(T.deneme, { label: kisaTitle('mini'), sub: 'sınav gibi · çıkmış değil', go: kisaHref('mini'), min: KISA.mini.min });
  if (fin.on && rr.mock && !rr.tasks?.deneme) tick('deneme');
  const r3 = dayRec();
  // Deneme günü (programdaki çıkmış deneme ya da kısa deneme bugün): ana liste kart tekrarı + deneme; gerisi isteğe bağlı
  const xm = !busy && !fin.on && w.mock && w.mock.day in WD && WD[w.mock.day] === wdN ? w.mock : null;
  if (xm) Object.assign(T.deneme, { label: xm.kind === 'tam' ? 'Tam deneme (180 dk)' : `Yarım deneme (${xm.n || 40} soru · 90 dk)`, sub: xm.title || 'çıkmış sınav', go: mockHref(xm), min: xm.kind === 'tam' ? 180 : 90, note: mockNote(xm) });
  const mockDay = !!(kz || xm);
  const keys = [...taskList(busy, fin.on), ...(xm ? ['deneme'] : []), ...(kz ? ['kisa'] : [])].filter(k => k !== 'hata' || hs.total).filter(k => !(fin.on && k === 'yeni' && !nl));
  return orderMockDay(keys, mockDay).map(k => ({
    key: k, label: T[k].label || LABEL[k], sub: T[k].sub, go: T[k].go, min: T[k].min, note: T[k].note || '', done: !!r3.tasks?.[k] || (k === 'deneme' && !!r3.mock),
    optional: mockDay && !MOCK_DAY_MAIN.includes(k)
  }));
}

// Saf: deneme günü sırası (deneme önce, sonra kart; diğerleri isteğe bağlı sonda)
export const MOCK_DAY_MAIN = ['deneme', 'kisa', 'kart'];
export function orderMockDay(keys, mockDay) {
  if (!mockDay) return keys;
  return [...MOCK_DAY_MAIN.filter(k => keys.includes(k)), ...keys.filter(k => !MOCK_DAY_MAIN.includes(k))];
}

// Tanı denemesi gibi programdaki denemenin tek satır açıklaması (program.json "note"; "Tanı" başlıklıda varsayılan)
export const TANI_NOTE = 'Seviyeni görmek için; sonuç önemli değil.';
export const mockNote = m => m?.note || (/^tanı/i.test(m?.title || '') ? TANI_NOTE : '');

// Programdaki deneme bağlantısı (yarım → ilk 40 soru / 90 dk)
export const mockHref = m => !m?.exam ? '#/cikmis' : '#/cikmis/sinav/' + encodeURIComponent(m.exam) + (m.kind === 'tam' ? '' : '/yarim');

// Sıradaki görev düğmesi (bitiş ekranları için); yoksa Bugün
export async function nextTaskBtn(current) {
  const ts = await todayTasks().catch(() => []);
  const n = ts.find(t => !t.done && t.key !== current);
  return n ? h('a.btn.primary.wide.next-task', { href: n.go }, `Sıradaki: ${n.label} ›`) : h('a.btn.wide', { href: '#/bugun' }, 'Bugün ›');
}
