// Sınav stratejisi araçları: Süre planı, Hedef net, Sınav günü, Kaynaklar (data/aids.json; bölüm yoksa araç görünmez)
import * as store from '../store.js';
import { h, add, fmtDate } from '../util.js';
import { planRows, targetFor, netRows, lastFullMock } from '../strategy.js';

const arr = x => Array.isArray(x) ? x : [];

// Süre planı: çözme sırasına göre bölüm başına hedef dakika (tek ekran, çubuklu)
export function timePlanView(root, a) {
  const tp = a.timePlan, rows = planRows(tp);
  const max = Math.max(...rows.map(r => r.minutes), 1);
  const sum = rows.reduce((s, r) => s + r.minutes, 0);
  let acc = 0;
  root.append(
    h('p.small.muted', `${tp.total || 180} dk · ${rows.reduce((s, r) => s + r.count, 0)} soru · sıra soldaki numara`),
    h('ol.tplan', rows.map((r, i) => {
      acc += r.minutes;
      return h('li', h('span.tp-n', i + 1),
        h('div.grow', h('div.row.between', h('b', r.label), h('span.tp-min', `${r.minutes} dk`)),
          h('div.tp-bar', h('i', { style: `width:${(r.minutes / max * 100).toFixed(0)}%` })),
          h('div.small.muted', [r.count ? `${r.count} soru` : '', r.count ? `≈ ${Math.round(r.minutes * 60 / r.count)} sn/soru` : '', `biter: ${acc}. dk`].filter(Boolean).join(' · ')),
          r.tip ? h('div.small', r.tip) : null));
    })),
    (tp.total || 180) - sum > 0 ? h('div.note', `Kalan ${(tp.total || 180) - sum} dk: işaretli sorular + optik kontrol.`) : null,
    tp.note ? h('p.small', tp.note) : null,
    arr(tp.rules).length ? h('section.card', h('h3', 'Kurallar'), h('ul.plain', arr(tp.rules).map(x => h('li', String(x))))) : null,
    h('p.small.muted', 'Tam denemede her bölümün süresi ekranda görünür.'));
}

// Hedef net: hedef puan → bölüm başına gereken net; yanında son tam denemen ve fark
export function targetView(root, a) {
  const scores = [...new Set(arr(a.targets).map(t => +t.score).filter(Boolean))].sort((x, y) => x - y);
  const box = h('div');
  root.append(box);
  const draw = () => {
    const set = +store.settings().targetScore || 0;
    const cur = scores.includes(set) ? set : (scores.filter(s => s <= set).at(-1) || scores[Math.min(1, scores.length - 1)]);
    const t = targetFor(a.targets, cur);
    const mock = lastFullMock(store.all('mocks'));
    const rows = netRows(t, mock);
    const mine = mock ? rows.reduce((s, r) => s + (r.mine || 0), 0) : null;
    const diff = d => d == null ? '' : d > 0 ? '+' + d : d === 0 ? '✓' : '−' + Math.abs(d);
    box.innerHTML = '';
    add(box,
      h('div.seg.target-seg', scores.map(s => h('button' + (s === cur ? '.active' : ''), { type: 'button', 'aria-pressed': String(s === cur), onclick: () => { store.setSetting('targetScore', s); draw(); } }, s + ' puan'))),
      set && !scores.includes(set) ? h('p.small.muted', `Ayarlar'daki hedefin ${set}; en yakın tablo: ${cur}.`) : null,
      h('div.tblwrap', h('table.mock.nettable',
        h('tr', h('th', 'Bölüm'), h('th', 'Gereken'), mock ? h('th', 'Senin') : null, mock ? h('th', 'Fark') : null),
        rows.map(r => h('tr', h('td', r.label, h('span.small.muted', ` ${r.n}`)), h('td', r.need),
          mock ? h('td', r.mine ?? '–') : null, mock ? h('td' + (r.diff == null ? '' : r.diff < 0 ? '.bad-t' : '.good-t'), diff(r.diff)) : null)),
        h('tr.total', h('td', 'Toplam', h('span.small.muted', ' 80')), h('td', t.total), mock ? h('td', mine) : null,
          mock ? h('td' + (mine - t.total < 0 ? '.bad-t' : '.good-t'), diff(mine - t.total)) : null))),
      h('p.small.muted', `${t.total} doğru × 1,25 = ${(t.total * 1.25).toLocaleString('tr-TR')} puan. Yanlış doğruyu götürmez.`),
      t.note ? h('p.small', t.note) : null,
      mock ? h('p.small.muted', `Senin: ${fmtDate(mock.date)}${mock.name ? ' · ' + mock.name : ''}`)
        : h('div.note', 'Tam deneme çözünce kendi netlerin ve fark burada görünür.'),
      mock ? null : h('a.btn.wide', { href: '#/cikmis' }, 'Denemelere git'));
  };
  draw();
}

// Sınav günü: tiklenebilir kontrol listesi (cihazlar arası senkron)
export function examDayView(root, a) {
  const box = h('div');
  root.append(box);
  const draw = () => {
    const done = store.get('progress', 'examday')?.done || {};
    box.innerHTML = '';
    add(box, arr(a.examDay).filter(g => arr(g?.items).length).map((g, gi) => h('section.card', h('h3', g.when || ''),
      h('ul.checklist', arr(g.items).map((x, ii) => {
        const k = gi + ':' + ii, on = !!done[k], txt = typeof x === 'string' ? x : x?.text || x?.label || '';
        return h('li' + (on ? '.done' : ''), h('button.check', { type: 'button', role: 'checkbox', 'aria-checked': String(on), 'aria-label': txt,
          onclick: () => { store.patch('progress', 'examday', { done: { ...done, [k]: !on } }); draw(); } }, on ? '✓' : ''), h('span.grow', txt));
      })))));
  };
  draw();
}

// Kaynaklar: bağlantı listesi (yeni sekmede)
export function resourcesView(root, a) {
  root.append(h('ul.list.reslist', arr(a.resources).filter(r => r?.title).map(r => {
    const inner = [h('b', r.title), r.kind ? h('span.chip.small', r.kind) : null, r.url ? h('span.small.muted.ext', '↗') : null, r.note ? h('span.small.muted', r.note) : null];
    return h('li', /^https?:\/\//.test(r.url || '') ? h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, inner) : h('span', inner));
  })));
}
