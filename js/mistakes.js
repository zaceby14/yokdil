// Cevap kaydı + Hata kutusu (1-3-7-14 gün; üst üste 2 doğru → çözüldü)
import * as store from './store.js';
import { dayKey, addDays, uid } from './util.js';
import { bumpDay, FINAL } from './plan.js';
import { keysOf, examW } from './priority.js';

export const STEPS = [1, 3, 7, 14];

// Saf kural: mevcut hata kaydı + doğru/yanlış → yeni kayıt (veya null = dokunma)
export function nextMistake(m, correct, today = dayKey()) {
  if (!correct) {
    // Yanlış: yarın tekrar, seri sıfır; ilerleme (stage) korunur
    return { ...(m || {}), stage: m && !m.solved ? m.stage || 0 : 0, streak: 0, solved: false,
      due: addDays(today, STEPS[0]), wrongs: (m?.wrongs || 0) + 1, last: today };
  }
  if (!m || m.solved) return null;
  const streak = (m.streak || 0) + 1;
  if (streak >= 2) return { ...m, streak, solved: true, solvedAt: today, last: today };
  const stage = Math.min((m.stage || 0) + 1, STEPS.length - 1);
  return { ...m, streak, stage, due: addDays(today, STEPS[stage]), last: today };
}

// key: soru anahtarı (g0001 veya d001#2). info: {kind:'gramer'|'drill'|'okuma', topic, dtype}
export function answer(key, correct, info, extra = {}) {
  const day = dayKey();
  const inSet = (store.get('days', day)?.hset || []).includes(key);
  store.put('grammarLog', { id: uid('l'), q: key, correct: !!correct, at: Date.now(), day, ...info, ...(extra.hint ? { hint: true } : {}), ...(inSet ? { hset: true } : {}) });
  bumpDay('answered'); if (correct) bumpDay('correct');
  const n = nextMistake(store.get('mistakes', key), correct);
  if (n) store.put('mistakes', { ...n, id: key, kind: info.kind, topic: info.topic || '', dtype: info.dtype || '' });
}

export function dueMistakes(kind) {
  const t = dayKey();
  return store.all('mistakes').filter(m => !m.solved && m.due <= t && (!kind || m.kind === kind));
}

export function openMistakes() { return store.all('mistakes').filter(m => !m.solved); }

// Günlük hata tekrarı: en fazla 8 soru (en eski vade, sonra en çok yanlış). Tüm kaynaklar (gramer, alıştırma, okuma, çıkmış, ders).
export const DAILY_MISTAKES = 8, FINAL_MISTAKES = 12; // son 14 günde 12
// Birikme varsa sayı artar (her 20 bekleyen için +2, en fazla 14). Sıra: vade → sınav ağırlığı → yanlış sayısı
export const MAX_MISTAKES = 14;
export const mistakeN = (due, base = DAILY_MISTAKES) => Math.min(MAX_MISTAKES, Math.max(base, base + Math.floor(due / 20) * 2));
const wOf = m => Math.max(0, ...keysOf({ ...m, kind: m.kind || 'gramer' }).map(examW), 0);
export function pickMistakes(list, today = dayKey(), n = DAILY_MISTAKES) {
  const due = list.filter(m => !m.solved && m.due && m.due <= today && m.kind !== 'hafiza');
  return due.sort((a, b) => a.due.localeCompare(b.due) || wOf(b) - wOf(a) || (b.wrongs || 0) - (a.wrongs || 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, mistakeN(due.length, n)).map(m => m.id);
}
// Son 7 günde kapatılan (çözülen) yanlış sayısı
export const closedWeek = (list, today = dayKey()) => list.filter(m => m.solved && (m.solvedAt || '') >= addDays(today, -6)).length;

// Bugünün hata seti (gün kaydında sabit; birikmiş sayı büyüse de bugün en fazla 8)
export function mistakeSet(key = dayKey()) {
  const r = store.get('days', key) || { id: key, tasks: {} };
  if (Array.isArray(r.hset)) return r.hset;
  const ids = pickMistakes(store.all('mistakes'), key, FINAL.on ? FINAL_MISTAKES : DAILY_MISTAKES);
  store.put('days', { ...r, id: key, hset: ids }, { silent: true });
  return ids;
}

// {ids, done, total}: bugün setten kaç soru çözüldü
export function mistakeToday(key = dayKey()) {
  const ids = mistakeSet(key);
  const set = new Set(ids);
  const done = new Set(store.all('grammarLog').filter(l => l.day === key && set.has(l.q) && l.hset).map(l => l.q)).size;
  return { ids, done, total: ids.length };
}
