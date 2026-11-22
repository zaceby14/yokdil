// Gramer: günlük set, hata kutusu, konu çalışması, kural notlarım
import * as store from '../store.js';
import { grammar, program, drills, passages } from '../data.js';
import { h, dayKey, seeded, uid, toast, TOPICS, topicName } from '../util.js';
import { week, weakTopics, dayRec, updateDay, tick } from '../plan.js';
import { answer, openMistakes, mistakeToday } from '../mistakes.js';
import { keyOf, isType, matches, practicePick, mixPractice } from '../warm.js';
import { warmGate, inProgress } from './warmup.js';
import { topicLevels, pickDaily, levelOrder } from '../gplan.js';
import { runQuiz } from '../quiz.js';
import { gItem, dItem, pItem, xItem, resolve } from '../qbank.js';
import { getPack } from '../pack.js';
import { soruTabs, lessonLink, emptyData } from './hub.js';

export default async function render(root, [mode, arg, arg2]) {
  if (mode === 'gunluk') return daily(root);
  if (mode === 'pratik') return practice(root, arg, arg2 === 'kural');
  if (mode === 'yanlis') return myWrongs(root, arg);
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
  const sid = 'gunluk:' + dayKey();
  root.insertBefore(await whyCard(ids, qs), box);
  const go = () => runQuiz(box, items, {
    title: 'Günlük', extra: lessonLink, sid, name: 'Günlük gramer', source: 'Gramer', task: 'gramer', coach: true,
    onAnswer: logAns,
    onEnd: () => tick('gramer')
  });
  // Isınma: setteki zayıf konuların kural kartı (yarım oturuma dönerken gösterilmez)
  if (inProgress(sid)) go(); else warmGate(box, items.map(it => keyOf(it.info)), go);
}

// "Bu set neden böyle?": konu başına soru sayısı, neden ve seviye (cevaplarına göre)
async function whyCard(ids, qs) {
  const w = await week();
  const cur = new Set([...(w.grammar || []), ...(w.lessons || [])]);
  const weak = new Set(await weakTopics());
  const levels = await gLevels();
  const logs = store.all('grammarLog').filter(l => l.kind === 'gramer');
  const acc = {};
  for (const l of logs) { const a = acc[l.topic] ||= [0, 0]; a[1]++; if (l.correct) a[0]++; }
  const cnt = {};
  for (const id of ids) { const t = qs.get(id)?.topic; if (t) cnt[t] = (cnt[t] || 0) + 1; }
  const rows = Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([t, n]) => {
    const why = weak.has(t) ? 'zorlandığın konu' : cur.has(t) ? 'bu haftanın konusu' : 'tekrar';
    const a = acc[t];
    return h('li', h('b', `${n} × ${topicName(t)}`), h('span.small.muted', ` · ${why} · seviye ${levels[t] || 1}/3${a ? ` · şu ana kadar %${Math.round(100 * a[0] / a[1])} doğru` : ''}`));
  });
  const det = h('details.card.why', h('summary', 'Bu set neden böyle? ', h('span.small.muted', 'cevaplarına göre seçildi')),
    h('ul.list.compact', rows),
    h('p.small.muted', 'Bir konuda %70 doğruyu geçince sorular zorlaşır. Bildiğin sorular daha az, yanlışların Hata tekrarında gelir.'));
  return det;
}

// Konu seviyeleri (gramer kayıtlarından)
async function gLevels() {
  const lvOf = new Map((await grammar()).map(q => [q.id, q.level || 1]));
  return topicLevels(store.all('grammarLog').filter(l => l.kind === 'gramer').map(l => ({ ...l, level: l.level || lvOf.get(l.q) || 0 })));
}

// Konu/soru tipi havuzu: [{key, level, make}]
export async function poolFor(k) {
  const out = [];
  if (!isType(k) || k === 'bosluk') for (const q of await grammar()) if (k === 'bosluk' || q.topic === k) out.push({ key: q.id, level: q.level || 1, make: () => gItem(q) });
  if (k === 'paragraf') for (const p of await passages()) (p.questions || []).forEach((_, i) => out.push({ key: `${p.id}#${i}`, level: p.level || 1, make: () => pItem(p, i) }));
  for (const d of await drills()) if (isType(k) ? d.type === k : d.topic === k) (d.items || []).forEach((_, i) => out.push({ key: `${d.id}#${i}`, level: d.level || 1, make: () => dItem(d, i) }));
  return out;
}

// Çıkmış (gizli paket, IndexedDB) havuzu: konu ya da soru tipi eşleşmesi; diyalog hariç; etiket "Çıkmış · …"
export async function xPoolFor(k) {
  const out = [];
  const pack = await getPack().catch(() => null);
  for (const e of pack?.exams || []) for (const q of e.questions || []) {
    if (!q || q.type === 'diyalog' || !Array.isArray(q.options)) continue;
    if (isType(k) ? q.type !== k : q.topic !== k) continue;
    out.push({ key: `${e.id}:${q.n}`, level: 2, x: true, make: () => { const it = xItem(e, q); return { ...it, label: 'Çıkmış · ' + it.label, cikmis: true }; } });
  }
  return out;
}

const backP = () => h('a.btn.small', { href: '#/eksikler' }, '‹ Eksikler');

// "5 soru çöz": önce yanlış yapılanlar, sonra seviyeye uygun yeniler. kural=true → önce kural kartı
async function practice(root, k, kural) {
  const own = await poolFor(k), xs = await xPoolFor(k);
  const levels = await gLevels();
  const ids = mixPractice(own, xs, { logs: store.all('grammarLog'), mistakes: store.all('mistakes'), allowed: isType(k) ? 3 : levels[k] || 1, n: 5 });
  const by = new Map([...own, ...xs].map(p => [p.key, p]));
  const items = ids.map(id => by.get(id).make());
  const el = h('div');
  root.append(backP(), h('h2', topicName(k) + ' · 5 soru'), el);
  if (!items.length) { el.append(h('p.muted', 'Bu konuda soru yok.')); return; }
  const sid = 'pratik:' + k;
  const go = () => runQuiz(el, items, { title: topicName(k), extra: lessonLink, sid, name: topicName(k) + ' · 5 soru', source: 'Gramer', coach: true, onAnswer: logAns });
  if (kural) warmGate(el, [k], go, { force: true }); else go();
}

// "Yanlışlarım": hata kutusunda o konuya / tipe ait açık sorular (tüm kaynaklar)
async function myWrongs(root, k) {
  const ms = openMistakes().filter(m => matches(m, k)).sort((a, b) => (a.due || '').localeCompare(b.due || '') || (b.wrongs || 0) - (a.wrongs || 0));
  const items = (await Promise.all(ms.slice(0, 20).map(m => resolve(m.id)))).filter(Boolean);
  const el = h('div');
  root.append(backP(), h('h2', 'Yanlışlarım · ' + topicName(k)), el);
  if (!items.length) { el.append(h('div.card', h('p', 'Bu konuda açık yanlış yok.'), h('a.btn.wide', { href: '#/gramer/pratik/' + encodeURIComponent(k) }, '5 soru çöz'))); return; }
  runQuiz(el, items.map(e => ({ ...e, label: 'Yanlış · ' + e.label })), { title: 'Yanlışlarım', extra: lessonLink, name: 'Yanlışlarım · ' + topicName(k), coach: true, onAnswer: logAns });
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
  runQuiz(el, items.map(e => ({ ...e, label: 'Hata · ' + e.label })), { title: 'Hata', extra: lessonLink, sid: 'hata:' + dayKey(), name: 'Hata tekrarı', task: 'hata', coach: true,
    onAnswer: logAns, onEnd: () => tick('hata') });
}

async function byTopic(root, topic) {
  const qs = (await grammar()).filter(q => q.topic === topic);
  const el = h('div');
  root.append(back(), h('h2', topicName(topic)), el);
  if (!qs.length) { el.append((await grammar()).length ? h('p.muted', 'Bu konuda soru yok') : emptyData()); return; }
  const seenOk = new Set(store.all('grammarLog').filter(l => l.correct).map(l => l.q));
  const order = levelOrder(qs.filter(q => !seenOk.has(q.id))).concat(levelOrder(qs.filter(q => seenOk.has(q.id))));
  runQuiz(el, order.slice(0, 8).map(gItem), { extra: lessonLink, sid: 'konu:' + topic, name: topicName(topic), source: 'Gramer', coach: true, onAnswer: logAns });
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
    h('p.small.muted.screen-why', 'Her gün birkaç soru: sınavdaki boşluk sorularının kuralları.'),
    qs.length ? null : emptyData(),
    h('div.chips', h('span.muted.small', `Hafta ${w.n}: `), (w.grammar || []).map(t => h('span.chip.ok', topicName(t)))),
    h('a.btn.primary.wide.big-btn', { href: '#/gramer/gunluk' }, r.tasks?.gramer ? 'Günün soruları ✓ (yeniden çöz)' : `Günün soruları · ${r.busy ? 3 : store.settings().grammarCount} soru`),
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
