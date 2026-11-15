// Boşluk doldurma: kendi öğrendiğin kartlardan YÖKDİL "cümlede boşluk" formatı (5 şık)
import * as store from '../store.js';
import { words, wordIndex, enrich } from '../data.js';
import { h, shuffle } from '../util.js';
import { runQuiz } from '../quiz.js';
import { isStudied, isGraduated } from '../vocab.js';

export const GAP_MIN = 20;
const N = 10;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const gapPool = () => store.all('cards').filter(c => isStudied(c) && c.word && !/\s/.test(c.word.trim()));

// Saf: cümlede kelimeyi boşalt (tam kelime eşleşmesi) → null ya da '----' içeren cümle
export function blankOut(sentence, word) {
  const re = new RegExp(`\\b${esc(word)}\\b`, 'i');
  if (!sentence || !re.test(sentence)) return null;
  return sentence.replace(re, '----');
}

async function sentencesFor(c) {
  const en = await enrich(c.word).catch(() => null);
  return [c.ctx, ...(en?.ex || []).map(e => e.en), c.ex, en?.core?.ex].filter(Boolean);
}

export async function buildItems(n = N) {
  const pool = gapPool();
  const idx = await wordIndex();
  const core = await words();
  const posOf = c => c.pos || idx.get(c.word.toLowerCase())?.pos || '';
  // Önce zayıf/yakın tarihli kartlar
  const order = shuffle(pool).sort((a, b) => (a.interval || 0) - (b.interval || 0) + (b.lapses || 0) - (a.lapses || 0));
  const items = [];
  for (const c of order) {
    if (items.length >= n) break;
    let q = null;
    for (const s of await sentencesFor(c)) if ((q = blankOut(s, c.word))) break;
    if (!q) continue;
    const pos = posOf(c), low = c.word.toLowerCase();
    const bad = new Set([low]);
    const ok = w => w && !/\s/.test(w) && !bad.has(w.toLowerCase()) && !new RegExp(`\\b${esc(w)}\\b`, 'i').test(q);
    const pick = [];
    const take = list => { for (const w of shuffle(list)) { if (pick.length >= 4) break; if (ok(w)) { pick.push(w); bad.add(w.toLowerCase()); } } };
    take(pool.filter(x => posOf(x) === pos).map(x => x.word));
    if (pick.length < 4) take(core.filter(x => x.pos === pos).map(x => x.word));
    if (pick.length < 4) take(core.map(x => x.word));
    const opts = shuffle([c.word, ...pick].map(w => w.toLowerCase()));
    items.push({
      key: 'gap:' + c.id, cardId: c.id, q, options: opts, answer: opts.indexOf(low),
      explain: `${c.word} = ${c.tr || '?'}`, label: 'Kartlarım'
    });
  }
  return items;
}

// Yanlış → kart bugüne çekilir (öğrenilmişse kontrol için kuyruğa döner)
export function gapResult(cardId, ok) {
  if (ok) return;
  const c = store.get('cards', cardId);
  if (!c) return;
  store.put('cards', { ...c, due: Math.min(c.due || Date.now(), Date.now()), ...(isGraduated(c) ? { pulled: true } : {}) });
}

export default async function gap(root, tabs) {
  root.append(tabs, h('h2', 'Boşluk doldurma'));
  const have = gapPool().length;
  if (have < GAP_MIN) {
    root.append(h('div.card', h('p', `Çalıştığın kart sayısı ${GAP_MIN} olunca açılır.`), h('p.small.muted', `Şu an ${have} / ${GAP_MIN}`)));
    return;
  }
  const items = await buildItems();
  const box = h('div');
  root.append(box);
  if (!items.length) { box.append(h('p.muted', 'Örnek cümlesi olan kart bulunamadı.')); return; }
  runQuiz(box, items, {
    title: 'Boşluk', auto: false,
    onAnswer: (it, ok) => gapResult(it.cardId, ok),
    onEnd: (_, el) => el.append(h('a.btn.wide', { href: '#/kartlar/bosluk', onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Yeni tur'))
  });
}
