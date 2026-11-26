// Isınma ekranı (sorulardan önce kural kartı), oturum içi küçük kart, yan panelde "Kuralı oku"
// Görülme kaydı: progress/kkart:<konu> {firstAt, lastAt, lastDay, views, snoozeUntil} (senkrona girer)
import * as store from '../store.js';
import { aids } from '../data.js';
import { h, dayKey, topicName, TOPIC_LESSON, TYPE_LESSON, toast } from '../util.js';
import { md } from '../md.js';
import { findLesson, openLesson, showSide, lessonBlocks, closeSide } from '../side.js';
import { pickWarm, extraFor, snoozeDay } from '../warm.js';

const PID = k => 'kkart:' + k;
export const seenMap = () => Object.fromEntries(store.all('progress').filter(p => p.id?.startsWith('kkart:')).map(p => [p.id.slice(6), p]));
export function markSeen(k) {
  const p = store.get('progress', PID(k)) || {};
  const now = Date.now();
  store.patch('progress', PID(k), { kind: 'kkart', topic: k, firstAt: p.firstAt || now, lastAt: now, lastDay: dayKey(), views: (p.views || 0) + 1 });
}
export const snooze = k => store.patch('progress', PID(k), { kind: 'kkart', topic: k, snoozeUntil: snoozeDay() });

// Oturum yarımda mı? (devam ederken ısınma gösterilmez)
export const inProgress = sid => { const x = sid && store.get('sessions', sid); return !!x && !x.done && (x.i > 0 || Object.keys(x.picks || {}).length > 0); };

export const lessonOf = k => findLesson([k, TOPIC_LESSON[k], TYPE_LESSON[k]].filter(Boolean));

export async function cardData(k) {
  if (!k) return null;
  const [a, l] = await Promise.all([aids().catch(() => null), lessonOf(k)]);
  const rule = (a?.personalRules || []).find(r => r && r.topic === k) || null;
  const extra = extraFor(k, a);
  if (!l?.formula && !rule && !extra) return null;
  return { key: k, name: topicName(k), lesson: l, formula: l?.formula || '', rule, extra };
}

function openSheet(c) {
  showSide(c.title || 'Kopya kağıdı', [h('section.card.lesson', h('div', { html: md(c.md || '') })), h('button.btn.wide', { onclick: closeSide }, 'Kapat')]);
}

function extraEl(e, full) {
  if (!e) return null;
  const c = e.card;
  if (e.kind === 'pol') return h('div.wc-extra', h('b', (c.group || '') + ': '), h('span', { lang: 'en' }, (c.words || []).join(' · ')),
    c.structure ? h('span.muted', ' → ' + c.structure) : null, c.trap ? h('div.small.trap', 'Tuzak: ' + c.trap) : null);
  if (full) return h('div.wc-extra.wc-sheet-full', h('b', c.title || ''), h('div', { html: md(c.md || '') }));
  return h('button.linkbtn.wc-sheet', { type: 'button', onclick: () => openSheet(c) }, 'Kopya kağıdı: ' + (c.title || '') + ' ›');
}

// Dersin "Kısaca" bloğu (başlığa göre; sabit indekse dayanma)
const blockMd = (l, re) => (l?.blocks || []).find(b => re.test(String(b?.h || '').trim()))?.md || '';
const kisaca = l => blockMd(l, /^kısaca$/i);
// Saf: md içinden ilk n madde ("- " ile başlayan satırlar)
export const bullets = (md, n = 9) => String(md || '').split('\n').map(x => x.trim()).filter(x => /^[-*] /.test(x)).slice(0, n).map(x => x.replace(/^[-*] /, ''));
const tuzak = l => bullets(blockMd(l, /tuza/i), 2);
const ornek = l => bullets(blockMd(l, /^örnek/i), 1)[0] || '';
const nasil = l => blockMd(l, /^senin notun$/i);
const li = (xs, cls = '') => xs.length ? h('ul.wc-list' + cls, xs.map(x => h('li', { html: md(x).replace(/^<p>|<\/p>$/g, '') }))) : null;

// Kural kartı: formül + kısaca (açık) + tuzak + örnek + nasıl çözülür + kişisel kural (yanlış → doğru)
export function ruleCardEl(d, { onSnooze, full, compact } = {}) {
  const r = d.rule, l = d.lesson;
  const k = bullets(kisaca(l), compact ? 2 : 4), tz = tuzak(l), ex = ornek(l), how = nasil(l);
  return h('div.wcard', { 'data-key': d.key },
    h('div.wc-head', h('b', d.name)),
    d.formula ? h('div.wc-formula', d.formula) : null,
    li(k),
    tz.length ? h('div.wc-trap', h('b.small', 'Tuzak'), li(compact ? tz.slice(0, 1) : tz, '.trap')) : null,
    !compact && (ex || how) ? h('details.wc-more', h('summary.small', 'Örnek ve çözüm yolu ▸'),
      ex ? h('div.small.wc-ex', { lang: 'en', html: '✓ ' + md(ex).replace(/^<p>|<\/p>$/g, '') }) : null,
      how ? h('div.small.wc-how', { html: md(how) }) : null) : null,
    r && (r.wrong || r.right) ? h('div.wc-rule', h('b.small', 'Notlarından'),
      r.wrong ? h('div.small.bad-t', { lang: 'en' }, '✗ ' + r.wrong) : null,
      r.right ? h('div.small.good-t', { lang: 'en' }, '✓ ' + r.right) : null) : null,
    extraEl(d.extra, full),
    full ? null : h('div.wc-acts',
      l ? h('button.linkbtn.small.wc-lesson', { type: 'button', onclick: () => openLesson(l.id) }, 'Dersi aç') : null,
      onSnooze ? h('button.linkbtn.small.wc-snooze.muted', { type: 'button', onclick: onSnooze }, 'Bir hafta gösterme') : null));
}

// Isınma: setteki zayıf konulardan en fazla 2 kart; yoksa doğrudan start(). force: verilen konuları her durumda göster
export async function warmGate(root, keys, start, { force = false } = {}) {
  if (!force && store.settings().warmup === false) return start();
  let list;
  if (force) list = [...new Set(keys)].filter(Boolean).map(key => ({ key }));
  else {
    const a = await aids().catch(() => null);
    list = pickWarm(keys, { logs: store.all('grammarLog'), mistakes: store.all('mistakes'), rules: a?.personalRules || [] }, seenMap(), 4);
  }
  const ds = (await Promise.all(list.map(p => cardData(p.key)))).filter(Boolean).slice(0, 2);
  if (!ds.length) return start();
  ds.forEach(d => markSeen(d.key));
  const box = h('div.warm');
  let gone = false;
  const go = () => { if (gone) return; gone = true; box.remove(); start(); };
  const cards = h('div.wcards', ds.map(d => ruleCardEl(d, { compact: ds.length > 1,
    onSnooze: force ? null : e => { snooze(d.key); toast('Bir hafta gösterilmeyecek'); e.currentTarget.closest('.wcard')?.remove(); if (!cards.children.length) go(); }
  })));
  box.append(h('div.warm-head', h('b', 'Isınma'), h('span.small.muted', ds.length > 1 ? ' · 2 kural, 30 sn' : ' · 30 sn')), cards,
    h('div.actbar', h('button.btn.primary.wide.warm-go', { type: 'button', onclick: go }, 'Anladım, sorulara geç')));
  root.append(box);
  window.scrollTo(0, 0);
}

// Oturumda aynı konudan 2. yanlış → sonraki sorunun üstünde küçük kart (kapatılabilir)
export async function miniCard(k) {
  const d = await cardData(k);
  if (!d) return null;
  markSeen(k);
  const el = h('div.minirule', { role: 'note' },
    h('div.mr-head', h('b.grow', 'Hatırla · ' + d.name), h('button.icon-x.small', { type: 'button', 'aria-label': 'kapat', onclick: () => el.remove() }, '×')),
    d.formula ? h('div.small', d.formula) : null,
    li(bullets(kisaca(d.lesson), 3)),
    tuzak(d.lesson)[0] ? h('div.small.trap', { html: 'Tuzak: ' + md(tuzak(d.lesson)[0]).replace(/^<p>|<\/p>$/g, '') }) : null,
    h('button.linkbtn.small.mr-open', { type: 'button', onclick: () => openRule(k) }, 'Kuralın tamamı ›'));
  return el;
}

// Yan panel (mobilde tam ekran): kural kartı + dersin tamamı + 5 soru
export async function openRule(k) {
  const d = await cardData(k);
  const l = d?.lesson || await lessonOf(k);
  if (!d && !l) { toast('Bu konu için kural kartı yok'); return; }
  if (d) markSeen(k);
  showSide(d?.name || l.title, [
    d ? ruleCardEl(d, { full: true }) : null,
    l ? [h('h3.wc-full', 'Dersin tamamı'), ...lessonBlocks(l)] : null,
    h('a.btn.primary.wide.side-practice', { href: '#/gramer/pratik/' + encodeURIComponent(k) }, '5 soru çöz'),
    h('button.btn.wide', { type: 'button', onclick: closeSide }, 'Kapat')
  ]);
}
