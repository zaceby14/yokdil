// İçerik güncelleme: sözlük (words.json / seed-user.json) düzeltilince cihazdaki eski kopyaları tazele.
// Kullanıcının elle düzenlediği kartlara (userEdited) ve SRS alanlarına asla dokunmaz.
import * as store from './store.js';
import { words, seedUser } from './data.js';

const RK = 'yokdil.dataRev';
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const arr = x => Array.isArray(x) ? x : x ? [x] : [];

export const seedId = c => c.id || 's:' + String(c.word || '').toLowerCase().trim().replace(/\s+/g, '-');

// Saf: kart + kaynak kayıt → güncellenmiş alanlar ya da null
export function refreshFields(card, src, kind) {
  if (!card || !src || card.userEdited || card.deleted) return null;
  const f = kind === 'seed'
    ? { tr: src.tr || '', syn: arr(src.syn), note: src.note || '' }
    : { tr: src.tr || '', syn: arr(src.syn), coll: src.coll || '', ex: src.ex || '', pos: src.pos || '', tags: arr(src.tags) };
  if (kind === 'seed' && !src.note) delete f.note; // seed'de not yoksa kullanıcının notunu silme
  const diff = {};
  for (const [k, v] of Object.entries(f)) if (!same(card[k], v)) diff[k] = v;
  return Object.keys(diff).length ? diff : null;
}

// Saf: tüm kartlar için güncelleme listesi [{id, fields}]
export function plan(cards, seedCards, coreWords) {
  const seed = new Map(seedCards.filter(c => c?.word).map(c => [seedId(c), c]));
  const core = new Map(coreWords.filter(w => w?.id).map(w => [w.id, w]));
  const out = [];
  for (const c of cards) {
    let f = null;
    if (seed.has(c.id)) f = refreshFields(c, seed.get(c.id), 'seed');
    else if (c.wid && core.has(c.wid) && (c.word || '').toLowerCase() === core.get(c.wid).word.toLowerCase()) f = refreshFields(c, core.get(c.wid), 'core');
    if (f) out.push({ id: c.id, fields: f });
  }
  return out;
}

const sig = (s, w) => {
  let h = 0;
  const str = JSON.stringify([s.cards || [], w.map(x => [x.id, x.tr, x.syn, x.coll, x.ex, x.pos, x.tags])]);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
};

// Açılışta: veri imzası değiştiyse çalışır. updatedAt güncellenir → senkronla diğer cihaza gider.
export async function migrateContent() {
  const [s, w] = await Promise.all([seedUser(), words()]);
  if (!w.length && !(s.cards || []).length) return 0;
  const rev = sig(s, w);
  if (localStorage.getItem(RK) === rev) return 0;
  const todo = plan(store.all('cards'), s.cards || [], w);
  for (const { id, fields } of todo) store.put('cards', { ...store.get('cards', id), ...fields, contentRev: rev });
  localStorage.setItem(RK, rev);
  return todo.length;
}
