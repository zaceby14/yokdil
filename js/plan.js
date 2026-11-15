// Program hesapları: hafta, faz, günlük limitler, seri
import { program, seedUser } from './data.js';
import * as store from './store.js';
import { dayKey, diffDays, addDays, parseDay } from './util.js';

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

export async function newLimit() {
  const s = store.settings();
  if (s.newLimit != null && s.newLimit !== '') return Number(s.newLimit);
  return (await week()).newWords ?? 15;
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

export const taskList = busy => busy ? ['kart', 'gramer'] : ['kart', 'gramer', 'okuma', 'yeni'];

export function dayDone(r) {
  if (!r) return false;
  return taskList(r.busy).every(t => r.tasks?.[t]);
}

export function streak(today = dayKey()) {
  let n = 0, k = today;
  if (dayDone(store.get('days', k))) n++;
  k = addDays(k, -1);
  while (dayDone(store.get('days', k))) { n++; k = addDays(k, -1); }
  return n;
}

// Zayıf konular: seed + doğruluğu düşük konular
export async function weakTopics() {
  const s = await seedUser();
  const set = new Set(s.weakTopics || []);
  const acc = {};
  for (const l of store.all('grammarLog')) {
    if (l.kind !== 'gramer') continue;
    const a = acc[l.topic] ||= [0, 0]; a[1]++; if (l.correct) a[0]++;
  }
  for (const [t, [c, n]] of Object.entries(acc)) if (n >= 4 && c / n < 0.6) set.add(t);
  return [...set];
}

export function weekdayHint(today = dayKey()) {
  const wd = parseDay(today).getDay();
  if (wd === 6) return 'Cumartesi: uzun okuma / deneme';
  if (wd === 0) return 'Pazar: hafif tekrar';
  return '';
}
