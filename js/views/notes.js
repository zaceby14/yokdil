// Notlar: liste, ara, düzenle, sil, Karta çevir, Tamamlandı
import * as store from '../store.js';
import { h, toast, fmtTime } from '../util.js';
import { quickNotes, parseLines, noteWords, addWords, saveNote } from '../notes.js';

export default function render(root) {
  const q = h('input', { type: 'search', placeholder: 'Notlarda ara' });
  const seg = h('div.seg.small');
  let filter = 'open';
  const ul = h('div');
  const draw = () => {
    seg.innerHTML = '';
    for (const [k, l] of [['open', 'Açık'], ['done', 'Tamamlanan'], ['all', 'Hepsi']])
      seg.append(h('button' + (filter === k ? '.active' : ''), { onclick: () => { filter = k; draw(); } }, l));
    const s = q.value.trim().toLowerCase();
    const ns = quickNotes().filter(n => (filter === 'all' || (filter === 'done') === !!n.done) &&
      (!s || (n.text || '').toLowerCase().includes(s) || (n.ctx?.label || '').toLowerCase().includes(s)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    ul.innerHTML = '';
    if (!ns.length) {
      ul.append(h('p.muted.center.pad', quickNotes().length ? 'Bu filtrede not yok.' : 'Henüz not yok. "Not" düğmesiyle her ekranda not alabilirsin.'));
      return;
    }
    for (const n of ns) ul.append(item(n, draw));
  };
  q.oninput = draw;
  root.append(h('h2', 'Notlarım'), h('p.small.muted.screen-why', 'Çalışırken aldığın kısa notlar; kelime notunu karta çevirebilirsin.'), q, seg, ul);
  draw();
}

function item(n, redraw) {
  const box = h('div.card.qnote' + (n.done ? '.dim' : ''));
  const view = () => {
    box.innerHTML = '';
    const lines = parseLines(n.text);
    box.append(
      h('div.small.muted.row.between', h('span.ellipsis', n.ctx?.label || 'Not'), h('span', fmtTime(n.createdAt || n.updatedAt))),
      h('div.qtext', n.text),
      h('div.row',
        h('button.btn.small' + (n.done ? '.primary' : ''), { onclick: () => { store.patch('notes', n.id, { done: !n.done }); redraw(); } }, n.done ? '✓ Tamamlandı' : 'Tamamlandı'),
        h('button.btn.small', { onclick: () => toCard(lines) }, 'Karta çevir'),
        h('button.btn.small', { onclick: edit }, 'Düzenle'),
        n.ctx?.route && n.ctx.route !== '#/notlar' ? h('a.btn.small', { href: n.ctx.route }, 'Git') : null,
        h('button.icon-x.small', { 'aria-label': 'sil', onclick: () => { if (confirm('Not silinsin mi?')) { store.del('notes', n.id); redraw(); } } }, '×')),
      picker);
  };
  const picker = h('div.picker');
  const toCard = lines => {
    picker.innerHTML = '';
    if (lines?.length) {
      picker.append(h('div.small', `${lines.length} satır "kelime - anlam" biçiminde:`),
        h('div.chips', lines.map(l => h('span.chip', h('b', { lang: 'en' }, l.word), ' ', l.tr))),
        h('button.btn.primary.wide', { onclick: async e => { e.currentTarget.disabled = true; const k = await addWords(lines, n); toast(k ? `+${k} kart eklendi · Yeni kelime'de ilk sırada` : 'Hepsi zaten kartta'); picker.innerHTML = ''; } }, `Hepsini karta ekle (${lines.length})`));
      return;
    }
    const ws = noteWords(n.text);
    if (!ws.length) { picker.append(h('p.small.muted', 'Notta İngilizce kelime yok.')); return; }
    const on = new Set();
    const btn = h('button.btn.primary.wide', { onclick: async e => {
      if (!on.size) return toast('Önce kelimeye dokun');
      e.currentTarget.disabled = true;
      const k = await addWords([...on].map(w => ({ word: w })), n);
      toast(k ? `+${k} kart eklendi · Yeni kelime'de ilk sırada` : 'Zaten kartta'); picker.innerHTML = '';
    } }, 'Seçilenleri karta ekle (0)');
    picker.append(h('div.small.muted', 'Kelimeye dokun, sonra ekle:'),
      h('div.chips', ws.map(w => h('button.chip.pick', { lang: 'en', onclick: e => {
        on.has(w) ? on.delete(w) : on.add(w); e.currentTarget.classList.toggle('on', on.has(w)); btn.textContent = `Seçilenleri karta ekle (${on.size})`;
      } }, w))), btn);
    if (ws.length === 1) picker.querySelector('.chip.pick').click();
  };
  const edit = () => {
    box.innerHTML = '';
    const ta = h('textarea', { rows: 4 }); ta.value = n.text;
    box.append(ta, h('div.row',
      h('button.btn.primary.grow', { onclick: () => { if (!ta.value.trim()) return toast('Not boş'); n = saveNote(ta.value, null, n.id); view(); } }, 'Kaydet'),
      h('button.btn', { onclick: view }, 'Vazgeç')));
    ta.focus();
  };
  view();
  return box;
}
