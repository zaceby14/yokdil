// Gramer: günlük set, hata kutusu, konu çalışması, kural notlarım
import * as store from '../store.js';
import { grammar, program } from '../data.js';
import { h, dayKey, seeded, shuffle, uid, toast, TOPICS, topicName } from '../util.js';
import { week, weakTopics, dayRec, updateDay, tick } from '../plan.js';
import { answer, dueMistakes, openMistakes } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { gItem, resolve } from '../qbank.js';
import { soruTabs, lessonLink } from './hub.js';

export default async function render(root, [mode, arg]) {
  if (mode === 'gunluk') return daily(root);
  if (mode === 'hata') return box(root);
  if (mode === 'konu') return byTopic(root, arg);
  return home(root);
}

const back = () => h('a.btn.small', { href: '#/gramer' }, '‹ Gramer');

// Günlük set: haftanın konusu ağırlıklı + önceki konular + zayıf konular
export async function dailySet() {
  const r = dayRec();
  if (r.gset?.length) return r.gset;
  const qs = await grammar();
  const w = await week();
  const p = await program();
  const weak = new Set(await weakTopics());
  const cur = new Set(w.grammar || []);
  const prev = new Set(p.weeks.filter(x => x.n <= w.n).flatMap(x => x.grammar || []));
  const open = new Set(openMistakes().map(m => m.id));
  const seen = new Map();
  for (const l of store.all('grammarLog')) if (l.kind === 'gramer') seen.set(l.q, l.correct);
  const rnd = seeded(dayKey());
  const pool = qs.filter(q => !open.has(q.id)).map(q => {
    let wt = (cur.has(q.topic) ? 5 : 0) + (weak.has(q.topic) ? 2 : 0) + (prev.has(q.topic) ? 1 : 0.3);
    if (seen.get(q.id) === true) wt *= 0.25; else if (!seen.has(q.id)) wt *= 1.5;
    return { q, k: Math.pow(rnd(), 1 / wt) }; // ağırlıklı örnekleme
  }).sort((a, b) => b.k - a.k);
  const ids = pool.slice(0, store.settings().grammarCount || 8).map(x => x.q.id);
  updateDay({ gset: ids });
  return ids;
}

async function daily(root) {
  const r = dayRec();
  const ids = await dailySet();
  const qs = new Map((await grammar()).map(q => [q.id, q]));
  const errs = (await Promise.all(dueMistakes('gramer').map(m => resolve(m.id)))).filter(Boolean);
  let items = [...errs.map(e => ({ ...e, label: 'Hata · ' + e.label })), ...ids.map(id => qs.get(id)).filter(Boolean).map(gItem)];
  if (r.busy) items = items.slice(0, 3);
  const box = h('div');
  root.append(back(), box);
  if (!items.length) { box.append(h('p.muted', 'Soru yok')); return; }
  runQuiz(box, items, {
    title: 'Günlük', extra: lessonLink,
    onAnswer: (it, ok) => answer(it.key, ok, it.info),
    onEnd: (_, el) => { tick('gramer'); el.append(h('a.btn.wide', { href: '#/bugun' }, 'Bugün')); }
  });
}

async function box(root) {
  const items = (await Promise.all(dueMistakes().map(m => resolve(m.id)))).filter(Boolean);
  const el = h('div');
  root.append(back(), h('h2', 'Hata kutusu'), el);
  if (!items.length) { el.append(h('p.muted', 'Bugün tekrar edilecek hata yok.')); return; }
  runQuiz(el, shuffle(items), { title: 'Hata', extra: lessonLink, onAnswer: (it, ok) => answer(it.key, ok, it.info) });
}

async function byTopic(root, topic) {
  const qs = (await grammar()).filter(q => q.topic === topic);
  const el = h('div');
  root.append(back(), h('h2', topicName(topic)), el);
  if (!qs.length) { el.append(h('p.muted', 'Bu konuda soru yok')); return; }
  runQuiz(el, shuffle(qs).slice(0, 8).map(gItem), { extra: lessonLink, onAnswer: (it, ok) => answer(it.key, ok, it.info) });
}

async function home(root) {
  const w = await week();
  const qs = await grammar();
  const weak = await weakTopics();
  const due = dueMistakes().length, open = openMistakes().length;
  const r = dayRec();
  const acc = {};
  for (const l of store.all('grammarLog')) if (l.kind === 'gramer') { const a = acc[l.topic] ||= [0, 0]; a[1]++; if (l.correct) a[0]++; }
  const cnt = {}; for (const q of qs) cnt[q.topic] = (cnt[q.topic] || 0) + 1;
  root.append(
    soruTabs('gramer'),
    h('h2', 'Gramer'),
    h('div.chips', h('span.muted.small', `Hafta ${w.n}: `), (w.grammar || []).map(t => h('span.chip.ok', topicName(t)))),
    h('a.btn.primary.wide.big-btn', { href: '#/gramer/gunluk' }, r.tasks?.gramer ? 'Günlük set ✓ (tekrar)' : `Günlük set · ${r.busy ? 3 : store.settings().grammarCount} soru`),
    h('a.btn.wide', { href: '#/gramer/hata' }, `Hata kutusu · bugün ${due} / açık ${open}`),
    h('h3', 'Konular'),
    h('ul.list.compact', Object.keys(TOPICS).filter(t => cnt[t]).map(t => {
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
    const ns = store.all('notes').sort((a, b) => (a.topic || '').localeCompare(b.topic || '') || (a.createdAt || 0) - (b.createdAt || 0));
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
