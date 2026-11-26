// Serbest pratik (bonus): günlük tekrar bitince isteyen için 10 soruluk karışık turlar.
// Takvimi bozmaz: doğru → dokunma; yanlış → kart bugüne (Tekrar günü sayılmaz). Görev/seri/sayaçlar etkilenmez.
import * as store from '../store.js';
import { h, shuffle, dayKey, addDays } from '../util.js';
import { runQuiz } from '../quiz.js';
import { meaningItem, synItem, familyItem, blank, inLadder } from '../memory.js';
import { buildGuess } from './guess.js';
import { words, forms, enrich } from '../data.js';
import { isGraduated } from '../vocab.js';
import { dayRec, updateDay } from '../plan.js';

export const TOUR_N = 10, TOUR_ENOUGH = 3, RECENT_MIN = 10;

// Saf: kart önceliği — bugünün yenileri (≥10 dk önce) → merdiven/son 10 günde Tekrar → aralığı ≤7 g (bugün görülmemiş) → %20 oturmuş
export function freePool(cards, { now = Date.now(), today = dayKey(), rnd = Math.random, n = TOUR_N, used = new Set() } = {}) {
  const sod = new Date(today + 'T00:00:00').getTime();
  const ok = c => c && c.word && (c.tr || '').trim() && !used.has(c.id) && now - (c.lastReview || 0) >= RECENT_MIN * 60000 && c.state !== 'known';
  const tier = c => {
    if (c.intro === today) return 0;
    if (inLadder(c) || (c.agDays || []).some(d => d >= addDays(today, -10))) return 1;
    if ((c.interval || 0) <= 7 && (c.lastReview || 0) < sod && (c.state || 'new') !== 'new') return 2;
    if (isGraduated(c) || (c.interval || 0) > 7) return 3;
    return 9;
  };
  const xs = shuffle((cards || []).filter(ok), rnd).map(c => ({ c, t: tier(c) })).filter(x => x.t < 9).sort((a, b) => a.t - b.t);
  const nOld = Math.max(1, Math.round(n * 0.2));
  const main = xs.filter(x => x.t < 3).slice(0, n - Math.min(nOld, xs.filter(x => x.t === 3).length));
  const old = xs.filter(x => x.t === 3).slice(0, n - main.length);
  return [...main, ...old].map(x => x.c);
}

// Ne zaman açılır? Hazır kart yoksa en erken (son görülme + 10 dk)
export function freeReady(cards = store.all('cards'), now = Date.now()) {
  if (freePool(cards, { now, n: 1 }).length) return { ok: true };
  const soon = (cards || []).filter(c => c.word && c.tr && now - (c.lastReview || 0) < RECENT_MIN * 60000).map(c => (c.lastReview || 0) + RECENT_MIN * 60000);
  return { ok: false, at: soon.length ? Math.min(...soon) : null };
}
export const hhmm = t => new Date(t).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
// Giriş düğmesi: hazır değilse saatini söyler (çıkmaz yol yok)
export function freeBtn(primary = false) {
  const r = freeReady();
  if (r.ok) return h('a.btn.wide.free-btn' + (primary ? '.primary' : ''), { href: '#/kartlar/serbest' }, h('span', h('b', 'Serbest pratik'), ' ', h('span.chip.small', 'bonus'), h('br'), h('span.small.muted', 'karışık 10 soru · takvimi bozmaz')));
  return r.at ? h('p.small.muted.center.free-wait', `Serbest pratik ${hhmm(r.at)}'de açılır (öğrendiklerin 10 dk dinlensin).`) : null;
}

const FORMATS = ['anlam', 'tahmin', 'bosluk', 'es', 'aile'];

async function buildTour(used) {
  const cards = store.all('cards');
  const pick = freePool(cards, { used });
  const others = [...cards, ...(await words())].filter(o => o.word && o.tr);
  const fm = await forms();
  const items = [];
  let f = Math.floor(Math.random() * FORMATS.length);
  for (const c of pick) {
    let it = null;
    for (let tries = 0; tries < FORMATS.length && !it; tries++, f++) {
      const fmt = FORMATS[f % FORMATS.length];
      if (fmt === 'anlam') it = meaningItem(c, others);
      else if (fmt === 'es') it = synItem(c, others);
      else if (fmt === 'aile') it = familyItem(c, fm);
      else {
        const en = await enrich(c.word).catch(() => null);
        const exs = [c.ctx && { en: c.ctx }, ...(en?.ex || [])].filter(x => x && x.en);
        if (fmt === 'tahmin') it = buildGuess({ word: c.word.toLowerCase(), tr: c.tr, pos: c.pos, cardId: c.id }, exs, others);
        else {
          const s = exs.map(x => blank(x.en, c.word)).find(Boolean);
          const w = c.word.toLowerCase();
          const opts = s ? shuffle([w, ...shuffle(others.filter(o => o.word.toLowerCase() !== w && !/\s/.test(o.word) && (!c.pos || o.pos === c.pos)).map(o => o.word.toLowerCase())).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4)]) : null;
          if (s && opts.length === 5) it = { key: 'bos:' + c.id, cardId: c.id, q: s, options: opts, answer: opts.indexOf(w), explain: `${c.word} = ${c.tr}`, label: 'Boşluk', info: { kind: 'hafiza', dtype: 'bosluk' } };
        }
      }
    }
    if (it) { items.push({ ...it, cardId: it.cardId || c.id, key: 'serbest:' + (it.key || c.id), label: 'Bonus · ' + (it.label || '') }); used.add(c.id); }
  }
  return items;
}

export default async function freePractice(root, tabs) {
  const used = new Set();
  const tour = async () => {
    root.innerHTML = '';
    root.append(tabs(''), h('h2', 'Serbest pratik ', h('span.chip.small', 'bonus')),
      h('p.small.muted', 'Takvimi bozmaz: doğru cevaplar tekrar tarihini değiştirmez, yanlışlar bugün kart tekrarına eklenir.'));
    const items = await buildTour(used);
    const el = h('div'); root.append(el);
    if (!items.length) { const r = freeReady(); el.append(h('div.card', h('p', r.at ? `Serbest pratik ${hhmm(r.at)}'de açılır: öğrendiklerin 10 dk dinlensin.` : 'Şu an pratik edilecek kart yok. Yeni kelime öğrenince burada çıkar.'))); return; }
    runQuiz(el, items, {
      title: 'Serbest pratik', name: 'Serbest pratik', source: 'Kartlar', noLog: true,
      onAnswer: (it, ok) => {
        if (ok) return;
        const c = store.get('cards', it.cardId);
        if (c) store.put('cards', { ...c, due: Math.min(c.due || Date.now(), Date.now()), wrongDay: dayKey(), ...(isGraduated(c) ? { pulled: true } : {}) });
      },
      onEnd: (_, box) => {
        const n = (dayRec().freeTours || 0) + 1;
        updateDay({ freeTours: n });
        box.querySelector('.endcard')?.append(
          n >= TOUR_ENOUGH ? h('p.small.free-enough', 'Bugün için yeterli. Uyku da tekrar yapar; yarın daha kalıcı olur.') : null,
          h('button.btn.primary.wide.free-again', { type: 'button', onclick: tour }, 'Bir tur daha'));
      }
    });
  };
  tour();
}
