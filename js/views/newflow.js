// Yeni kelime akışı: Tanış (önce tahmin) → Hatırla (karışık, Bildim/Bilemedim) → Pekiştir (sonda, başka cümlede).
// Dayanak: geri çağırma (Karpicke & Roediger 2008), ilk gün tekrarlı hatırlama (Nakata 2017), başarısız tahmin (Kornell vd. 2009).
import * as store from '../store.js';
import { h, toast, shuffle, flip } from '../util.js';
import { newQueue, cardFromWord, introduce, softRelearn } from '../srs.js';
import { markKnown } from '../vocab.js';
import { enrich, words, wordIndex } from '../data.js';
import { buildGuess } from './guess.js';
import { blank } from '../memory.js';
import { speak, canSpeak } from '../speak.js';
import { nextTaskBtn } from '../tasks.js';
import { freeBtn } from './freeprac.js';

export const GROUP = 5, REDO_GAP = 2, REDO_MAX = 3;

// Saf: kelimenin geçtiği cümleler (tekrarsız)
export function sentencesOf(card, en) {
  const xs = [
    card.ctx && { en: card.ctx, tr: '' },
    card.ex && { en: card.ex, tr: '' },
    en?.core?.ex && { en: en.core.ex, tr: en.core.exTr || '' },
    ...(en?.ex || []).map(e => e && { en: e.en, tr: e.tr || '' })
  ].filter(x => x && x.en && blank(x.en, card.word));
  const seen = new Set();
  return xs.filter(x => { const k = x.en.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}
const markHtml = (s, w) => {
  const esc = x => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  const re = new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+') + '\\w*)', 'i');
  return esc(s).replace(re, '<mark>$1</mark>');
};

// Saf: Hatırla kuyruğu — bilemediğin kelime 2 kart sonra yeniden (en fazla 3 gösterim)
export function redo(queue, item, shows) {
  if ((shows[item.id] || 0) >= REDO_MAX) return queue;
  const q = [...queue];
  q.splice(Math.min(REDO_GAP, q.length), 0, item);
  return q;
}

export default async function newFlow(root, tabs) {
  const qs = await newQueue();
  const pool = (await words()).filter(w => w.tr && w.word && !/\s/.test(w.word));
  const idx = await wordIndex();
  const all = [];
  for (const it of qs) {
    const card = it.card || cardFromWord(it.word);
    const en = await enrich(card.word).catch(() => null);
    all.push({ id: card.id, card, en, sents: sentencesOf(card, en) });
  }
  const groups = [];
  for (let i = 0; i < all.length; i += GROUP) groups.push(all.slice(i, i + GROUP));
  const res = {}; // id → { hFail, pFail }
  let gi = 0;
  // Adım göstergesi: Tanış → Hatırla → Pekiştir (geçilen adım işaretli, şimdiki vurgulu)
  const STEPS = ['Tanış', 'Hatırla', 'Pekiştir'];
  const stepper = title => {
    const cur = STEPS.indexOf(title);
    if (cur < 0) return null;
    return h('ol.nf-steps', { 'aria-label': 'Adımlar' }, STEPS.map((t, k) => h('li' + (k < cur ? '.past' : k === cur ? '.now' : ''), k === cur ? { 'aria-current': 'step' } : null, h('span.nf-dot', k < cur ? '✓' : String(k + 1)), h('span.nf-step-t', t))));
  };
  let lastTitle = '';
  const frame = (title, sub, ...body) => {
    root.innerHTML = '';
    const moved = lastTitle && lastTitle !== title; lastTitle = title;
    const st = stepper(title); if (st && moved) st.classList.add('moved');
    root.append(tabs(''), ...(st ? [st] : []), h('div.nf-head', h('b', title), h('span.small.muted', ' ' + sub)), ...body);
    window.scrollTo(0, 0);
  };
  const sentFor = (x, n) => x.sents.length ? x.sents[n % x.sents.length] : null;

  if (!all.length) {
    frame('Yeni kelime', '', h('div.card.center', h('p', 'Bugünlük yeni kelime bitti.'), freeBtn()));
    return;
  }

  // 1) Tanış: önce bağlamdan tahmin, sonra sade kart
  const meet = (g, i) => {
    if (i >= g.length) return recall(g);
    const x = g[i], c = x.card;
    const s0 = sentFor(x, 0);
    const sub = `grup ${gi + 1}/${groups.length} · ${i + 1}/${g.length}`;
    // Şıklar aynı sözcük türünden olsun (yoksa cevap türünden belli olur); bulunamazsa tahmin adımı atlanır
    const pos = c.pos || idx.get(c.word.toLowerCase())?.pos || '';
    const g0 = s0 && pos ? buildGuess({ word: c.word.toLowerCase(), tr: c.tr, pos }, x.sents, pool.filter(w => w.pos === pos)) : null;
    const guess = g0 && g0.options.length === 4 ? g0 : null;
    const showCard = picked => {
      const syn = (c.syn || x.en?.core?.syn || [])[0];
      const more = [...x.sents.slice(1, 3).map(s => h('div.small', { lang: 'en' }, '• ' + s.en)), x.en?.family?.length ? h('div.small', 'Ailesi: ' + x.en.family.slice(0, 4).map(f => f.w + (f.tr ? ' (' + f.tr + ')' : '')).join(' · ')) : null].filter(Boolean);
      const cardEl = h('div.card.nf-card',
        h('div.nf-word', { lang: 'en' }, c.word, canSpeak() ? h('button.icon-x.small.nf-say', { type: 'button', 'aria-label': 'dinle', onclick: () => speak(c.word) }, '🔊') : null),
        h('div.nf-tr', c.tr || '?'),
        syn ? h('div.small.muted', '≈ ' + syn) : null,
        s0 ? h('div.nf-sent', { lang: 'en', html: markHtml(s0.en, c.word) }) : null,
        s0?.tr ? h('div.small.muted', s0.tr) : null,
        more.length ? h('details.nf-more', h('summary.small', 'Daha fazla ▸'), ...more) : null);
      const next = h('button.btn.primary.wide.big-btn.nf-next', { type: 'button', onclick: () => meet(g, i + 1) }, 'Devam');
      const know = h('button.linkbtn.small.nf-know', { type: 'button', onclick: () => { markKnown(c); toast('Bildiklerine eklendi'); g.splice(i, 1); meet(g, i); } }, 'Biliyorum, gösterme');
      frame('Tanış', sub, picked, cardEl, h('div.actbar', next), know);
    };
    if (guess) {
      const opts = h('div.opts');
      const ask = h('div', h('div.card.nf-sent', { lang: 'en', html: markHtml(guess.q, c.word) }), h('p.small', 'Cümleden tahmin et: işaretli kelime ne demek?'), opts);
      const done = k => {
        const ok = k === guess.answer;
        showCard(h('p.small.' + (ok ? 'good-t' : 'muted') + '.nf-guess', k < 0 ? 'Bilmiyordun, sorun değil: şimdi öğren.' : ok ? 'Doğru tahmin ✓' : 'Tahmin tutmadı; yanlış tahmin bile öğrenmeye yardım eder.'));
      };
      guess.options.forEach((o, k) => opts.append(h('button.opt', { type: 'button', onclick: () => done(k) }, h('span', o))));
      opts.append(h('button.btn.small.nf-dunno', { type: 'button', onclick: () => done(-1) }, 'Bilmiyorum'));
      frame('Tanış', sub + ' · önce tahmin', ask);
    } else showCard(null);
  };

  // 2) Hatırla: grup karışık; İng → anlamı? → Göster → Bildim / Bilemedim
  const recall = g => {
    if (!g.length) return nextGroup();
    let q = shuffle([...g]);
    const shows = {};
    const step = () => {
      if (!q.length) {
        for (const x of g) x.card = introduce(x.card, !res[x.id]?.hFail);
        return nextGroup();
      }
      const x = q.shift(); shows[x.id] = (shows[x.id] || 0) + 1;
      const s = sentFor(x, 1);
      const back = h('div.nf-back.hidden', h('div.nf-tr', x.card.tr || '?'));
      const btns = h('div.row.nf-grades.hidden',
        h('button.btn.nf-no', { type: 'button', onclick: () => { (res[x.id] ||= {}).hFail = true; q = redo(q, x, shows); step(); } }, 'Bilemedim'),
        h('button.btn.primary.nf-yes', { type: 'button', onclick: () => step() }, 'Bildim'));
      const showBtn = h('button.btn.primary.wide.big-btn.nf-show', { type: 'button', onclick: () => flip(root.querySelector('.nf-card'), () => { back.classList.remove('hidden'); btns.classList.remove('hidden'); showBtn.remove(); }) }, 'Göster');
      frame('Hatırla', `grup ${gi + 1}/${groups.length} · ${q.length + 1} kaldı`,
        h('div.card.nf-card', h('div.nf-word', { lang: 'en' }, x.card.word), s ? h('div.nf-sent', { lang: 'en', html: markHtml(s.en, x.card.word) }) : null, h('p.small.muted', 'Anlamı neydi? Önce aklından söyle.'), back),
        h('div.actbar', showBtn, btns));
    };
    step();
  };

  const nextGroup = () => { gi++; if (gi < groups.length) meet(groups[gi], 0); else reinforce(); };

  // 3) Pekiştir: bugünün tüm yenileri, başka cümlede, son bir kez
  const reinforce = () => {
    let q = shuffle(groups.flat());
    const shows = {};
    const step = () => {
      if (!q.length) return finish();
      const x = q.shift(); shows[x.id] = (shows[x.id] || 0) + 1;
      const s = sentFor(x, 2);
      const back = h('div.nf-back.hidden', h('div.nf-tr', x.card.tr || '?'));
      const btns = h('div.row.nf-grades.hidden',
        h('button.btn.nf-no', { type: 'button', onclick: () => { (res[x.id] ||= {}).pFail = true; if (shows[x.id] === 1) { x.card = softRelearn(x.card); q.push(x); } step(); } }, 'Bilemedim'),
        h('button.btn.primary.nf-yes', { type: 'button', onclick: () => step() }, 'Bildim'));
      const showBtn = h('button.btn.primary.wide.big-btn.nf-show', { type: 'button', onclick: () => flip(root.querySelector('.nf-card'), () => { back.classList.remove('hidden'); btns.classList.remove('hidden'); showBtn.remove(); }) }, 'Göster');
      frame('Pekiştir', `${q.length + 1} kaldı · son bir kez`,
        h('div.card.nf-card', h('div.nf-word', { lang: 'en' }, x.card.word), s ? h('div.nf-sent', { lang: 'en', html: markHtml(s.en, x.card.word) }) : null, back),
        h('div.actbar', showBtn, btns));
    };
    step();
  };

  const finish = () => {
    const list = groups.flat();
    const ok = list.filter(x => !res[x.id]?.hFail && !res[x.id]?.pFail).length;
    const slot = h('div.endnext');
    frame('Yeni kelime', '',
      h('div.card.center.endcard', h('div.big', list.length), h('p', 'yeni kelime öğrenildi'),
        h('p.small', `${ok}/${list.length} kelimeyi hiç takılmadan hatırladın. Takıldıkların 10 dk sonra kart tekrarında yine gelir.`),
        freeBtn()), slot);
    nextTaskBtn('yeni').then(b => slot.append(b));
  };

  meet(groups[0], 0);
}
