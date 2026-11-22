// Hızlı kelime tarama: çekirdek listeden görülmemiş kelimeler 50'şer → Biliyorum / Bilmiyorum (isteğe bağlı: 1–2★ atla)
import * as store from '../store.js';
import { words } from '../data.js';
import { h, add } from '../util.js';
import { cardFromWord, coreOrder, starFirst } from '../srs.js';
import { loadStars, starRow, starOf, hasStars } from '../stars.js';
import { markKnown, counts } from '../vocab.js';
import { swipe } from '../swipe.js';

export const BATCH = 50;
// Saf: 1–2★ (sınavda az/hiç çıkmayan) kelimeleri atla; yıldız verisi yoksa liste aynı
export const skipLow = (list, on, star = w => starOf(w.word)) => on ? list.filter(w => (star(w) || 0) >= 3) : list;

// Sıradaki görülmemiş çekirdek kelimeler (yeni kuyrukla aynı sıra: sık olan önce)
export async function unseenCore(n = BATCH) {
  const snap = store.snapshot().cards || {};
  const have = new Set(Object.values(snap).map(c => c.wid).filter(Boolean));
  const known = new Set(store.all('cards').map(c => (c.word || '').toLowerCase()));
  const low = store.settings().scanSkipLow && hasStars();
  return skipLow(coreOrder((await words()).filter(w => w?.word && !have.has(w.id) && !known.has(w.word.toLowerCase())), await starFirst()), low).slice(0, n);
}

export default async function scan(root, tabs) {
  await loadStars();
  let list = await unseenCore();
  let i = 0, yes = 0, no = 0, unsw = null;
  const hist = [];
  const box = h('div');
  root.append(tabs, box);

  const act = knows => {
    const w = list[i]; if (!w) return;
    const c = cardFromWord(w);
    if (knows) { markKnown(c); yes++; } else { store.put('cards', { ...c, front: Date.now() }); no++; }
    hist.push([c.id, knows]); i++; draw();
  };
  const undo = () => {
    const last = hist.pop(); if (!last) return;
    store.del('cards', last[0]); last[1] ? yes-- : no--; i--; draw();
  };
  const key = e => {
    if (!root.isConnected) return;
    if (e.key === 'ArrowRight') act(true);
    else if (e.key === 'ArrowLeft') act(false);
  };
  addEventListener('keydown', key);

  function draw() {
    unsw?.(); unsw = null;
    box.innerHTML = '';
    if (!list.length) { box.append(h('div.card.center', h('p', 'Taranacak kelime kalmadı.'))); return; }
    if (i >= list.length) {
      const st = counts();
      add(box, h('div.card.center',
        h('div.big', `${yes} / ${list.length}`), h('p', 'biliyordun'),
        h('p.small.muted', `${no} kelime yeni kelimelerin başına eklendi · bildiğin toplam ${st.knowTotal}`)),
        h('button.btn.primary.wide.big-btn.scan-more', { onclick: async () => { list = await unseenCore(); i = yes = no = 0; hist.length = 0; draw(); } }, `Devam (${BATCH} kelime daha)`),
        no ? h('a.btn.wide', { href: '#/kartlar/calis' }, 'Yenileri çalış') : null,
        hist.length ? h('button.btn.wide', { onclick: undo }, 'Son seçimi geri al') : null);
      return;
    }
    const w = list[i];
    const tr = h('div.scan-tr.hidden', w.tr || '—');
    const show = h('button.btn.small', { onclick: () => { tr.classList.remove('hidden'); show.remove(); } }, 'Anlamı gör');
    const card = h('div.card.scan-card',
      h('div.small.muted', `${i + 1} / ${list.length}`),
      h('div.fword', { lang: 'en' }, w.word),
      starRow(w.word),
      w.pos ? h('div.small.muted', w.pos) : null,
      tr, show);
    unsw = swipe(card, { right: () => act(true), left: () => act(false) });
    const lowSw = hasStars() ? h('label.switch.inline.scan-low', h('input', { type: 'checkbox', name: 'scanSkipLow', checked: !!store.settings().scanSkipLow,
      onchange: async e => { store.setSetting('scanSkipLow', e.target.checked); list = await unseenCore(); i = 0; draw(); } }), h('span', '1–2★ kelimeleri atla (sınavda az çıkar)')) : null;
    add(box,
      h('p.small.muted.center', 'Bildiklerini ele: biliyorsan sağa, bilmiyorsan sola kaydır.'),
      i === 0 ? lowSw : null,
      card,
      h('div.scan-btns',
        h('button.btn.big-btn.no', { onclick: () => act(false) }, 'Bilmiyorum'),
        h('button.btn.big-btn.yes', { onclick: () => act(true) }, 'Biliyorum')),
      hist.length ? h('button.btn.small.wide', { onclick: undo }, 'Geri al') : null
    );
  }
  draw();
  return () => { removeEventListener('keydown', key); unsw?.(); };
}
