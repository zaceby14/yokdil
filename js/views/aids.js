// Gramer kolaylaştırıcıları: karar ağacı, bağlaç kutup kartları, zaman tablosu, kopya kağıtları, şık eleme, kişisel kurallar
// data/aids.json yoksa ya da bir bölüm eksikse o araç görünmez.
import { aids } from '../data.js';
import { h, add, topicName } from '../util.js';
import { md } from '../md.js';
import { setCtx } from '../ctx.js';
import * as store from '../store.js';
import { planRows } from '../strategy.js';
import { timePlanView, targetView, examDayView, resourcesView } from './strategy.js';

const TOOLS = [
  ['agac', 'Karar ağacı', a => a.decisionTree?.nodes?.length],
  ['kutup', 'Bağlaç kartları', a => a.polarityCards?.length],
  ['zaman', 'Zaman tablosu', a => a.tenseTable?.rows?.length],
  ['kopya', 'Kopya kağıtları', a => a.cheatSheets?.length || a.mnemonics?.length],
  ['eleme', 'Şık eleme', a => a.eliminationTips?.length],
  ['kural', 'Kişisel kurallarım', a => a.personalRules?.length],
  ['sure', 'Süre planı', a => planRows(a.timePlan).length],
  ['net', 'Hedef net', a => a.targets?.some?.(t => t?.nets && t.score)],
  ['gun', 'Sınav günü', a => a.examDay?.some?.(g => g?.items?.length)],
  ['kaynak', 'Kaynaklar', a => a.resources?.some?.(r => r?.title)]
];
// Strateji araçları şeridin başında
const STRIP = ['sure', 'net', 'gun', 'agac', 'kutup', 'zaman', 'kopya', 'eleme', 'kural', 'kaynak'];
const COLORS = { kirmizi: 'red', 'kırmızı': 'red', red: 'red', yesil: 'green', 'yeşil': 'green', green: 'green', mavi: 'blue', blue: 'blue',
  mor: 'purple', purple: 'purple', gri: 'gray', gray: 'gray', grey: 'gray', turuncu: 'orange', orange: 'orange' };

export async function toolsStrip() {
  const a = await aids().catch(() => null);
  if (!a) return null;
  const on = TOOLS.filter(([, , ok]) => { try { return ok(a); } catch { return false; } });
  if (!on.length) return null;
  on.sort((x, y) => STRIP.indexOf(x[0]) - STRIP.indexOf(y[0]));
  return h('section.tools', h('div.small.muted', 'Araçlar', on.length > 3 ? ' · kaydır →' : ''),
    h('div.toolstrip', { tabindex: '0', role: 'group', 'aria-label': 'Araçlar' }, on.map(([k, l]) => h('a.tool', { href: '#/dersler/arac/' + k }, l))));
}

const back = () => h('a.btn.small', { href: '#/dersler' }, '‹ Dersler');
const arr = x => Array.isArray(x) ? x : [];

export async function toolView(root, kind, id) {
  const a = await aids().catch(() => null);
  const t = TOOLS.find(x => x[0] === kind);
  root.append(back());
  if (!a || !t || !(() => { try { return t[2](a); } catch { return false; } })()) { root.append(h('p.muted', 'Bu araç için içerik yok.')); return; }
  root.append(h('h2', t[1]));
  setCtx({ type: 'ders', key: 'arac:' + kind, label: 'Araç · ' + t[1] });
  ({ agac: tree, kutup: polarity, zaman: tense, kopya: sheets, eleme: elim, kural: rules, sure: timePlanView, net: targetView, gun: examDayView, kaynak: resourcesView })[kind](root, a, id);
}

// Karar ağacı: adım adım soru → seçenek → sonraki düğüm / sonuç
function tree(root, a) {
  const t = a.decisionTree;
  const nodes = new Map(arr(t.nodes).map(n => [n.id, n]));
  const box = h('div.treebox');
  const path = [];
  const step = (id, result) => {
    box.innerHTML = '';
    if (t.title) box.append(h('p.small.muted', t.title));
    if (path.length) box.append(h('div.small.muted.treepath', path.map(p => p.label).join(' → ')));
    if (result != null) {
      box.append(h('div.card.tree-result', h('b', 'Sonuç: '), h('span', { html: md(String(result)) })),
        h('div.row', h('button.btn', { onclick: () => { path.pop(); step(path.at(-1)?.from || arr(t.nodes)[0]?.id); } }, '‹ Geri'),
          h('button.btn.primary.grow', { onclick: () => { path.length = 0; step(arr(t.nodes)[0]?.id); } }, 'Baştan')));
      return;
    }
    const n = nodes.get(id);
    if (!n) { box.append(h('p.muted', 'Düğüm bulunamadı.')); return; }
    add(box, h('div.card.tree-q', h('b', n.q)),
      h('div.tree-opts', arr(n.options).map(o => h('button.btn.wide.tree-opt', {
        onclick: () => { path.push({ label: o.label, from: n.id }); o.next && nodes.has(o.next) ? step(o.next) : step(null, o.result ?? '—'); }
      }, o.label))),
      path.length ? h('button.btn', { onclick: () => { const p = path.pop(); step(p.from); } }, '‹ Geri') : null);
  };
  root.append(box);
  step(arr(t.nodes)[0]?.id);
}

function polarity(root, a) {
  root.append(h('p.small.muted', 'Kaydır →'), h('div.polcards', arr(a.polarityCards).map(c =>
    h('div.polcard.pc-' + (COLORS[String(c.color || '').toLowerCase()] || 'gray'),
      h('b', c.group), h('div.chips', arr(c.words).map(w => h('span.chip', { lang: 'en' }, w))),
      c.structure ? h('div.small', h('b', 'Yapı: '), c.structure) : null,
      c.ex ? h('div.small', { lang: 'en' }, c.ex) : null,
      c.trap ? h('div.small.trap', h('b', 'Tuzak: '), c.trap) : null))));
}

function table(cols, rows) {
  return h('div.tbl.cardify', h('table',
    h('tr', arr(cols).map(c => h('th', c))),
    arr(rows).map(r => h('tr', (Array.isArray(r) ? r : arr(cols).map(c => r?.[c] ?? '')).map((v, i) => h('td', { 'data-th': arr(cols)[i] || '' }, String(v ?? '')))))));
}

function tense(root, a) { root.append(table(a.tenseTable.cols, a.tenseTable.rows)); }

function sheets(root, a, id) {
  const list = arr(a.cheatSheets);
  const cur = list.find(x => x.id === id);
  if (cur) { root.append(h('section.card.lesson', h('h3', cur.title), h('div', { html: md(cur.md) })), h('a.btn.wide', { href: '#/dersler/arac/kopya' }, '‹ Tüm kopya kağıtları')); return; }
  root.append(h('ul.list', list.map(x => h('li', h('a', { href: '#/dersler/arac/kopya/' + encodeURIComponent(x.id) }, h('b', x.title))))));
  if (arr(a.mnemonics).length) root.append(h('h3', 'Ezber formülleri'), h('ul.list.compact', arr(a.mnemonics).map(m => h('li', h('span', h('span.small.muted', topicName(m.topic || '') + ' '), m.text)))));
}

function elim(root, a) {
  root.append(h('ol.elim', arr(a.eliminationTips).map(t => h('li', h('b', t.title), h('div', t.text), t.ex ? h('div.small.muted', { lang: 'en' }, t.ex) : null))));
}

// id = konu: Bugün'deki "Kural kartı" görevinden gelinir → o kart üstte + "Okudum" (görev kapanır)
function rules(root, a, id) {
  const list = arr(a.personalRules);
  const cur = id ? list.filter(r => r.topic === id) : [];
  if (cur.length) root.append(h('div.note', 'Bu kuraldan son günlerde 2+ yanlış yaptın. Kartı oku, örneği sesli söyle.'));
  root.append(cur.length ? null : h('p.small.muted', 'İlgili konuda yanlış yapınca bu kart soru açıklamasında kendiliğinden çıkar.'),
    h('div', [...cur, ...list.filter(r => !cur.includes(r))].map(r => h('div.rulecard' + (cur.includes(r) ? '.focus' : ''), h('div.small.muted', topicName(r.topic || '')), h('b', r.rule),
      r.ex ? h('div.small', { lang: 'en' }, r.ex) : null,
      r.wrong || r.right ? h('div.small', r.wrong ? h('span.bad-t', '✗ ' + r.wrong + ' ') : null, r.right ? h('span.good-t', '✓ ' + r.right) : null) : null,
      cur.includes(r) && r === cur.at(-1) ? h('div.row', h('button.btn.primary.grow.rule-ack', { onclick: () => { store.patch('progress', 'kural:' + id, { ackAt: Date.now() }); location.hash = '#/bugun'; } }, 'Okudum'),
        h('a.btn', { href: '#/gramer/konu/' + encodeURIComponent(id) }, 'Bu konudan çöz')) : null))));
}
