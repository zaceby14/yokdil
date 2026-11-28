// Kısa deneme: özgün sorulardan (gramer / alıştırma / okuma) YÖKDİL oranında 20 ya da 40 soruluk set (saf — node ile test edilir)

import { SECTION_OF } from './strategy.js';

// Bölüm planı: units = birim sayısı, w = birim başına soru (cloze metni 5, okuma parçası 3)
export const KISA = {
  mini: { n: 22, label: 'Mini', plan: [
    { sec: 'bosluk', pool: 'g', units: 5, w: 1, dbl: 1 }, { sec: 'cloze', pool: 'cloze', units: 1, w: 5 },
    { sec: 'tamamlama', pool: 'cumle-tamamlama', units: 3, w: 1 }, { sec: 'en-tr', pool: 'ceviri-en-tr', units: 2, w: 1 },
    { sec: 'tr-en', pool: 'ceviri-tr-en', units: 2, w: 1 }, { sec: 'paragraf', pool: 'paragraf-tamamlama', units: 1, w: 1 },
    { sec: 'ilgisiz', pool: 'ilgisiz', units: 1, w: 1 }, { sec: 'okuma', pool: 'p', units: 1, w: 3 }] },
  yarim: { n: 40, label: 'Yarım', plan: [
    { sec: 'bosluk', pool: 'g', units: 10, w: 1, dbl: 2 }, { sec: 'cloze', pool: 'cloze', units: 1, w: 5 },
    { sec: 'tamamlama', pool: 'cumle-tamamlama', units: 6, w: 1 }, { sec: 'en-tr', pool: 'ceviri-en-tr', units: 3, w: 1 },
    { sec: 'tr-en', pool: 'ceviri-tr-en', units: 3, w: 1 }, { sec: 'paragraf', pool: 'paragraf-tamamlama', units: 2, w: 1 },
    { sec: 'ilgisiz', pool: 'ilgisiz', units: 2, w: 1 }, { sec: 'okuma', pool: 'p', units: 3, w: 3 }] }
};
// Bölüm provası (son haftalar): yalnız okuma 5 parça / 60 dk · yalnız çeviri 12 soru / 15 dk
KISA.okuma = { n: 15, prova: 1, label: 'Okuma provası', plan: [{ sec: 'okuma', pool: 'p', units: 5, w: 3 }] };
KISA.ceviri = { n: 12, prova: 1, label: 'Çeviri provası', plan: [{ sec: 'en-tr', pool: 'ceviri-en-tr', units: 6, w: 1 }, { sec: 'tr-en', pool: 'ceviri-tr-en', units: 6, w: 1 }] };
// Bölüm başı dakika / soru — gerçek sınav zaman planından (aids.json timePlan: 180 dk)
export const SEC_MIN = { bosluk: 22 / 20, cloze: 14 / 10, tamamlama: 22 / 11, 'en-tr': 15 / 12, 'tr-en': 15 / 12, paragraf: 15 / 6, ilgisiz: 12 / 6, okuma: 60 / 15 };
export const KONTROL = 20 / 80; // 20 dk kontrol payı, soru başı (bölüm provasında yok)
export function secMinutes(size) {
  const m = {};
  for (const s of KISA[size].plan) m[s.sec] = (m[s.sec] || 0) + s.units * s.w * SEC_MIN[s.sec];
  return m;
}
for (const k of Object.keys(KISA)) {
  const c = KISA[k], base = Object.values(secMinutes(k)).reduce((a, b) => a + b, 0);
  c.min = Math.round((base + (c.prova ? 0 : c.n * KONTROL)) / 5) * 5;
}
export const KISA_SIZES = ['mini', 'yarim', 'okuma', 'ceviri'];
export const kisaTitle = size => `Kısa deneme (${KISA[size]?.n || 20} soru · ${KISA[size]?.min || 45} dk)`;
export const MIX = [0.3, 0.45, 0.25]; // seviye 1/2/3
export const RECENT_N = 3;            // son 3 kısa denemede çıkan birim tekrar etmez

const isDouble = q => !!q.double || (String(q.q || '').match(/-{2,}/g) || []).length >= 2;

// İçerik → havuzlar: { g:[{id, level, dbl}], cloze:[…], 'cumle-tamamlama':[…], …, p:[…] }
export function poolsOf({ grammar = [], drills = [], passages = [] }) {
  const P = { g: [], p: [] };
  for (const q of grammar) if (q?.id && (q.type || 'bosluk') === 'bosluk' && Array.isArray(q.options) && q.options.length) P.g.push({ id: q.id, level: +q.level || 2, dbl: isDouble(q) });
  for (const d of drills) {
    if (!d?.id || !Array.isArray(d.items) || !d.items.length) continue;
    if (d.type === 'cloze' && d.items.length < 5) continue;
    if (d.type !== 'cloze' && d.items.length !== 1) continue;
    (P[d.type] ||= []).push({ id: d.id, level: +d.level || 2 });
  }
  for (const p of passages) if (p?.id && Array.isArray(p.questions) && p.questions.length >= 3) P.p.push({ id: p.id, level: +p.level || 2 });
  return P;
}

// Gizli okumalar → kısa deneme birimi: en az 3 çoktan seçmeli (mc) sorusu olanlar; kimlik "r:<id>" (ilk 3 mc soru)
export const PRIV_MC = 3;
export const privMc = r => (r?.questions || []).map((q, k) => ({ q, k })).filter(x => x.q && x.q.type !== 'tf' && Array.isArray(x.q.options) && x.q.options.length >= 2);
export function privPool(readings = []) {
  return (readings || []).filter(r => r?.id && typeof r.text === 'string' && privMc(r).length >= PRIV_MC && !/^di[gğ]er$/i.test(String(r.topic || '')))
    .map(r => ({ id: 'r:' + r.id, level: Math.min(3, Math.max(1, +r.level || 2)) }));
}

// Cevap kaydı → birim kimliği başına son görülme (g0001, d001#2 → d001, p001#0 → p001, read:p001 → p001)
export function lastSeenOf(logs = [], reads = []) {
  const m = new Map();
  const bump = (id, at) => { if (id && (!m.has(id) || m.get(id) < at)) m.set(id, at); };
  for (const l of logs) if (l?.q && !String(l.q).includes(':')) bump(String(l.q).split('#')[0], l.at || 1);
  for (const r of reads) if (r?.id?.startsWith('read:')) bump(r.id.slice(5), r.at || 1);
  return m;
}

// Seçim: plan sırasıyla (büyük birimler önce) seviye açığı en büyük olan seviyeden en "taze" birim.
// Taze: hiç görülmemiş (rastgele) → en eski görülen. recent: son denemelerde çıkanlar (yetmezse kullanılır).
// mixPriv: okuma birimlerinin yarısı (yukarı yuvarlanır) gizli okumalardan (pools.pr; yoksa özgünden)
export function buildKisa(pools, size = 'mini', { lastSeen = new Map(), recent = new Set(), rand = Math.random, mixPriv = false } = {}) {
  const cfg = KISA[size] || KISA.mini;
  const total = cfg.plan.reduce((a, s) => a + s.units * s.w, 0);
  const target = MIX.map(x => x * total), got = [0, 0, 0];
  const used = new Set();
  const order = new Map();
  for (const k of Object.keys(pools)) for (const u of pools[k]) order.set(u.id, rand());
  const fresh = (a, b) => (lastSeen.get(a.id) ?? -Infinity) - (lastSeen.get(b.id) ?? -Infinity) || order.get(a.id) - order.get(b.id);
  const slots = [];
  cfg.plan.forEach((s, pi) => { for (let i = 0; i < s.units; i++) {
    const priv = mixPriv && s.pool === 'p' && i < Math.ceil(s.units / 2) && (pools.pr || []).length;
    slots.push({ ...s, pi, i, needDbl: i < (s.dbl || 0), ...(priv ? { pool: 'pr', alt: 'p' } : {}) });
  } });
  // Ağır birimler (cloze 5, okuma 3) seviye dağılımını önce belirlesin
  const proc = [...slots].sort((a, b) => b.w - a.w || a.pi - b.pi || a.i - b.i);
  const pick = new Map();
  for (const sl of proc) {
    let all = (pools[sl.pool] || []).filter(u => !used.has(u.id));
    if (!all.length && sl.alt) all = (pools[sl.alt] || []).filter(u => !used.has(u.id));
    let cands = all.filter(u => !recent.has(u.id));
    if (!cands.length) cands = all;
    if (sl.needDbl && cands.some(u => u.dbl)) cands = cands.filter(u => u.dbl);
    if (!cands.length) continue;
    const lv = [0, 1, 2].sort((a, b) => (target[b] - got[b]) - (target[a] - got[a]) || MIX[b] - MIX[a]);
    // Önce görülmemişler (seviye açığına göre), yoksa en eski görülenler
    let u = null;
    const unseen = cands.filter(x => !lastSeen.has(x.id));
    for (const tier of unseen.length ? [unseen, cands] : [cands]) {
      for (const l of lv) { const c = tier.filter(x => (x.level || 2) === l + 1).sort(fresh); if (c.length) { u = c[0]; break; } }
      if (u) break;
    }
    u ||= cands.sort(fresh)[0];
    used.add(u.id);
    got[Math.min(2, Math.max(0, (u.level || 2) - 1))] += sl.w;
    pick.set(sl, u);
  }
  const units = slots.filter(sl => pick.has(sl)).map(sl => ({ sec: sl.sec, id: pick.get(sl).id, level: pick.get(sl).level || 2, w: sl.w }));
  return { size, n: units.reduce((a, u) => a + u.w, 0), units, levels: got };
}

// Son N kısa denemenin birimleri (tanımlar: [{createdAt, units:[{id}]}])
export function recentUnits(defs = [], n = RECENT_N) {
  return new Set(defs.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, n).flatMap(d => (d.units || []).map(u => u.id)));
}

// Bölüm süre planını soru sayısına oranla (timePlan.sections[].minutes × bu denemedeki soru / tam sınavdaki soru)
export function scalePlan(tp, counts, rowsOf) {
  if (!tp?.sections) return null;
  const rows = rowsOf(tp);
  const sections = rows.map(r => {
    const n = r.secs.reduce((a, k) => a + (counts[k] || 0), 0);
    const type = r.secs.length === 2 ? 'ceviri' : Object.keys(SECTION_OF).find(t => SECTION_OF[t] === r.secs[0]) || r.secs[0];
    return { type, label: r.label, count: n, minutes: n && r.count ? Math.max(1, Math.round(r.minutes * n / r.count)) : 0, order: r.order, tip: r.tip };
  }).filter(s => s.minutes > 0);
  return { ...tp, sections, total: sections.reduce((a, s) => a + s.minutes, 0) };
}

// Kısa deneme puanı: doğru / soru × 100
export const kisaScore = (right, n) => n ? Math.round(right / n * 100) : 0;
