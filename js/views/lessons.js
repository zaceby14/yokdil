// Gramer dersleri: liste (bu haftanın konusu üstte, okundu işareti) + ders sayfası + mini test
import * as store from '../store.js';
import { lessons, aids } from '../data.js';
import { h, topicName } from '../util.js';
import { md } from '../md.js';
import { week } from '../plan.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { lItem, lessonTopic } from '../qbank.js';
import { emptyData } from './hub.js';
import { lessonBlocks, openLesson } from '../side.js';
import { setCtx } from '../ctx.js';
import { toolsStrip, toolView } from './aids.js';

export default async function render(root, [id, a1, a2]) {
  if (id === 'arac') return toolView(root, a1, a2);
  const ls = (await lessons()).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  if (id) {
    const l = ls.find(x => x.id === id);
    if (l) return lesson(root, l);
  }
  const w = await week();
  const cur = new Set(w.grammar || []), curL = new Set(w.lessons || []);
  const isCur = l => cur.has(lessonTopic(l)) || curL.has(l.id);
  const top = ls.filter(isCur), rest = ls.filter(l => !isCur(l));
  const item = l => {
    const read = store.get('progress', 'ders:' + l.id)?.read;
    return h('li' + (read ? '.done' : ''), h('a', { href: '#/dersler/' + encodeURIComponent(l.id) },
      h('b', (read ? '✓ ' : '') + l.title), isCur(l) ? h('span.chip.ok.small', 'bu hafta') : null,
      l.formula ? h('span.small.formula-line', l.formula) : null,
      h('span.small.muted', `${l.minutes ? l.minutes + ' dk · ' : ''}${l.summary || ''}`)));
  };
  const tools = await toolsStrip();
  root.append(tools, h('h2', 'Gramer dersleri'),
    ls.length ? h('p.small.muted', 'Soru çözerken "Ders" düğmesiyle de açılır (sayfadan çıkmadan).') : null,
    ls.length ? h('ul.list', [...top, ...rest].map(item)) : emptyData('Dersler'));
}

function lesson(root, l) {
  const read = () => store.patch('progress', 'ders:' + l.id, { read: true, at: Date.now() });
  const qbox = h('div');
  setCtx({ type: 'ders', key: 'ders:' + l.id, label: 'Ders · ' + l.title });
  const sid = 'ders:' + l.id;
  const startTest = btn => {
    btn?.remove();
    runQuiz(qbox, l.checks.map((_, i) => lItem(l, i)), {
      sid, name: 'Ders testi · ' + l.title, source: 'Ders',
      onAnswer: (it, ok, k, m) => answer(it.key, ok, it.info, m),
      onEnd: () => read(), noNext: true
    });
  };
  root.append(
    h('a.btn.small', { href: '#/dersler' }, '‹ Dersler'),
    h('h2', l.title),
    l.formula ? h('div.formula', h('b', '30 sn: '), l.formula) : null,
    h('div.small.muted', [topicName(lessonTopic(l)), l.minutes ? l.minutes + ' dk' : ''].filter(Boolean).join(' · ')),
    l.summary ? h('div.note', l.summary) : null,
    ...lessonBlocks(l),
    l.checks?.length ? h('section.card', h('h3', `Mini test (${l.checks.length})`),
      store.get('sessions', sid) ? (setTimeout(() => startTest()), null) : h('button.btn.primary.wide', { onclick: e => startTest(e.currentTarget) }, 'Teste başla'), qbox) : null,
    h('button.btn.wide', { onclick: () => { read(); location.hash = '#/dersler'; } }, 'Okudum')
  );
}
