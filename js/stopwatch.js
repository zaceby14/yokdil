// Kronometre (üst çubuk). Bu cihazda tutulur, senkron edilmez. Sayfa değişse/yenilense de çalışmaya devam eder.
import { h } from './util.js';

const KEY = 'yokdil.sw';
// Saf: geçen süre (ms)
export const elapsed = (s, now = Date.now()) => (s.acc || 0) + (s.running && s.start ? now - s.start : 0);
// Saf: 75000 → "01:15", 3725000 → "1:02:05"
export function fmt(ms) {
  const t = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(t / 3600), mm = Math.floor(t / 60) % 60, ss = t % 60;
  const p = n => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}
// Saf durum geçişleri
export const start = (s, now = Date.now()) => s.running ? s : { ...s, running: true, start: now };
export const stop = (s, now = Date.now()) => s.running ? { ...s, running: false, acc: elapsed(s, now), start: 0 } : s;
export const reset = () => ({ running: false, start: 0, acc: 0, laps: [] });
export const lap = (s, now = Date.now()) => ({ ...s, laps: [...(s.laps || []), elapsed(s, now)].slice(-20) });

const load = () => { try { return { ...reset(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return reset(); } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

export function initStopwatch() {
  const anchor = document.querySelector('.top-actions a[data-r="eksikler"]');
  if (!anchor || document.getElementById('swTop')) return;
  const lbl = h('span.sw-time');
  const btn = h('button.icon-btn.sw-top', { id: 'swTop', type: 'button', 'aria-label': 'Kronometre', 'aria-expanded': 'false' },
    h('span', { html: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5M12 2.5V5M18.5 6.5l1.5-1.5"/></svg>' }), lbl);
  anchor.before(btn);

  const big = h('div.sw-big', '00:00');
  const goBtn = h('button.btn.primary.sw-go', { type: 'button' });
  const lapBtn = h('button.btn.sw-lap', { type: 'button' }, 'Tur');
  const rstBtn = h('button.btn.sw-reset', { type: 'button' }, 'Sıfırla');
  const laps = h('ol.sw-laps');
  const panel = h('div.sw-panel.hidden', { id: 'swPanel', role: 'dialog', 'aria-label': 'Kronometre' },
    h('div.sw-head', h('b', 'Kronometre'), h('button.sw-x', { type: 'button', 'aria-label': 'Kapat' }, '×')),
    big, h('div.sw-row', goBtn, lapBtn, rstBtn), laps,
    h('p.small.muted', 'Sayfa değişse de çalışır. Bu cihazda tutulur.'));
  document.body.append(panel);

  let s = load(), timer = 0;
  const draw = () => {
    const e = elapsed(s);
    big.textContent = fmt(e);
    lbl.textContent = s.running || s.acc ? fmt(e) : '';
    btn.classList.toggle('on', !!s.running);
    btn.classList.toggle('paused', !s.running && !!s.acc);
    goBtn.textContent = s.running ? 'Durdur' : s.acc ? 'Devam' : 'Başlat';
    lapBtn.disabled = !s.running;
    rstBtn.disabled = !s.running && !s.acc;
    laps.innerHTML = '';
    (s.laps || []).forEach((t, i, a) => laps.append(h('li', h('span', `Tur ${i + 1}`), h('b', fmt(t - (a[i - 1] || 0))), h('span.muted', fmt(t)))));
  };
  const tick = () => {
    clearInterval(timer);
    if (s.running) timer = setInterval(draw, 500);
    draw();
  };
  const set = n => { s = n; save(s); tick(); };
  const open = v => { panel.classList.toggle('hidden', !v); btn.setAttribute('aria-expanded', String(v)); };

  btn.onclick = e => { e.stopPropagation(); open(panel.classList.contains('hidden')); };
  panel.querySelector('.sw-x').onclick = () => open(false);
  goBtn.onclick = () => set(s.running ? stop(s) : start(s));
  lapBtn.onclick = () => set(lap(s));
  rstBtn.onclick = () => set(reset());
  document.addEventListener('click', e => { if (!panel.contains(e.target) && e.target !== btn) open(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
  window.addEventListener('storage', e => { if (e.key === KEY) { s = load(); tick(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
  tick();
}
