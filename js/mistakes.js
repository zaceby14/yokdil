// Cevap kaydı + Hata kutusu (1-3-7-14 gün; üst üste 2 doğru → çözüldü)
import * as store from './store.js';
import { dayKey, addDays, uid } from './util.js';
import { bumpDay } from './plan.js';

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
export function answer(key, correct, info) {
  store.put('grammarLog', { id: uid('l'), q: key, correct: !!correct, at: Date.now(), day: dayKey(), ...info });
  bumpDay('answered'); if (correct) bumpDay('correct');
  const n = nextMistake(store.get('mistakes', key), correct);
  if (n) store.put('mistakes', { ...n, id: key, kind: info.kind, topic: info.topic || '', dtype: info.dtype || '' });
}

export function dueMistakes(kind) {
  const t = dayKey();
  return store.all('mistakes').filter(m => !m.solved && m.due <= t && (!kind || m.kind === kind));
}

export function openMistakes() { return store.all('mistakes').filter(m => !m.solved); }
