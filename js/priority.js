// Tek öncelik kaynağı + son dönem doğruluk (saf fonksiyonlar: node ile test edilir)
// Bugün ekranı, Eksikler'deki "1 şey" ve "En zayıf 3 alan" hepsi buradan beslenir.
import { TOPIC_W, LOW_TOPICS, TOPICS } from './util.js';
import { typeOf } from './warm.js';

// Sınavdaki ağırlık: gramer konuları TOPIC_W; soru tipleri bölüm büyüklüğüne göre (aynı ölçek)
export const TYPE_W = { cloze: 3, 'cumle-tamamlama': 3.5, 'ceviri-en-tr': 2.5, 'ceviri-tr-en': 2.5, 'paragraf-tamamlama': 2, ilgisiz: 2, paragraf: 4, 'yakin-anlam': 0.3 };
export const examW = k => LOW_TOPICS.includes(k) ? 0 : (TYPE_W[k] ?? TOPIC_W[k] ?? (TOPICS[k] ? 1 : 0));

export const RECENT_N = 30, PRIOR_N = 4, PRIOR_ACC = 0.65, TARGET_ACC = 0.8, MIN_N = 5, CONF_N = 10, TREND_MIN = 8;

// Kayıt → anahtarlar (konu ve soru tipi ayrı ayrı sayılır)
export function keysOf(l) {
  const out = [];
  if (!l || l.kind === 'hafiza') return out;
  if (l.topic && TOPICS[l.topic] && (l.kind === 'gramer' || l.kind === 'ders' || l.kind === 'cikmis' || l.kind === 'drill')) out.push(l.topic);
  const t = typeOf(l);
  if (t && t !== 'bosluk') out.push(t);
  return out;
}

// Saf: anahtar başına { n, c, value (son 30), all:{n,c,value}, trend (son 30 − önceki 30, yeterli veri yoksa null) }
export function keyStats(logs) {
  const by = {};
  for (const l of [...(logs || [])].sort((a, b) => (a.at || 0) - (b.at || 0))) {
    if (!l) continue;
    for (const k of keysOf(l)) (by[k] ||= []).push(l.correct && !l.hint ? 1 : 0);
  }
  const out = {};
  for (const [k, xs] of Object.entries(by)) {
    const rec = xs.slice(-RECENT_N), prev = xs.slice(-2 * RECENT_N, -RECENT_N);
    const sum = a => a.reduce((s, x) => s + x, 0);
    const value = sum(rec) / rec.length;
    const trend = rec.length >= TREND_MIN && prev.length >= TREND_MIN ? value - sum(prev) / prev.length : null;
    out[k] = { k, n: rec.length, c: sum(rec), value, all: { n: xs.length, c: sum(xs), value: sum(xs) / xs.length }, trend };
  }
  return out;
}

// Saf: öncelik puanı = eksiklik (hedef − küçültülmüş doğruluk) × sınav ağırlığı × güven (+ açık hata)
export function priScore(s, k, open = 0) {
  const w = examW(k);
  if (!w || !s || s.n < MIN_N) return 0;
  const shr = (s.c + PRIOR_ACC * PRIOR_N) / (s.n + PRIOR_N);
  const gap = Math.max(0, TARGET_ACC - shr) + Math.min(0.1, open * 0.01);
  return gap * w * Math.min(1, s.n / CONF_N);
}

// Saf: öncelik listesi. ctx: { logs, mistakes, mock (son deneme sections), seed (yedek liste) } → [{k, value, n, trend, score}]
export function priorities({ logs = [], mistakes = [], seed = [] } = {}) {
  const st = keyStats(logs);
  const openBy = {};
  for (const m of mistakes || []) if (m && !m.solved) for (const k of keysOf({ ...m, kind: m.kind || 'gramer' })) openBy[k] = (openBy[k] || 0) + 1;
  const list = Object.values(st).map(s => ({ k: s.k, value: s.value, n: s.n, trend: s.trend, all: s.all, score: priScore(s, s.k, openBy[s.k] || 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.k.localeCompare(b.k));
  if (list.length) return list;
  // Veri yok: notlardaki zayıf konular (az çıkanlar hariç)
  return (seed || []).filter(k => examW(k) > 0).map(k => ({ k, value: null, n: 0, trend: null, score: 0 }));
}

// Saf: "bu hafta güçlenenler" (en az +10 puan artış)
export const risers = stats => Object.values(stats || {}).filter(s => s.trend != null && s.trend >= 0.1 && examW(s.k) > 0).sort((a, b) => b.trend - a.trend).slice(0, 3);

export const trendText = t => t == null ? '' : t >= 0.05 ? `↑ +${Math.round(t * 100)}` : t <= -0.05 ? `↓ ${Math.round(t * 100)}` : '→';
