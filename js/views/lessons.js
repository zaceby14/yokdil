// Gramer dersleri: liste (bu haftanın konusu üstte, okundu işareti) + ders sayfası + mini test
import * as store from '../store.js';
import { lessons } from '../data.js';
import { h, topicName } from '../util.js';
import { md } from '../md.js';
import { week } from '../plan.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { lItem, lessonTopic } from '../qbank.js';
import { soruTabs } from './hub.js';

export default async function render(root, [id]) {
  const ls = (await lessons()).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (id) {
    const l = ls.find(x => x.id === id);
    if (l) return lesson(root, l);
  }
  const w = await week();
  const cur = new Set(w.grammar || []);
  const top = ls.filter(l => cur.has(lessonTopic(l))), rest = ls.filter(l => !cur.has(lessonTopic(l)));
  const item = l => {
    const read = store.get('progress', 'ders:' + l.id)?.read;
    return h('li' + (read ? '.done' : ''), h('a', { href: '#/dersler/' + encodeURIComponent(l.id) },
      h('b', (read ? '✓ ' : '') + l.title), cur.has(lessonTopic(l)) ? h('span.chip.ok.small', 'bu hafta') : null,
      h('span.small.muted', `${l.minutes ? l.minutes + ' dk · ' : ''}${l.summary || ''}`)));
  };
  root.append(soruTabs('dersler'), h('h2', 'Gramer dersleri'),
    ls.length ? h('ul.list', [...top, ...rest].map(item)) : h('p.muted', 'Ders yok'));
}

function lesson(root, l) {
  const read = () => store.patch('progress', 'ders:' + l.id, { read: true, at: Date.now() });
  const qbox = h('div');
  root.append(
    h('a.btn.small', { href: '#/dersler' }, '‹ Dersler'),
    h('h2', l.title),
    h('div.small.muted', [topicName(lessonTopic(l)), l.minutes ? l.minutes + ' dk' : ''].filter(Boolean).join(' · ')),
    l.summary ? h('div.note', l.summary) : null,
    ...(l.blocks || []).map(b => h('section.card.lesson', b.h ? h('h3', b.h) : null, h('div', { html: md(b.md) }))),
    l.checks?.length ? h('section.card', h('h3', `Mini test (${l.checks.length})`),
      h('button.btn.primary.wide', {
        onclick: e => {
          e.target.remove();
          runQuiz(qbox, l.checks.map((_, i) => lItem(l, i)), {
            onAnswer: (it, ok) => answer(it.key, ok, it.info),
            onEnd: () => read()
          });
        }
      }, 'Teste başla'), qbox) : null,
    h('button.btn.wide', { onclick: () => { read(); location.hash = '#/dersler'; } }, 'Okudum')
  );
}
