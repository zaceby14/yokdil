// Dokunulabilir metin: kelimeye dokun → alt panel → karta ekle. Uzun bas / öbek modu: başlangıç → bitiş.
import * as store from './store.js';
import { h, uid, lemmas, toast } from './util.js';
import { local, online } from './lookup.js';
import { enrich, wordIndex } from './data.js';
import { coreHits, unknownHit } from './vocab.js';
import { speak, canSpeak } from './speak.js';

// Metni parçala: paragraf > cümle > token
export function tokenize(text) {
  const tokens = [], sentences = [], paras = [];
  for (const para of String(text || '').replace(/\r/g, '').split(/\n\s*\n/)) {
    const pt = [];
    const sents = para.replace(/\s*\n\s*/g, ' ').match(/[^.!?]+(?:[.!?]+["'”’)\]]*|$)\s*/g) || [];
    for (const s of sents) {
      const si = sentences.push(s.trim()) - 1;
      for (const m of s.matchAll(/[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*|\d+(?:[.,]\d+)*|-{2,}|_{3,}|\s+|[^\sA-Za-zÀ-ÖØ-öø-ÿ\d]/g)) {
        const t = m[0];
        const tok = { t, s: si, w: /^[A-Za-zÀ-ÖØ-öø-ÿ]/.test(t), i: tokens.length };
        tokens.push(tok); pt.push(tok);
      }
    }
    paras.push(pt);
  }
  return { tokens, sentences, paras };
}

// opts: { source, page, note, cls, hl, inline, tapOpens, ctx, afterPara } → { el, setPhrase(bool), markSaved(), newCore() }
// hl: çekirdek listede olup bilmediğin kelimeler altı noktalı
// inline: <span> içinde (şık metni). tapOpens:false → kısa dokunuş üst öğeye (şık seçimi) gider, UZUN bas = kelime paneli
// ctx: bağlam cümlesi yerine kullanılacak metin (fonksiyon(cümle) ya da metin)
// afterPara(i): her paragrafın ardına eklenecek öğe (aktif okuma kutusu)
export function tappable(text, opts = {}) {
  const { tokens, sentences, paras } = tokenize(text);
  const tapOpens = opts.tapOpens !== false;
  let phraseMode = false, selStart = null, lpTimer = null, lpFired = false, startXY = null;
  const body = h((opts.inline ? 'span' : 'div') + '.reader' + (opts.inline ? '.inline' : '') + (opts.cls ? '.' + opts.cls : ''), { lang: 'en' });
  let nb = 0;
  paras.forEach((pt, pi) => {
    const p = h(opts.inline ? 'span' : 'p');
    for (const t of pt) p.append(t.w ? h('span.w', { 'data-i': t.i }, t.t) : /^(-{2,}|_{3,})$/.test(t.t) ? h('span.blank', { 'data-b': ++nb }, t.t) : t.t);
    body.append(p);
    const extra = opts.afterPara?.(pi, pt.map(t => t.t).join(''));
    if (extra) body.append(extra);
  });
  const ctxOf = sent => typeof opts.ctx === 'function' ? (opts.ctx(sent) || sent) : (opts.ctx || sent);
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
      lpFired = true; lpBlock = true; clearSel(); el.classList.add('sel');
      navigator.vibrate?.(20);
      if (!tapOpens || opts.inline) { const i = +el.dataset.i; openPanel(tokens[i].t, ctxOf(sentences[tokens[i].s]), false); return; }
      selStart = +el.dataset.i; toast('Bitiş kelimesine dokun');
    }, 450);
  });
  body.addEventListener('pointermove', e => {
    if (startXY && Math.hypot(e.clientX - startXY[0], e.clientY - startXY[1]) > 10) clearTimeout(lpTimer);
  });
  ['pointerup', 'pointercancel'].forEach(ev => body.addEventListener(ev, () => clearTimeout(lpTimer)));
  body.addEventListener('click', e => {
    const el = e.target.closest('.w'); if (!el) return;
    if (lpFired) { lpFired = false; e.preventDefault(); e.stopPropagation(); return; }
    if (!tapOpens && !body.closest('.answered')) return; // şık seçimi (üst öğe)
    e.stopPropagation();
    const i = +el.dataset.i;
    if (selStart != null) {
      const [a, b] = [Math.min(selStart, i), Math.max(selStart, i)];
      selStart = null; clearSel();
      const sel = tokens.slice(a, b + 1);
      sel.filter(t => t.w).forEach(t => elAt(t.i).classList.add('sel'));
      const phrase = sel.map(t => t.t).join('').replace(/\s+/g, ' ').replace(/[^\w\s'’-]+$/, '').trim();
      openPanel(phrase, ctxOf(sentences[tokens[a].s]), true);
      return;
    }
    if (phraseMode) { selStart = i; clearSel(); el.classList.add('sel'); return; }
    clearSel(); el.classList.add('sel');
    openPanel(tokens[i].t, ctxOf(sentences[tokens[i].s]), false);
  });

  // Alt panel (tek paylaşılan)
  async function openPanel(word, ctx, isPhrase) {
    const sheet = getSheet();
    sheet.innerHTML = '';
    sheet.classList.remove('hidden');
    sheet._close = () => { sheet.classList.add('hidden'); clearSel(); };
    const hit = await local(word);
    const entry = hit?.entry, card = hit?.card;
    let base = isPhrase ? word.toLowerCase() : (hit?.lemma || word.toLowerCase());
    if (!isPhrase && !hit) base = (await enrich(base).catch(() => null))?.key || guessLemma(base);
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
      h('div.sheet-head', wIn,
        canSpeak() ? h('button.icon-btn.say', { 'aria-label': 'dinle', onclick: () => speak(wIn.value) }, SPK()) : null,
        h('button.icon-x', { 'aria-label': 'kapat', onclick: () => sheet._close() }, '×')),
      info, forms, sugg,
      h('label', 'Türkçe anlam', trIn),
      h('label', 'Eş anlamlılar', synIn),
      h('label', 'Bağlam', ctxIn),
      h('button.btn.primary.wide', { onclick: save }, card ? 'Kartı güncelle' : 'Karta ekle')
    );
    if (!entry && !card) {
      if (!navigator.onLine) info.append('Çevrimdışı: anlamı sen yaz (kart yine kaydedilir).');
      else info.append('Öneri aranıyor…');
      if (navigator.onLine) online(base).then(o => {
        if (sheet.classList.contains('hidden') || wIn.value !== base) return;
        info.textContent = o.def || (o.tr ? '' : 'Öneri bulunamadı (bağlantı yok olabilir): anlamı sen yaz.');
        if (o.tr) { if (!trIn.value) trIn.value = o.tr; sugg.append(h('button.chip', { onclick: () => trIn.value = o.tr }, o.tr)); }
        if (o.syn?.length && !synIn.value) synIn.value = o.syn.join(', ');
      });
    }
    function save() {
      const w = wIn.value.trim(); if (!w) return;
      const syn = synIn.value.split(',').map(s => s.trim()).filter(Boolean);
      const existing = card || store.all('cards').find(c => (c.word || '').toLowerCase() === w.toLowerCase());
      if (existing) {
        const edited = trIn.value.trim() !== (existing.tr || '') || syn.join(',') !== (existing.syn || []).join(',');
        store.put('cards', { ...existing, tr: trIn.value.trim(), syn, ctx: ctxIn.value.trim(), ...(edited ? { userEdited: true } : {}) });
        toast('Güncellendi');
      } else {
        const wid = entry && entry.word.toLowerCase() === w.toLowerCase() ? entry.id : null;
        store.put('cards', {
          id: wid ? 'w:' + wid : uid('c'), wid, word: w, tr: trIn.value.trim(), syn, ctx: ctxIn.value.trim(),
          coll: entry?.coll || '', ex: entry?.ex || '', pos: entry?.pos || '', tags: entry?.tags || [],
          source: opts.source || 'Okuma', page: opts.page || '', note: opts.note || '',
          state: 'new', createdAt: Date.now(), mine: Date.now(),
          ...(wid && (trIn.value.trim() !== (entry.tr || '') || syn.join(',') !== (entry.syn || []).join(',')) ? { userEdited: true } : {})
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

// Uzun basmadan sonra gelen tıklama (parmak/fare biraz kaymış olsa da) şıkkı seçmesin
let lpBlock = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { lpBlock = false; }, true);
  document.addEventListener('click', e => { if (lpBlock) { lpBlock = false; e.preventDefault(); e.stopPropagation(); } }, true);
}

// Saf: sözlükte olmayan kelimede basit kök tahmini (engineers → engineer, studies → study)
export function guessLemma(w) {
  w = String(w || '').toLowerCase();
  if (w.length < 5) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ss|us|is|ous|ics)$/.test(w)) return w;
  if (/(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

// Hoparlör ikonu
export const SPK = () => h('span', { html: '<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>' });

function getSheet() {
  let s = document.getElementById('wordSheet');
  if (!s) { s = h('div.sheet.hidden', { id: 'wordSheet' }); document.body.append(s); }
  return s;
}

// Sayfa değişince paneli kapat
addEventListener('hashchange', () => document.getElementById('wordSheet')?.classList.add('hidden'));
