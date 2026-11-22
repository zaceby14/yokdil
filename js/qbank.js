// Soru bankası: anahtar → oturum öğesi
//  gramer: g0001 · alıştırma: d001#0 · ders: ders:<id>#0 · çıkmış: <examId>:<n>
import { grammar, drills, lessons, passages } from './data.js';
import { topicName, typeName, TOPICS, optText } from './util.js';
import { getPack, groupOf } from './pack.js';
import { tappable } from './tappable.js';
import { autoParts } from './autoparts.js';

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
  return '';
}

export async function lessonFor(topic) {
  if (!topic) return null;
  return (await lessons()).find(l => lessonTopic(l) === topic) || null;
}

export function gItem(q) {
  const dbl = !!q.double || (String(q.q || '').match(/-{2,}/g) || []).length >= 2;
  return { key: q.id, q: q.q, options: (q.options || []).map(optText), answer: q.answer, explain: q.explain, tip: q.tip, hint: q.hint || '', double: dbl,
    label: topicName(q.topic) + (dbl ? ' · çift boşluk' : ''), info: { kind: 'gramer', topic: q.topic, dtype: q.type || 'bosluk', level: q.level || 0 } };
}

export function dItem(d, i) {
  const it = d.items[i];
  return {
    key: `${d.id}#${i}`, stem: d.stem, q: it.q, options: (it.options || []).map(optText), answer: it.answer, explain: it.explain, tip: it.tip, hint: it.hint || '',
    label: typeName(d.type) + (d.items.length > 1 ? ` (${i + 1})` : ''),
    ...(Array.isArray(it.parts) && it.parts.length ? { parts: it.parts, check: it.check || [] } : {}),
    info: { kind: 'drill', topic: d.topic || '', dtype: d.type }
  };
}

export function lItem(l, i) {
  const c = l.checks[i];
  return { key: `ders:${l.id}#${i}`, q: c.q, options: (c.options || []).map(optText), hint: c.hint || l.formula || '', answer: c.answer, explain: c.explain, label: l.title, info: { kind: 'ders', topic: lessonTopic(l), dtype: 'bosluk' } };
}

export function pItem(p, i) {
  const q = p.questions[i];
  return { key: `${p.id}#${i}`, stemNode: () => tappable(p.text, { source: 'Okuma', note: p.title }).el, q: q.q, options: q.options, answer: q.answer, explain: q.explain,
    label: p.title, info: { kind: 'okuma', topic: p.topic || '', dtype: 'paragraf' } };
}

// Gizli okuma sorusu: anahtar r:<okumaId>:<n> (n 1'den); metin IndexedDB'den
export function rItem(r, k) {
  const q = r.questions[k];
  return { key: `r:${r.id}:${k + 1}`, stemNode: () => tappable(r.text, { source: r.source || 'Okuma', note: r.title || '' }).el, q: q.q, options: q.options.map(optText), answer: q.answer,
    explain: q.explain || '', tf: q.type === 'tf', unverified: q.keySource === 'claude', label: r.title || 'Okuma',
    info: { kind: 'okuma', topic: r.topic || '', dtype: 'paragraf', src: 'gizli' } };
}

// Çıkmış çeviri: içerikte parçalar varsa onlar, yoksa basit otomatik parçalama (rol etiketi yok, karşılık yok)
function xParts(q) {
  if (!/^ceviri-/.test(q.type || '')) return {};
  if (Array.isArray(q.parts) && q.parts.length) return { parts: q.parts, check: q.check || [] };
  const ps = autoParts(q.q, q.type === 'ceviri-tr-en' ? 'tr' : 'en');
  return ps.length > 1 ? { parts: ps, autoParts: true } : {};
}

// Çıkmış soru öğesi (metinler IndexedDB'den)
export function xItem(e, q) {
  const g = groupOf(e, q);
  const src = { source: e.title || 'Çıkmış', note: `Soru ${q.n}` };
  const long = q.type !== 'ceviri-tr-en' && String(q.q || '').length > 140;
  return {
    key: `${e.id}:${q.n}`, stemNode: g?.text ? () => tappable(g.text, src).el : null,
    qNode: long ? () => tappable(q.q, src).el : null, q: q.q,
    options: (q.options || []).map(optText), answer: q.answer, explain: q.explain || '',
    label: `${e.title || e.id} · ${q.n}`, unverified: q.keySource === 'claude',
    info: { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' },
    ...xParts(q)
  };
}

export async function resolve(key) {
  const { gmap, dmap, lmap, pmap } = await maps();
  if (gmap.has(key)) return gItem(gmap.get(key));
  if (key.startsWith('r:')) {
    const k = key.lastIndexOf(':'), id = key.slice(2, k), n = +key.slice(k + 1);
    const r = (await getPack())?.readings?.find(x => x.id === id);
    return r?.questions?.[n - 1] ? rItem(r, n - 1) : null;
  }
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

// İpucu: sorunun kendi "hint" alanı, yoksa konunun (ya da soru tipinin) dersindeki 30 saniyelik formül
export async function hintFor(it) {
  if (it.hint) return it.hint;
  const { findLesson, lessonCands } = await import('./side.js');
  const l = await findLesson(lessonCands(it));
  return l?.formula || '';
}
