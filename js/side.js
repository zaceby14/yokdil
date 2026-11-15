// Ders yan paneli: soru çözerken sayfadan AYRILMADAN ders açılır.
// Masaüstü (≥1100px): sağda sabit panel, soru ekranı solda kalır. Mobil: tam ekran kayan panel; geri tuşu / × kapatır.
import { lessons } from './data.js';
import { h, topicName } from './util.js';
import { md } from './md.js';
import { lessonTopic } from './qbank.js';
import * as store from './store.js';

const wide = () => matchMedia('(min-width: 1100px)').matches;
let pushed = false;

function el() {
  let p = document.getElementById('sidePanel');
  if (!p) {
    p = h('aside.side.hidden', { id: 'sidePanel', 'aria-label': 'Ders paneli' });
    document.body.append(p);
  }
  return p;
}

export const isOpen = () => !el().classList.contains('hidden');

// Ders içeriği blokları (ders sayfası ve panel ortak)
export function lessonBlocks(l) {
  return (l.blocks || []).map(b => h('section.card.lesson', b.h ? h('h3', b.h) : null, h('div', { html: md(b.md) })));
}

function show(title, body, backBtn) {
  const p = el();
  p.innerHTML = '';
  p.append(
    h('div.side-head', backBtn, h('b.grow.ellipsis', title), h('button.icon-x', { 'aria-label': 'kapat', onclick: closeSide }, '×')),
    h('div.side-body', body));
  p.scrollTop = 0; p.querySelector('.side-body').scrollTop = 0;
  if (!isOpen()) {
    p.classList.remove('hidden');
    document.body.classList.add('side-open');
    if (!wide()) { history.pushState({ side: 1 }, ''); pushed = true; }
  }
}

export async function openLesson(idOrTopic) {
  const ls = await lessons();
  const l = ls.find(x => x.id === idOrTopic) || ls.find(x => lessonTopic(x) === idOrTopic);
  if (!l) return openLessonList();
  store.patch('progress', 'ders:' + l.id, { opened: Date.now() });
  show(l.title, [
    h('div.small.muted', [topicName(lessonTopic(l)), l.minutes ? l.minutes + ' dk' : ''].filter(Boolean).join(' · ')),
    l.summary ? h('div.note', l.summary) : null,
    ...lessonBlocks(l),
    h('button.btn.wide', { onclick: closeSide }, 'Kapat ve soruya dön')
  ], h('button.btn.small', { onclick: openLessonList, 'aria-label': 'tüm dersler' }, '‹'));
}

export async function openLessonList() {
  const ls = (await lessons()).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  show('Dersler', ls.length ? h('ul.list.compact', ls.map(l => h('li', h('a', { href: 'javascript:void 0', onclick: e => { e.preventDefault(); openLesson(l.id); } },
    h('b', l.title), h('span.small.muted', l.summary || ''))))) : h('p.muted', 'Dersler yüklenemedi. İnternete bağlanıp sayfayı yenile.'));
}

export function closeSide(fromPop) {
  const p = el();
  if (!isOpen()) return;
  p.classList.add('hidden');
  document.body.classList.remove('side-open');
  if (pushed && fromPop !== true) { pushed = false; history.back(); }
  pushed = false;
}

// Geri tuşu paneli kapatır (oturum bozulmaz)
addEventListener('popstate', () => { if (isOpen()) closeSide(true); });
addEventListener('hashchange', () => { if (isOpen()) { pushed = false; closeSide(true); } });
