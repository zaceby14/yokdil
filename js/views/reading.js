// Okuma: hazır parçalar + kendi metinlerim; dokunulabilir kelimeler, öbek seçimi, süre, sorular
import * as store from '../store.js';
import { loadStars, starOf } from '../stars.js';
import { passages } from '../data.js';
import { h, uid, toast, topicName } from '../util.js';
import { tappable } from '../tappable.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { bumpDay, tick, updateDay, dayRec } from '../plan.js';
import { cardFromWord } from '../srs.js';
import { setCtx } from '../ctx.js';
import { saveNote, quickNotes } from '../notes.js';
import { emptyData } from './hub.js';
import { getPack, reading as getReading } from '../pack.js';
import { rItem } from '../qbank.js';
import { suggestLevel, readRecs, pickReading, readingDone, isOther } from '../readpick.js';
import { glossMap, chipMeaning } from '../vocab.js';
export { suggestLevel, readRecs };

// Saf: okuma görevi sayılır mı? Makul hız (< 400 kelime/dk) ve (en az 1 doğru ya da sorusuz tamamlanmış okuma)
export const MAX_WPM = 400;
export function readCounts({ words, secs, right = 0, total = 0 }) {
  if (!secs || !words) return false;
  const wpm = words / (secs / 60);
  // Soruları cevapladıysan: en az 1 doğru ya da ≥ 5 dk okuma (çaba sayılır)
  return wpm < MAX_WPM && (total ? right >= 1 || secs >= 300 : true);
}


export const SOURCES = ['More to Read', 'Ikigai', 'Diğer'];

export default async function render(root, [mode, id]) {
  if (mode === 'yeni' || mode === 'duzenle') return editor(root, mode === 'duzenle' ? store.get('texts', id) : null);
  if (mode === 'p') {
    const p = (await passages()).find(x => x.id === id);
    if (p) return reader(root, { id: p.id, title: p.title, text: p.text, gloss: p.gloss, questions: p.questions, source: 'Okuma: ' + p.title, passage: p });
  }
  if (mode === 'g') {
    const r = await getReading(id);
    if (r) return reader(root, { id: 'r:' + r.id, title: r.title || 'Okuma', text: r.text, gloss: r.glossary, tr: r.tr, level: +r.level || 0, topic: r.topic || '',
      source: r.source || 'Kaynağım', gizli: r, questions: r.questions?.length ? r.questions : null });
  }
  if (mode === 't') {
    const t = store.get('texts', id);
    if (t) return reader(root, { id: t.id, title: t.title, text: t.text, source: t.source, page: t.page, mine: t });
  }
  return list(root);
}

async function list(root) {
  const ps = await passages();
  const rs = (await getPack().catch(() => null))?.readings || [];
  const done = await readingDone();
  const mine = store.all('texts').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const recs = readRecs();
  const last = [...recs].sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  const { next, sg } = pickReading({ ps, rs, done, recs, lastGizli: !!last?.gizli });
  root.append(
    h('div.row.between', h('h2', 'Okuma'), h('a.btn.primary', { href: '#/okuma/yeni' }, '+ Metin yapıştır')),
    h('p.small.muted.screen-why', 'Fen metni oku; bilmediğin kelimeye dokun, karta ekle.'),
    next ? h('a.card.link.suggest', { href: next.href },
      h('div.small.muted', 'Sana önerilen · seviye ' + (next.level || '-') + (next.gizli ? ' · kaynağım' : '')), h('b', next.title),
      sg.acc != null ? h('div.small.muted', `Son okumalar: ${sg.wpm} kelime/dk · doğruluk %${Math.round(sg.acc * 100)}`) : null) : null,
    h('a.card.link.guess-link', { href: '#/kartlar/tahmin' }, h('b', 'Bağlamdan tahmin'), h('span.small.muted', ' bilmediğin kelimeyi cümleden çıkar')),
    mine.length ? h('h3', 'Metinlerim') : null,
    h('ul.list', mine.map(t => h('li', h('a', { href: '#/okuma/t/' + t.id },
      h('b', t.title || 'Başlıksız'), h('span.small.muted', `${t.source || ''}${t.page ? ' · s. ' + t.page : ''}`))))),
    rs.length ? privList(rs, done) : null,
    h('h3', 'Hazır parçalar'),
    ps.length ? h('ul.list', ps.filter(p => p.id !== next?.id).map(p => h('li' + (done.has(p.id) ? '.done' : ''), h('a', { href: '#/okuma/p/' + p.id },
      h('b', (done.has(p.id) ? '✓ ' : '') + p.title),
      h('span.small.muted', `${topicName(p.topic) || ''} · seviye ${p.level || '-'} · ${p.words || '?'} kelime`))))) : emptyData('Okuma parçaları')
  );
}

// Gizli kaynak okumaları: kaynağa göre gruplu; fen dışı ("diğer") en altta, katlanmış
function privList(rs, done) {
  const item = r => {
    const d = done.has('r:' + r.id), nq = r.questions?.length || 0;
    return h('li' + (d ? '.done' : ''), h('a', { href: '#/okuma/g/' + encodeURIComponent(r.id) },
      h('b', (d ? '✓ ' : '') + (r.title || r.id)),
      h('span.small.muted', [isOther(r) ? '' : topicName(r.topic) || '', r.level ? 'seviye ' + r.level : '', r.tr ? 'çevirili' : '', nq ? nq + ' soru' : ''].filter(Boolean).join(' · '))));
  };
  const groups = new Map();
  for (const r of rs.filter(x => !isOther(x))) { const k = r.source || 'Diğer kaynak'; (groups.get(k) || groups.set(k, []).get(k)).push(r); }
  const other = rs.filter(isOther);
  return h('section.priv-read',
    h('h3', 'Kaynaklarım'),
    h('p.small.muted', 'Gizli paketten; yalnız bu cihazda.'),
    [...groups].map(([src, list]) => h('details.privgroup', { open: groups.size <= 3 }, h('summary', h('b', src), h('span.small.muted', ` · ${list.length}`)), h('ul.list', list.map(item)))),
    other.length ? h('details.privgroup.other', h('summary', h('b', 'Diğer (genel)'), h('span.small.muted', ` · ${other.length} · fen dışı`)), h('ul.list', other.map(item))) : null);
}

function editor(root, t) {
  const title = h('input', { placeholder: 'Başlık', value: t?.title || '' });
  const src = h('select', SOURCES.map(s => h('option', { value: s, selected: (t?.source || 'More to Read') === s }, s)));
  const page = h('input', { placeholder: 'Sayfa', inputmode: 'numeric', value: t?.page || '' });
  const text = h('textarea', { rows: 12, placeholder: 'Metni buraya yapıştır' });
  text.value = t?.text || '';
  root.append(
    h('h2', t ? 'Metni düzenle' : 'Kendi metnim'),
    h('label', 'Başlık', title),
    h('div.row', h('label.grow', 'Kaynak', src), h('label', { style: 'width:7rem' }, 'Sayfa', page)),
    h('label', 'Metin', text),
    h('button.btn.primary.wide', {
      onclick: () => {
        if (!text.value.trim()) return toast('Metin boş');
        const id = t?.id || uid('t');
        store.put('texts', { ...(t || {}), id, title: title.value.trim() || 'Başlıksız', source: src.value, page: page.value.trim(), text: text.value.trim(), createdAt: t?.createdAt || Date.now() });
        location.hash = '#/okuma/t/' + id;
      }
    }, 'Kaydet ve oku')
  );
}

function reader(root, doc) {
  // Süre
  let secs = 0, pending = 0;
  const timerEl = h('span.timer', '00:00');
  const iv = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    secs++; pending++;
    timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    if (pending >= 30) flush();
  }, 1000);
  // Okuma görevi tamam: okunan parçanın adı görevde kalsın (öneri başka parçaya kaymasın)
  const tickRead = () => { if (!dayRec().readTitle) updateDay({ readTitle: doc.title || '' }); tick('okuma'); };
  function flush() {
    if (!pending) return;
    const r = bumpDay('readSec', pending); pending = 0;
    if ((r.readSec || 0) >= 15 * 60 && !r.tasks?.okuma) tickRead();
  }
  setCtx({ type: 'okuma', key: 'okuma:' + doc.id, id: doc.id, label: 'Okuma · ' + doc.title });
  // Aktif okuma: her paragraf sonunda katlanabilir "ana fikir" kutusu → notlara düşer
  const active = store.settings().activeRead !== false;
  const mainIdea = i => {
    const key = `okuma:${doc.id}#p${i}`;
    const prev = quickNotes().find(n => n.ctx?.key === key);
    const ta = h('textarea', { rows: 2, placeholder: 'Bu paragraf ne anlatıyor? (1 cümle, Türkçe olur)' });
    ta.value = prev?.text || '';
    let id = prev?.id;
    const st = h('span.small.muted', prev ? 'kaydedildi' : '');
    const save = () => {
      if (!ta.value.trim()) return;
      id = saveNote(ta.value, { type: 'okuma', key, id: doc.id, para: i, label: `${doc.title} · paragraf ${i + 1}`, route: location.hash }, id).id;
      st.textContent = 'kaydedildi';
    };
    ta.addEventListener('change', save);
    return h('details.idea' + (prev ? '.has' : ''), h('summary', prev ? '✓ Ana fikir' : '+ Ana fikir yaz'),
      ta, h('div.row', h('button.btn.small', { onclick: save }, 'Ana fikri kaydet'), st));
  };
  // Çeviri (gizli okumada "tr" varsa): paragraf paragraf, varsayılan gizli; önce kendi çevirini yaz (isteğe bağlı → notlar)
  const trParas = doc.tr ? String(doc.tr).replace(/\r/g, '').split(/\n\s*\n/) : [];
  const trBox = i => {
    if (!trParas[i]) return null;
    const key = `okuma:${doc.id}#tr${i}`;
    const prev = quickNotes().find(n => n.ctx?.key === key);
    const ta = h('textarea.mytr', { rows: 2, placeholder: 'Önce kendin çevir (isteğe bağlı)' });
    ta.value = prev?.text || '';
    let id = prev?.id;
    const st = h('span.small.muted', prev ? 'kaydedildi' : '');
    const save = () => { if (!ta.value.trim()) return; id = saveNote(ta.value, { type: 'okuma', key, id: doc.id, para: i, label: `${doc.title} · çevirim ${i + 1}`, route: location.hash }, id).id; st.textContent = 'kaydedildi'; };
    ta.addEventListener('change', save);
    const out = h('div.trpara.hidden', { lang: 'tr' }, trParas[i]);
    const btn = h('button.btn.small.tr-show', { type: 'button', onclick: () => { save(); out.classList.toggle('hidden'); btn.textContent = out.classList.contains('hidden') ? 'Çeviriyi göster' : 'Çeviriyi gizle'; } }, 'Çeviriyi göster');
    return h('details.idea.trbox', h('summary', '+ Çeviri'), ta, h('div.row', h('button.btn.small', { type: 'button', onclick: save }, 'Çevirimi kaydet'), btn, st), out);
  };
  const after = i => { const a = active ? mainIdea(i) : null, b = trBox(i); return a && b ? h('div', a, b) : a || b; };
  const tp = tappable(doc.text, { gloss: doc.gloss, source: doc.mine || doc.gizli ? doc.source : 'Okuma', page: doc.page || '', note: doc.title, hl: store.settings().readHl !== false,
    afterPara: active || trParas.length ? after : null });
  const nWords = doc.passage?.words || (String(doc.text).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length;
  const rid = 'read:' + doc.id;
  let readDone = false;
  const speed = h('div.small.muted.speed');
  // Okumayı bitir: hız kaydı (bir kez)
  function stopReading() {
    if (readDone) return; readDone = true;
    if (secs < 10) return;
    const wpm = Math.round(nWords / (secs / 60));
    if (wpm > 600) { speed.textContent = 'Çok hızlı geçtin; hız kaydedilmedi.'; return; } // göz gezdirme
    store.put('progress', { ...(store.get('progress', rid) || {}), id: rid, kind: 'read', words: nWords, secs, wpm, level: doc.passage?.level || doc.level || 0, at: Date.now(), right: 0, total: 0, ...(doc.gizli ? { gizli: true } : {}) });
    speed.textContent = `Okuma hızın: ${wpm} kelime/dk (${Math.round(secs / 60) || '<1'} dk)`;
  }
  const summary = h('div');
  async function showNew() {
    if (summary.childNodes.length) return;
    // Yalnız sınavda çıkan (≥2★) kelimeler, en fazla 8: deste kolay kelimelerle dolmasın
    const m = await loadStars().catch(() => null);
    const list = (await tp.newCore()).filter(x => !m?.size || (starOf(x.entry.word, m) || 0) >= 2).sort((a, b) => (m ? (starOf(b.entry.word, m) || 0) - (starOf(a.entry.word, m) || 0) : 0)).slice(0, 8);
    summary.append(newWordsBox(list, doc, () => tp.markSaved()));
    summary.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  const body = tp.el;
  let phraseMode = false;
  const phraseBtn = h('button.btn.small', { onclick: () => { phraseMode = !phraseMode; tp.setPhrase(phraseMode); phraseBtn.classList.toggle('primary', phraseMode); if (phraseMode) toast('İlk ve son kelimeye dokun'); } }, 'Öbek');

  const gloss = doc.gloss?.length ? h('details.gloss', h('summary', `Sözlükçe (${doc.gloss.length})`),
    h('div.chips', doc.gloss.map(g => h('span.chip', h('b', g.w), ' ', g.tr)))) : null;

  const qbox = h('div');
  const qsec = doc.questions?.length ? h('section.card',
    h('h3', 'Sorular'),
    h('button.btn.wide', {
      onclick: e => {
        e.target.remove();
        stopReading();
        // Gizli okuma: soru metni oturum kaydına (senkron) girmez; anahtar r:<id>:<n>, metin paketten çözülür
        const G = doc.gizli;
        const its = G ? G.questions.map((q, k) => ({ ...rItem(G, k), stemNode: null }))
          : doc.questions.map((q, k) => ({ ...q, key: `${doc.id}#${k}`, info: { kind: 'okuma', dtype: 'paragraf', topic: doc.passage?.topic || '' } }));
        runQuiz(qbox, its, {
          sid: 'okuma:' + doc.id, name: 'Okuma · ' + doc.title, source: G ? doc.source : 'Okuma', inline: !!doc.mine,
          resolve: async key => {
            if (G) { const k = +key.split(':').pop() - 1; return G.questions[k] ? { ...rItem(G, k), stemNode: null } : null; }
            const k = +key.split('#').pop(); const q = doc.questions[k]; return q ? { ...q, key, info: { kind: 'okuma', dtype: 'paragraf' } } : null;
          },
          onAnswer: (it, ok) => answer(it.key, ok, G ? it.info : { kind: 'okuma', topic: doc.passage?.topic || '', dtype: 'okuma' }),
          task: 'okuma',
          extraTop: it => evidBtn(it, body),
          onEnd: ({ right, total }, el) => {
            flush();
            if (readCounts({ words: nWords, secs, right, total })) tickRead();
            else el.querySelector('.endcard')?.append(h('p.small.warn-t.shortread', 'Kısa okuma: görev sayılmadı (en az 5 dk okuma ya da 1 doğru gerekir). Yanlışlar yarın hata tekrarında.'));
            const r = store.get('progress', rid);
            if (r) store.put('progress', { ...r, right, total });
            showNew();
          }
        });
      }
    }, 'Soruları çöz'), qbox) : null;

  // Yarım kalan soru oturumu varsa sorular kendiliğinden açılır
  if (doc.questions?.length && store.get('sessions', 'okuma:' + doc.id)) setTimeout(() => qsec?.querySelector('button')?.click());
  root.append(
    h('div.readbar', h('a.btn.small', { href: '#/okuma' }, '‹'), h('b.grow.ellipsis', doc.title), timerEl, phraseBtn),
    doc.mine ? h('div.small.muted', `${doc.source || ''}${doc.page ? ' · s. ' + doc.page : ''} · `,
      h('a', { href: '#/okuma/duzenle/' + doc.id }, 'Düzenle'), ' · ',
      h('a', { href: '#/okuma', onclick: e => { if (!confirm('Metin silinsin mi?')) return e.preventDefault(); store.del('texts', doc.id); } }, 'Sil')) :
      doc.passage ? h('div.small.muted', `${topicName(doc.passage.topic || '')} · seviye ${doc.passage.level || '-'}`) :
      doc.gizli ? h('div.small.muted.priv-meta', [doc.source, isOther(doc) ? 'genel' : topicName(doc.topic), doc.level ? 'seviye ' + doc.level : ''].filter(Boolean).join(' · ')) : null,
    h('p.small.muted.read-help', 'Kelimeye dokun → anlamı. Birkaç kelime için ', h('b', 'Öbek'), '.'),
    store.settings().readHl !== false ? h('p.small.muted.read-legend', h('span.lg-new', 'altı noktalı'), ' = yeni kelime · ', h('mark', 'sarı'), ' = kartında var') : null,
    gloss, body,
    doc.questions?.length ? null : h('button.btn.wide.finish', { onclick: e => { e.target.remove(); stopReading(); flush(); if (readCounts({ words: nWords, secs })) tickRead(); else speed.textContent = 'Kısa okuma: görev sayılmadı.'; showNew(); } }, 'Okumayı bitirdim'),
    speed, qsec, summary
  );
  const onVis = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(iv); flush(); document.removeEventListener('visibilitychange', onVis); };
}

// Parça sonu: kartı olmayan çekirdek kelimeler → hepsini ekle / seç
export function newWordsBox(list, doc, after) {
  const box = h('section.card.newwords');
  if (!list.length) { box.append(h('p.small.muted', 'Bu parçada kartında olmayan sık kelime yok.')); return box; }
  const on = new Set();
  const gm = glossMap(doc.gloss);
  const add = items => {
    for (const x of items) store.put('cards', { ...cardFromWord(x.entry), ...(gm.has(String(x.entry.word).toLowerCase()) ? { tr: gm.get(String(x.entry.word).toLowerCase()) } : {}), ctx: x.ctx || '', source: 'Okuma', note: doc.title || '', front: Date.now(), mine: Date.now() });
    box.innerHTML = '';
    box.append(h('p', h('b', `+${items.length} kelime karta eklendi`)));
    toast(`+${items.length} kelime karta eklendi`);
    document.querySelectorAll('.reader').forEach(r => r._mark?.());
    after?.();
  };
  const chips = list.map(x => { const tr = chipMeaning(x.entry, gm); return h('button.chip.pick.nw-chip', { 'data-w': x.entry.word,
    onclick: e => { const b = e.currentTarget; on.has(x) ? on.delete(x) : on.add(x); b.classList.toggle('on', on.has(x)); selBtn.textContent = `Seçilenleri ekle (${on.size})`; }
  }, h('b', { lang: 'en' }, x.entry.word), tr ? h('span.small.nw-tr', tr) : null); });
  const selBtn = h('button.btn.grow', { onclick: () => on.size ? add([...on]) : toast('Önce kelimeye dokun') }, 'Seçilenleri ekle (0)');
  box.append(h('h3', `Kartında olmayan ${list.length} kelime`), h('p.small.muted.nw-hint', 'Anlamı yazmayanlar çok anlamlı: metinde kelimeye dokun, bağlamdaki anlamı gör.'), h('div.chips', chips),
    h('div.row', selBtn));
  return box;
}

// Saf: doğru şıkka en çok benzeyen metin cümlesi (kanıt)
const STOP = new Set('the a an of to in and or for on with by that this these those is are was were be been it its as at from which who than then their there they can may also not more most such into'.split(' '));
export function evidence(text, option) {
  const toks = x => (String(x).toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOP.has(w)).map(w => w.slice(0, 5));
  const want = new Set(toks(option));
  const sents = String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || [];
  let best = null, bs = 0;
  for (const s of sents) { const n = toks(s).filter(w => want.has(w)).length; if (n > bs) { bs = n; best = s.trim(); } }
  return bs >= 2 ? best : null;
}
// "Metinde göster": kanıt cümlesi + paragrafa kaydır, sarıyla vurgula
function evidBtn(it, body) {
  const opt = String((it.options || [])[it.answer] || '');
  const text = body?.textContent || '';
  const sent = evidence(text, opt + ' ' + String(it.q || '').replace(/-{3,}/g, ''));
  if (!sent) return null;
  const b = h('button.btn.small.evid-btn', { type: 'button' }, 'Metinde göster');
  b.onclick = () => {
    const key = sent.slice(0, 40);
    const paras = [...body.querySelectorAll('p, .para, div')].filter(p => p.textContent.replace(/\s+/g, ' ').includes(key));
    const p = paras.at(-1);
    document.querySelectorAll('.evid').forEach(x => x.classList.remove('evid'));
    if (p) { p.classList.add('evid'); p.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    b.replaceWith(h('div.small.evid-q', h('b', 'Metindeki dayanak: '), h('span', { lang: 'en' }, sent)));
  };
  return b;
}
