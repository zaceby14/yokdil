// Hızlı notlar: sağ altta "Not" düğmesi → panel (oturumu bozmadan). Not bağlamı otomatik kaydeder.
// Kayıt: notes koleksiyonu, kind:'quick'. Çıkmış soru METNİ kopyalanmaz, yalnızca soru kimliği + etiket.
import * as store from './store.js';
import { h, uid, toast, dayKey, lemmas } from './util.js';
import { getCtx } from './ctx.js';
import { STOP } from './vocab.js';

export const quickNotes = () => store.all('notes').filter(n => n.kind === 'quick');

// Saf: "kelime - anlam" satırları → [{word, tr}] (her satır uyuyorsa); yoksa null
export function parseLines(text) {
  const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const out = [];
  for (const l of lines) {
    const m = l.match(/^([A-Za-z][A-Za-z'’ -]{0,40}?)\s*(?:-|–|—|:|=)\s*(.+)$/);
    if (!m || m[1].trim().split(/\s+/).length > 4) return null;
    out.push({ word: m[1].trim().toLowerCase(), tr: m[2].trim() });
  }
  return out;
}

// Saf: nottaki İngilizce kelime adayları (tekrarsız, işlev kelimeleri hariç)
export function noteWords(text) {
  const seen = new Set(), out = [];
  for (const m of String(text || '').matchAll(/[A-Za-z][A-Za-z'’-]+/g)) {
    const w = m[0].toLowerCase();
    if (w.length < 3 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
  }
  return out;
}

// Kelimeleri karta ekle (varsa atla). Döner: eklenen sayısı
export async function addWords(list, note) {
  const { wordIndex } = await import('./data.js');
  const idx = await wordIndex();
  const have = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
  let n = 0;
  for (const { word, tr } of list) {
    const w = word.trim().toLowerCase();
    if (!w || have.has(w)) continue;
    const e = lemmas(w).map(l => idx.get(l)).find(Boolean);
    const core = e && e.word.toLowerCase() === w ? e : null;
    store.put('cards', {
      id: core && !store.raw('cards', 'w:' + core.id)?.word ? 'w:' + core.id : uid('c'), wid: core?.id || null, word: w,
      tr: tr || core?.tr || '', syn: core?.syn || [], coll: core?.coll || '', ex: core?.ex || '', pos: core?.pos || '',
      source: 'Not', note: note?.ctx?.label || '', state: 'new', createdAt: Date.now(), front: Date.now()
    });
    have.add(w); n++;
  }
  return n;
}

export function saveNote(text, ctx = getCtx(), id) {
  const prev = id ? store.get('notes', id) : null;
  const c = ctx ? { type: ctx.type, key: ctx.key || '', label: ctx.label || '', route: ctx.route || '', id: ctx.id || '', para: ctx.para ?? null } : null;
  return store.put('notes', {
    ...(prev || { id: uid('q'), createdAt: Date.now(), day: dayKey(), ctx: c }),
    kind: 'quick', text: String(text).trim()
  });
}

// --- Düğme + panel
let sheet = null, pushed = false;
const open = () => sheet && !sheet.classList.contains('hidden');

export function initNotes() {
  const fab = h('button.fab', { id: 'noteFab', type: 'button', 'aria-label': 'Not al', onclick: () => open() ? close() : show() },
    h('span', { html: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>' }), h('span', 'Not'));
  sheet = h('div.sheet.notesheet.hidden', { id: 'noteSheet' });
  document.body.append(fab, sheet);
  addEventListener('popstate', () => { if (open()) close(true); });
  addEventListener('hashchange', () => { if (open()) { pushed = false; close(true); } });
}

function show() {
  const ctx = getCtx();
  const ta = h('textarea', { rows: 4, placeholder: 'Notun… (kelime - anlam satırları karta çevrilebilir)' });
  let busy = false;
  const save = () => {
    if (busy) return;
    if (!ta.value.trim()) return toast('Not boş');
    busy = true;
    saveNote(ta.value, ctx); toast('Not kaydedildi'); close();
  };
  const same = quickNotes().filter(n => ctx.key && n.ctx?.key === ctx.key).slice(-3);
  sheet.innerHTML = '';
  sheet.append(...[
    h('div.sheet-head', h('b.grow', 'Hızlı not'), h('button.icon-x', { 'aria-label': 'kapat', onclick: () => close() }, '×')),
    h('div.small.muted.ellipsis', 'Bağlam: ' + (ctx.label || '—')),
    same.length ? h('ul.notes.small', same.map(n => h('li', n.text))) : null,
    ta,
    h('div.row', h('button.btn.primary.grow', { onclick: save }, 'Kaydet'), h('a.btn', { href: '#/notlar' }, 'Notlar ›'))].filter(Boolean));
  sheet.classList.remove('hidden');
  document.body.classList.add('note-open');
  if (!matchMedia('(min-width: 900px)').matches) { history.pushState({ note: 1 }, ''); pushed = true; }
  setTimeout(() => ta.focus(), 30);
}

function close(fromPop) {
  if (!sheet) return;
  sheet.classList.add('hidden');
  document.body.classList.remove('note-open');
  if (pushed && fromPop !== true) { pushed = false; history.back(); }
  pushed = false;
}
