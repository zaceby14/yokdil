// Bağlamdan tahmin: örnek cümlede vurgulu kelimenin Türkçe anlamını 4 şıktan seç
// Havuz: öğrenmekte olduğun kartlar (önce) + çekirdek liste; çeldiriciler aynı türden kelimelerin anlamları
import * as store from '../store.js';
import { words, forms, wordIndex, lessons } from '../data.js';
import { h, shuffle, dayKey } from '../util.js';
import { runQuiz } from '../quiz.js';
import { isStudied, isFunctionWord, level } from '../vocab.js';
import { splitAt } from '../strategy.js';
import { gapResult } from './gap.js';
import { openLesson } from '../side.js';
import { doneToday, markDone } from '../memory.js';

const N = 10;
const short = tr => String(tr || '').split(/[;(]/)[0].trim();

// Saf: Türkçesi kelimenin kendisi gibi mi? (risk/risk, sector/sektör, factor/faktör)
const trN = x => String(x || '').toLowerCase().replace(/[öüşçğı]/g, ch => ({ ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g', ı: 'i' })[ch]).replace(/k/g, 'c');
export const cognate = (word, tr) => { const w = trN(word).replace(/[^a-z]/g, ''); if (w.length < 4) return false; return String(tr || '').split(/[,;/]/).some(t => trN(t).trim().startsWith(w.slice(0, 4))); };
// Saf: tek soru kur. cand {word, tr, pos, cardId}; exs [{en,tr}]; pool [{word,tr,pos}] → öğe ya da null
export function buildGuess(cand, exs, pool, rnd = Math.random) {
  const tr = short(cand.tr);
  if (!tr) return null;
  let hit = null, ex = null;
  for (const e of exs || []) { const sp = splitAt(e?.en, cand.word); if (sp) { hit = sp; ex = e; break; } }
  if (!hit) return null;
  const used = new Set([tr.toLocaleLowerCase('tr-TR')]);
  const pick = [];
  const take = list => {
    for (const w of shuffle(list, rnd)) {
      if (pick.length >= 3) break;
      const t = short(w.tr), k = t.toLocaleLowerCase('tr-TR');
      // Anlam parçaları çakışan şık olmasın ("-e rağmen, -dığı halde" ile "-se de, -e rağmen")
      const parts = x => String(x).split(/[,;/]/).map(y => y.trim()).filter(Boolean);
      if (!t || used.has(k) || w.word === cand.word || [...used].some(u => u.includes(k) || k.includes(u) || parts(u).some(pu => parts(k).some(pk => pu === pk || (pu.length > 3 && (pu.includes(pk) || pk.includes(pu))))))) continue;
      used.add(k); pick.push(t);
    }
  };
  take(pool.filter(w => w.pos && w.pos === cand.pos));
  if (pick.length < 3) take(pool);
  if (pick.length < 3) return null;
  const options = shuffle([tr, ...pick], rnd);
  return { key: 'tahmin:' + cand.word, cardId: cand.cardId || null, q: ex.en, hl: hit[1], options, answer: options.indexOf(tr), plainOpts: true,
    explain: `${cand.word} = ${cand.tr}${ex.tr ? ' · ' + ex.tr : ''}`, label: 'Bağlamdan tahmin', info: { dtype: 'tahmin' } };
}

export async function buildItems(n = N) {
  const [core, fm, idx] = await Promise.all([words(), forms(), wordIndex()]);
  const cards = store.all('cards');
  const ok = w => w && !/\s/.test(w) && !isFunctionWord(w, idx);
  const posOf = w => idx.get(w.toLowerCase())?.pos || '';
  // Önce öğrenmekte olduğun (zayıf olan önce), sonra henüz görmediğin çekirdek kelimeler
  const doneT = doneToday('tahmin');
  const mine = shuffle(cards.filter(c => isStudied(c) && c.tr && ok(c.word) && !doneT[c.id])).sort((a, b) => (a.interval || 0) - (b.interval || 0))
    .map(c => ({ word: c.word.toLowerCase().trim(), tr: c.tr, pos: c.pos || posOf(c.word), cardId: c.id }));
  const have = new Set(cards.filter(c => level(c) !== 'new').map(c => (c.word || '').toLowerCase().trim()));
  const fresh = shuffle(core.filter(w => ok(w.word) && !have.has(w.word.toLowerCase()))).sort((a, b) => (b.freq || 0) - (a.freq || 0)).slice(0, 60)
    .map(w => ({ word: w.word.toLowerCase(), tr: w.tr, pos: w.pos }));
  const pool = core.filter(w => ok(w.word) && w.tr);
  const out = [], seen = new Set();
  for (const c of [...mine, ...shuffle(fresh)]) {
    if (out.length >= n) break;
    if (seen.has(c.word) || cognate(c.word, c.tr)) continue; // risk = risk: bağlamdan tahmin olmaz
    const f = fm[c.word];
    const it = buildGuess(c, [...(f?.ex || []), ...(idx.get(c.word)?.ex ? [{ en: idx.get(c.word).ex }] : [])], pool);
    if (it) { seen.add(c.word); out.push(it); }
  }
  return out;
}

export default async function guess(root, tabs) {
  const hasLesson = (await lessons()).some(l => l.id === 'taktik-kelime-tahmini');
  root.append(tabs, h('div.row.between', h('h2', 'Bağlamdan tahmin'),
    hasLesson ? h('button.btn.small', { onclick: () => openLesson('taktik-kelime-tahmini') }, 'Taktik') : null),
    h('p.small.muted', 'Cümleyi oku, sarı kelimenin anlamını bağlamdan çıkar.'));
  const items = await buildItems();
  const box = h('div');
  root.append(box);
  if (!items.length) { box.append(h('div.card.empty', h('p', 'Örnek cümle bulunamadı. İnternete bağlanıp yenile.'))); return; }
  runQuiz(box, items, {
    title: 'Tahmin', auto: false, sid: 'tahmin:' + dayKey(), inline: true, name: 'Bağlamdan tahmin', source: 'Kartlarım', noLesson: true,
    onAnswer: (it, ok) => { if (it.cardId) { gapResult(it.cardId, ok); if (ok) markDone('tahmin', it.cardId); } },
    onEnd: (_, el) => el.querySelector('.endnext')?.before(h('a.btn.wide', { href: '#/kartlar/tahmin', onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Yeni tur'))
  });
}
