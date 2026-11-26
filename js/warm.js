// Isınma / kural kartı kararları (saf fonksiyonlar: node ile test edilir)
// Konu anahtarı: gramer konusu (baglac-zitlik…) ya da soru tipi (cloze, ilgisiz, paragraf…)
import { addDays, dayKey, TYPES, TOPICS } from './util.js';

export const WARM_DAYS = 14, WARM_ACC = 0.7, WARM_MIN_N = 3, WARM_MAX = 2, SNOOZE_DAYS = 7, OPEN_MIN = 2;

export const isType = k => Object.prototype.hasOwnProperty.call(TYPES, k);
// Kayıt (log/hata) → soru tipi (Eksikler'deki "soru tipi doğruluğu" ile aynı)
export const typeOf = l => (l.kind === 'gramer' || l.kind === 'ders') ? 'bosluk' : l.kind === 'okuma' ? 'paragraf' : l.dtype;
// Soru öğesi / kayıt → konu anahtarı (konu varsa konu, yoksa soru tipi)
export function keyOf(info) {
  if (!info) return '';
  if (info.kind === 'okuma') return 'paragraf';
  const t = info.topic || '', d = info.dtype || '';
  if (t && TOPICS[t]) return t; // gramer konusu (alıştırmalardaki "biyoloji" gibi alan adları değil)
  return d && d !== 'bosluk' ? d : '';
}
// Kayıt bu anahtara mı ait?
export const matches = (l, k) => !!k && (isType(k) ? typeOf(l) === k : l.topic === k);

// Deneme bölüm anahtarı → soru tipi
export const MOCK_TYPE = { bosluk: 'bosluk', cloze: 'cloze', tamamlama: 'cumle-tamamlama', 'en-tr': 'ceviri-en-tr', 'tr-en': 'ceviri-tr-en',
  paragraf: 'paragraf-tamamlama', ilgisiz: 'ilgisiz', okuma: 'paragraf' };
export const normKey = k => MOCK_TYPE[k] || k;

// Saf: bir anahtarın zayıflık bilgisi. ctx: {logs, mistakes, rules, today}
export function weakInfo(k, { logs = [], mistakes = [], rules = [], today = dayKey() } = {}) {
  const from = addDays(today, -WARM_DAYS);
  const rec = logs.filter(l => matches(l, k) && (l.day || '') >= from);
  const n = rec.length, c = rec.filter(l => l.correct && !l.hint).length;
  const acc = n ? c / n : null;
  const open = mistakes.filter(m => m && !m.solved && matches(m, k)).length;
  const hasRule = rules.some(r => r && r.topic === k);
  const ruleHit = hasRule && rec.some(l => !l.correct);
  const weak = (n >= WARM_MIN_N && acc < WARM_ACC) || open >= OPEN_MIN || ruleHit;
  const score = (acc ?? 0.6) - open * 0.08 - (ruleHit ? 0.05 : 0);
  return { key: k, n, c, acc, open, ruleHit, weak, score };
}

// Saf: setteki anahtarlardan gösterilecek en fazla 2 zayıf konu.
// seen: {key: {lastDay, snoozeUntil}} (progress kkart:<key>)
export function pickWarm(keys, ctx = {}, seen = {}, max = WARM_MAX) {
  const today = ctx.today || dayKey();
  return [...new Set((keys || []).filter(Boolean))]
    .map(k => weakInfo(k, { ...ctx, today }))
    .filter(x => x.weak)
    .filter(x => { const s = seen[x.key]; return !s || (s.lastDay !== today && !(s.snoozeUntil && s.snoozeUntil > today)); })
    .sort((a, b) => a.score - b.score || a.key.localeCompare(b.key))
    .slice(0, max);
}

export const snoozeDay = (today = dayKey()) => addDays(today, SNOOZE_DAYS);

// Saf: "5 soru çöz" sırası. pool: [{key, level}] · ctx: {logs, mistakes, allowed (seviye), n}
// Önce açık hatalar, sonra daha önce yanlış yapılanlar, sonra seviyeye uygun yeniler, sonra üst seviye yeniler, en son doğru bilinenler (eski önce)
// Aynı soruları döndürmemek için: önce hiç görülmemiş, sonra en eski görülen. Yanlışlar zaten hata tekrarında gelir:
// en fazla 1 tanesi karışır. Son RECENT_DAYS günde çözülen soru en sona.
export const RECENT_DAYS = 3, MAX_WRONG_IN_PRACTICE = 1;
export function practicePick(pool, { logs = [], mistakes = [], allowed = 1, n = 5, rnd = Math.random, now = Date.now() } = {}) {
  const open = new Map(mistakes.filter(m => m && !m.solved).map(m => [m.id, m]));
  const last = new Map();
  for (const l of [...logs].sort((a, b) => (a.at || 0) - (b.at || 0))) last.set(l.q, l);
  const recent = l => l && (now - (l.at || 0)) < RECENT_DAYS * 864e5;
  const rank = p => {
    const l = last.get(p.key);
    if (recent(l)) return [5, String(l.at || 0).padStart(15, '0')];
    if (open.has(p.key) || (l && !l.correct)) return [3, String(l?.at || 0).padStart(15, '0')];
    if (!l) { const lv = p.level || 1; return lv <= allowed ? [0, String(9 - lv) + rnd().toFixed(4)] : [1, String(lv) + rnd().toFixed(4)]; }
    return [2, String(l.at || 0).padStart(15, '0')];
  };
  const sorted = pool.map(p => ({ p, r: rank(p) })).sort((a, b) => a.r[0] - b.r[0] || String(a.r[1]).localeCompare(String(b.r[1])));
  const out = [], wrongs = sorted.filter(x => x.r[0] === 3);
  // Bir yanlış (varsa) sona yakın karışır; geri kalanı yeni/eski sorular
  for (const x of sorted) { if (out.length >= n) break; if (x.r[0] === 3) continue; out.push(x.p.key); }
  if (wrongs.length && MAX_WRONG_IN_PRACTICE) { if (out.length >= n) out.pop(); out.push(wrongs[0].p.key); }
  for (const x of wrongs.slice(1)) { if (out.length >= n) break; out.push(x.p.key); }
  return out.slice(0, n);
}

// Saf: "5 soru çöz" karışımı — özgün havuz + çıkmış havuz (en fazla xMax çıkmış soru; özgün az ise çıkmışla tamamlanır).
// Önce özgündeki açık hatalar/yanlışlar korunur, sonra çıkmışlar, sonra kalan özgünler.
export function mixPractice(own, xs, ctx = {}, xMax = 2) {
  const n = ctx.n || 5;
  const xp = practicePick(xs || [], { ...ctx, n });
  const op = practicePick(own || [], { ...ctx, n });
  const nx = Math.min(xp.length, Math.max(xMax, n - op.length));
  const no = Math.min(op.length, n - nx);
  return [...op.slice(0, no), ...xp.slice(0, nx)].slice(0, n);
}

// Saf: kural kartını ilk gördükten sonraki doğruluk (ve öncesi)
export function afterCard(logs, k, firstAt) {
  const a = { n: 0, c: 0 }, b = { n: 0, c: 0 };
  if (!firstAt) return null;
  for (const l of logs || []) {
    if (!matches(l, k)) continue;
    const x = (l.at || 0) >= firstAt ? a : b;
    x.n++; if (l.correct && !l.hint) x.c++;
  }
  return { after: a, before: b };
}

// Konu → bağlaç kartı (polarityCards: words içinde aranan kelime) / kopya kağıdı (cheatSheets id)
export const POL_WORD = { 'baglac-zitlik': 'although', 'despite-although': 'despite', 'baglac-neden-amac': 'because',
  'zaman-ifadeleri': 'until', 'kosul-wish': 'unless', 'zaman-uyumu': 'until' };
export const SHEET = { 'baglac-master': 'baglac-master', 'edat-esdizim': 'fen-edat', 'sifat-fiil-edat': 'fen-edat', 'edat-ving': 'to-ving',
  'gerund-infinitive': 'to-ving', inversion: 'devrik', 'either-neither': 'cift-esler', 'cumle-tamamlama-kurallari': 'baglac-master' };
// Saf: konu için tek ek kart → {kind:'pol'|'sheet', card} | null. Veride "topic" alanı varsa o önce.
export function extraFor(k, a) {
  const pols = Array.isArray(a?.polarityCards) ? a.polarityCards.filter(Boolean) : [];
  const sheets = Array.isArray(a?.cheatSheets) ? a.cheatSheets.filter(Boolean) : [];
  const pt = pols.find(c => c.topic === k); if (pt) return { kind: 'pol', card: pt };
  const st = sheets.find(c => c.topic === k); if (st) return { kind: 'sheet', card: st };
  const w = POL_WORD[k];
  if (w) { const c = pols.find(c => (c.words || []).some(x => String(x).toLowerCase() === w)); if (c) return { kind: 'pol', card: c }; }
  const s = SHEET[k] && sheets.find(c => c.id === SHEET[k]);
  return s ? { kind: 'sheet', card: s } : null;
}

// Saf: Eksikler'in "en çok kazandıracak 1 şey"i: en az 3 sorulu en düşük doğruluk (konu önce), yoksa yedek liste
export function bestOne(topicRows, typeRows, fallback = []) {
  const pick = rs => (rs || []).filter(r => r.n >= WARM_MIN_N && r.value < 0.85).sort((a, b) => a.value - b.value || b.n - a.n)[0];
  const t = pick(topicRows) || pick((typeRows || []).filter(r => r.k !== 'bosluk'));
  if (t) return { key: t.k, value: t.value, n: t.n };
  return fallback.length ? { key: fallback[0], value: null, n: 0 } : null;
}

// Saf: yanlış cevaptaki "Senin kuralın" kutusu: konu aynı + kuralın İngilizce anahtar sözcüklerinden biri doğru/seçilen şıkta geçmeli.
// Soru tipi kuralında (ör. ilgisiz cümle) konu eşleşmesi yeter. Eşleşme yoksa null (ilgisiz kural gösterilmez).
const RSTOP = new Set('a an the is are was were be it its and or but this x v ving'.split(' '));
export const ruleWords = r => new Set((String([r?.rule, r?.right, String(r?.ex || '').split('→')[0]].filter(Boolean).join(' ')).toLowerCase().match(/[a-z]{2,}/g) || []).filter(w => !RSTOP.has(w)));
export function ruleMatch(rules, topic, texts = []) {
  if (!topic) return null;
  const tok = new Set(texts.join(' ').toLowerCase().match(/[a-z]{2,}/g) || []);
  for (const r of (rules || []).filter(r => r && r.topic === topic)) {
    if (isType(topic)) return r; // soru tipi kuralı (ör. ilgisiz cümle) stratejidir: konu eşleşmesi yeter
    const ws = ruleWords(r);
    if (!ws.size || [...ws].some(w => tok.has(w))) return r;
  }
  return null;
}
