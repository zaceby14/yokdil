// Okuma: hazır parçalar + kendi metinlerim; dokunulabilir kelimeler, öbek seçimi, süre, sorular
import * as store from '../store.js';
import { passages } from '../data.js';
import { h, uid, toast, topicName } from '../util.js';
import { tappable } from '../tappable.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { bumpDay, tick } from '../plan.js';

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
  root.append(
    h('div.row.between', h('h2', 'Okuma'), h('a.btn.primary', { href: '#/okuma/yeni' }, '+ Metin yapıştır')),
    mine.length ? h('h3', 'Metinlerim') : null,
    h('ul.list', mine.map(t => h('li', h('a', { href: '#/okuma/t/' + t.id },
      h('b', t.title || 'Başlıksız'), h('span.small.muted', `${t.source || ''}${t.page ? ' · s. ' + t.page : ''}`))))),
    h('h3', 'Hazır parçalar'),
    ps.length ? h('ul.list', ps.map(p => h('li' + (done.has(p.id) ? '.done' : ''), h('a', { href: '#/okuma/p/' + p.id },
      h('b', (done.has(p.id) ? '✓ ' : '') + p.title),
      h('span.small.muted', `${p.topic || ''} · seviye ${p.level || '-'} · ${p.words || '?'} kelime`))))) : h('p.muted', 'Parça yok')
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
  const tp = tappable(doc.text, { source: doc.mine ? doc.source : 'Okuma', page: doc.page || '', note: doc.title });
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
        runQuiz(qbox, doc.questions.map((q, k) => ({ ...q, key: `${doc.id}#${k}` })), {
          onAnswer: (it, ok) => answer(it.key, ok, { kind: 'okuma', topic: doc.passage?.topic || '', dtype: 'okuma' }),
          onEnd: () => { flush(); tick('okuma'); }
        });
      }
    }, 'Soruları çöz'), qbox) : null;

  root.append(
    h('div.readbar', h('a.btn.small', { href: '#/okuma' }, '‹'), h('b.grow.ellipsis', doc.title), timerEl, phraseBtn),
    doc.mine ? h('div.small.muted', `${doc.source || ''}${doc.page ? ' · s. ' + doc.page : ''} · `,
      h('a', { href: '#/okuma/duzenle/' + doc.id }, 'Düzenle'), ' · ',
      h('a', { href: '#/okuma', onclick: e => { if (!confirm('Metin silinsin mi?')) return e.preventDefault(); store.del('texts', doc.id); } }, 'Sil')) :
      doc.passage ? h('div.small.muted', `${topicName(doc.passage.topic || '')} · seviye ${doc.passage.level || '-'}`) : null,
    h('p.small.muted', 'Dokun: kelime · Uzun bas/Öbek: başlangıç → bitiş'),
    gloss, body, qsec
  );
  const onVis = () => document.visibilityState === 'hidden' && flush();
  document.addEventListener('visibilitychange', onVis);
  return () => { clearInterval(iv); flush(); document.removeEventListener('visibilitychange', onVis); };
}
