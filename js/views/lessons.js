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
import { pickX } from './grammar.js';
import { inProgress } from './warmup.js';
import { toolsStrip, toolView } from './aids.js';
import { LESSON_GROUPS, lessonGroup } from '../strategy.js';

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
  const item = l => {
    const read = store.get('progress', 'ders:' + l.id)?.read;
    return h('li' + (read ? '.done' : ''), { 'data-q': norm([l.title, l.summary, l.formula, topicName(lessonTopic(l))].join(' ')) }, h('a', { href: '#/dersler/' + encodeURIComponent(l.id) },
      h('b', (read ? '✓ ' : '') + l.title), isCur(l) ? h('span.chip.ok.small', 'bu hafta') : null,
      l.formula ? h('span.small.formula-line', l.formula) : null,
      h('span.small.muted', `${l.minutes ? l.minutes + ' dk · ' : ''}${l.summary || ''}`)));
  };
  // Gruplar: Bu hafta (açık) · Bağlaçlar · Edatlar · Zaman · Cümle yapıları · Kelime · Soru tipi taktikleri · Strateji (katlanır)
  const groups = [['hafta', 'Bu hafta', ls.filter(isCur)], ...LESSON_GROUPS.map(([k, t]) => [k, t, ls.filter(l => lessonGroup(l) === k)])].filter(g => g[2].length);
  const readN = list => list.filter(l => store.get('progress', 'ders:' + l.id)?.read).length;
  const wrap = h('div.lgroups', groups.map(([k, t, list], i) => h('details.lgroup', { 'data-g': k, open: i === 0 ? true : null },
    h('summary', h('b', t), h('span.small.muted', ` ${readN(list)}/${list.length}`)), h('ul.list', list.map(item)))));
  const none = h('p.muted.hidden', 'Eşleşen ders yok.');
  const search = h('input.lsearch', { type: 'search', placeholder: 'Derslerde ara (ör. despite, which)', 'aria-label': 'Derslerde ara', autocomplete: 'off',
    oninput: () => {
      const q = norm(search.value.trim());
      let any = false;
      wrap.querySelectorAll('details.lgroup').forEach((d, i) => {
        let n = 0;
        d.querySelectorAll('li').forEach(li => { const ok = !q || li.dataset.q.includes(q); li.classList.toggle('hidden', !ok); if (ok) n++; });
        // Arama sırasında "Bu hafta" kopyaları gizlenir, eşleşen gruplar açılır
        d.classList.toggle('hidden', !n || (!!q && d.dataset.g === 'hafta'));
        d.open = q ? n > 0 : i === 0;
        if (n && !(q && d.dataset.g === 'hafta')) any = true;
      });
      none.classList.toggle('hidden', any);
    } });
  const tools = await toolsStrip();
  root.append(tools, h('h2', 'Dersler'),
    ls.length ? h('p.small.muted.screen-why', `Kurallar kısa ve örnekli. ${ls.length} ders · ${readN(ls)} okundu. Soru çözerken "Ders" düğmesiyle de açılır.`) : null,
    ls.length ? [ls.length > 8 ? search : null, wrap, none] : emptyData('Dersler'));
}

const norm = s => String(s || '').toLocaleLowerCase('tr-TR');

function lesson(root, l) {
  const read = () => store.patch('progress', 'ders:' + l.id, { read: true, at: Date.now() });
  const qbox = h('div');
  setCtx({ type: 'ders', key: 'ders:' + l.id, label: 'Ders · ' + l.title });
  const sid = 'ders:' + l.id;
  const startTest = async btn => {
    btn?.remove();
    // Sonda bu konudan 2 çıkmış soru (paket varsa): sınavda nasıl sorulduğunu gör
    const xs = inProgress(sid) ? [] : (await pickX([lessonTopic(l)], 2)).map(p => p.make());
    runQuiz(qbox, [...l.checks.map((_, i) => lItem(l, i)), ...xs], {
      sid, name: 'Ders testi · ' + l.title, source: 'Ders',
      onAnswer: (it, ok, k, m) => answer(it.key, ok, it.info, m),
      onEnd: () => read(), noNext: true
    });
  };
  root.append(
    h('a.btn.small', { href: '#/dersler' }, '‹ Dersler'),
    h('h2', l.title),
    l.formula ? h('div.formula', h('b', '30 sn özet: '), l.formula) : null,
    h('div.small.muted', [topicName(lessonTopic(l)), l.minutes ? l.minutes + ' dk' : ''].filter(Boolean).join(' · ')),
    l.summary ? h('div.note', l.summary) : null,
    ...lessonBlocks(l),
    l.checks?.length ? h('section.card', h('h3', `Mini test (${l.checks.length})`),
      store.get('sessions', sid) ? (setTimeout(() => startTest()), null) : h('button.btn.primary.wide', { onclick: e => startTest(e.currentTarget) }, 'Teste başla'), qbox) : null,
    h('button.btn.wide', { onclick: () => { read(); location.hash = '#/dersler'; } }, 'Okudum')
  );
}
