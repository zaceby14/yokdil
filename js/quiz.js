// Çoktan seçmeli soru oturumu (gramer, alıştırma, hata kutusu, okuma, ders, çıkmış, kelime oyunları)
// - Oturum ilerlemesi 'sessions' koleksiyonuna yazılır (sid): sayfadan çıkıp dönünce "Kaldığın yerden devam et".
// - Soru kökündeki kelimeye dokun = kelime paneli; şık satırına dokun = seç; şıktaki kelimeye UZUN bas = kelime paneli.
import { h, add } from './util.js';
import * as store from './store.js';
import { fromWrong, fillContext } from './autocard.js';
import { tappable } from './tappable.js';
import { setCtx } from './ctx.js';
import { openLesson } from './side.js';
import { resolve as resolveKey } from './qbank.js';

const L = 'ABCDE';

// Türkçe metin dokunulabilir olmasın
const trQ = it => it.info?.dtype === 'ceviri-tr-en';
const trOpts = it => it.info?.dtype === 'ceviri-en-tr';

// items: [{key, stem, q, options, answer, explain, tip, label, info}]
// opts: onAnswer(item, ok) · onEnd({right,total}, root) · title · extra(it, ok) · auto (yanlışta otomatik kart)
//       sid (oturum kimliği) · name (Bugün'de görünen ad) · inline (öğeler kaydedilebilir düz nesne; resolve gerekmez)
//       resolve(key) (öğeyi yeniden kur; varsayılan qbank) · source (karta eklerken kaynak)
export function runQuiz(root, items, opts = {}) {
  const { sid } = opts;
  const saved = sid ? store.get('sessions', sid) : null;
  if (saved && !saved.done && (saved.i > 0 || Object.keys(saved.picks || {}).length)) {
    root.innerHTML = '';
    const n = saved.total || saved.keys?.length || 0;
    root.append(h('div.card.resume',
      h('b', 'Kaldığın yerden devam et'), h('div.small.muted', `${Math.min(saved.i + 1, n)} / ${n}`),
      h('div.row',
        h('button.btn.primary.grow', {
          onclick: async e => {
            e.currentTarget.disabled = true;
            let its = saved.inline || await Promise.all((saved.keys || []).map(k => (opts.resolve || resolveKey)(k)));
            if (!its.length || its.some(x => !x)) its = items; // çözülemedi → baştan
            else return start(its, saved);
            start(its, null);
          }
        }, 'Devam et'),
        h('button.btn', { onclick: () => start(items, null) }, 'Baştan başla'))));
    return;
  }
  start(items, null);

  function start(items, st) {
    let i = st?.i || 0, right = st?.right || 0;
    const picks = { ...(st?.picks || {}) };
    const persist = () => {
      if (!sid) return;
      store.put('sessions', {
        id: sid, name: opts.name || opts.title || '', route: location.hash, i, right, picks, total: items.length,
        keys: items.map(x => x.key), inline: opts.inline ? items : null, at: Date.now(), done: false
      });
    };
    if (!st) persist();

    const show = () => {
      root.innerHTML = '';
      root.classList.remove('answered');
      if (i >= items.length) {
        if (sid) store.del('sessions', sid);
        setCtx(null);
        root.append(h('div.card.center',
          h('div.big', `${right} / ${items.length}`),
          h('p.muted', right === items.length ? 'Tamamı doğru' : 'Bitti')));
        onEndOnce();
        return;
      }
      const it = items[i];
      const ctxLabel = [opts.name || opts.title, `${i + 1}/${items.length}`, it.label].filter(Boolean).join(' · ');
      setCtx({ type: 'soru', key: it.key, label: ctxLabel });
      let answered = false;
      const src = { source: opts.source || it.label || 'Soru', note: it.info?.kind === 'cikmis' ? it.label : '' };
      const ctx = s => answered ? (fillContext(it) || s) : s;
      // Şıktaki kelimenin bağlamı: soru cümlesi (cevaptan sonra boşluk doldurulmuş)
      const qSent = () => {
        const q = String(it.q || ''), m = q.match(/^\s*\((\d+)\)\s*$/);
        if (m && it.stem) return (String(it.stem).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || []).find(x => x.includes(`(${m[1]})`))?.trim() || '';
        return q.length < 400 ? q : '';
      };
      const octx = s => answered ? (fillContext(it) || qSent() || s) : (qSent() || s);
      const exp = h('div.explain.hidden');
      let nextBusy = false;
      const next = h('button.btn.primary.wide.hidden', { onclick: () => { if (nextBusy) return; nextBusy = true; i++; persist(); show(); } }, i + 1 < items.length ? 'Sonraki' : 'Bitir');
      const reveal = (k, replay) => {
        answered = true;
        root.classList.add('answered');
        const ok = k === it.answer;
        opts_.forEach((b, j) => { b.classList.add('done'); if (j === it.answer) b.classList.add('right'); });
        if (!ok) opts_[k].classList.add('wrong');
        exp.classList.remove('hidden');
        exp.innerHTML = '';
        exp.append(h('b', ok ? 'Doğru. ' : `Cevap: ${L[it.answer]}. `), it.explain || '');
        if (it.tip) exp.append(h('div.tip', 'Taktik: ' + it.tip));
        const x = opts.extra?.(it, ok); if (x) Promise.resolve(x).then(n => n && exp.append(n));
        exp.append(h('div.small.muted.tap-hint', 'Kelimeye dokun → karta ekle'));
        next.classList.remove('hidden');
        if (!replay) {
          if (ok) right++;
          picks[i] = k; persist();
          opts.onAnswer?.(it, ok, k);
          if (!ok && opts.auto !== false) fromWrong(it, k).catch(e => console.warn(e));
          next.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }
      };
      const optNode = o => trOpts(it) ? h('span.otext', o) : h('span.otext', tappable(String(o), { ...src, inline: true, tapOpens: false, ctx: octx }).el);
      const opts_ = it.options.map((o, k) => h('button.opt', {
        type: 'button',
        onclick: () => { if (answered) return; reveal(k, false); }
      }, h('span.ol', L[k]), optNode(o)));
      const stem = it.stemNode ? h('div.stem.tap', it.stemNode()) : it.stem ? h('div.stem.tap', tappable(it.stem, { ...src, ctx }).el) : null;
      const q = it.qNode ? h('div.q.tap', it.qNode()) : it.q ? (trQ(it) ? h('div.q', it.q) : h('div.q.tap', tappable(it.q, { ...src, ctx }).el)) : null;
      add(root,
        h('div.qhead', h('span.muted', `${opts.title ? opts.title + ' · ' : ''}${i + 1}/${items.length}`),
          h('span.qtools', it.unverified ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null, it.label ? h('span.chip', it.label) : null,
            h('button.chip.lesson-btn', { type: 'button', title: 'Dersi yanda aç', onclick: () => openLesson(it.info?.topic || '') }, 'Ders'))),
        stem, q,
        h('div.opts', opts_), exp, next
      );
      if (picks[i] != null) reveal(picks[i], true);
      if (i === 0 || picks[i] == null) window.scrollTo(0, 0);
    };
    let ended = false;
    const onEndOnce = () => { if (ended) return; ended = true; opts.onEnd?.({ right, total: items.length }, root); };
    show();
  }
}

// Yarım kalan oturumlar (Bugün ekranı için)
export const openSessions = () => store.all('sessions').filter(s => !s.done && s.route && (s.i > 0 || Object.keys(s.picks || {}).length))
  .sort((a, b) => (b.at || 0) - (a.at || 0));
