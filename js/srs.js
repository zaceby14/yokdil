// SM-2 türevi aralıklı tekrar. Durumlar: new, learning, review, relearn
import * as store from './store.js';
import { words } from './data.js';
import { endOfToday, dayKey, DAY } from './util.js';
import { newLimit, bumpDay, dayRec, tick } from './plan.js';
import { isGraduated, weeklyChecks, counts, STUDY_STATES } from './vocab.js';

const MIN = 60000;
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const GRADE_TR = { again: 'Tekrar', hard: 'Zor', good: 'İyi', easy: 'Kolay' };

// Merdiven: "Tekrar" alan kart 10 dk sonra, sonra bildikçe 1-3-7-14 gün sonra kesin gelir
export const LADDER = [1, 3, 7, 14];

// Saf hesap: kart + not → yeni alanlar
export function schedule(card, grade, now = Date.now()) {
  let { state = 'new', ease = 2.5, interval = 0, lapses = 0, reps = 0, ladder = null } = card;
  if (ladder == null && state === 'relearn') ladder = 0; // eski kayıt: relearn → merdiven başı
  let due;
  if (grade === 'again') {
    // Her durumda merdiven başa: 10 dk sonra aynı oturumda
    if (state === 'review' || state === 'relearn') { if (state === 'review') lapses++; ease = Math.max(1.3, ease - (state === 'review' ? 0.2 : 0)); state = 'relearn'; }
    else state = 'learning';
    ladder = 0; interval = 0; due = now + 10 * MIN;
  } else if (ladder != null) {
    // Merdivende: İyi/Kolay bir basamak çıkar (atlama yok), Zor aynı basamakta kalır
    const step = grade === 'hard' ? Math.max(0, ladder - 1) : ladder;
    interval = LADDER[Math.min(step, LADDER.length - 1)];
    ladder = grade === 'hard' ? Math.max(1, ladder) : ladder + 1;
    state = 'review';
    if (ladder >= LADDER.length && grade !== 'hard') ladder = null; // merdiven bitti → normal büyüme
  } else if (state === 'new' || state === 'learning') {
    if (grade === 'hard') { state = 'review'; interval = 1; } // ertesi gün (oturumda bir kez daha gösterilir)
    else if (grade === 'good') { state = 'review'; interval = 1; }
    else { state = 'review'; interval = 3; ease += 0.15; }
  } else { // review
    if (grade === 'hard') { ease = Math.max(1.3, ease - 0.15); interval = Math.max(interval + 1, Math.round(interval * 1.2)); }
    else if (grade === 'good') { interval = Math.max(interval + 1, Math.round(interval * ease)); }
    else { ease += 0.15; interval = Math.max(interval + 2, Math.round(interval * ease * 1.3)); }
  }
  if (due == null) due = startOfDay(now) + interval * DAY + 4 * 3600000; // ilgili günün sabahı
  const hist = [...(Array.isArray(card.hist) ? card.hist : []), grade[0]].slice(-5); // son notlar (mezuniyet için)
  return { state, ease: +ease.toFixed(2), interval, lapses, reps: reps + 1, due, lastReview: now, hist, ladder };
}

// Merdivendeki kart mı?
export const inLadder = c => c?.ladder != null || c?.state === 'relearn';

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function previewLabel(card, grade) {
  const s = schedule(card, grade);
  const ms = s.due - Date.now();
  if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + ' dk';
  if (s.interval < 1) return Math.round(ms / 3600000) + ' sa';
  return s.interval + ' g';
}

// Bekleyen kartlar: öğrenilenler hariç; öğrenilenlerden haftalık kontrol (≤5) + oyunda yanlış çekilenler
export function dueCards() {
  const end = endOfToday();
  const out = store.all('cards').filter(c => STUDY_STATES.includes(c.state) && c.due <= end && (!isGraduated(c) || c.pulled));
  const have = new Set(out.map(c => c.id));
  for (const c of weeklyChecks()) if (!have.has(c.id)) out.push({ ...c, check: true });
  return out.sort((a, b) => a.due - b.due);
}

export function dueCount() { return dueCards().length; }

// Kendi eklediği kart mı? (okurken dokunma, elle ekleme, not, parça sonu seçimi)
const AUTO_SRC = ['Çekirdek', 'Notlarım', 'Hata'];
export const isMine = c => !!c?.mine || (!!c && !(c.tags || []).includes('hata') && !AUTO_SRC.includes(c.source || 'Çekirdek') && !String(c.id || '').startsWith('s:'));
export const MINE_EXTRA = 10; // dünden kalan kendi kelimeleri limiti en fazla bu kadar aşabilir

// Saf: yeni kuyruk sırası. Kendi eklediklerin (eskiden yeniye) → öne alınanlar (tarama/hata) → notlarım/seed.
// Dünden (ya da önceden) kalan kendi kelimelerin limit dolsa bile gelir (en fazla MINE_EXTRA) → en geç ertesi gün.
export function orderNew(cards, left, startToday) {
  const fresh = cards.filter(c => (c.state || 'new') === 'new');
  const mine = fresh.filter(isMine).sort((a, b) => (a.mine || a.createdAt || 0) - (b.mine || b.createdAt || 0));
  const rest = fresh.filter(c => !isMine(c)).sort((a, b) => newOrder(a) - newOrder(b));
  const old = mine.filter(c => (c.mine || c.createdAt || 0) < startToday);
  const n = Math.max(left, Math.min(old.length, left + MINE_EXTRA));
  return [...mine, ...rest].slice(0, n);
}

// Bugün eklenebilecek yeni kart sayısı ve listesi (kendi kelimelerin önce, sonra çekirdek deste)
export async function newQueue() {
  const r = dayRec();
  if (r.busy) return [];
  const left = Math.max(0, (await newLimit()) - (r.newDone || 0));
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const q = orderNew(store.all('cards'), left, sod.getTime()).map(c => ({ card: c }));
  if (q.length < left) {
    const have = new Set(Object.values(store.snapshot().cards).map(c => c.wid).filter(Boolean));
    const known = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
    const core = (await words()).filter(w => !have.has(w.id) && !known.has(w.word.toLowerCase()))
      .sort((a, b) => (b.freq || 0) - (a.freq || 0));
    for (const w of core.slice(0, left - q.length)) q.push({ word: w });
  }
  return q;
}

// Yeni kuyruk sırası: "front" (tarama/hata ile eklenen) en önde
export const newOrder = c => c.front ? c.front - 1e13 : (c.createdAt || 0);

export function cardFromWord(w) {
  return {
    id: 'w:' + w.id, wid: w.id, word: w.word, pos: w.pos, tr: w.tr, syn: w.syn || [], coll: w.coll || '',
    ex: w.ex || '', tags: w.tags || [], source: 'Çekirdek', state: 'new', createdAt: Date.now()
  };
}

export function review(card, grade) {
  const wasNew = (card.state || 'new') === 'new';
  const next = { ...card, ...schedule(card, grade) };
  delete next.pulled; delete next.check;
  if (next.ladder == null) delete next.ladder;
  store.put('cards', next);
  bumpDay('reviews');
  if (wasNew) {
    const r = bumpDay('newDone');
    newLimit().then(l => { if ((r.newDone || 0) >= l) tick('yeni'); });
  }
  if (!dueCount()) tick('kart');
  return next;
}

// {new, learning, mature, known, grad, knowTotal}
export function stats() { return counts(); }

export const todayKey = dayKey;
