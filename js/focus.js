// Odak oturumu: 25 dk çalış / 5 dk ayağa kalk (ayarlanabilir). Çalışma dakikaları gün kaydına (focusMin) yazılır.
// Durum localStorage'da: sayfa değişse / uygulama kapansa da sürer.
import * as store from './store.js';
import { h, toast, dayKey } from './util.js';
import { bumpDay } from './plan.js';

const K = 'yokdil.focus', TK = 'yokdil.eveTip';
const MINMS = 60000;
export const BREAK_TIPS = ['Ayağa kalk, biraz yürü.', 'Bir bardak su iç.', 'Pencereden uzağa bak (20 sn).', 'Omuzlarını ve boynunu esnet.', 'Yüzünü yıka, derin nefes al.'];

const load = () => { try { return JSON.parse(localStorage.getItem(K)) || null; } catch { return null; } };
const save = s => s ? localStorage.setItem(K, JSON.stringify(s)) : localStorage.removeItem(K);
export const lens = () => { const s = store.settings(); return { work: +s.focusWork || 25, brk: +s.focusBreak || 5 }; };

// Saf: durum + şimdi → { s (yeni durum), credit (dk) }
export function advance(s, now, { work, brk }) {
  if (!s) return { s: null, credit: 0 };
  let credit = 0;
  s = { ...s };
  if (s.phase === 'work') {
    const upto = Math.min(now, s.endsAt);
    const mins = Math.floor((upto - s.startedAt) / MINMS) - (s.credited || 0);
    if (mins > 0) { credit = mins; s.credited = (s.credited || 0) + mins; }
    if (now >= s.endsAt) {
      const rest = Math.max(0, Math.round((s.endsAt - s.startedAt) / MINMS) - (s.credited || 0));
      credit += rest; s.credited = (s.credited || 0) + rest;
      const bEnd = s.endsAt + brk * MINMS;
      s = now < bEnd ? { phase: 'break', startedAt: s.endsAt, endsAt: bEnd, task: s.task, label: s.label, rounds: (s.rounds || 0) + 1, tip: (s.rounds || 0) % BREAK_TIPS.length }
        : { phase: 'idle', rounds: (s.rounds || 0) + 1, task: s.task, label: s.label };
    }
  } else if (s.phase === 'break' && now >= s.endsAt) {
    s = { phase: 'idle', rounds: s.rounds, task: s.task, label: s.label };
  }
  return { s, credit };
}

let state = load(), iv = null, pill = null, overlay = null;

export const running = () => state && (state.phase === 'work' || state.phase === 'break');

export function startFocus(task = '', label = '') {
  const { work } = lens();
  const now = Date.now();
  state = { phase: 'work', startedAt: now, endsAt: now + work * MINMS, credited: 0, task, label, rounds: state?.rounds || 0 };
  save(state); loop(); eveTip(true);
  toast(`Odak: ${work} dk başladı`);
}

export function stopFocus() {
  tickOnce();
  state = null; save(null); render();
}

function tickOnce() {
  if (!state) return;
  const before = state.phase;
  const { s, credit } = advance(state, Date.now(), lens());
  if (credit) bumpDay('focusMin', credit);
  state = s; save(state);
  if (before === 'work' && state?.phase === 'break' && navigator.userActivation?.hasBeenActive) navigator.vibrate?.([200, 100, 200]);
  if (state?.phase === 'idle') { if (before === 'break') toast('Mola bitti'); state = null; save(null); }
}

function loop() {
  clearInterval(iv);
  tickOnce(); render();
  if (!running()) return;
  iv = setInterval(() => { tickOnce(); render(); if (!running()) clearInterval(iv); }, 1000);
}

const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

function render() {
  if (!pill) return;
  if (!running()) { pill.classList.add('hidden'); overlay?.remove(); overlay = null; return; }
  const left = state.endsAt - Date.now();
  pill.classList.remove('hidden');
  pill.classList.toggle('brk', state.phase === 'break');
  pill.textContent = (state.phase === 'work' ? 'Odak ' : 'Mola ') + mmss(left);
  if (state.phase === 'break') {
    if (!overlay) {
      overlay = h('div.breakscreen', h('div.brk-in',
        h('div.small.muted', 'Mola'), h('div.big.brk-t'),
        h('p.brk-tip', BREAK_TIPS[state.tip || 0]),
        h('button.btn.primary.wide', { onclick: () => startFocus(state.task, state.label) }, 'Yeni blok başlat'),
        h('button.btn.wide', { onclick: stopFocus }, 'Bitir')));
      document.body.append(overlay);
    }
    overlay.querySelector('.brk-t').textContent = mmss(left);
  } else { overlay?.remove(); overlay = null; }
}

function menu() {
  if (!running()) return;
  if (state.phase === 'break') return render();
  if (confirm(`Odak bloğu: ${mmss(state.endsAt - Date.now())} kaldı.\nBloğu bitirmek ister misin?`)) stopFocus();
}

export function initFocus() {
  pill = document.getElementById('focusPill');
  pill?.addEventListener('click', menu);
  loop();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loop(); });
}

// Akşam ipucu: 17:00'den sonra açılışta / odak başlarken, günde bir kez (ayarla kapatılır)
export function eveTip(force) {
  if (store.settings().eveTip === false) return;
  if (new Date().getHours() < 17 || localStorage.getItem(TK) === dayKey()) return;
  if (!force && document.querySelector('.evetip')) return;
  localStorage.setItem(TK, dayKey());
  const b = h('div.evetip', h('span.grow', 'Uykun geliyorsa: ayağa kalk, 25 dk blok, kahve 17:00\'den sonra yok.'),
    h('button.icon-x.small', { 'aria-label': 'kapat', onclick: () => b.remove() }, '×'));
  document.body.append(b);
  setTimeout(() => b.remove(), 15000);
}
