// Kartlar: SRS tekrarı, liste (ara/filtre/düzenle/sil), manuel ekleme
import * as store from '../store.js';
import { h, esc, uid, toast } from '../util.js';
import { dueCards, newQueue, cardFromWord, review, previewLabel, GRADES, GRADE_TR, stats } from '../srs.js';
import { tick } from '../plan.js';

const SRC = ['Ikigai', 'More to Read', 'Diğer'];
const STATE_TR = { new: 'Yeni', learning: 'Öğreniliyor', relearn: 'Tekrar öğren', review: 'Tekrar' };

function tabs(active) {
  return h('div.seg', [['', 'Tekrar'], ['liste', 'Liste'], ['ekle', '+ Ekle']].map(([k, l]) =>
    h('a' + (active === k ? '.active' : ''), { href: '#/kartlar' + (k ? '/' + k : '') }, l)));
}

export default async function render(root, [mode, id]) {
  if (mode === 'liste') return list(root);
  if (mode === 'ekle') return form(root, null);
  if (mode === 'duzenle') return form(root, store.get('cards', id));
  if (mode === 'calis') return session(root);
  return home(root, mode === 'yeni');
}

async function home(root, autostart) {
  if (autostart) return session(root);
  const due = dueCards().length;
  const nq = (await newQueue()).length;
  const st = stats();
  root.append(tabs(''),
    h('div.stats3', h('div', h('b', due), h('span', 'tekrar')), h('div', h('b', nq), h('span', 'yeni (bugün)')),
      h('div', h('b', store.all('cards').length), h('span', 'toplam'))),
    h('a.btn.primary.wide.big-btn' + (due + nq ? '' : '.disabled'), { href: '#/kartlar/calis' }, due + nq ? 'Başla' : 'Bugünlük bitti'),
    h('p.small.muted.center', `Yeni ${st.new} · Öğreniliyor ${st.learning} · Olgun ${st.mature}`)
  );
}

function hl(ctx, word) {
  if (!ctx) return '';
  const w = (word || '').trim();
  if (!w) return esc(ctx);
  const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\w*)', 'i');
  return esc(ctx).replace(re, '<mark>$1</mark>');
}

async function session(root) {
  const queue = dueCards().map(c => ({ card: c }));
  queue.push(...await newQueue());
  const reverseOn = store.settings().reverse;
  let done = 0;
  const show = () => {
    root.innerHTML = '';
    root.append(tabs(''));
    if (!queue.length) {
      if (!dueCards().length) tick('kart');
      root.append(h('div.card.center', h('div.big', done), h('p', 'kart çalışıldı'), h('a.btn', { href: '#/bugun' }, 'Bugün')));
      return;
    }
    const item = queue.shift();
    let card = item.card;
    if (!card) { card = cardFromWord(item.word); }
    const rev = reverseOn && card.state === 'review' && (card.reps || 0) % 2 === 1;
    const front = h('div.flash',
      h('div.small.muted', `${queue.length + 1} kaldı · ${STATE_TR[card.state || 'new']}`),
      rev ? h('div.fword', card.tr || '?') : h('div.fword', { lang: 'en' }, card.word),
      card.ctx ? h('div.ctx', { lang: 'en', html: rev ? esc(card.ctx).replace(new RegExp(esc(card.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'ig'), '____') : hl(card.ctx, card.word) }) : null
    );
    const back = h('div.back.hidden',
      h('div.ftr', rev ? card.word : card.tr || '—'),
      card.pos || card.tags?.length ? h('div.chips.centerx', card.pos ? h('span.small.muted', card.pos + ' ') : null, (card.tags || []).filter(t => t !== 'fen').map(t => h('span.chip.small', t))) : null,
      card.syn?.length ? h('div', h('b', 'Eş: '), card.syn.join(', ')) : null,
      card.coll ? h('div', h('b', 'Eşdizim: '), card.coll) : null,
      card.ex ? h('div.ex', { lang: 'en' }, card.ex) : null,
      card.note ? h('div.small', card.note) : null,
      h('div.small.muted', [card.source, card.page ? 's. ' + card.page : ''].filter(Boolean).join(' · '))
    );
    const grades = h('div.grades.hidden', GRADES.map(g => h('button.g-' + g, {
      onclick: () => {
        if (!store.get('cards', card.id)) store.put('cards', card);
        const next = review(store.get('cards', card.id) || card, g);
        done++;
        if (next.due < Date.now() + 20 * 60000) queue.push({ card: next });
        show();
      }
    }, h('b', GRADE_TR[g]), h('span', previewLabel(card, g)))));
    const reveal = h('button.btn.primary.wide.big-btn', { onclick: () => { back.classList.remove('hidden'); grades.classList.remove('hidden'); reveal.remove(); } }, 'Göster');
    root.append(h('div.card', front, back), reveal, grades);
  };
  show();
}

function list(root) {
  const q = h('input', { type: 'search', placeholder: 'Ara (İng/Tr)' });
  const fs = h('select', h('option', { value: '' }, 'Tüm kaynaklar'),
    ['Notlarım', 'Çekirdek', 'Okuma', ...SRC].map(s => h('option', { value: s }, s)));
  const fst = h('select', h('option', { value: '' }, 'Tüm durumlar'), Object.entries(STATE_TR).map(([k, v]) => h('option', { value: k }, v)));
  const ul = h('ul.list.compact');
  const count = h('div.small.muted');
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    let cs = store.all('cards').filter(c =>
      (!s || (c.word || '').toLowerCase().includes(s) || (c.tr || '').toLowerCase().includes(s)) &&
      (!fs.value || (c.source || '').startsWith(fs.value)) &&
      (!fst.value || (c.state || 'new') === fst.value));
    cs.sort((a, b) => (a.word || '').localeCompare(b.word || '', 'en'));
    count.textContent = cs.length + ' kart';
    ul.innerHTML = '';
    for (const c of cs.slice(0, 300)) ul.append(h('li', h('a', { href: '#/kartlar/duzenle/' + encodeURIComponent(c.id) },
      h('b', { lang: 'en' }, c.word), h('span.small.muted', `${c.tr || ''}`), h('span.chip.small', STATE_TR[c.state || 'new']))));
    if (cs.length > 300) ul.append(h('li.muted.small', 'İlk 300 gösteriliyor, aramayı daralt'));
  };
  q.oninput = draw; fs.onchange = draw; fst.onchange = draw;
  root.append(tabs('liste'), q, h('div.row', fs, fst), count, ul);
  draw();
}

function form(root, c) {
  const f = (ph, v) => h('input', { placeholder: ph, value: v || '' });
  const word = f('kelime / öbek', c?.word), tr = f('Türkçe anlam', c?.tr), syn = f('eş anlamlılar (virgülle)', (c?.syn || []).join(', '));
  const coll = f('eşdizim (ops.)', c?.coll);
  const note = h('textarea', { rows: 2, placeholder: 'not / örnek' }); note.value = c?.note || '';
  const curSrc = c?.source || 'Diğer';
  const srcOpts = SRC.includes(curSrc) ? SRC : [curSrc, ...SRC];
  const src = h('select', srcOpts.map(s => h('option', { value: s, selected: s === curSrc }, s)));
  const page = f('sayfa', c?.page);
  page.inputMode = 'numeric';
  root.append(tabs(c ? '' : 'ekle'),
    h('h2', c ? 'Kartı düzenle' : 'Yeni kart'),
    h('label', 'Kelime', word), h('label', 'Anlam', tr), h('label', 'Eş anlamlı', syn), h('label', 'Eşdizim', coll),
    h('label', 'Not', note),
    h('div.row', h('label.grow', 'Kaynak', src), h('label', { style: 'width:7rem' }, 'Sayfa', page)),
    c?.ctx ? h('div.ctx.small', { lang: 'en' }, c.ctx) : null,
    h('button.btn.primary.wide', {
      onclick: () => {
        const w = word.value.trim(); if (!w) return toast('Kelime boş');
        const dup = !c && store.all('cards').find(x => (x.word || '').toLowerCase() === w.toLowerCase());
        if (dup) { toast('Bu kelime zaten var'); location.hash = '#/kartlar/duzenle/' + encodeURIComponent(dup.id); return; }
        store.put('cards', {
          ...(c || { id: uid('c'), state: 'new', createdAt: Date.now() }),
          word: w, tr: tr.value.trim(), syn: syn.value.split(',').map(s => s.trim()).filter(Boolean),
          coll: coll.value.trim(), note: note.value.trim(), source: src.value, page: page.value.trim()
        });
        toast(c ? 'Kaydedildi' : 'Eklendi');
        if (c) location.hash = '#/kartlar/liste'; else { word.value = tr.value = syn.value = coll.value = note.value = ''; word.focus(); }
      }
    }, c ? 'Kaydet' : 'Ekle'),
    c ? h('button.btn.danger.wide', { onclick: () => { if (confirm('Kart silinsin mi?')) { store.del('cards', c.id); location.hash = '#/kartlar/liste'; } } }, 'Sil') : null,
    c ? h('p.small.muted', `Durum: ${STATE_TR[c.state || 'new']} · aralık ${c.interval || 0} g · unutma ${c.lapses || 0}`) : null
  );
}
