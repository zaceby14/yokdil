// Kalıcı hafıza egzersizleri: saf yardımcılar + SRS'e hafif etki
import * as store from './store.js';
import { shuffle, dayKey } from './util.js';
import { level, isGraduated } from './vocab.js';

const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const inLadder = c => c?.ladder != null || c?.state === 'relearn';

// Saf: küçük yazım toleransı (Levenshtein ≤ 1; 8+ harfte ≤ 2), büyük/küçük harf ve baş/son boşluk önemsiz
export function typoOk(input, target) {
  const a = String(input || '').trim().toLowerCase().replace(/\s+/g, ' '), b = String(target || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!a || !b) return false;
  if (a === b) return true;
  const tol = b.length >= 8 ? 2 : b.length >= 4 ? 1 : 0;
  if (Math.abs(a.length - b.length) > tol) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length] <= tol;
}

// Saf: yazılan kelime kartın eş anlamlılarından biri mi? (yazım toleranslı) → eşleşen eş anlam | null
export function synHit(input, syn) {
  for (const x of Array.isArray(syn) ? syn : []) if (typoOk(input, x)) return x;
  return null;
}

// Saf: cümlede kelimeyi boşalt
export function blank(sentence, word) {
  const re = new RegExp(`\\b${reEsc(word)}\\b`, 'i');
  return sentence && re.test(sentence) ? sentence.replace(re, '----') : null;
}

// Egzersiz havuzu: öğrenmekte olan + merdivendeki kartlar
export const pool = (cards = store.all('cards')) => cards.filter(c => c.word && (inLadder(c) || level(c) === 'learning'));

// Hafıza turu havuzu: merdivendeki + bugün yanlış yapılanlar
export function tourPool(cards = store.all('cards'), today = dayKey()) {
  const isToday = t => t && dayKey(new Date(t)) === today;
  return cards.filter(c => c.word && c.state !== 'known' && (inLadder(c) || c.wrongDay === today ||
    (isToday(c.lastReview) && (c.hist || []).at(-1) === 'a') || ((c.tags || []).includes('hata') && isToday(c.createdAt))));
}

// Günlük alıştırma kaydı: bugün bu alıştırmada DOĞRU yapılan kartlar bir daha gelmez
export const exKey = (day = dayKey()) => `exlog:${day}`;
export const doneToday = (mode, day = dayKey()) => store.get('progress', exKey(day))?.[mode] || {};
export function markDone(mode, id, day = dayKey()) {
  if (!mode || !id) return;
  const prev = doneToday(mode, day);
  if (prev[id]) return;
  store.patch('progress', exKey(day), { [mode]: { ...prev, [id]: 1 } });
}

export const TOUR_MAX = 8;
// Hafıza turu kartları: anlamı olan, en fazla 8 (Bugün'deki sayı = turdaki soru sayısı)
export const tourCards = (cards = store.all('cards'), today = dayKey(), skip = {}) =>
  tourPool(cards, today).filter(c => (c.tr || '').trim() && !skip[c.id]).sort((a, b) => (inLadder(b) - inLadder(a)) || String(a.id).localeCompare(String(b.id))).slice(0, TOUR_MAX);

// Saf: anlam seçme sorusu (kelime → 5 Türkçe anlamdan biri). others: [{word, tr}]
export function meaningItem(card, others, rnd = Math.random) {
  const ans = (card.tr || '').trim();
  if (!ans) return null;
  const bad = new Set([ans.toLowerCase()]);
  const cand = [];
  for (const o of shuffle(others, rnd)) {
    if (cand.length >= 4) break;
    const t = (o.tr || '').trim();
    if (!t || bad.has(t.toLowerCase()) || (o.word || '').toLowerCase() === card.word.toLowerCase()) continue;
    bad.add(t.toLowerCase()); cand.push(t);
  }
  if (cand.length < 4) return null;
  const options = shuffle([ans, ...cand], rnd);
  return { key: 'anlam:' + card.id, cardId: card.id, q: `${card.word}\n\nTürkçe anlamı hangisi?`, options, answer: options.indexOf(ans),
    explain: `${card.word} = ${ans}`, label: 'Anlam', info: { kind: 'hafiza', dtype: 'anlam' } };
}

// Saf: eş anlam sorusu (YÖKDİL yakın anlam formatı): kelime → 5 şıktan eş anlamlısı
export function synItem(card, others, rnd = Math.random) {
  const syn = (card.syn || []).filter(s => s && s.split(/\s+/).length <= 3 && s.toLowerCase() !== card.word.toLowerCase());
  if (!syn.length) return null;
  const ans = syn[Math.floor(rnd() * syn.length)];
  const bad = new Set([card.word, ...(card.syn || [])].map(s => s.toLowerCase()));
  const cand = [];
  for (const o of shuffle(others, rnd)) {
    if (cand.length >= 4) break;
    if ((o.word || '').toLowerCase() === card.word.toLowerCase()) continue;
    for (const s of shuffle([...(o.syn || []), o.word].filter(Boolean), rnd)) {
      const l = s.toLowerCase();
      if (bad.has(l) || s.split(/\s+/).length > 3) continue;
      bad.add(l); cand.push(s); break;
    }
  }
  if (cand.length < 4) return null;
  const options = shuffle([ans, ...cand], rnd);
  return {
    key: 'es:' + card.id, cardId: card.id, q: `${card.word}\n\nAnlamca en yakın olan hangisi?`, options, answer: options.indexOf(ans),
    explain: `${card.word} ≈ ${(card.syn || []).join(', ')}${card.tr ? ' · ' + card.tr : ''}`, label: 'Eş anlam', info: { kind: 'hafiza', dtype: 'yakin-anlam' }
  };
}

// Saf: kelime ailesi sorusu (forms.json family): cümlede boşluk → doğru biçim
export function familyItem(card, fm, rnd = Math.random) {
  const key = card.word.toLowerCase().trim();
  const f = fm?.[key];
  if (!f?.family?.length) return null;
  const forms = [{ w: key, pos: card.pos || '', tr: card.tr || '' }, ...f.family].filter((x, i, a) => x.w && !/\s/.test(x.w) && a.findIndex(y => y.w.toLowerCase() === x.w.toLowerCase()) === i);
  if (forms.length < 3) return null;
  for (const ex of shuffle(f.ex || [], rnd)) {
    const hit = forms.find(x => blank(ex.en, x.w));
    if (!hit) continue;
    const opts = shuffle([hit, ...shuffle(forms.filter(x => x !== hit), rnd).slice(0, 4)], rnd);
    const POS = { n: 'isim', v: 'fiil', adj: 'sıfat', adv: 'zarf' };
    return {
      key: 'aile:' + card.id, cardId: card.id, q: blank(ex.en, hit.w), options: opts.map(x => x.w), answer: opts.indexOf(hit),
      explain: opts.map(x => `${x.w}${POS[x.pos] ? ' (' + POS[x.pos] + ')' : ''}${x.tr ? ' = ' + x.tr : ''}`).join(' · ') + (ex.tr ? `\n${ex.tr}` : ''),
      label: 'Kelime ailesi', info: { kind: 'hafiza', dtype: 'bosluk' }
    };
  }
  return null;
}

// Egzersiz sonucu: yanlış → kart bugüne (merdivendeyse zaten kısa aralıkta), doğruysa dokunma
export function memResult(cardId, ok, mode) {
  if (ok) { markDone(mode, cardId); return; }
  const c = store.get('cards', cardId);
  if (!c) return;
  store.put('cards', { ...c, due: Math.min(c.due || Date.now(), Date.now()), wrongDay: dayKey(), ...(isGraduated(c) ? { pulled: true } : {}) });
}
