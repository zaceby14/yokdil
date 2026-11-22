// Kalıcı hafıza alıştırmaları: Yazarak hatırla · Eş anlam · Kelime ailesi · Hafıza turu (karışık, 3–5 dk)
import * as store from '../store.js';
import { forms, words, enrich } from '../data.js';
import { h, add, shuffle, dayKey, toast } from '../util.js';
import { runQuiz } from '../quiz.js';
import { nextTaskBtn } from '../tasks.js';
import { tick } from '../plan.js';
import { pool, tourCards, typoOk, synHit, blank, synItem, familyItem, meaningItem, memResult, doneToday } from '../memory.js';
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
    out.push({ key: 'yaz:' + c.id, cardId: c.id, word: c.word, tr: c.tr, syn: Array.isArray(c.syn) ? c.syn : [], s: await sentence(c) });
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
  const fm = await forms();
  const left = m => pool().filter(c => !doneToday(m)[c.id]);
  return { yaz: left('yaz').filter(c => c.tr).length, es: left('es').filter(c => c.syn?.length || c.wid).length,
    aile: left('aile').filter(c => fm[c.word.toLowerCase()]?.family?.length).length, hafiza: tourCards(undefined, undefined, doneToday('hafiza')).length };
}

export default async function memory(root, mode, tabs) {
  root.append(tabs, h('a.btn.small', { href: '#/kartlar' }, '‹ Kartlar'), h('h2', EX[mode] || 'Alıştırma'));
  const box = h('div');
  root.append(box);
  const done = doneToday(mode);
  const full = mode === 'hafiza' ? tourCards() : pool();
  const cards = mode === 'hafiza' ? tourCards(undefined, undefined, done) : full.filter(c => !done[c.id]);
  if (!cards.length && full.length && !memory.all) {
    box.append(h('div.card.center', h('div.big', 'Bugünlük bitti ✓'), h('p.muted', `Bu alıştırmadaki ${Object.keys(done).length} kelimeyi bugün doğru yaptın. Yarın aralıklı tekrarla yine gelecekler.`),
      h('button.btn', { onclick: () => { memory.all = true; box.remove(); memory(root, mode, tabs).finally(() => { memory.all = false; }); } }, 'Yine de çalış')));
    nextTaskBtn('').then(b => box.append(b));
    return;
  }
  if (memory.all) { cards.length = 0; cards.push(...full); }
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
    // Hafıza turu: her karttan bir seçmeli soru (eş anlam → kelime ailesi → anlam). Yazma yok (yorgun akşam).
    const core = await words(), fm = await forms();
    const others = [...store.all('cards'), ...shuffle(core).slice(0, 300)];
    items = [];
    for (const c of cards) {
      const syn = c.syn?.length ? c.syn : (core.find(w => w.id === c.wid)?.syn || []);
      const it = synItem({ ...c, syn }, others) || familyItem(c, fm) || meaningItem(c, others);
      if (it) items.push(it);
    }
    if (!items.length) { box.append(h('p.muted', 'Hafıza turu için soru üretilemedi.')); return; }
    box.append(h('p.small.muted', `${items.length} kelime · seçmeli. Yazarak çalışmak için: Kartlar → Yazarak hatırla.`));
    const q = h('div'); box.append(q);
    return runQuiz(q, items, quizOpts(sid, () => tick('hafiza'), null, 'hafiza'));
  }
  if (!items.length) { box.append(h('p.muted', mode === 'aile' ? 'Kartlarında kelime ailesi bilgisi olan kelime yok.' : 'Eş anlamlısı olan kart yok.')); return; }
  runQuiz(box, items, quizOpts(sid, null, again, mode));
}

const quizOpts = (sid, done, again, mode) => ({
  sid, inline: true, auto: false, name: 'Hafıza', source: 'Alıştırma',
  onAnswer: (it, ok) => memResult(it.cardId, ok, mode),
  onEnd: (_, el) => { done?.(); if (again) el.querySelector('.endnext')?.before(again()); }
});

// Yazarak hatırla: Türkçe anlam + boşluklu cümle → İngilizce kelimeyi yaz
function typing(box, items, sid, after) {
  const saved = store.get('sessions', sid);
  const resume = saved && !saved.done && saved.i > 0 && saved.inline?.length;
  if (resume) items = saved.inline;
  let i = resume ? saved.i : 0, right = resume ? saved.right || 0 : 0;
  const wrongs = [];
  const persist = () => store.put('sessions', { id: sid, name: 'Yazarak hatırla', route: location.hash, i, right, total: items.length, inline: items, keys: items.map(x => x.key), at: Date.now() });
  const show = () => {
    box.innerHTML = '';
    if (i >= items.length) {
      store.del('sessions', sid);
      document.body.classList.remove('qmode');
      box.append(h('div.card.center', h('div.big', `${right} / ${items.length}`), h('p.muted', 'yazdın')));
      if (wrongs.length) box.append(h('section.card.wronglist', h('h3', 'Yanlışların'), h('ul.list.compact', wrongs.map(w => h('li', h('b', { lang: 'en' }, w.word), h('span.small.muted', w.tr))))));
      const x = after?.(); if (x) box.append(x);
      nextTaskBtn('').then(b => box.append(b));
      return;
    }
    document.body.classList.add('qmode');
    const it = items[i];
    setCtx({ type: 'alistirma', key: it.key, label: `Yazarak hatırla · ${i + 1}/${items.length}` });
    const inp = h('input.typein', { placeholder: 'İngilizcesi', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', lang: 'en' });
    const fb = h('div.explain.hidden');
    let done = false;
    const check = giveUp => {
      if (done) { i++; persist(); return show(); }
      if (!giveUp && !inp.value.trim()) return toast('Kelimeyi yaz');
      done = true;
      const exact = !giveUp && typoOk(inp.value, it.word);
      // Eş anlamlı: kısmen kabul ("Yakın" — doğru sayılır, kartın kelimesi gösterilir)
      const near = !giveUp && !exact ? synHit(inp.value, it.syn) : null;
      const ok = exact || !!near;
      if (ok) right++; else wrongs.push(it);
      memResult(it.cardId, ok, 'yaz');
      inp.disabled = true; inp.classList.add(ok ? 'right' : 'wrong');
      fb.classList.remove('hidden');
      add(fb, h('b', near ? `Yakın: ${near} da olur. Kart "` : exact ? (inp.value.trim().toLowerCase() === it.word.toLowerCase() ? 'Doğru. ' : 'Doğru (küçük yazım farkı). ') : 'Doğrusu: '), h('span', { lang: 'en' }, it.word), near ? h('b', '" istiyordu.') : null,
        canSpeak() ? h('button.icon-btn.say', { 'aria-label': 'dinle', onclick: () => speak(it.word) }, SPK()) : null);
      btn.textContent = i + 1 < items.length ? 'Sonraki' : 'Bitir';
      persist();
    };
    const btn = h('button.btn.primary.wide.main-act', { onclick: () => check() }, 'Kontrol');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    add(box,
      h('div.qhead', h('span.muted', `${i + 1}/${items.length}`), h('span.chip', 'Yazarak')),
      h('div.card.typecard', h('div.ftr', it.tr), it.s ? h('div.ctx', { lang: 'en' }, it.s) : null),
      inp,
      h('div.row', h('button.btn.small', { onclick: () => { if (!done) { inp.value = it.word[0]; inp.focus(); } } }, 'İpucu: ilk harf'),
        h('button.btn.small', { onclick: () => { if (!done) check(true); } }, 'Bilmiyorum')),
      h('div.actbar', btn), fb);
    if (matchMedia('(hover: hover)').matches) inp.focus();
  };
  if (!resume) persist();
  show();
}
