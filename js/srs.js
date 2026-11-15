// SM-2 türevi aralıklı tekrar. Durumlar: new, learning, review, relearn
import * as store from './store.js';
import { words } from './data.js';
import { endOfToday, dayKey, DAY } from './util.js';
import { newLimit, bumpDay, dayRec, tick } from './plan.js';

const MIN = 60000;
export const GRADES = ['again', 'hard', 'good', 'easy'];
export const GRADE_TR = { again: 'Tekrar', hard: 'Zor', good: 'İyi', easy: 'Kolay' };

// Saf hesap: kart + not → yeni alanlar
export function schedule(card, grade, now = Date.now()) {
  let { state = 'new', ease = 2.5, interval = 0, lapses = 0, reps = 0 } = card;
  let due;
  if (state === 'new' || state === 'learning') {
    if (grade === 'again' || grade === 'hard') { state = 'learning'; interval = 0; due = now + 10 * MIN; }
    else if (grade === 'good') { state = 'review'; interval = 1; }
    else { state = 'review'; interval = 3; ease += 0.15; }
  } else if (state === 'relearn') {
    if (grade === 'again' || grade === 'hard') { due = now + 10 * MIN; }
    else { state = 'review'; interval = Math.max(1, Math.round(interval * (grade === 'easy' ? 0.7 : 0.5))); }
  } else { // review
    if (grade === 'again') { lapses++; state = 'relearn'; ease = Math.max(1.3, ease - 0.2); due = now + 10 * MIN; }
    else if (grade === 'hard') { ease = Math.max(1.3, ease - 0.15); interval = Math.max(interval + 1, Math.round(interval * 1.2)); }
    else if (grade === 'good') { interval = Math.max(interval + 1, Math.round(interval * ease)); }
    else { ease += 0.15; interval = Math.max(interval + 2, Math.round(interval * ease * 1.3)); }
  }
  if (due == null) due = startOfDay(now) + interval * DAY + 4 * 3600000; // ilgili günün sabahı
  return { state, ease: +ease.toFixed(2), interval, lapses, reps: reps + 1, due, lastReview: now };
}

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function previewLabel(card, grade) {
  const s = schedule(card, grade);
  const ms = s.due - Date.now();
  if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + ' dk';
  if (s.interval < 1) return Math.round(ms / 3600000) + ' sa';
  return s.interval + ' g';
}

export function dueCards() {
  const end = endOfToday();
  return store.all('cards').filter(c => c.state && c.state !== 'new' && c.due <= end)
    .sort((a, b) => a.due - b.due);
}

export function dueCount() { return dueCards().length; }

// Bugün eklenebilecek yeni kart sayısı ve listesi (kişisel yeniler önce, sonra çekirdek deste)
export async function newQueue() {
  const r = dayRec();
  if (r.busy) return [];
  const left = Math.max(0, (await newLimit()) - (r.newDone || 0));
  if (!left) return [];
  const personal = store.all('cards').filter(c => (c.state || 'new') === 'new')
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const q = personal.slice(0, left).map(c => ({ card: c }));
  if (q.length < left) {
    const have = new Set(Object.values(store.snapshot().cards).map(c => c.wid).filter(Boolean));
    const known = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
    const core = (await words()).filter(w => !have.has(w.id) && !known.has(w.word.toLowerCase()))
      .sort((a, b) => (b.freq || 0) - (a.freq || 0));
    for (const w of core.slice(0, left - q.length)) q.push({ word: w });
  }
  return q;
}

export function cardFromWord(w) {
  return {
    id: 'w:' + w.id, wid: w.id, word: w.word, pos: w.pos, tr: w.tr, syn: w.syn || [], coll: w.coll || '',
    ex: w.ex || '', tags: w.tags || [], source: 'Çekirdek', state: 'new', createdAt: Date.now()
  };
}

export function review(card, grade) {
  const wasNew = (card.state || 'new') === 'new';
  const next = { ...card, ...schedule(card, grade) };
  store.put('cards', next);
  bumpDay('reviews');
  if (wasNew) {
    const r = bumpDay('newDone');
    newLimit().then(l => { if ((r.newDone || 0) >= l) tick('yeni'); });
  }
  if (!dueCount()) tick('kart');
  return next;
}

export function stats() {
  const c = store.all('cards');
  const by = { new: 0, learning: 0, mature: 0 };
  for (const x of c) {
    const s = x.state || 'new';
    if (s === 'new') by.new++;
    else if (s === 'review' && x.interval >= 21) by.mature++;
    else by.learning++;
  }
  return by;
}

export const todayKey = dayKey;
