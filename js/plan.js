// Program hesapları: hafta, faz, günlük limitler, seri
import { program, seedUser } from './data.js';
import * as store from './store.js';
import { dayKey, diffDays, addDays, parseDay } from './util.js';
import { isFinal, finalNewLimit } from './strategy.js';

export async function week(today = dayKey()) {
  const p = await program();
  const d = diffDays(p.start, today);
  const n = Math.min(Math.max(Math.floor(d / 7) + 1, 1), Math.max(p.weeks.length, 1));
  const w = p.weeks.find(x => x.n === n) || p.weeks[n - 1] || { n, phase: 'Temel', newWords: 15, grammar: [], drills: [], goal: '' };
  return { ...w, n, beforeStart: d < 0, daysToStart: -d, prog: p };
}

export async function daysToExam(today = dayKey()) {
  const p = await program();
  return diffDays(today, p.exam);
}

// Son 14 gün modu (Ayarlar'dan kapatılabilir). FINAL.on açılışta hesaplanır (eşzamanlı kullanım için).
export const FINAL = { on: false, left: 999 };
export async function finalMode(today = dayKey()) {
  const left = await daysToExam(today);
  const on = store.settings().finalMode !== false && isFinal(left);
  FINAL.on = on; FINAL.left = left;
  return { on, left };
}

// Program / ayar limiti (son 14 gün kısıtı olmadan)
export async function baseNewLimit() {
  const s = store.settings();
  if (s.newLimit != null && s.newLimit !== '') return Number(s.newLimit);
  return (await week()).newWords ?? 15;
}
export async function newLimit() {
  const base = await baseNewLimit();
  const f = await finalMode();
  return f.on ? finalNewLimit(base, f.left) : base;
}

export function dayRec(key = dayKey()) {
  return store.get('days', key) || { id: key, tasks: {}, busy: false };
}

export function updateDay(fields, key = dayKey()) {
  const r = dayRec(key);
  return store.put('days', { ...r, ...fields, id: key });
}

export function bumpDay(field, n = 1, key = dayKey()) {
  const r = dayRec(key);
  return store.put('days', { ...r, id: key, [field]: (r[field] || 0) + n });
}

export function tick(task, val = true, key = dayKey()) {
  const r = dayRec(key);
  store.put('days', { ...r, id: key, tasks: { ...(r.tasks || {}), [task]: val } });
}

// Görev anahtarları (Bugün sırası). 'hata' yalnız bugünkü hata seti doluysa görünür (tasks.js)
// Son 14 gün: tekrar + hata + deneme ağırlıklı (okuma görevi yok; yeni kelime limit 0 ise gizlenir)
export const taskList = (busy, final) => busy ? ['kart', 'gramer'] : final ? ['kart', 'hata', 'deneme', 'gramer', 'yeni'] : ['kart', 'yeni', 'gramer', 'hata', 'okuma'];

export function dayDone(r) {
  if (!r) return false;
  return taskList(r.busy, r.final).filter(t => t !== 'hata' || (r.hset || []).length).filter(t => !(r.final && t === 'yeni'))
    .every(t => r.tasks?.[t] || (t === 'deneme' && r.mock));
}

// Saf: anlamlı çalışma günü mü? (≥10 dk odak, ≥1 görev ya da deneme)
export const FOCUS_MIN = 10;
export const activeDay = (d, mockDays) => !!d && (Object.values(d.tasks || {}).some(Boolean) || (d.focusMin || 0) >= FOCUS_MIN || !!d.mock) ||
  !!(mockDays && d && mockDays.has(d.id));

// Saf: seri. Bugün henüz çalışılmadıysa dünden sayar (bugün seriyi bozmaz).
// Dondurma hakkı: haftada 1 (pazartesi başlangıçlı), tek atlanan gün seriyi sıfırlamaz (o gün sayılmaz).
export function streakCalc(get, today, mockDays = new Set()) {
  const act = k => activeDay(get(k) || (mockDays.has(k) ? { id: k } : null), mockDays);
  const wk = k => { const d = parseDay(k).getDay(); return addDays(k, -((d + 6) % 7)); };
  let n = 0, k = today, frozen = [];
  if (!act(k)) k = addDays(k, -1);
  for (let guard = 0; guard < 400; guard++) {
    if (act(k)) { n++; k = addDays(k, -1); continue; }
    const prev = addDays(k, -1);
    if (act(prev) && !frozen.includes(wk(k))) { frozen.push(wk(k)); k = prev; continue; }
    break;
  }
  return { n, frozen };
}

export function streak(today = dayKey()) {
  const mockDays = new Set(store.all('mocks').map(m => m.date).filter(Boolean));
  return streakCalc(k => store.get('days', k), today, mockDays).n;
}
export function streakInfo(today = dayKey()) {
  const mockDays = new Set(store.all('mocks').map(m => m.date).filter(Boolean));
  return streakCalc(k => store.get('days', k), today, mockDays);
}

// Zayıf konular: seed + doğruluğu düşük konular
export async function weakTopics() {
  const s = await seedUser();
  const acc = {};
  for (const l of store.all('grammarLog')) {
    if (l.kind !== 'gramer') continue;
    const a = acc[l.topic] ||= [0, 0]; a[1]++; if (l.correct) a[0]++;
  }
  return weakFrom(s.weakTopics || [], acc);
}

// Saf: zayıf konu = doğruluk < %60 (en az 5 soru). Tohum (notlardaki) zayıf konu: hiç soru yoksa ya da 20 soruya kadar doğruluk < %60 ise kalır.
export function weakFrom(seed, acc) {
  const out = new Set();
  for (const t of seed) { const [c, n] = acc[t] || [0, 0]; if (!n || (n < 20 && c / n < 0.6)) out.add(t); }
  for (const [t, [c, n]] of Object.entries(acc)) if (n >= 5 && c / n < 0.6) out.add(t);
  return [...out];
}

export function weekdayHint(today = dayKey()) {
  const wd = parseDay(today).getDay();
  if (wd === 6) return 'Cumartesi: uzun okuma / deneme';
  if (wd === 0) return 'Pazar: hafif tekrar';
  return '';
}
