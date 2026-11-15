// Kartlar: SRS tekrarı, liste (ara/filtre/düzenle/sil), manuel ekleme
import * as store from '../store.js';
import { h, esc, uid, toast } from '../util.js';
import { dueCards, newQueue, cardFromWord, review, previewLabel, GRADES, GRADE_TR, stats } from '../srs.js';
import { markKnown, unKnow, level, isGraduated } from '../vocab.js';
import { swipe } from '../swipe.js';
import scan from './scan.js';
import gap, { gapPool, GAP_MIN } from './gap.js';
import { tick } from '../plan.js';
import { enrich } from '../data.js';

const SRC = ['Ikigai', 'More to Read', 'Diğer'];
const POS_TR = { n: 'isim', v: 'fiil', adj: 'sıfat', adv: 'zarf', conj: 'bağlaç', prep: 'edat', phr: 'öbek' };
const STATE_TR = { new: 'Yeni', learning: 'Öğreniliyor', relearn: 'Tekrar öğren', review: 'Tekrar', known: 'Biliyorum' };
const stateTr = c => isGraduated(c) ? 'Öğrenildi' : STATE_TR[c.state || 'new'] || c.state;

function tabs(active) {
  return h('div.seg', [['', 'Tekrar'], ['liste', 'Liste'], ['ekle', '+ Ekle']].map(([k, l]) =>
    h('a' + (active === k ? '.active' : ''), { href: '#/kartlar' + (k ? '/' + k : '') }, l)));
}

export default async function render(root, [mode, id]) {
  if (mode === 'liste') return list(root);
  if (mode === 'ekle') return form(root, null);
  if (mode === 'duzenle') return form(root, store.get('cards', id));
  if (mode === 'calis') return session(root);
  if (mode === 'tara') return scan(root, tabs(''));
  if (mode === 'bosluk') return gap(root, tabs(''));
  return home(root, mode === 'yeni');
}

async function home(root, autostart) {
  if (autostart) return session(root);
  const due = dueCards().length;
  const nq = (await newQueue()).length;
  const st = stats();
  const gp = gapPool().length;
  root.append(tabs(''),
    h('div.stats3', h('div', h('b', due), h('span', 'tekrar')), h('div', h('b', nq), h('span', 'yeni (bugün)')),
      h('div', h('b', store.all('cards').length), h('span', 'toplam'))),
    h('a.btn.primary.wide.big-btn' + (due + nq ? '' : '.disabled'), { href: '#/kartlar/calis' }, due + nq ? 'Başla' : 'Bugünlük bitti'),
    h('p.small.muted.center', `Yeni ${st.new} · Öğreniliyor ${st.learning} · Olgun ${st.mature} · Öğrenildi ${st.grad} · Biliyorum ${st.known}`),
    h('div.row2',
      h('a.btn.wide', { href: '#/kartlar/tara' }, h('span', h('b', 'Kelime tara'), h('br'), h('span.small.muted', 'bildiklerini ele'))),
      gp >= GAP_MIN ? h('a.btn.wide', { href: '#/kartlar/bosluk' }, h('span', h('b', 'Boşluk doldurma'), h('br'), h('span.small.muted', 'kendi kartlarınla')))
        : h('span.btn.wide.disabled', h('span', h('b', 'Boşluk doldurma'), h('br'), h('span.small.muted', `${gp}/${GAP_MIN} kartta açılır`))))
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
  let done = 0, keyH = null, unsw = null;
  const seen = new Set(queue.map(q => q.card?.id || 'w:' + q.word.id));
  // "Biliyorum": kotayı yemez, sıradaki yeni kelime gelir
  const knowIt = async card => {
    markKnown(card);
    toast('Bildiklerine eklendi');
    for (const q of await newQueue()) {
      const id = q.card?.id || 'w:' + q.word.id;
      if (!seen.has(id)) { seen.add(id); queue.push(q); }
    }
    show();
  };
  const onKey = e => {
    if (!root.isConnected || e.target.closest?.('input, textarea')) return;
    keyH?.(e);
  };
  addEventListener('keydown', onKey);
  const show = () => {
    unsw?.(); unsw = null; keyH = null;
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
    enrich(card.word).then(en => paint(card, en));
  };
  const paint = (card, en) => {
    const rev = reverseOn && card.state === 'review' && (card.reps || 0) % 2 === 1;
    const front = h('div.flash',
      h('div.small.muted', `${queue.length + 1} kaldı · ${stateTr(card)}`),
      rev ? h('div.fword', card.tr || '?') : h('div.fword', { lang: 'en' }, card.word),
      (card.ctx || en?.ex?.[0]?.en) ? h('div.ctx', { lang: 'en', html: rev ? esc(card.ctx || en.ex[0].en).replace(new RegExp(esc(card.word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*', 'ig'), '____') : hl(card.ctx || en.ex[0].en, card.word) }) : null
    );
    const back = h('div.back.hidden',
      h('div.ftr', rev ? card.word : card.tr || '—'),
      card.pos || card.tags?.length ? h('div.chips.centerx', card.pos ? h('span.small.muted', card.pos + ' ') : null, (card.tags || []).filter(t => t !== 'fen').map(t => h('span.chip.small', t))) : null,
      card.syn?.length ? h('div', h('b', 'Eş: '), card.syn.join(', ')) : null,
      card.coll ? h('div', h('b', 'Eşdizim: '), card.coll) : null,
      extra(card, en),
      card.note ? h('div.small', card.note) : null,
      h('div.small.muted', [card.source, card.page ? 's. ' + card.page : ''].filter(Boolean).join(' · '))
    );
    const grade = g => {
      if (!store.get('cards', card.id)) store.put('cards', card);
      const next = review(store.get('cards', card.id) || card, g);
      done++;
      if (next.due < Date.now() + 20 * 60000) queue.push({ card: next });
      show();
    };
    const grades = h('div.grades.hidden', GRADES.map(g => h('button.g-' + g, { onclick: () => grade(g) },
      h('b', GRADE_TR[g]), h('span', previewLabel(card, g)))));
    const isNew = (card.state || 'new') === 'new' && !card.reps;
    let open = false;
    const doReveal = () => { if (open) return; open = true; back.classList.remove('hidden'); grades.classList.remove('hidden'); reveal.remove(); knowBtn?.remove(); hint.classList.remove('hidden'); };
    const reveal = h('button.btn.primary.wide.big-btn', { onclick: doReveal }, 'Göster');
    const knowBtn = isNew ? h('button.btn.wide.know', { onclick: () => knowIt(card) }, 'Biliyorum, gösterme') : null;
    const hint = h('p.small.muted.center.hidden', '← Tekrar · kaydır · İyi →');
    const box = h('div.card.flashcard', card.check ? h('span.chip.small.ok', 'haftalık kontrol') : null, front, back);
    // Tek el: karta dokun = göster; açıkken sağa = İyi, sola = Tekrar
    unsw = swipe(box, { tap: doReveal, right: () => open && grade('good'), left: () => open && grade('again') });
    keyH = e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doReveal(); }
      else if (open && '1234'.includes(e.key)) grade(GRADES[+e.key - 1]);
      else if (!open && isNew && (e.key === 'k' || e.key === 'K')) knowIt(card);
    };
    root.append(box, reveal, knowBtn, grades, hint);
  };
  show();
  return () => { removeEventListener('keydown', onKey); unsw?.(); };
}

// Kartın arka yüzü: diğer halleri + örnek cümleler (forms.json + words.json + kartın kendi örneği)
function extra(card, en) {
  const wrap = h('div.extra');
  const fam = en?.family || [];
  if (en?.verb || fam.length) {
    wrap.append(h('div.xh', 'Diğer halleri'));
    if (en.verb) wrap.append(h('div.vforms', { lang: 'en' }, en.verb, en.irregular ? h('span.chip.small.warn', 'düzensiz') : null));
    if (fam.length) wrap.append(h('div.fam', fam.map(f => h('div.famrow',
      h('b', { lang: 'en' }, f.w), h('span.small.muted', POS_TR[f.pos] || f.pos), h('span.small', f.tr || '')))));
  }
  const exs = [];
  const seen = new Set();
  // neredeyse aynı cümleleri ele (ilk 4 kelime aynıysa)
  const sig = t => t.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).slice(0, 4).join(' ');
  const add = (en_, tr_) => {
    const k = (en_ || '').trim(); if (!k) return;
    const sg = sig(k);
    const prev = exs.find(e => sig(e[0]) === sg);
    if (prev) { if (!prev[1] && tr_) prev[1] = tr_; return; }
    if (seen.has(k.toLowerCase())) return;
    seen.add(k.toLowerCase()); exs.push([k, tr_]);
  };
  if (card.ex) add(card.ex, '');
  if (en?.core?.ex) add(en.core.ex, '');
  for (const e of en?.ex || []) add(e.en, e.tr);
  if (exs.length) {
    wrap.append(h('div.xh', 'Örnek cümleler'));
    for (const [e, t] of exs.slice(0, 3)) wrap.append(h('div.exrow',
      h('div.ex', { lang: 'en', html: hl(e, card.word) || esc(e) }), t ? h('div.small.muted', t) : null));
  }
  if (!card.coll && en?.core?.coll) wrap.append(h('div.small', h('b', 'Eşdizim: '), en.core.coll));
  return wrap.childNodes.length ? wrap : null;
}

function list(root) {
  const q = h('input', { type: 'search', placeholder: 'Ara (İng/Tr)' });
  const fs = h('select', h('option', { value: '' }, 'Tüm kaynaklar'),
    ['Notlarım', 'Çekirdek', 'Okuma', 'Hata', ...SRC].map(s => h('option', { value: s }, s)));
  const LV = { known: 'Bildiklerim', grad: 'Öğrenildi', eksik: 'Anlam eksik' };
  const fst = h('select', h('option', { value: '' }, 'Tüm durumlar'), Object.entries(STATE_TR).filter(([k]) => k !== 'known').map(([k, v]) => h('option', { value: k }, v)),
    Object.entries(LV).map(([k, v]) => h('option', { value: k }, v)));
  const stOk = c => !fst.value || (fst.value === 'grad' ? level(c) === 'grad' : fst.value === 'eksik' ? !(c.tr || '').trim()
    : fst.value === 'review' ? c.state === 'review' && !isGraduated(c) : (c.state || 'new') === fst.value);
  const ul = h('ul.list.compact');
  const count = h('div.small.muted');
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    let cs = store.all('cards').filter(c =>
      (!s || (c.word || '').toLowerCase().includes(s) || (c.tr || '').toLowerCase().includes(s)) &&
      (!fs.value || (c.source || '').startsWith(fs.value)) &&
      stOk(c));
    cs.sort((a, b) => (a.word || '').localeCompare(b.word || '', 'en'));
    count.textContent = cs.length + ' kart';
    ul.innerHTML = '';
    for (const c of cs.slice(0, 300)) ul.append(h('li', h('a', { href: '#/kartlar/duzenle/' + encodeURIComponent(c.id) },
      h('b', { lang: 'en' }, c.word), h('span.small.muted', `${c.tr || ''}`),
      !(c.tr || '').trim() ? h('span.chip.bad.small', 'anlam eksik') : null,
      h('span.chip.small', stateTr(c))),
      c.state === 'known' ? h('button.btn.small.undo', { onclick: () => { unKnow(c); toast('Yeni kuyruğa alındı'); draw(); } }, 'Geri al') : null));
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
  const preview = h('div.preview');
  const showPreview = async () => {
    preview.innerHTML = '';
    const w = word.value.trim(); if (!w) return;
    const en = await enrich(w);
    if (!en) return;
    if (!tr.value.trim() && en.core?.tr) tr.placeholder = 'öneri: ' + en.core.tr;
    const x = extra({ word: w }, en);
    if (x) preview.append(h('div.card.small-card', x));
  };
  word.addEventListener('change', showPreview);
  page.inputMode = 'numeric';
  root.append(tabs(c ? '' : 'ekle'),
    h('h2', c ? 'Kartı düzenle' : 'Yeni kart'),
    h('label', 'Kelime', word), h('label', 'Anlam', tr), h('label', 'Eş anlamlı', syn), h('label', 'Eşdizim', coll),
    h('label', 'Not', note),
    h('div.row', h('label.grow', 'Kaynak', src), h('label', { style: 'width:7rem' }, 'Sayfa', page)),
    c?.ctx ? h('div.ctx.small', { lang: 'en' }, c.ctx) : null,
    preview,
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
    (showPreview(), null),
    c ? h('p.small.muted', `Durum: ${stateTr(c)} · aralık ${c.interval || 0} g · unutma ${c.lapses || 0}`) : null
  );
}
