// Sınav stratejisi: süre planı, hedef net, hata nedenleri, son 14 gün, kural görevi, okuma hızı (saf fonksiyonlar — node ile test edilir)
import { addDays, diffDays, parseDay, dayKey } from './util.js';

// Soru tipi → deneme bölümü
export const SECTION_OF = {
  'bosluk': 'bosluk', 'cloze': 'cloze', 'cumle-tamamlama': 'tamamlama', 'ceviri-en-tr': 'en-tr', 'ceviri-tr-en': 'tr-en',
  'paragraf-tamamlama': 'paragraf', 'ilgisiz': 'ilgisiz', 'paragraf': 'okuma', 'yakin-anlam': 'yakin', 'diyalog': 'diyalog'
};
export const SEC_LBL = { bosluk: 'Cümlede boşluk', cloze: 'Cloze (boşluklu paragraf)', tamamlama: 'Cümle tamamlama', 'en-tr': 'Çeviri İng→Tr', 'tr-en': 'Çeviri Tr→İng',
  paragraf: 'Paragraf tamamlama', ilgisiz: 'İlgisiz cümle', okuma: 'Okuma', yakin: 'Yakın anlam', diyalog: 'Diyalog', diger: 'Diğer' };
// YÖKDİL Fen bölüm soru sayıları
export const SEC_N = { bosluk: 20, cloze: 10, tamamlama: 11, 'en-tr': 6, 'tr-en': 6, paragraf: 6, ilgisiz: 6, okuma: 15 };
export const SEC_ORDER = ['bosluk', 'cloze', 'tamamlama', 'en-tr', 'tr-en', 'paragraf', 'ilgisiz', 'okuma'];

// İçerikteki "tip" anahtarı (soru tipi adı, bölüm anahtarı ya da birleşik "ceviri") → bölüm anahtarları
const ALIAS = { tamamlama: ['tamamlama'], 'en-tr': ['en-tr'], 'tr-en': ['tr-en'], ceviri: ['en-tr', 'tr-en'], okuma: ['okuma'], yakin: ['yakin'],
  'paragraf-okuma': ['okuma'], 'okuma-parcasi': ['okuma'], kelime: ['bosluk'], gramer: ['bosluk'] };
export function secsOf(type, label = '') {
  const t = String(type || '').trim();
  if (t === 'paragraf' && /tamamla/i.test(label)) return ['paragraf'];
  if (SECTION_OF[t]) return [SECTION_OF[t]];
  if (ALIAS[t]) return ALIAS[t];
  return SEC_LBL[t] ? [t] : [];
}
const secLabel = secs => secs.length === 2 && secs.includes('en-tr') && secs.includes('tr-en') ? 'Çeviri' : secs.map(k => SEC_LBL[k] || k).join(' + ');

// Süre planı satırları (çözme sırasına göre): [{label, secs, count, minutes, order, tip}]
export function planRows(tp) {
  const rows = (Array.isArray(tp?.sections) ? tp.sections : []).filter(s => s && +s.minutes > 0).map((s, i) => {
    const secs = secsOf(s.type, s.label);
    return { label: s.label || secLabel(secs) || String(s.type || ''), secs, count: +s.count || secs.reduce((a, k) => a + (SEC_N[k] || 0), 0),
      minutes: +s.minutes, order: +s.order || i + 1, tip: s.tip || '' };
  });
  return rows.sort((a, b) => a.order - b.order);
}
// Bölümün süre planı satırı (birleşik satır da olabilir)
export const planFor = (tp, sec) => planRows(tp).find(r => r.secs.includes(sec)) || null;
// Bölüm göstergesi: { used (dk), target (dk), over }
export function secClock(tp, sec, secTime = {}) {
  const r = planFor(tp, sec);
  if (!r) return null;
  const s = r.secs.reduce((a, k) => a + (+secTime[k] || 0), 0);
  return { label: r.label, used: Math.floor(s / 60), target: r.minutes, over: s > r.minutes * 60, secs: s };
}

// Hedef net: puana en yakın (altta kalan) hedef satırı → [{label, secs, n, need}]
export function targetFor(targets, score) {
  const list = (Array.isArray(targets) ? targets : []).filter(t => t && t.nets && +t.score > 0).sort((a, b) => a.score - b.score);
  if (!list.length) return null;
  const t = list.filter(x => x.score <= score).at(-1) || list[0];
  const rows = Object.entries(t.nets).map(([k, v]) => ({ secs: secsOf(k), need: +v || 0 })).filter(r => r.secs.length)
    .map(r => ({ ...r, label: secLabel(r.secs), n: r.secs.reduce((a, k) => a + (SEC_N[k] || 0), 0) }));
  rows.sort((a, b) => SEC_ORDER.indexOf(a.secs[0]) - SEC_ORDER.indexOf(b.secs[0]));
  return { score: +t.score, rows, total: +t.total || rows.reduce((a, r) => a + r.need, 0), note: t.note || '' };
}
// Son tam denemedeki doğrular ile karşılaştır (YÖKDİL'de yanlış doğruyu götürmez: net = doğru)
export function netRows(target, mock) {
  if (!target) return [];
  return target.rows.map(r => {
    const has = mock && r.secs.some(k => mock.sections?.[k]);
    const mine = has ? r.secs.reduce((a, k) => a + (+mock.sections?.[k]?.d || 0), 0) : null;
    return { ...r, mine, diff: mine == null ? null : mine - r.need };
  });
}
export const lastFullMock = mocks => (mocks || []).filter(m => m && !m.half && !m.sample && m.kind !== 'kisa' && m.sections).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.updatedAt || 0) - (b.updatedAt || 0)).at(-1) || null;

// Hata nedenleri: kayıtlar [{reason}] → [{id, label, advice, n}] (çoktan aza)
export function reasonCounts(recs, reasons) {
  const cnt = {};
  for (const r of recs || []) if (r?.reason) cnt[r.reason] = (cnt[r.reason] || 0) + 1;
  return (Array.isArray(reasons) ? reasons : []).filter(x => x?.id).map(x => ({ id: x.id, label: x.label || x.id, advice: x.advice || '', n: cnt[x.id] || 0 }))
    .filter(x => x.n).sort((a, b) => b.n - a.n);
}

// Analiz adımı: metin ya da {title|step|label, text|note|desc, min|minutes}
export function stepOf(x) {
  if (x == null) return null;
  if (typeof x === 'string') return { title: x, text: '', min: 0, end: +(x.match(/^\s*\d+\s*[–-]\s*(\d+)\s*dk/)?.[1] || 0) };
  return { title: x.title || x.step || x.label || x.text || '', text: x.title || x.step || x.label ? (x.text || x.note || x.desc || '') : '', min: +(x.min ?? x.minutes ?? 0) || 0 };
}

// Son 14 gün
export const FINAL_DAYS = 14;
export const isFinal = left => left >= 0 && left <= FINAL_DAYS;
// Yeni kelime: son 14 gün en fazla 5, son 3 gün 0
export function finalNewLimit(limit, left) {
  if (!isFinal(left)) return limit;
  return left <= 3 ? 0 : Math.min(limit, 5);
}
// Sınav günü grupları: "when" metninden kaç gün kala gösterileceği (days alanı varsa o)
export function whenDays(g) {
  if (g?.days != null && !isNaN(+g.days)) return +g.days;
  const w = String(g?.when || '').toLocaleLowerCase('tr-TR');
  const num = w.match(/(\d+)/)?.[1];
  if (/hafta/.test(w)) return 7 * (+num || 1);
  if (/sabah|sınavda|sırasında|salonda|sınav günü|sınav anı/.test(w)) return 0;
  if (/(\d+)\s*gün/.test(w)) return +num;
  if (/gün önce|önceki|akşam|gece|dün/.test(w)) return 1;
  if (/son gün/.test(w)) return 3;
  return null;
}
// Bugüne uyan grup(lar): eşiği kalan güne en yakın (≥ kalan) olan; bulunamazsa ilki
export function examDayFor(list, left) {
  const gs = (Array.isArray(list) ? list : []).filter(g => g && Array.isArray(g.items) && g.items.length);
  if (!gs.length || !isFinal(left)) return [];
  const withD = gs.map(g => ({ g, d: whenDays(g) })).filter(x => x.d != null && x.d >= left);
  if (!withD.length) return left === 0 ? gs.slice(-1) : gs.slice(0, 1);
  const best = Math.min(...withD.map(x => x.d));
  return withD.filter(x => x.d === best).map(x => x.g);
}

// Başvuru bandı: { kind:'soon'|'open'|'late', days }
export function applyState(apply, late, today) {
  const [a, b] = apply || [];
  if (!a || !b) return null;
  if (today < a) { const d = diffDays(today, a); return d <= 14 ? { kind: 'soon', days: d } : null; }
  if (today <= b) return { kind: 'open', days: diffDays(today, b) };
  if (late && today <= late) return { kind: 'late', days: diffDays(today, late) };
  return null;
}

// Kişisel kural görevi: onaydan (ack) sonra aynı kural konusunda ≥2 yanlış → o konular
export const RULE_WRONGS = 2, RULE_WINDOW = 14;
export function ruleTasks(logs, rules, acks = {}, today = dayKey()) {
  const topics = [...new Set((rules || []).map(r => r?.topic).filter(Boolean))];
  const from = addDays(today, -RULE_WINDOW);
  const out = [];
  for (const t of topics) {
    const since = acks[t] || 0;
    const n = (logs || []).filter(l => l.topic === t && !l.correct && (l.at || 0) > since && (l.day || '') >= from).length;
    if (n >= RULE_WRONGS) out.push({ topic: t, n });
  }
  return out.sort((a, b) => b.n - a.n);
}

// Okuma hızı: son `weeks` hafta (pazartesi başlangıçlı) ortalaması → [{wk, label, v, n}] (boş haftalar v=null)
export function weeklyWpm(recs, today = dayKey(), weeks = 8) {
  const mon = k => addDays(k, -((parseDay(k).getDay() + 6) % 7));
  const first = addDays(mon(today), -7 * (weeks - 1));
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const wk = addDays(first, i * 7), end = addDays(wk, 7);
    const r = (recs || []).filter(x => x.wpm && x.at && dayKey(new Date(x.at)) >= wk && dayKey(new Date(x.at)) < end);
    const d = parseDay(wk);
    out.push({ wk, label: `${d.getDate()}.${d.getMonth() + 1}`, n: r.length, v: r.length ? Math.round(r.reduce((a, x) => a + x.wpm, 0) / r.length) : null });
  }
  return out;
}
export const READ_GOAL = 120; // kelime/dk (Ayarlar'dan değişir)

// Çekirdek listeden görülen kelime: kartı olan ve artık "yeni" olmayan
export function coreSeen(words, cards) {
  const seen = new Set();
  for (const c of cards || []) if (c && !c.deleted && (c.state || 'new') !== 'new') { if (c.wid) seen.add(c.wid); if (c.word) seen.add(String(c.word).toLowerCase().trim()); }
  let n = 0;
  for (const w of words || []) if (seen.has(w.id) || seen.has(String(w.word || '').toLowerCase())) n++;
  return { seen: n, total: (words || []).length };
}

// Yarım deneme: ilk 40 soru / 90 dk
export const HALF_N = 40, HALF_MIN = 90;

// Dersler listesi grupları
export const LESSON_GROUPS = [['baglac', 'Bağlaçlar'], ['edat', 'Edatlar'], ['zaman', 'Zaman'], ['yapi', 'Cümle yapıları'], ['kelime', 'Kelime'], ['taktik', 'Soru tipi taktikleri'], ['strateji', 'Strateji']];
const GROUP_IDS = {
  baglac: ['baglac-zitlik', 'despite-although', 'baglac-neden-amac', 'so-such-too-enough', 'baglac-master', 'either-neither', 'as-like-such-as'],
  edat: ['edat-esdizim', 'sifat-fiil-edat', 'edat-ving', 'preposition-which'],
  zaman: ['zaman-uyumu', 'zaman-ifadeleri', 'cift-bosluk'],
  kelime: ['kelime-turu', 'onek-sonek', 'phrasal-verbs', 'taktik-kelime-tahmini'],
  strateji: ['taktik-sure', 'taktik-deneme-analizi']
};
export function lessonGroup(l) {
  const id = String(l?.id || ''), t = String(l?.topic || '');
  for (const [g, ids] of Object.entries(GROUP_IDS)) if (ids.includes(id)) return g;
  if (t === 'strateji') return 'strateji';
  if (t.startsWith('kelime') || t === 'onek-sonek') return 'kelime';
  if (id.startsWith('taktik')) return 'taktik';
  if (id.startsWith('baglac') || t.startsWith('baglac')) return 'baglac';
  if (id.startsWith('edat') || t.startsWith('edat')) return 'edat';
  if (id.startsWith('zaman') || t.startsWith('zaman')) return 'zaman';
  return 'yapi';
}

// Bağlamdan tahmin: cümlede kelimeyi (yalnız çekim ekleriyle: -s, -ed, -ing, -ly…) bul → [önce, kelime, sonra] ya da null
export function splitAt(sentence, word) {
  const w = String(word || '').trim();
  if (!w || !sentence) return null;
  const q = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const alts = [q(w) + '(?:s|es|d|ed|ing|ly|r|er|est)?'];
  if (!/\s/.test(w) && w.length > 2) {
    const last = w.at(-1);
    if (/[^aeiouy]/i.test(last)) alts.push(q(w + last) + '(?:ed|ing|er|est)');
    if (/e$/i.test(w)) alts.push(q(w.slice(0, -1)) + '(?:ing|ed|es|er|est)');
    if (/y$/i.test(w)) alts.push(q(w.slice(0, -1)) + '(?:ies|ied|ier|iest|ily)');
  }
  const m = new RegExp(`\\b(?:${alts.join('|')})\\b`, 'i').exec(sentence);
  return m ? [sentence.slice(0, m.index), m[0], sentence.slice(m.index + m[0].length)] : null;
}

// Saf: kelime ilerlemesi çerçevesi. st: counts() · goal · frac: programda geçen süre oranı (0..1) · left: sınava gün · limit: günlük yeni
// → {studied, solid, todayGoal (bugünkü ara hedef, sağlam), proj (sınavda çalışılmış ≈), needPerDay (hedefe yetişmek için günlük yeni | 0)}
export function vocabPlan(st, goal, frac, left, limit) {
  const studied = (st.learning || 0) + (st.mature || 0) + (st.grad || 0) + (st.known || 0);
  const solid = st.knowTotal || 0;
  const f = Math.min(1, Math.max(0, frac || 0));
  const todayGoal = Math.round(goal * f);
  const L = Math.max(0, left || 0);
  const proj = studied + (limit || 0) * L;
  const raw = proj >= goal || !L ? 0 : Math.ceil((goal - studied) / L);
  // Son 14 günde ya da programın 2 katından fazlası gerekiyorsa gösterme (ulaşılamaz hedef moral bozar)
  const needPerDay = L <= 14 || raw > 2 * (limit || 0) ? 0 : raw;
  return { studied, solid, todayGoal, proj, needPerDay };
}

// Programdan kelime hedefi: Σ (haftalık yeni kelime × 7), 50'ye yuvarlı
export const progVocab = prog => Math.round((prog?.weeks || []).reduce((a, w) => a + (+w.newWords || 0) * 7, 0) / 50) * 50 || 1000;
