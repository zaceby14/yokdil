// Okuma: hazır parçalar + kendi metinlerim; dokunulabilir kelimeler, öbek seçimi, süre, sorular
import * as store from '../store.js';
import { passages } from '../data.js';
import { h, uid, toast, topicName } from '../util.js';
import { tappable } from '../tappable.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { bumpDay, tick } from '../plan.js';
import { cardFromWord } from '../srs.js';
import { setCtx } from '../ctx.js';
import { saveNote, quickNotes } from '../notes.js';
import { emptyData } from './hub.js';

// Saf: okuma görevi sayılır mı? Makul hız (< 400 kelime/dk) ve (en az 1 doğru ya da sorusuz tamamlanmış okuma)
export const MAX_WPM = 400;
export function readCounts({ words, secs, right = 0, total = 0 }) {
  if (!secs || !words) return false;
  const wpm = words / (secs / 60);
  return wpm < MAX_WPM && (total ? right >= 1 : true);
}

// Okuma hızı + doğruluk → önerilen seviye (saf)
export function suggestLevel(recs, maxL = 3) {
  const r = recs.filter(x => x.total).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 3);
  if (!r.length) return { level: 1, wpm: 0, acc: null };
  const wpm = Math.round(r.reduce((s, x) => s + (x.wpm || 0), 0) / r.length);
  const acc = r.reduce((s, x) => s + x.right, 0) / r.reduce((s, x) => s + x.total, 0);
  let level = r[0].level || 1;
  if (acc >= 0.8 && wpm >= 110) level++;
  else if (acc < 0.5) level--;
  return { level: Math.min(maxL, Math.max(1, level)), wpm, acc };
}
export const readRecs = () => store.all('progress').filter(x => x.kind === 'read');

export const SOURCES = ['More to Read', 'Ikigai', 'Diğer'];

export default async function render(root, [mode, id]) {
  if (mode === 'yeni' || mode === 'duzenle') return editor(root, mode === 'duzenle' ? store.get('texts', id) : null);
  if (mode === 'p') {
    const p = (await passages()).find(x => x.id === id);
    if (p) return reader(root, { id: p.id, title: p.title, text: p.text, gloss: p.gloss, questions: p.questions, source: 'Okuma: ' + p.title, passage: p });
  }
  if (mode === 't') {
    const t = store.get('texts', id);
    if (t) return reader(root, { id: t.id, title: t.title, text: t.text, source: t.source, page: t.page, mine: t });
  }
  return list(root);
}

async function list(root) {
  const ps = await passages();
  const done = new Set(store.all('grammarLog').filter(l => l.kind === 'okuma').map(l => l.q.split('#')[0]));
  const mine = store.all('texts').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const sg = suggestLevel(readRecs(), Math.max(1, ...ps.map(p => p.level || 1)));
  const todo = ps.filter(p => !done.has(p.id));
  const next = todo.find(p => (p.level || 1) === sg.level) || todo.sort((a, b) => Math.abs((a.level || 1) - sg.level) - Math.abs((b.level || 1) - sg.level))[0];
  root.append(
    h('div.row.between', h('h2', 'Okuma'), h('a.btn.primary', { href: '#/okuma/yeni' }, '+ Metin yapıştır')),
    next ? h('a.card.link.suggest', { href: '#/okuma/p/' + next.id },
      h('div.small.muted', 'Sıradaki önerilen · seviye ' + (next.level || '-')), h('b', next.title),
      sg.acc != null ? h('div.small.muted', `Son okumalar: ${sg.wpm} kelime/dk · doğruluk %${Math.round(sg.acc * 100)}`) : null) : null,
    h('a.card.link.guess-link', { href: '#/kartlar/tahmin' }, h('b', 'Bağlamdan tahmin'), h('span.small.muted', ' bilmediğin kelimeyi cümleden çıkar')),
    mine.length ? h('h3', 'Metinlerim') : null,
    h('ul.list', mine.map(t => h('li', h('a', { href: '#/okuma/t/' + t.id },
      h('b', t.title || 'Başlıksız'), h('span.small.muted', `${t.source || ''}${t.page ? ' · s. ' + t.page : ''}`))))),
    h('h3', 'Hazır parçalar'),
    ps.length ? h('ul.list', ps.map(p => h('li' + (done.has(p.id) ? '.done' : ''), h('a', { href: '#/okuma/p/' + p.id },
      h('b', (done.has(p.id) ? '✓ ' : '') + p.title),
      h('span.small.muted', `${topicName(p.topic) || ''} · seviye ${p.level || '-'} · ${p.words || '?'} kelime`))))) : emptyData('Okuma parçaları')
  );
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
  function flush() {
    if (!pending) return;
    const r = bumpDay('readSec', pending); pending = 0;
    if ((r.readSec || 0) >= 15 * 60 && !r.tasks?.okuma) tick('okuma');
  }
  setCtx({ type: 'okuma', key: 'okuma:' + doc.id, id: doc.id, label: 'Okuma · ' + doc.title });
  // Aktif okuma: her paragraf sonunda katlanabilir "ana fikir" kutusu → notlara düşer
  const active = store.settings().activeRead !== false;
  const mainIdea = i => {
    const key = `okuma:${doc.id}#p${i}`;
    const prev = quickNotes().find(n => n.ctx?.key === key);
    const ta = h('textarea', { rows: 2, placeholder: 'Bu paragrafın ana fikri ne? (1 cümle, Türkçe olabilir)' });
    ta.value = prev?.text || '';
    let id = prev?.id;
    const st = h('span.small.muted', prev ? 'kaydedildi' : '');
    const save = () => {
      if (!ta.value.trim()) return;
      id = saveNote(ta.value, { type: 'okuma', key, id: doc.id, para: i, label: `${doc.title} · paragraf ${i + 1}`, route: location.hash }, id).id;
      st.textContent = 'kaydedildi';
    };
    ta.addEventListener('change', save);
    return h('details.idea' + (prev ? '.has' : ''), h('summary', prev ? '✓ Ana fikir' : 'Ana fikir?'),
      ta, h('div.row', h('button.btn.small', { onclick: save }, 'Kaydet'), st));
  };
  const tp = tappable(doc.text, { source: doc.mine ? doc.source : 'Okuma', page: doc.page || '', note: doc.title, hl: store.settings().readHl !== false,
    afterPara: active ? i => mainIdea(i) : null });
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
    store.put('progress', { ...(store.get('progress', rid) || {}), id: rid, kind: 'read', words: nWords, secs, wpm, level: doc.passage?.level || 0, at: Date.now(), right: 0, total: 0 });
    speed.textContent = `Okuma hızın: ${wpm} kelime/dk (${Math.round(secs / 60) || '<1'} dk)`;
  }
  const summary = h('div');
  async function showNew() {
    if (summary.childNodes.length) return;
    const list = await tp.newCore();
    summary.append(newWordsBox(list, doc, () => tp.markSaved()));
    summary.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  const body = tp.el;
  let phraseMode = false;
  const phraseBtn = h('button.btn.small', { onclick: () => { phraseMode = !phraseMode; tp.setPhrase(phraseMode); phraseBtn.classList.toggle('primary', phraseMode); if (phraseMode) toast('Başlangıç ve bitiş kelimesine dokun'); } }, 'Öbek');

  const gloss = doc.gloss?.length ? h('details.gloss', h('summary', `Sözlükçe (${doc.gloss.length})`),
    h('div.chips', doc.gloss.map(g => h('span.chip', h('b', g.w), ' ', g.tr)))) : null;

  const qbox = h('div');
  const qsec = doc.questions?.length ? h('section.card',
    h('h3', 'Sorular'),
    h('button.btn.wide', {
      onclick: e => {
        e.target.remove();
        stopReading();
        runQuiz(qbox, doc.questions.map((q, k) => ({ ...q, key: `${doc.id}#${k}`, info: { kind: 'okuma', dtype: 'paragraf', topic: doc.passage?.topic || '' } })), {
          sid: 'okuma:' + doc.id, name: 'Okuma · ' + doc.title, source: 'Okuma', inline: !!doc.mine,
          resolve: async key => { const k = +key.split('#').pop(); const q = doc.questions[k]; return q ? { ...q, key, info: { kind: 'okuma', dtype: 'paragraf' } } : null; },
          onAnswer: (it, ok) => answer(it.key, ok, { kind: 'okuma', topic: doc.passage?.topic || '', dtype: 'okuma' }),
          task: 'okuma',
          onEnd: ({ right, total }, el) => {
            flush();
            if (readCounts({ words: nWords, secs, right, total })) tick('okuma');
            else el.querySelector('.endcard')?.append(h('p.small.warn-t.shortread', 'Kısa okuma: görev sayılmadı (metni okuyup en az 1 doğru gerekir).'));
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
      doc.passage ? h('div.small.muted', `${topicName(doc.passage.topic || '')} · seviye ${doc.passage.level || '-'}`) : null,
    h('p.small.muted', 'Dokun: kelime · Uzun bas/Öbek: başlangıç → bitiş'),
    gloss, body,
    doc.questions?.length ? null : h('button.btn.wide.finish', { onclick: e => { e.target.remove(); stopReading(); flush(); if (readCounts({ words: nWords, secs })) tick('okuma'); else speed.textContent = 'Kısa okuma: görev sayılmadı.'; showNew(); } }, 'Okumayı bitirdim'),
    speed, qsec, summary
  );
  const onVis = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(iv); flush(); document.removeEventListener('visibilitychange', onVis); };
}

// Parça sonu: kartı olmayan çekirdek kelimeler → hepsini ekle / seç
function newWordsBox(list, doc, after) {
  const box = h('section.card.newwords');
  if (!list.length) { box.append(h('p.small.muted', 'Bu parçada yeni çekirdek kelime yok.')); return box; }
  const on = new Set();
  const add = items => {
    for (const x of items) store.put('cards', { ...cardFromWord(x.entry), ctx: x.ctx || '', source: 'Okuma', note: doc.title || '', front: Date.now(), mine: Date.now() });
    box.innerHTML = '';
    box.append(h('p', h('b', `+${items.length} kelime karta eklendi`)));
    toast(`+${items.length} kelime karta eklendi`);
    document.querySelectorAll('.reader').forEach(r => r._mark?.());
    after?.();
  };
  const chips = list.map(x => h('button.chip.pick', {
    onclick: e => { const b = e.currentTarget; on.has(x) ? on.delete(x) : on.add(x); b.classList.toggle('on', on.has(x)); selBtn.textContent = `Seçilenleri ekle (${on.size})`; }
  }, h('b', { lang: 'en' }, x.entry.word), ' ', h('span.small', x.entry.tr || '')));
  const selBtn = h('button.btn.grow', { onclick: () => on.size ? add([...on]) : toast('Önce kelimeye dokun') }, 'Seçilenleri ekle (0)');
  box.append(h('h3', `Bu parçada ${list.length} yeni kelime vardı`), h('div.chips', chips),
    h('div.row', h('button.btn.primary.grow', { onclick: () => add(list) }, 'Hepsini ekle'), selBtn));
  return box;
}
