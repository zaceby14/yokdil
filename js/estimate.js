// Tahmini puan (1. haftadan): bölüm başına son cevaplardan doğruluk → 80 soruya oranla. Saf fonksiyonlar.
import { SEC_N, SEC_ORDER } from './strategy.js';
import { typeOf } from './warm.js';
import { addDays, dayKey } from './util.js';

// Soru tipi → deneme bölümü
export const SEC_OF_TYPE = { bosluk: 'bosluk', cloze: 'cloze', 'cumle-tamamlama': 'tamamlama', 'ceviri-en-tr': 'en-tr', 'ceviri-tr-en': 'tr-en',
  'paragraf-tamamlama': 'paragraf', ilgisiz: 'ilgisiz', paragraf: 'okuma', okuma: 'okuma' };
export const EST_DAYS = 28, EST_N = 40, PRIOR = 0.45, PRIOR_M = 6, PRACTICE_F = 0.92, MIN_TOTAL = 30;

// Saf: logs [{kind, dtype, correct, hint, day, src}], mocks [{date, sections:{sec:{d,n}}}] → tahmin
export function estimate(logs, mocks = [], today = dayKey()) {
  const from = addDays(today, -EST_DAYS);
  const by = {};
  for (const l of [...(logs || [])].filter(l => l && l.kind !== 'hafiza' && (l.day || '') >= from).sort((a, b) => (a.at || 0) - (b.at || 0))) {
    const s = SEC_OF_TYPE[typeOf(l)];
    if (!s) continue;
    // Deneme içindeki cevap (src kisa/cikmis) sınav koşuluna yakın: indirim yok
    (by[s] ||= []).push({ ok: l.correct && !l.hint ? 1 : 0, mock: l.src === 'kisa' || l.src === 'cikmis' });
  }
  // Elle girilen tam deneme (cevap kaydı yok): bölüm doğruları sınav koşulu kaydı sayılır
  for (const m of mocks || []) {
    if (!m?.sections || m.src || m.kind || m.half || (m.date || '') < from) continue;
    for (const [k, x] of Object.entries(m.sections)) {
      const N = +x?.n || SEC_N[k] || 0, d = Math.min(N, +x?.d || 0);
      if (!SEC_N[k]) continue;
      for (let j = 0; j < N; j++) (by[k] ||= []).push({ ok: j < d ? 1 : 0, mock: true });
    }
  }
  const sec = {};
  let mid = 0, varSum = 0, total = 0;
  for (const k of SEC_ORDER) {
    const xs = (by[k] || []).slice(-EST_N);
    const n = xs.length;
    const c = xs.reduce((a, x) => a + (x.mock ? x.ok : x.ok * PRACTICE_F), 0);
    const p = (c + PRIOR * PRIOR_M) / (n + PRIOR_M);
    const N = SEC_N[k];
    sec[k] = { acc: n ? c / n : null, p, n, d: +(p * N).toFixed(1), N };
    mid += p * N; varSum += N * N * p * (1 - p) / (n + PRIOR_M); total += n;
  }
  const sd = Math.sqrt(varSum) * 1.25;
  const pts = mid * 1.25;
  const half = Math.max(3, Math.round(sd * 1.3));
  return { mid: Math.round(pts), lo: Math.max(0, Math.round(pts - half)), hi: Math.min(100, Math.round(pts + half)), sec, n: total, enough: total >= MIN_TOTAL };
}

// Tahmini "senin" satırları için sahte deneme (hedef tablosunda karşılaştırma)
export const estMock = est => ({ sections: Object.fromEntries(Object.entries(est.sec).map(([k, s]) => [k, { d: Math.round(s.d), n: s.N }])), est: true });
