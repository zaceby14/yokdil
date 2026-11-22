// El yapımı SVG grafikler (renkler CSS sınıflarından)
import { esc, dayKey, addDays, parseDay } from './util.js';

const cls = v => v >= 0.75 ? 'good' : v >= 0.5 ? 'mid' : 'bad';

// Yatay çubuk: rows [{label, value 0..1, note}]
export function hbars(rows, { width = 340 } = {}) {
  if (!rows.length) return '<p class="muted small">Veri yok</p>';
  const rh = 26, lw = 128, bw = width - lw - 54;
  const H = rows.length * rh;
  const g = rows.map((r, i) => {
    const y = i * rh;
    return `<text x="0" y="${y + 17}" class="lbl">${esc(r.label)}</text>
      <rect x="${lw}" y="${y + 6}" width="${bw}" height="14" rx="4" class="track"/>
      <rect x="${lw}" y="${y + 6}" width="${Math.max(2, bw * r.value)}" height="14" rx="4" class="bar ${cls(r.value)}"/>
      <text x="${width}" y="${y + 17}" class="val" text-anchor="end">${Math.round(r.value * 100)}%${r.note ? ' ' + esc(r.note) : ''}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${H}" width="100%" role="img">${g}</svg>`;
}

// Son 8 hafta ısı haritası: value(dayKey) → sayı
export function heatmap(value, today = dayKey()) {
  const s = 14, gap = 3;
  // Pazartesi başlangıçlı haftalar
  const wd = (parseDay(today).getDay() + 6) % 7;
  const start = addDays(today, -wd - 7 * 7);
  let cells = '';
  let max = 1;
  const vals = [];
  for (let w = 0; w < 8; w++) for (let d = 0; d < 7; d++) {
    const k = addDays(start, w * 7 + d);
    const v = k > today ? -1 : value(k);
    vals.push([w, d, k, v]); if (v > max) max = v;
  }
  for (const [w, d, k, v] of vals) {
    const lvl = v < 0 ? 'fut' : v === 0 ? 'l0' : 'l' + Math.min(4, Math.ceil((v / max) * 4));
    cells += `<rect x="${24 + w * (s + gap)}" y="${d * (s + gap)}" width="${s}" height="${s}" rx="3" class="hm ${lvl}"><title>${k}: ${Math.max(v, 0)}</title></rect>`;
  }
  const days = ['Pt', '', 'Ça', '', 'Cu', '', 'Pz'].map((t, i) => `<text x="0" y="${i * (s + gap) + 11}" class="lbl small">${t}</text>`).join('');
  const W = 24 + 8 * (s + gap), H = 7 * (s + gap);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${Math.min(W * 1.6, 340)}" role="img">${days}${cells}</svg>`;
}

// Puan eğilimi (çizgi): points [{label, v}] 0..100
export function line(points, { width = 340, height = 120, max = 100, goal = 0 } = {}) {
  if (!points.length) return '';
  const pl = 28, pb = 18, w = width - pl - 8, hh = height - pb - 8;
  const x = i => pl + (points.length === 1 ? w / 2 : (i * w) / (points.length - 1));
  const y = v => 8 + hh - (v / max) * hh;
  const grid = [0, 50, 100].map(v => `<line x1="${pl}" x2="${width - 8}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="0" y="${y(v) + 4}" class="lbl small">${v}</text>`).join('');
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" class="dot${p.cls ? ' ' + p.cls : ''}"/><text x="${x(i)}" y="${height - 4}" class="lbl small${p.cls ? ' ' + p.cls : ''}" text-anchor="middle">${esc(p.label)}</text>`).join('');
  const gl = goal > 0 && goal <= max ? `<line x1="${pl}" x2="${width - 8}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" class="goalL"/><text x="${width - 8}" y="${(y(goal) - 3).toFixed(1)}" class="lbl small goalT" text-anchor="end">hedef ${goal}</text>` : '';
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" width="100%" role="img">${grid}${gl}<path d="${path}" class="lineP"/>${dots}</svg>`;
}

// Yığılmış bölüm çubuğu: rows [{label, d, y, b, n}]
export function stacked(rows, { width = 340 } = {}) {
  const rh = 24, lw = 132, bw = width - lw - 44;
  const g = rows.map((r, i) => {
    const yy = i * rh, n = r.n || 1;
    const wd = bw * (r.d / n), wy = bw * (r.y / n);
    return `<text x="0" y="${yy + 16}" class="lbl">${esc(r.label)}</text>
      <rect x="${lw}" y="${yy + 5}" width="${bw}" height="14" rx="4" class="track"/>
      <rect x="${lw}" y="${yy + 5}" width="${wd}" height="14" class="bar good"/>
      <rect x="${lw + wd}" y="${yy + 5}" width="${wy}" height="14" class="bar bad"/>
      <text x="${width}" y="${yy + 16}" class="val" text-anchor="end">${r.d}/${n}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${rows.length * rh}" width="100%" role="img">${g}</svg>`;
}

// Haftalık çubuklar + hedef çizgisi: points [{label, v|null}], goal
export function weekBars(points, { width = 340, height = 130, goal = 0, unit = '' } = {}) {
  if (!points.some(p => p.v != null)) return '';
  const pl = 30, pb = 18, pt = 14, w = width - pl - 6, hh = height - pb - pt;
  const max = Math.max(goal, ...points.map(p => p.v || 0)) * 1.15 || 1;
  const y = v => pt + hh - (v / max) * hh;
  const bw = w / points.length;
  const bars = points.map((p, i) => {
    const x = pl + i * bw + bw * 0.18, ww = bw * 0.64;
    const lbl = `<text x="${(x + ww / 2).toFixed(1)}" y="${height - 4}" class="lbl small" text-anchor="middle">${esc(p.label)}</text>`;
    if (p.v == null) return lbl + `<rect x="${x.toFixed(1)}" y="${y(0) - 2}" width="${ww.toFixed(1)}" height="2" class="track"/>`;
    return lbl + `<rect x="${x.toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${ww.toFixed(1)}" height="${Math.max(2, y(0) - y(p.v)).toFixed(1)}" rx="3" class="bar ${goal && p.v < goal ? 'mid' : 'good'}"><title>${esc(p.label)}: ${p.v}${unit}</title></rect>
      <text x="${(x + ww / 2).toFixed(1)}" y="${(y(p.v) - 3).toFixed(1)}" class="val small" text-anchor="middle">${p.v}</text>`;
  }).join('');
  const g = goal ? `<line x1="${pl}" x2="${width - 6}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" class="goalL"/><text x="0" y="${(y(goal) + 4).toFixed(1)}" class="lbl small">${goal}</text>` : '';
  return `<svg class="chart weekbars" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Haftalık okuma hızı">${bars}${g}</svg>`;
}
