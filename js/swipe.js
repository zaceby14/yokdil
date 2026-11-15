// Sağa/sola kaydırma (tek elle kullanım). swipe(el, { left, right, tap }) → kaldırma fonksiyonu
export function swipe(el, { left, right, tap, min = 70 } = {}) {
  let x0 = null, y0 = 0, dx = 0, id = null;
  const reset = () => { el.style.transform = ''; el.style.transition = ''; el.classList.remove('sw-l', 'sw-r'); };
  const down = e => {
    if (e.target.closest('button, a, input, textarea, select')) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId;
  };
  const move = e => {
    if (x0 == null || e.pointerId !== id) return;
    dx = e.clientX - x0;
    if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - y0)) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`;
    el.classList.toggle('sw-r', dx > min / 2); el.classList.toggle('sw-l', dx < -min / 2);
  };
  const up = e => {
    if (x0 == null || e.pointerId !== id) return;
    const d = dx; x0 = null;
    reset();
    if (d > min && right) right();
    else if (d < -min && left) left();
    else if (Math.abs(d) < 8 && tap && !e.target.closest('button, a, input, textarea, select')) tap();
  };
  const cancel = () => { x0 = null; reset(); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.style.touchAction = 'pan-y';
  return () => {
    el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', cancel);
  };
}
