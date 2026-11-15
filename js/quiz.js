// Çoktan seçmeli soru oturumu (gramer, alıştırma, hata kutusu, okuma)
import { h, add } from './util.js';

const L = 'ABCDE';

// items: [{key, stem, q, options, answer, explain, tip, label}]
// onAnswer(item, correct) ; onEnd({right, total})
export function runQuiz(root, items, { onAnswer, onEnd, title, extra } = {}) {
  let i = 0, right = 0;
  const show = () => {
    root.innerHTML = '';
    if (i >= items.length) {
      root.append(h('div.card.center',
        h('div.big', `${right} / ${items.length}`),
        h('p.muted', right === items.length ? 'Tamamı doğru' : 'Bitti'),
      ));
      onEnd?.({ right, total: items.length }, root);
      return;
    }
    const it = items[i];
    const exp = h('div.explain.hidden');
    const next = h('button.btn.primary.wide.hidden', { onclick: () => { i++; show(); } }, i + 1 < items.length ? 'Sonraki' : 'Bitir');
    const opts = it.options.map((o, k) => h('button.opt', {
      onclick: () => {
        if (root.dataset.locked) return;
        root.dataset.locked = 1;
        const ok = k === it.answer;
        if (ok) right++;
        opts.forEach((b, j) => { b.disabled = true; if (j === it.answer) b.classList.add('right'); });
        if (!ok) opts[k].classList.add('wrong');
        exp.classList.remove('hidden');
        exp.append(h('b', ok ? 'Doğru. ' : `Cevap: ${L[it.answer]}. `), it.explain || '');
        if (it.tip) exp.append(h('div.tip', 'Taktik: ' + it.tip));
        const x = extra?.(it, ok); if (x) Promise.resolve(x).then(n => n && exp.append(n));
        next.classList.remove('hidden');
        onAnswer?.(it, ok);
        next.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, h('span.ol', L[k]), h('span', o)));
    delete root.dataset.locked;
    add(root,
      h('div.qhead', h('span.muted', `${title ? title + ' · ' : ''}${i + 1}/${items.length}`),
        h('span', it.unverified ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null, it.label ? h('span.chip', it.label) : null)),
      it.stemNode ? h('div.stem.tap', it.stemNode()) : it.stem ? h('div.stem', it.stem) : null,
      it.qNode ? h('div.q.tap', it.qNode()) : it.q ? h('div.q', it.q) : null,
      h('div.opts', opts), exp, next
    );
    window.scrollTo(0, 0);
  };
  show();
}
