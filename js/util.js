// Küçük yardımcılar (DOM, tarih, metin)

export const DAY = 86400000;

export function pad(n) { return String(n).padStart(2, '0'); }

// Yerel gün anahtarı: YYYY-MM-DD
export function dayKey(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDay(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function diffDays(a, b) { // b - a, gün
  return Math.round((parseDay(b) - parseDay(a)) / DAY);
}

export function endOfToday() {
  const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime();
}

export function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// h('div.cls', {onclick}, ...children) — basit eleman üretici
export function h(tag, attrs, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

export function fmtDate(key) {
  const d = parseDay(key);
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function fmtTime(ms) {
  return new Date(ms).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function shuffle(a, rnd = Math.random) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Tohumlu rastgele (günlük set sabit kalsın)
export function seeded(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; };
}

// Kart çevirme (gerçek 3B): kart 0→90° döner, kenardan görünmezken yüz değişir (fn), sonra -90°→0° gelir.
// Toplam 300 ms; kart hep dokunulabilir. Hareket azaltma açıksa yalnız değişiklik.
export function flip(el, fn) {
  if (!el || !el.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  // Animasyon sonu olayıyla ilerler (sekme arka plandaysa ya da olay gelmezse yedek zamanlayıcı)
  const after = (name, ms, cb) => {
    let done = false;
    const go = () => { if (done) return; done = true; el.removeEventListener('animationend', on); cb(); };
    const on = e => { if (e.target === el && e.animationName === name) go(); };
    el.addEventListener('animationend', on); setTimeout(go, ms);
  };
  el.classList.remove('flip-in'); el.classList.add('flip-out');
  after('flip-out', 700, () => {
    el.classList.remove('flip-out');
    fn();
    el.classList.add('flip-in');
    after('flip-in', 700, () => el.classList.remove('flip-in'));
  });
}

// opts.bottom: ekranın altında (başlığı kapatmasın; ör. deneme sonucu)
export function toast(msg, opts = {}) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.classList.toggle('bottom', !!opts.bottom); t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 1800);
}

// Basit lemma adayları: -s, -es, -ed, -ing, -ies
export function lemmas(w) {
  w = w.toLowerCase();
  const out = [w];
  const add = x => { if (x && x.length > 1 && !out.includes(x)) out.push(x); };
  if (w.endsWith('ies')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('ied')) add(w.slice(0, -3) + 'y');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s') && !w.endsWith('ss')) add(w.slice(0, -1));
  if (w.endsWith('ed')) { add(w.slice(0, -2)); add(w.slice(0, -1)); dedouble(w.slice(0, -2)); }
  if (w.endsWith('ing')) { add(w.slice(0, -3)); add(w.slice(0, -3) + 'e'); dedouble(w.slice(0, -3)); }
  if (w.endsWith('ly')) add(w.slice(0, -2));
  function dedouble(s) { if (s.length > 2 && s.at(-1) === s.at(-2)) add(s.slice(0, -1)); }
  return out;
}

export const TOPICS = {
  'baglac-zitlik': 'Bağlaç: zıtlık', 'baglac-neden-amac': 'Bağlaç: neden/amaç', 'edat-esdizim': 'Edat & eşdizim',
  'zaman-uyumu': 'Zaman uyumu', 'relative': 'Relative clause', 'gerund-infinitive': 'Gerund / infinitive',
  'passive': 'Passive', 'kosul-wish': 'If / wish', 'noun-clause': 'Noun clause', 'karsilastirma': 'Karşılaştırma',
  'either-neither': 'Either / neither', 'quantifier': 'Quantifier', 'modal': 'Modal', 'participle': 'Participle',
  'inversion': 'Inversion', 'referans': 'Referans', 'kelime': 'Kelime',
  'zaman-ifadeleri': 'Zaman ifadeleri', 'baglac-master': 'Bağlaç master', 'despite-although': 'Despite / although',
  'so-such-too-enough': 'so/such · too/enough', 'edat-ving': 'Edat + Ving', 'sifat-fiil-edat': 'Sıfat/fiil + edat',
  'preposition-which': 'Edat + which', 'subjunctive': 'Subjunctive', 'cumle-tamamlama-kurallari': 'Cümle tamamlama kuralları',
  'as-like-such-as': 'as / like / such as', 'kelime-turu': 'Kelime türü', 'onek-sonek': 'Ön ek / son ek', 'cift-bosluk': 'Çift boşluk',
  'phrasal-verbs': 'Phrasal verb', 'strateji': 'Strateji', 'kelime-tahmini': 'Kelime tahmini', 'karisik': 'Karışık'
};

export const DRILL_TYPES = {
  'cloze': 'Cloze (boşluklu paragraf)', 'cumle-tamamlama': 'Cümle tamamlama', 'ilgisiz': 'İlgisiz cümle',
  'paragraf-tamamlama': 'Paragraf tamamlama', 'ceviri-en-tr': 'Çeviri İng→Tr', 'ceviri-tr-en': 'Çeviri Tr→İng',
  'yakin-anlam': 'Yakın anlam'
};

// Tüm soru tipleri (sınav sırası)
export const TYPES = {
  'bosluk': 'Cümlede boşluk', 'cloze': 'Cloze (boşluklu paragraf)', 'cumle-tamamlama': 'Cümle tamamlama', 'ceviri-en-tr': 'Çeviri İng→Tr',
  'ceviri-tr-en': 'Çeviri Tr→İng', 'paragraf-tamamlama': 'Paragraf tamamlama', 'ilgisiz': 'İlgisiz cümle',
  'paragraf': 'Paragraf (okuma)', 'yakin-anlam': 'Yakın anlam', 'diyalog': 'Diyalog'
};
export const typeName = t => TYPES[t] || t;

// Gramer konu sırası (program) — ders eşlemesinde kullanılır
export const TOPIC_ORDER = ['baglac-zitlik', 'baglac-neden-amac', 'edat-esdizim', 'zaman-uyumu', 'relative', 'gerund-infinitive',
  'passive', 'kosul-wish', 'noun-clause', 'karsilastirma', 'either-neither', 'quantifier', 'modal', 'participle', 'inversion', 'referans'];

// Okuma parçası konuları (passages.json topic)
export const PASSAGE_TOPICS = {
  'hayvan-davranisi': 'Hayvan davranışı', 'tarim-gida': 'Tarım-gıda', 'meteoroloji': 'Meteoroloji', 'saglik': 'Sağlık',
  'arkeoloji': 'Arkeoloji', 'psikoloji': 'Psikoloji', 'tarim': 'Tarım', tip: 'Tıp', 'muhendislik-tarihi': 'Mühendislik tarihi',
  'yapay-zeka': 'Yapay zekâ', yerbilimi: 'Yerbilimi', ceviri: 'Çeviri'
};

// Bilinmeyen anahtar: tire → boşluk, baş harf büyük
export const prettyKey = t => { const s = String(t || '').replace(/-/g, ' ').trim(); return s ? s[0].toLocaleUpperCase('tr-TR') + s.slice(1) : ''; };
export const topicName = t => TOPICS[t] || TYPES[t] || PASSAGE_TOPICS[t] || prettyKey(t);

// Düşük getirili konular: günlük sette en fazla 1 soru (sınav uzmanı raporu)
export const LOW_TOPICS = ['quantifier', 'inversion', 'referans', 'modal', 'karsilastirma', 'passive', 'noun-clause'];
// Konu ağırlığı (sınavdaki pay)
export const TOPIC_W = { 'baglac-zitlik': 3, 'baglac-neden-amac': 3, 'edat-esdizim': 2.5, 'relative': 2, 'zaman-uyumu': 2, 'kelime': 2,
  'participle': 1.2, 'gerund-infinitive': 1, 'kosul-wish': 1, 'either-neither': 1,
  'despite-although': 3, 'baglac-master': 2.5, 'edat-ving': 2, 'sifat-fiil-edat': 2, 'zaman-ifadeleri': 2, 'preposition-which': 1.5,
  'cumle-tamamlama-kurallari': 1.5, 'so-such-too-enough': 1, 'as-like-such-as': 1, 'kelime-turu': 1.2, 'onek-sonek': 0.8, 'subjunctive': 0.5 };

// Soru tipi → taktik dersi
export const TYPE_LESSON = {
  'bosluk': 'taktik-bosluk', 'cloze': 'taktik-cloze', 'cumle-tamamlama': 'taktik-cumle-tamamlama', 'ceviri-en-tr': 'taktik-ceviri',
  'ceviri-tr-en': 'taktik-ceviri', 'paragraf-tamamlama': 'taktik-paragraf-tamamlama', 'ilgisiz': 'taktik-ilgisiz', 'paragraf': 'taktik-paragraf',
  'okuma': 'taktik-paragraf', 'yakin-anlam': 'taktik-ceviri', 'tahmin': 'taktik-kelime-tahmini'
};
// Konu → ek ders adayları (konu dersi yoksa)
export const TOPIC_LESSON = { 'kelime': 'kelime-turu', 'cift-bosluk': 'cift-bosluk' };

// Açıklama gerçekten açıklama mı? ("Cevap: B." gibi tek satırlar sayılmaz)
export const realExplain = s => { const t = String(s || '').trim(); return t && !/^cevap\s*[:：]?\s*\(?[A-E]\)?\s*[.)]?\s*$/i.test(t) ? t : ''; };

// Şık metni: dizi ise "x / y"
export const optText = o => Array.isArray(o) ? o.join(' / ') : String(o ?? '');

// append: null/false atla, dizileri düzleştir
export function add(el, ...kids) {
  el.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  return el;
}

// Kart notu: otomatik (Claude) düzeltme kayıtlarını ayıkla → {own: kullanıcının notu, auto: kısa gri satır | ''}
export function noteParts(note) {
  const segs = String(note || '').split(/;\s*/).map(s => s.trim()).filter(Boolean);
  const isAuto = s => /claude/i.test(s) || /(eklendi|güncellendi|düzeltildi)\b/i.test(s) && /^(anlam|eş anlam|örnek|kalıp|tr)\b/i.test(s) || /\(eski:/i.test(s);
  const own = segs.filter(s => !isAuto(s)).join('; ');
  const auto = segs.filter(isAuto);
  if (!auto.length) return { own, auto: '' };
  const added = auto.some(s => /eklendi/i.test(s)), fixed = auto.some(s => /düzeltildi/i.test(s));
  return { own, auto: added && fixed ? 'anlam otomatik eklendi, düzeltildi' : added ? 'anlam otomatik eklendi' : 'anlam otomatik düzeltildi' };
}

// Örnek cümle "İngilizce → Türkçe": solu lang="en", sağı küçük gri Türkçe
export function exEl(ex, cls = 'div.small') {
  if (!ex) return null;
  const i = String(ex).indexOf('→');
  if (i < 0) return h(cls, { lang: 'en' }, ex);
  return h(cls + '.ex-pair', h('span', { lang: 'en' }, String(ex).slice(0, i).trim()), ' ', h('span.small.muted.ex-tr', { lang: 'tr' }, '→ ' + String(ex).slice(i + 1).trim()));
}
