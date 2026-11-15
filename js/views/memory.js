// Kalıcı hafıza alıştırmaları: Yazarak hatırla · Eş anlam · Kelime ailesi · Hafıza turu (karışık, 3–5 dk)
import * as store from '../store.js';
import { forms, words, enrich } from '../data.js';
import { h, add, shuffle, dayKey, toast } from '../util.js';
import { runQuiz } from '../quiz.js';
import { tick } from '../plan.js';
import { pool, tourPool, typoOk, blank, synItem, familyItem, memResult } from '../memory.js';
import { setCtx } from '../ctx.js';
import { speak, canSpeak } from '../speak.js';
import { SPK } from '../tappable.js';

export const EX = { yaz: 'Yazarak hatırla', es: 'Eş anlam eşleştir', aile: 'Kelime ailesi', hafiza: 'Hafıza turu' };
const N = 8;

async function sentence(c) {
  const en = await enrich(c.word).catch(() => null);
  for (const s of [c.ctx, c.ex, ...(en?.ex || []).map(e => e.en), en?.core?.ex]) { const b = blank(s, c.word); if (b) return b; }
  return '';
}

async function typeItems(cards, n) {
  const out = [];
  for (const c of shuffle(cards).filter(c => c.tr && c.word.trim().split(/\s+/).length <= 3)) {
    if (out.length >= n) break;
    out.push({ key: 'yaz:' + c.id, cardId: c.id, word: c.word, tr: c.tr, s: await sentence(c) });
  }
  return out;
}

async function synItems(cards, n) {
  const core = await words();
  const others = [...cards, ...shuffle(core).slice(0, 300)];
  const out = [];
  for (const c of shuffle(cards)) {
    if (out.length >= n) break;
    const it = synItem({ ...c, syn: c.syn?.length ? c.syn : (core.find(w => w.id === c.wid)?.syn || []) }, others);
    if (it) out.push(it);
  }
  return out;
}

async function famItems(cards, n) {
  const fm = await forms();
  const out = [];
  for (const c of shuffle(cards)) { if (out.length >= n) break; const it = familyItem(c, fm); if (it) out.push(it); }
  return out;
}

export async function counts() {
  const p = pool(), fm = await forms();
  return { yaz: p.filter(c => c.tr).length, es: p.filter(c => c.syn?.length || c.wid).length, aile: p.filter(c => fm[c.word.toLowerCase()]?.family?.length).length, hafiza: tourPool().length };
}

export default async function memory(root, mode, tabs) {
  root.append(tabs, h('a.btn.small', { href: '#/kartlar' }, '‹ Kartlar'), h('h2', EX[mode] || 'Alıştırma'));
  const box = h('div');
  root.append(box);
  const cards = mode === 'hafiza' ? tourPool() : pool();
  if (!cards.length) {
    box.append(h('div.card', h('p', mode === 'hafiza' ? 'Bugün hafıza turu için kelime yok.' : 'Öğrenmekte olduğun kart yok.'),
      h('p.small.muted', 'Kart çalıştıkça (özellikle "Tekrar" dediklerin) burada çıkar.'), h('a.btn', { href: '#/kartlar/calis' }, 'Kart çalış')));
    return;
  }
  const again = () => h('a.btn.wide', { href: location.hash, onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Yeni tur');
  const sid = `mem:${mode}:${dayKey()}`;
  if (mode === 'yaz') {
    const items = await typeItems(cards, N);
    if (!items.length) { box.append(h('p.muted', 'Anlamı olan kart yok.')); return; }
    return typing(box, items, sid, again);
  }
  let items;
  if (mode === 'es') items = await synItems(cards, N);
  else if (mode === 'aile') items = await famItems(cards, N);
  else {
    // Hafıza turu: karışık, kısa (≈ 3–5 dk)
    const t = await typeItems(cards, 3), s = await synItems(cards, 3), f = await famItems(cards, 2);
    items = shuffle([...s, ...f]);
    if (t.length) return typing(box, t, sid + ':yaz', () => {
      const wrap = h('div');
      if (items.length) runQuiz(wrap, items, quizOpts(sid, () => tick('hafiza')));
      else tick('hafiza');
      return wrap;
    });
  }
  if (!items.length) { box.append(h('p.muted', mode === 'aile' ? 'Kartlarında kelime ailesi bilgisi olan kelime yok.' : 'Eş anlamlısı olan kart yok.')); return; }
  runQuiz(box, items, quizOpts(sid, null, again));
}

const quizOpts = (sid, done, again) => ({
  sid, inline: true, auto: false, name: 'Hafıza', source: 'Alıştırma',
  onAnswer: (it, ok) => memResult(it.cardId, ok),
  onEnd: (_, el) => { done?.(); if (again) el.append(again()); else el.append(h('a.btn.wide', { href: '#/bugun' }, 'Bugün')); }
});

// Yazarak hatırla: Türkçe anlam + boşluklu cümle → İngilizce kelimeyi yaz
function typing(box, items, sid, after) {
  const saved = store.get('sessions', sid);
  const resume = saved && !saved.done && saved.i > 0 && saved.inline?.length;
  if (resume) items = saved.inline;
  let i = resume ? saved.i : 0, right = resume ? saved.right || 0 : 0;
  const persist = () => store.put('sessions', { id: sid, name: 'Yazarak hatırla', route: location.hash, i, right, total: items.length, inline: items, keys: items.map(x => x.key), at: Date.now() });
  const show = () => {
    box.innerHTML = '';
    if (i >= items.length) {
      store.del('sessions', sid);
      box.append(h('div.card.center', h('div.big', `${right} / ${items.length}`), h('p.muted', 'yazdın')));
      const x = after?.(); if (x) box.append(x);
      return;
    }
    const it = items[i];
    setCtx({ type: 'alistirma', key: it.key, label: `Yazarak hatırla · ${i + 1}/${items.length}` });
    const inp = h('input.typein', { placeholder: 'İngilizcesi', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'en' });
    const fb = h('div.explain.hidden');
    let done = false;
    const check = giveUp => {
      if (done) { i++; persist(); return show(); }
      if (!giveUp && !inp.value.trim()) return toast('Kelimeyi yaz');
      done = true;
      const ok = !giveUp && typoOk(inp.value, it.word);
      if (ok) right++;
      memResult(it.cardId, ok);
      inp.disabled = true; inp.classList.add(ok ? 'right' : 'wrong');
      fb.classList.remove('hidden');
      add(fb, h('b', ok ? (inp.value.trim().toLowerCase() === it.word.toLowerCase() ? 'Doğru. ' : 'Doğru (küçük yazım farkı). ') : 'Doğrusu: '), h('span', { lang: 'en' }, it.word),
        canSpeak() ? h('button.icon-btn.say', { 'aria-label': 'dinle', onclick: () => speak(it.word) }, SPK()) : null);
      btn.textContent = i + 1 < items.length ? 'Sonraki' : 'Bitir';
      persist();
    };
    const btn = h('button.btn.primary.wide', { onclick: () => check() }, 'Kontrol');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    add(box,
      h('div.qhead', h('span.muted', `${i + 1}/${items.length}`), h('span.chip', 'Yazarak')),
      h('div.card.typecard', h('div.ftr', it.tr), it.s ? h('div.ctx', { lang: 'en' }, it.s) : null),
      inp,
      h('div.row', h('button.btn.small', { onclick: () => { if (!done) { inp.value = it.word[0]; inp.focus(); } } }, 'İpucu: ilk harf'),
        h('button.btn.small', { onclick: () => { if (!done) check(true); } }, 'Bilmiyorum')),
      btn, fb);
    if (matchMedia('(hover: hover)').matches) inp.focus();
  };
  if (!resume) persist();
  show();
}
