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

export const MIGRATIONS = [
  { id: 'v6-taktik-read', run: st => {
    const old = st.get('progress', 'ders:soru-tipi-taktikleri');
    const ex = Object.fromEntries(TAKTIK.map(id => [id, st.get('progress', 'ders:' + id)]));
    for (const r of taktikProgress(old, ex)) st.put('progress', { ...(st.get('progress', r.id) || {}), ...r });
  } },
  { id: 'v6-autocards', run: (st, ctx) => { for (const id of badAutoCards(st.all('cards'), ctx.idx)) st.del('cards', id); } }
];
