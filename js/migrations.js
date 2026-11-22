// Veri göçleri (saf fonksiyonlar + kayıt). store.migrate() bunları bir kez çalıştırır.
import { isFunctionWord, sameLemma } from './vocab.js';
import { lemmas } from './util.js';

// Saf: otomatik (Hata) eklenmiş, hiç tekrar edilmemiş, anlamsız / işlev kelimesi / çekimli kopya kartlar → silinecek id'ler
export function badAutoCards(cards, idx) {
  const live = cards.filter(c => c && !c.deleted && c.word);
  const untouched = c => c.source === 'Hata' && !c.reps && !c.lastReview && (c.state || 'new') === 'new' && !c.userEdited;
  const out = [];
  for (const c of live) {
    if (!untouched(c)) continue;
    const w = c.word.toLowerCase().trim();
    const noMeaning = !(c.tr || '').trim();
    const func = isFunctionWord(w, idx);
    // çekimli biçim: kökü başka bir kartta var (eating ↔ eat) ya da kökü sözlükte
    const inflected = !w.includes(' ') && (live.some(o => o !== c && o.word.toLowerCase().trim() !== w && sameLemma(o.word, w) && lemmas(w).includes(o.word.toLowerCase().trim())));
    if (noMeaning || func || inflected) out.push(c.id);
  }
  return out;
}

export const TAKTIK = ['taktik-bosluk', 'taktik-cloze', 'taktik-cumle-tamamlama', 'taktik-ceviri', 'taktik-paragraf-tamamlama', 'taktik-ilgisiz', 'taktik-paragraf'];
// Saf: eski "soru-tipi-taktikleri" dersi okunduysa okundu bilgisi 7 taktik dersine taşınır
export function taktikProgress(old, existing = {}) {
  if (!old?.read) return [];
  return TAKTIK.filter(id => !existing[id]?.read).map(id => ({ id: 'ders:' + id, read: true, at: old.at || Date.now(), from: 'soru-tipi-taktikleri' }));
}

// Aynı kelimenin birden çok kartı (ör. iki cihazda ayrı eklenmiş): en çok çalışılanı tut, diğerlerini sil.
// Deterministik: her cihaz aynı kartı seçer (reps çok → çekirdek 'w:' id → id sırası).
export function dupCards(cards) {
  const by = new Map();
  for (const c of cards) {
    if (c.deleted || !c.word) continue;
    const k = c.word.toLowerCase().trim();
    (by.get(k) || by.set(k, []).get(k)).push(c);
  }
  const del = [];
  for (const list of by.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => (b.reps || 0) - (a.reps || 0) || (String(b.id).startsWith('w:') - String(a.id).startsWith('w:')) || String(a.id).localeCompare(String(b.id)));
    del.push(...list.slice(1).map(c => c.id));
  }
  return del;
}
export function dedupeCards(st) { for (const id of dupCards(st.all('cards'))) st.del('cards', id); }

export const MIGRATIONS = [
  { id: 'v6-taktik-read', run: st => {
    const old = st.get('progress', 'ders:soru-tipi-taktikleri');
    const ex = Object.fromEntries(TAKTIK.map(id => [id, st.get('progress', 'ders:' + id)]));
    for (const r of taktikProgress(old, ex)) st.put('progress', { ...(st.get('progress', r.id) || {}), ...r });
  } },
  { id: 'v6-autocards', run: (st, ctx) => { for (const id of badAutoCards(st.all('cards'), ctx.idx)) st.del('cards', id); } },
  // v18: eski varsayılan kelime hedefi (2000) → programdan türetilen hedef (boş = program)
  { id: 'v18-vocabgoal', run: st => { if (+st.settings().vocabGoal === 2000) st.setSetting('vocabGoal', null); } }
];
