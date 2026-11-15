// Soru bankası: anahtar → oturum öğesi
//  gramer: g0001 · alıştırma: d001#0 · ders: ders:<id>#0 · çıkmış: <examId>:<n>
import { grammar, drills, lessons, passages } from './data.js';
import { topicName, typeName, TOPICS, TOPIC_ORDER } from './util.js';
import { getPack, groupOf } from './pack.js';
import { tappable } from './tappable.js';

let gmap = null, dmap = null, lmap = null, pmap = null;
async function maps() {
  if (!gmap) {
    gmap = new Map((await grammar()).map(q => [q.id, q]));
    dmap = new Map((await drills()).map(d => [d.id, d]));
    lmap = new Map((await lessons()).map(l => [l.id, l]));
    pmap = new Map((await passages()).map(p => [p.id, p]));
  }
  return { gmap, dmap, lmap, pmap };
}

export function lessonTopic(l) {
  if (!l) return '';
  if (l.topic) return l.topic;
  if (TOPICS[l.id]) return l.id;
  return TOPIC_ORDER.find(t => String(l.id).includes(t)) || TOPIC_ORDER[(l.order || 0) - 1] || '';
}

export async function lessonFor(topic) {
  if (!topic) return null;
  return (await lessons()).find(l => lessonTopic(l) === topic) || null;
}

export function gItem(q) {
  return { key: q.id, q: q.q, options: q.options, answer: q.answer, explain: q.explain, tip: q.tip, label: topicName(q.topic), info: { kind: 'gramer', topic: q.topic, dtype: q.type || 'bosluk' } };
}

export function dItem(d, i) {
  const it = d.items[i];
  return {
    key: `${d.id}#${i}`, stem: d.stem, q: it.q, options: it.options, answer: it.answer, explain: it.explain, tip: it.tip,
    label: typeName(d.type) + (d.items.length > 1 ? ` (${i + 1})` : ''),
    info: { kind: 'drill', topic: d.topic || '', dtype: d.type }
  };
}

export function lItem(l, i) {
  const c = l.checks[i];
  return { key: `ders:${l.id}#${i}`, q: c.q, options: c.options, answer: c.answer, explain: c.explain, label: l.title, info: { kind: 'ders', topic: lessonTopic(l), dtype: 'bosluk' } };
}

export function pItem(p, i) {
  const q = p.questions[i];
  return { key: `${p.id}#${i}`, stemNode: () => tappable(p.text, { source: 'Okuma', note: p.title }).el, q: q.q, options: q.options, answer: q.answer, explain: q.explain,
    label: p.title, info: { kind: 'okuma', topic: p.topic || '', dtype: 'paragraf' } };
}

// Çıkmış soru öğesi (metinler IndexedDB'den)
export function xItem(e, q) {
  const g = groupOf(e, q);
  const src = { source: e.title || 'Çıkmış', note: `Soru ${q.n}` };
  const long = q.type !== 'ceviri-tr-en' && String(q.q || '').length > 140;
  return {
    key: `${e.id}:${q.n}`, stemNode: g?.text ? () => tappable(g.text, src).el : null,
    qNode: long ? () => tappable(q.q, src).el : null, q: q.q,
    options: q.options, answer: q.answer, explain: q.explain || '',
    label: `${e.title || e.id} · ${q.n}`, unverified: q.keySource === 'claude',
    info: { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' }
  };
}

export async function resolve(key) {
  const { gmap, dmap, lmap, pmap } = await maps();
  if (gmap.has(key)) return gItem(gmap.get(key));
  if (key.startsWith('ders:')) {
    const [id, i] = key.slice(5).split('#');
    const l = lmap.get(id);
    return l?.checks?.[+i] ? lItem(l, +i) : null;
  }
  if (key.includes('#')) {
    const [id, i] = key.split('#');
    const d = dmap.get(id);
    if (d && d.items?.[+i]) return dItem(d, +i);
    const p = pmap.get(id);
    if (p?.questions?.[+i]) return pItem(p, +i);
    return null;
  }
  const k = key.lastIndexOf(':');
  if (k > 0) {
    const pack = await getPack();
    const e = pack?.exams.find(x => x.id === key.slice(0, k));
    const q = e?.questions.find(x => String(x.n) === key.slice(k + 1));
    if (q) return xItem(e, q);
  }
  return null;
}
