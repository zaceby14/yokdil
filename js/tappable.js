// Dokunulabilir metin: kelimeye dokun → alt panel → karta ekle. Uzun bas / öbek modu: başlangıç → bitiş.
import * as store from './store.js';
import { h, uid, lemmas, toast } from './util.js';
import { local, online } from './lookup.js';
import { enrich, wordIndex } from './data.js';
import { coreHits, unknownHit } from './vocab.js';

// Metni parçala: paragraf > cümle > token
export function tokenize(text) {
  const tokens = [], sentences = [], paras = [];
  for (const para of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const pt = [];
    const sents = para.replace(/\s*\n\s*/g, ' ').match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) || [];
    for (const s of sents) {
      const si = sentences.push(s.trim()) - 1;
      for (const m of s.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\d+(?:[.,]\d+)*|\s+|[^\sA-Za-zÀ-ÖØ-öø-ÿ\d]/g)) {
        const t = m[0];
        const tok = { t, s: si, w: /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t), i: tokens.length };
        tokens.push(tok); pt.push(tok);
      }
    }
    paras.push(pt);
  }
  return { tokens, sentences, paras };
}

// opts: { source, page, note, cls, hl } → { el, setPhrase(bool), markSaved(), newCore() }
// hl: çekirdek listede olup bilmediğin kelimeler altı noktalı
export function tappable(text, opts = {}) {
  const { tokens, sentences, paras } = tokenize(text);
  let phraseMode = false, selStart = null, lpTimer = null, lpFired = false, startXY = null;
  const body = h('div.reader' + (opts.cls ? '.' + opts.cls : ''), { lang: 'en' });
  for (const pt of paras) {
    const p = h('p');
    for (const t of pt) p.append(t.w ? h('span.w', { 'data-i': t.i }, t.t) : t.t);
    body.append(p);
  }
  const elAt = i => body.querySelector(`.w[data-i="${i}"]`);
  const clearSel = () => body.querySelectorAll('.sel').forEach(e => e.classList.remove('sel'));

  function markSaved() {
    const single = new Set(), multi = [];
    for (const c of store.all('cards')) {
      const w = (c.word || '').toLowerCase().trim();
      if (!w) continue;
      if (w.includes(' ')) multi.push(w.split(/\s+/)); else single.add(w);
    }
    const ws = tokens.filter(t => t.w);
    body.querySelectorAll('.saved').forEach(e => e.classList.remove('saved'));
    for (const t of ws) if (lemmas(t.t).some(l => single.has(l))) elAt(t.i).classList.add('saved');
    for (const ph of multi) for (let k = 0; k + ph.length <= ws.length; k++) {
      if (ph.every((p, j) => lemmas(ws[k + j].t).includes(p))) for (let j = 0; j < ph.length; j++) elAt(ws[k + j].i).classList.add('saved');
    }
  }

  body.addEventListener('contextmenu', e => { if (e.target.closest('.w')) e.preventDefault(); });
  body.addEventListener('pointerdown', e => {
    const el = e.target.closest('.w'); if (!el) return;
    lpFired = false; startXY = [e.clientX, e.clientY];
    clearTimeout(lpTimer);
    lpTimer = setTimeout(() => {
      lpFired = true; selStart = +el.dataset.i; clearSel(); el.classList.add('sel');
      navigator.vibrate?.(20); toast('Bitiş kelimesine dokun');
    }, 450);
  });
  body.addEventListener('pointermove', e => {
    if (startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) clearTimeout(lpTimer);
  });
  ['pointerup', 'pointercancel'].forEach(ev => body.addEventListener(ev, () => clearTimeout(lpTimer)));
  body.addEventListener('click', e => {
    const el = e.target.closest('.w'); if (!el) return;
    if (lpFired) { lpFired = false; return; }
    const i = +el.dataset.i;
    if (selStart != null) {
      const [a, b] = [Math.min(selStart, i), Math.max(selStart, i)];
      selStart = null; clearSel();
      const sel = tokens.slice(a, b + 1);
      sel.filter(t => t.w).forEach(t => elAt(t.i).classList.add('sel'));
      const phrase = sel.map(t => t.t).join('').replace(/\s+/g, ' ').replace(/[^\w\s'’-]+$/, '').trim();
      openPanel(phrase, sentences[tokens[a].s], true);
      return;
    }
    if (phraseMode) { selStart = i; clearSel(); el.classList.add('sel'); return; }
    clearSel(); el.classList.add('sel');
    openPanel(tokens[i].t, sentences[tokens[i].s], false);
  });

  // Alt panel (tek paylaşılan)
  async function openPanel(word, ctx, isPhrase) {
    const sheet = getSheet();
    sheet.innerHTML = '';
    sheet.classList.remove('hidden');
    sheet._close = () => { sheet.classList.add('hidden'); clearSel(); };
    const hit = await local(word);
    const entry = hit?.entry, card = hit?.card;
    const base = isPhrase ? word.toLowerCase() : (hit?.lemma || word.toLowerCase());
    const wIn = h('input.wordin', { value: card?.word || entry?.word || base });
    const trIn = h('input', { placeholder: 'Türkçe anlam', value: card?.tr || entry?.tr || '' });
    const synIn = h('input', { placeholder: 'eş anlamlılar (virgülle)', value: (card?.syn || entry?.syn || []).join(', ') });
    const ctxIn = h('textarea', { rows: 3 }); ctxIn.value = ctx;
    const info = h('div.small.muted');
    const sugg = h('div.chips');
    const forms = h('div.small.formsline');
    enrich(base).then(en => {
      if (!en) return;
      const parts = [];
      if (en.verb) parts.push(en.verb + (en.irregular ? ' (düzensiz)' : ''));
      for (const f of en.family || []) parts.push(`${f.w} (${f.pos})`);
      if (parts.length) forms.append(h('b', 'Halleri: '), parts.join(' · '));
    });
    if (card) info.append(h('span.chip.ok', 'Kartta var'), ' ');
    if (entry) info.append(h('span.chip', 'Çekirdek liste'), ' ', entry.pos ? `(${entry.pos}) ` : '', entry.coll ? 'Eşdizim: ' + entry.coll : '', ...(entry.tags || []).filter(t => t !== 'fen').map(t => h('span.chip.small', t)));
    sheet.append(
      h('div.sheet-head', wIn, h('button.icon-x', { 'aria-label': 'kapat', onclick: () => sheet._close() }, '×')),
      info, forms, sugg,
      h('label', 'Türkçe anlam', trIn),
      h('label', 'Eş anlamlılar', synIn),
      h('label', 'Bağlam', ctxIn),
      h('button.btn.primary.wide', { onclick: save }, card ? 'Kartı güncelle' : 'Karta ekle')
    );
    if (!entry && !card) {
      info.append('Öneri aranıyor…');
      online(base).then(o => {
        if (sheet.classList.contains('hidden') || wIn.value !== base) return;
        info.textContent = o.def || (o.tr ? '' : 'Öneri yok');
        if (o.tr) { if (!trIn.value) trIn.value = o.tr; sugg.append(h('button.chip', { onclick: () => trIn.value = o.tr }, o.tr)); }
        if (o.syn?.length && !synIn.value) synIn.value = o.syn.join(', ');
      });
    }
    function save() {
      const w = wIn.value.trim(); if (!w) return;
      const syn = synIn.value.split(',').map(s => s.trim()).filter(Boolean);
      const existing = card || store.all('cards').find(c => (c.word || '').toLowerCase() === w.toLowerCase());
      if (existing) {
        store.put('cards', { ...existing, tr: trIn.value.trim(), syn, ctx: ctxIn.value.trim() });
        toast('Güncellendi');
      } else {
        const wid = entry && entry.word.toLowerCase() === w.toLowerCase() ? entry.id : null;
        store.put('cards', {
          id: wid ? 'w:' + wid : uid('c'), wid, word: w, tr: trIn.value.trim(), syn, ctx: ctxIn.value.trim(),
          coll: entry?.coll || '', ex: entry?.ex || '', pos: entry?.pos || '', tags: entry?.tags || [],
          source: opts.source || 'Okuma', page: opts.page || '', note: opts.note || '',
          state: 'new', createdAt: Date.now()
        });
        toast('Karta eklendi');
      }
      document.querySelectorAll('.reader').forEach(r => r._mark?.());
      sheet._close();
    }
  }

  async function markUnknown() {
    if (!opts.hl) return;
    const hits = coreHits(tokens, await wordIndex());
    body.querySelectorAll('.unk').forEach(e => e.classList.remove('unk'));
    for (const x of hits) if (unknownHit(x)) for (const t of x.tokens) elAt(t.i)?.classList.add('unk');
  }
  // Metindeki, kartı olmayan çekirdek kelimeler (parça sonu özeti)
  async function newCore() {
    return coreHits(tokens, await wordIndex()).filter(x => !x.card).map(x => ({ ...x, ctx: sentences[x.tokens[0].s] }));
  }

  body._mark = () => { markSaved(); markUnknown(); };
  body._mark();
  return {
    el: body, markSaved, newCore,
    setPhrase(on) { phraseMode = on; selStart = null; clearSel(); }
  };
}

function getSheet() {
  let s = document.getElementById('wordSheet');
  if (!s) { s = h('div.sheet.hidden', { id: 'wordSheet' }); document.body.append(s); }
  return s;
}

// Sayfa değişince paneli kapat
addEventListener('hashchange', () => document.getElementById('wordSheet')?.classList.add('hidden'));
