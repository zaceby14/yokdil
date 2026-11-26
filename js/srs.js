// SM-2 türevi aralıklı tekrar. Durumlar: new, learning, review, relearn
import * as store from './store.js';
import { words } from './data.js';
import { endOfToday, dayKey, DAY, addDays } from './util.js';
import { newLimit, bumpDay, dayRec, tick, FINAL } from './plan.js';
import { isGraduated, weeklyChecks, counts, STUDY_STATES } from './vocab.js';
import { loadStars, starOf } from './stars.js';

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

// Yeni/öğrenilen kartta "Zor": aynı oturumda bir kez daha gösterilir
export const hardAgain = c => ['new', 'learning'].includes(c?.state || 'new') && !inLadder(c);

// Merdivendeki kart mı?
export const inLadder = c => c?.ladder != null || c?.state === 'relearn';

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

export function previewLabel(card, grade) {
  const s = schedule(card, grade);
  // Yeni kartta Zor: bugün oturumda bir kez daha + yarın (İyi yalnız yarın) — düğmelerde fark görünsün
  if (grade === 'hard' && hardAgain(card)) return 'bugün + 1 g';
  const ms = s.due - Date.now();
  if (ms < 3600000) return Math.max(1, Math.round(ms / MIN)) + ' dk';
  if (s.interval < 1) return Math.round(ms / 3600000) + ' sa';
  return s.interval + ' g';
}

// Bekleyen kartlar: öğrenilenler hariç; öğrenilenlerden haftalık kontrol (≤5) + oyunda yanlış çekilenler
function rawDue() {
  const end = endOfToday();
  const out = store.all('cards').filter(c => STUDY_STATES.includes(c.state) && c.due <= end && (!isGraduated(c) || c.pulled));
  const have = new Set(out.map(c => c.id));
  for (const c of weeklyChecks()) if (!have.has(c.id)) out.push({ ...c, check: true });
  return out.sort((a, b) => a.due - b.due);
}

// Günlük tekrar tavanı: fazlası sonraki günlere yayılır. Uzun aradan sonra (≥3 gün çalışılmadı) ilk gün daha az.
export const REVIEW_CAP = 60, COMEBACK_CAP = 30, COMEBACK_GAP = 3;
let STARS = null;
loadStars().then(m => { STARS = m; }).catch(() => {});
// Saf: tavan uygula. Bugün oturumda görülmüş (yeniden gelen) kartlar her zaman kalır; gerisi öncelikle sıralanıp kesilir.
// Öncelik: kısa aralıklı (öğreniliyor/merdiven) → çok çıkan (yıldız) → en çok geciken
export function capDue(list, { cap = REVIEW_CAP, done = 0, sod = 0, star = () => 0 } = {}) {
  const inS = list.filter(c => (c.lastReview || 0) >= sod);
  const rest = list.filter(c => (c.lastReview || 0) < sod);
  const short = c => (c.state === 'learning' || c.state === 'relearn' || c.ladder != null || (c.interval || 0) <= 3) ? 0 : 1;
  rest.sort((a, b) => short(a) - short(b) || star(b) - star(a) || (a.due || 0) - (b.due || 0));
  const left = Math.max(0, cap - done);
  return { list: [...inS, ...rest.slice(0, left)], overflow: Math.max(0, rest.length - left) };
}
// Saf: geri dönüş günü mü? (bugünden önceki son çalışılan gün ≥ COMEBACK_GAP+1 gün önce)
export function isComeback(activeDays, today) {
  const past = activeDays.filter(d => d < today).sort();
  if (!past.length) return false;
  const last = past.at(-1);
  return (Date.parse(today) - Date.parse(last)) / DAY > COMEBACK_GAP;
}
export function dueInfo() {
  const today = dayKey();
  const r = dayRec(today);
  let comeback = r.comeback;
  if (comeback == null) {
    const act = store.all('days').filter(d => d.id !== today && ((d.reviews || 0) + (d.answered || 0) > 0 || Object.values(d.tasks || {}).some(Boolean))).map(d => d.id);
    comeback = isComeback(act, today);
    if (comeback) store.put('days', { ...r, id: today, comeback: true }, { silent: true });
  }
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const base = +store.settings().reviewCap || REVIEW_CAP;
  const cap = comeback ? Math.min(base, COMEBACK_CAP) : base;
  const raw = rawDue();
  const { list, overflow } = capDue(raw, { cap, done: r.dueDone || 0, sod: sod.getTime(), star: c => (STARS ? starOf(c.word, STARS) || 0 : 0) });
  return { list, overflow, cap, comeback: !!comeback, raw: raw.length };
}
export function dueCards() { return dueInfo().list; }

export function dueCount() { return dueCards().length; }

// Kendi eklediği kart mı? (okurken dokunma, elle ekleme, not, parça sonu seçimi)
const AUTO_SRC = ['Çekirdek', 'Notlarım', 'Hata'];
export const isMine = c => !!c?.mine || (!!c && !(c.tags || []).includes('hata') && !AUTO_SRC.includes(c.source || 'Çekirdek') && !String(c.id || '').startsWith('s:'));
export const MINE_EXTRA = 10; // dünden kalan kendi kelimeleri limiti en fazla bu kadar aşabilir

// Saf: yeni kuyruk sırası. Kendi eklediklerin (eskiden yeniye) → öne alınanlar (tarama/hata) → notlarım/seed.
// Dünden (ya da önceden) kalan kendi kelimelerin limit dolsa bile gelir (en fazla MINE_EXTRA) → en geç ertesi gün.
export function orderNew(cards, left, startToday, extra = MINE_EXTRA) {
  const fresh = cards.filter(c => (c.state || 'new') === 'new');
  const mine = fresh.filter(isMine).sort((a, b) => (a.mine || a.createdAt || 0) - (b.mine || b.createdAt || 0));
  const rest = fresh.filter(c => !isMine(c)).sort((a, b) => newOrder(a) - newOrder(b));
  const old = mine.filter(c => (c.mine || c.createdAt || 0) < startToday);
  const n = Math.max(left, Math.min(old.length, left + extra));
  return [...mine, ...rest].slice(0, n);
}

// Bugün eklenebilecek yeni kart sayısı ve listesi (kendi kelimelerin önce, sonra çekirdek deste)
export async function newQueue() {
  const r = dayRec();
  if (r.busy) return [];
  const left = Math.max(0, (await newLimit()) - (r.newDone || 0));
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const q = orderNew(store.all('cards'), left, sod.getTime(), FINAL.on ? 0 : MINE_EXTRA).map(c => ({ card: c })); // son 14 gün: limit aşılmaz
  if (q.length < left) {
    const have = new Set(Object.values(store.snapshot().cards).map(c => c.wid).filter(Boolean));
    const known = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
    const core = coreOrder((await words()).filter(w => !have.has(w.id) && !known.has(w.word.toLowerCase())), await starFirst());
    for (const w of core.slice(0, left - q.length)) q.push({ word: w });
  }
  return q;
}

// Ayar açıksa (varsayılan kapalı) ve yıldız verisi varsa: çok çıkanlar önce
export async function starFirst() {
  if (!store.settings().starFirst) return null;
  const m = await loadStars();
  return m.size ? m : null;
}

// Saf: çekirdek kelime sırası — sık olan önce; m (yıldız haritası) verilirse önce yıldız, eşitlikte sıklık. Kararlı.
export function coreOrder(list, m = null) {
  const st = w => (m ? starOf(w.word, m) || 0 : 0);
  return list.map((w, i) => [w, i]).sort(([a, i], [b, j]) => (st(b) - st(a)) || ((b.freq || 0) - (a.freq || 0)) || (i - j)).map(x => x[0]);
}

// Yeni kuyruk sırası: "front" (tarama/hata ile eklenen) en önde
export const newOrder = c => c.front ? c.front - 1e13 : (c.createdAt || 0);

export function cardFromWord(w) {
  return {
    id: 'w:' + w.id, wid: w.id, word: w.word, pos: w.pos, tr: w.tr, syn: w.syn || [], coll: w.coll || '',
    ex: w.ex || '', tags: w.tags || [], source: 'Çekirdek', state: 'new', createdAt: Date.now()
  };
}

// Yazma: 10 gün içinde 2 ayrı gün "Tekrar" denen kelime, kart yerine yazdırılır; 2 ayrı günde doğru yazınca normale döner
export const WRITE_DAYS = 2, WRITE_WIN = 10, WRITE_OK = 2;
export function needWrite(card, today = dayKey()) {
  const from = addDays(today, -WRITE_WIN);
  return (card?.agDays || []).filter(d => d >= from).length >= WRITE_DAYS && (card?.wr?.ok || 0) < WRITE_OK;
}
// Saf: "Tekrar" günü kaydı (tekrarsız, son 5)
export const addAgainDay = (card, today = dayKey()) => ({ agDays: [...new Set([...(card.agDays || []), today])].sort().slice(-5), wr: { ok: 0, day: '' } });
// Saf: yazma sonucu (aynı gün ikinci doğru sayılmaz; yanlış → sıfır)
export function writeResult(card, ok, today = dayKey()) {
  const wr = card.wr || { ok: 0, day: '' };
  if (!ok) return { wr: { ok: 0, day: today } };
  return { wr: wr.day === today && wr.ok > 0 ? wr : { ok: (wr.ok || 0) + 1, day: today } };
}

export function review(card, grade) {
  const wasNew = (card.state || 'new') === 'new';
  if (grade === 'again') card = { ...card, ...addAgainDay(card) };
  const sod0 = new Date(); sod0.setHours(0, 0, 0, 0);
  if (!wasNew && (card.lastReview || 0) < sod0.getTime()) bumpDay('dueDone'); // tavana sayılan ilk tekrar
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
