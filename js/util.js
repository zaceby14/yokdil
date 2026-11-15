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

export function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
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
  'inversion': 'Inversion', 'referans': 'Referans', 'kelime': 'Kelime'
};

export const DRILL_TYPES = {
  'cloze': 'Cloze test', 'cumle-tamamlama': 'Cümle tamamlama', 'ilgisiz': 'İlgisiz cümle',
  'paragraf-tamamlama': 'Paragraf tamamlama', 'ceviri-en-tr': 'Çeviri İng→Tr', 'ceviri-tr-en': 'Çeviri Tr→İng',
  'yakin-anlam': 'Yakın anlam'
};

// Tüm soru tipleri (sınav sırası)
export const TYPES = {
  'bosluk': 'Cümlede boşluk', 'cloze': 'Cloze test', 'cumle-tamamlama': 'Cümle tamamlama', 'ceviri-en-tr': 'Çeviri İng→Tr',
  'ceviri-tr-en': 'Çeviri Tr→İng', 'paragraf-tamamlama': 'Paragraf tamamlama', 'ilgisiz': 'İlgisiz cümle',
  'paragraf': 'Paragraf (okuma)', 'yakin-anlam': 'Yakın anlam', 'diyalog': 'Diyalog'
};
export const typeName = t => TYPES[t] || t;

// Gramer konu sırası (program) — ders eşlemesinde kullanılır
export const TOPIC_ORDER = ['baglac-zitlik', 'baglac-neden-amac', 'edat-esdizim', 'zaman-uyumu', 'relative', 'gerund-infinitive',
  'passive', 'kosul-wish', 'noun-clause', 'karsilastirma', 'either-neither', 'quantifier', 'modal', 'participle', 'inversion', 'referans'];

export const topicName = t => TOPICS[t] || TYPES[t] || t;

// append: null/false atla, dizileri düzleştir
export function add(el, ...kids) {
  el.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  return el;
}
