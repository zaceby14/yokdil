// Kelime bilgisi: "biliyorum" (known), mezuniyet (öğrenildi), olgun, haftalık kontrol, bilinmeyen kelime tespiti
import * as store from './store.js';
import { dayKey, addDays, parseDay, seeded, shuffle, lemmas } from './util.js';

// Kelime kartı olmaya değmeyen işlev kelimeleri
export const STOP = new Set(('a an the to of in on at by for from with into onto over under about against among between through during ' +
  'is are was were be been being am has have had do does did will would can could may might must shall should ought ' +
  'not no it its this that these those which who whom whose what where when why how there here than then as so ' +
  'and or but nor if unless i you he she we they them their his her our your one ones any some all each every ' +
  'up down out off very too also only just more most less least much many few little').split(' '));

// Okumada vurgulanmayacak kadar temel çekirdek kelimeler (kart olarak yine eklenebilir)
export const BASIC = new Set('atom axis cell data final gene goal level local lower mass still study tool use used uses risk role loss load link layer solid store track seem until fibre orbit scale range'.split(' '));

export const GRAD_DAYS = 45;      // mezuniyet aralığı (gün)
export const MATURE_DAYS = 21;
export const WEEKLY_CHECKS = 5;   // haftada en fazla kontrol
export const STUDY_STATES = ['learning', 'relearn', 'review'];

// Saf: kart "Öğrenildi" mi? (aralık ≥ 45 g ve son 3 tekrarda "Tekrar" yok)
export function isGraduated(c) {
  if (!c || c.state !== 'review' || (c.interval || 0) < GRAD_DAYS) return false;
  const h = Array.isArray(c.hist) ? c.hist : null;
  if (!h) return true; // eski kayıt: geçmiş yok, review'da 45+ g → unutulmamış say
  return h.length >= 3 && !h.slice(-3).includes('a');
}

// Kart sınıfı: new | known | grad | mature | learning
export function level(c) {
  const s = c?.state || 'new';
  if (s === 'new') return 'new';
  if (s === 'known') return 'known';
  if (isGraduated(c)) return 'grad';
  if (s === 'review' && (c.interval || 0) >= MATURE_DAYS) return 'mature';
  return 'learning';
}

export const isStudied = c => STUDY_STATES.includes(c?.state);
export const isKnownLevel = c => ['known', 'grad', 'mature'].includes(level(c));

// Haftanın pazartesisi (yerel)
export function weekStart(today = dayKey()) {
  const d = parseDay(today).getDay();
  return addDays(today, -((d + 6) % 7));
}

// Saf: bu haftanın kontrol listesi (en fazla 5, haftaya göre tohumlu rastgele)
export function pickChecks(cards, wk, n = WEEKLY_CHECKS) {
  const ws = parseDay(wk).getTime();
  const pool = cards.filter(c => isGraduated(c) && (c.lastReview || 0) < ws).sort((a, b) => a.id.localeCompare(b.id));
  return shuffle(pool, seeded('grad' + wk)).slice(0, n).map(c => c.id);
}

// Bu haftanın kontrol kartları (kayıt progress'te sabitlenir, cihazlar arası aynı)
export function weeklyChecks(today = dayKey()) {
  const wk = weekStart(today);
  const id = 'gradcheck:' + wk;
  let r = store.get('progress', id);
  if (!r) {
    const ids = pickChecks(store.all('cards'), wk);
    if (!ids.length) return [];
    r = store.put('progress', { id, ids }, { silent: true });
  }
  const ws = parseDay(wk).getTime();
  return (r.ids || []).map(i => store.get('cards', i)).filter(c => c && isGraduated(c) && (c.lastReview || 0) < ws);
}

// Kartı "biliyorum" yap (çekirdek kelimeden ya da mevcut karttan)
export function markKnown(card) {
  return store.put('cards', { ...card, state: 'known', knownAt: Date.now() });
}

// Geri al: known → new (yeni kuyruğun önüne)
export function unKnow(card) {
  const c = { ...card, state: 'new', front: Date.now() };
  delete c.knownAt;
  return store.put('cards', c);
}

// Kelime → kart (lemma eşleşmeli)
export function cardIndex() {
  const m = new Map();
  for (const c of store.all('cards')) { const w = (c.word || '').toLowerCase().trim(); if (w) m.set(w, c); }
  return m;
}

// Metindeki çekirdek kelimeler: [{lemma, entry, card, surface}] — tek kelimelik girişler
export function coreHits(tokens, idx, cards = cardIndex()) {
  const out = new Map();
  for (const t of tokens) {
    if (!t.w) continue;
    for (const l of lemmas(t.t)) {
      const e = idx.get(l);
      if (!e || e.word.includes(' ') || STOP.has(l) || BASIC.has(l)) continue;
      const card = cards.get(l) || null;
      if (!out.has(l)) out.set(l, { lemma: l, entry: e, card, tokens: [] });
      out.get(l).tokens.push(t);
      break;
    }
  }
  return [...out.values()];
}

// Kullanıcı bu kelimeyi bilmiyor mu? (kart yok ya da known/öğrenildi/olgun değil)
export const unknownHit = x => !x.card || !isKnownLevel(x.card);

// Sayaçlar
export function counts(cards = store.all('cards')) {
  const by = { new: 0, learning: 0, mature: 0, known: 0, grad: 0 };
  for (const c of cards) by[level(c)]++;
  by.knowTotal = by.known + by.grad + by.mature;
  return by;
}
