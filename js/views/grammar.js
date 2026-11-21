// Gramer: günlük set, hata kutusu, konu çalışması, kural notlarım
import * as store from '../store.js';
import { grammar, program } from '../data.js';
import { h, dayKey, seeded, uid, toast, TOPICS, topicName } from '../util.js';
import { week, weakTopics, dayRec, updateDay, tick } from '../plan.js';
import { answer, openMistakes, mistakeToday } from '../mistakes.js';
import { topicLevels, pickDaily, levelOrder } from '../gplan.js';
import { runQuiz } from '../quiz.js';
import { gItem, resolve } from '../qbank.js';
import { soruTabs, lessonLink, emptyData } from './hub.js';

export default async function render(root, [mode, arg]) {
  if (mode === 'gunluk') return daily(root);
  if (mode === 'hata') return box(root);
  if (mode === 'konu') return byTopic(root, arg);
  return home(root);
}

const back = () => h('a.btn.small', { href: '#/gramer' }, '‹ Gramer');

// Günlük set: haftanın konusu + sınav ağırlığı + seviye ilerlemesi (L1 → L2 → L3, konu bazında). Hatalar ayrı görevde.
export async function dailySet() {
  const r = dayRec();
  if (r.gset?.length) return r.gset;
  const qs = await grammar();
  const w = await week();
  const p = await program();
  const weak = new Set(await weakTopics());
  const cur = new Set([...(w.grammar || []), ...(w.lessons || [])]);
  const prev = new Set(p.weeks.filter(x => x.n <= w.n).flatMap(x => [...(x.grammar || []), ...(x.lessons || [])]));
  const open = new Set(openMistakes().map(m => m.id));
  const lvOf = new Map(qs.map(q => [q.id, q.level || 1]));
  const logs = store.all('grammarLog').filter(l => l.kind === 'gramer');
  const seen = new Map();
  for (const l of logs) seen.set(l.q, l.correct);
  const levels = topicLevels(logs.map(l => ({ ...l, level: l.level || lvOf.get(l.q) || 0 })));
  const ids = pickDaily(qs, { cur, prev, weak, seen, open, levels, n: store.settings().grammarCount || 8, rnd: seeded(dayKey()) });
  updateDay({ gset: ids });
  return ids;
}

const logAns = (it, ok, k, m) => answer(it.key, ok, it.info, m);

async function daily(root) {
  const r = dayRec();
  const ids = await dailySet();
  const qs = new Map((await grammar()).map(q => [q.id, q]));
  let items = ids.map(id => qs.get(id)).filter(Boolean).map(gItem);
  if (r.busy) items = items.slice(0, 3);
  const box = h('div');
  root.append(back(), box);
  if (!items.length) { box.append(emptyData()); return; }
  runQuiz(box, items, {
    title: 'Günlük', extra: lessonLink, sid: 'gunluk:' + dayKey(), name: 'Günlük gramer', source: 'Gramer', task: 'gramer',
    onAnswer: logAns,
    onEnd: () => tick('gramer')
  });
}

// Hata tekrarı: bugün en fazla 8 soru (tüm kaynaklar)
async function box(root) {
  const hs = mistakeToday();
  const left = hs.ids.filter(id => !store.all('grammarLog').some(l => l.q === id && l.day === dayKey() && l.hset));
  const items = (await Promise.all(left.map(id => resolve(id)))).filter(Boolean);
  const el = h('div');
  root.append(back(), h('h2', `Hata tekrarı · bugün ${hs.total}`), el);
  if (!items.length) {
    el.append(h('div.card', h('p', hs.total ? 'Bugünkü hata tekrarı bitti.' : 'Bugün tekrar edilecek hata yok.'), h('p.small.muted', 'Kalan hatalar sonraki günlere en fazla 8\'er soru olarak gelir.')));
    if (hs.total) tick('hata');
    return;
  }
  runQuiz(el, items.map(e => ({ ...e, label: 'Hata · ' + e.label })), { title: 'Hata', extra: lessonLink, sid: 'hata:' + dayKey(), name: 'Hata tekrarı', task: 'hata',
    onAnswer: logAns, onEnd: () => tick('hata') });
}

async function byTopic(root, topic) {
  const qs = (await grammar()).filter(q => q.topic === topic);
  const el = h('div');
  root.append(back(), h('h2', topicName(topic)), el);
  if (!qs.length) { el.append((await grammar()).length ? h('p.muted', 'Bu konuda soru yok') : emptyData()); return; }
  const seenOk = new Set(store.all('grammarLog').filter(l => l.correct).map(l => l.q));
  const order = levelOrder(qs.filter(q => !seenOk.has(q.id))).concat(levelOrder(qs.filter(q => seenOk.has(q.id))));
  runQuiz(el, order.slice(0, 8).map(gItem), { extra: lessonLink, sid: 'konu:' + topic, name: topicName(topic), source: 'Gramer', onAnswer: logAns });
}

async function home(root) {
  const w = await week();
  const qs = await grammar();
  const weak = await weakTopics();
  const hs = mistakeToday();
  const r = dayRec();
  const acc = {};
  for (const l of store.all('grammarLog')) if (l.kind === 'gramer') { const a = acc[l.topic] ||= [0, 0]; a[1]++; if (l.correct) a[0]++; }
  const cnt = {}; for (const q of qs) cnt[q.topic] = (cnt[q.topic] || 0) + 1;
  root.append(
    soruTabs('gramer'),
    h('h2', 'Gramer'),
    qs.length ? null : emptyData(),
    h('div.chips', h('span.muted.small', `Hafta ${w.n}: `), (w.grammar || []).map(t => h('span.chip.ok', topicName(t)))),
    h('a.btn.primary.wide.big-btn', { href: '#/gramer/gunluk' }, r.tasks?.gramer ? 'Günlük set ✓ (tekrar)' : `Günlük set · ${r.busy ? 3 : store.settings().grammarCount} soru`),
    hs.total ? h('a.btn.wide', { href: '#/gramer/hata' }, `Hata tekrarı · bugün ${hs.done}/${hs.total}`) : h('p.small.muted', 'Bugün hata tekrarı yok.'),
    h('h3', 'Konular'),
    h('ul.list.compact', [...new Set([...Object.keys(TOPICS), ...Object.keys(cnt)])].filter(t => cnt[t]).map(t => {
      const a = acc[t];
      return h('li', h('a', { href: '#/gramer/konu/' + t },
        h('b', topicName(t)), weak.includes(t) ? h('span.chip.bad.small', 'zayıf') : null,
        h('span.small.muted', `${cnt[t]} soru${a ? ` · %${Math.round(a[0] / a[1] * 100)}` : ''}`)));
    })),
    notes()
  );
}

// Kural notlarım: seed + kullanıcı
function notes() {
  const wrap = h('section');
  const draw = () => {
    wrap.innerHTML = '';
    const ns = store.all('notes').filter(n => n.kind !== 'quick').sort((a, b) => (a.topic || '').localeCompare(b.topic || '') || (a.createdAt || 0) - (b.createdAt || 0));
    const topic = h('select', h('option', { value: '' }, 'Konu (ops.)'), Object.entries(TOPICS).map(([k, v]) => h('option', { value: k }, v)));
    const text = h('textarea', { rows: 2, placeholder: 'Yeni kural notu' });
    wrap.append(
      h('h3', `Kural notlarım (${ns.length})`),
      h('ul.notes', ns.map(n => h('li',
        n.topic ? h('span.chip.small', topicName(n.topic)) : null,
        n.title ? h('b', n.title + ' ') : null,
        h('span', n.text), n.ex ? h('div.small.muted', { lang: 'en' }, n.ex) : null,
        h('button.icon-x.small', { 'aria-label': 'sil', onclick: () => { if (confirm('Not silinsin mi?')) { store.del('notes', n.id); draw(); } } }, '×')))),
      h('div.card', topic, text, h('button.btn.wide', {
        onclick: () => {
          if (!text.value.trim()) return toast('Not boş');
          store.put('notes', { id: uid('n'), topic: topic.value, text: text.value.trim(), origin: 'user', createdAt: Date.now() });
          draw();
        }
      }, 'Not ekle'))
    );
  };
  draw();
  return wrap;
}
