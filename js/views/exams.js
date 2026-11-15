// Çıkmış sorular: paket cihazda (IndexedDB), senkrona yalnızca cevaplar/sonuçlar girer
import * as store from '../store.js';
import { h, add, uid, dayKey, toast, shuffle, typeName, TYPES } from '../util.js';
import { getPack, savePack, clearPack, exam as getExam, groupOf } from '../pack.js';
import { answer } from '../mistakes.js';
import { runQuiz } from '../quiz.js';
import { xItem } from '../qbank.js';
import { tappable } from '../tappable.js';
import { soruTabs, lessonLink } from './hub.js';

const OSYM = 'https://www.osym.gov.tr/TR,23801/yokdil-cikmis-sorular.html';
// Soru tipi → deneme bölümü
export const SECTION_OF = {
  'bosluk': 'bosluk', 'cloze': 'cloze', 'cumle-tamamlama': 'tamamlama', 'ceviri-en-tr': 'en-tr', 'ceviri-tr-en': 'tr-en',
  'paragraf-tamamlama': 'paragraf', 'ilgisiz': 'ilgisiz', 'paragraf': 'okuma', 'yakin-anlam': 'yakin', 'diyalog': 'diyalog'
};
const showDialog = () => !!store.settings().showDialog;
const visibleQs = e => (e.questions || []).filter(q => showDialog() || q.type !== 'diyalog').sort((a, b) => a.n - b.n);

export default async function render(root, [mode, id]) {
  if (mode === 'sinav') { const e = await getExam(id); if (e) return examMode(root, e); }
  if (mode === 'sonuc') { const e = await getExam(id); if (e) return result(root, e); }
  if (mode === 'tip') return typeMode(root, id);
  return home(root);
}

function uploader(onDone) {
  const f = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  f.onchange = async () => {
    try {
      const p = JSON.parse(await f.files[0].text());
      const r = await savePack(p);
      toast(`Yüklendi: ${r.exams.length} sınav`); onDone();
    } catch (e) { toast('Paket okunamadı: ' + (e.message || '')); }
    f.value = '';
  };
  return [f, h('button.btn.primary.wide', { onclick: () => f.click() }, 'Paketi yükle')];
}

async function home(root) {
  const pack = await getPack();
  const redraw = () => { root.innerHTML = ''; home(root); };
  root.append(soruTabs('cikmis'), h('h2', 'Çıkmış sorular'));
  if (!pack?.exams?.length) {
    root.append(
      h('div.card',
        h('p', 'Sorular telifli olduğu için sitede yok. Kendi paketini (JSON) yükle; yalnızca bu cihazda saklanır.'),
        h('p.small', h('a', { href: OSYM, target: '_blank', rel: 'noopener' }, 'ÖSYM çıkmış sorular (resmi sayfa)'))),
      ...uploader(redraw));
    return;
  }
  const types = {};
  for (const e of pack.exams) for (const q of visibleQs(e)) types[q.type] = (types[q.type] || 0) + 1;
  root.append(
    h('h3', 'Sınavlar'),
    h('ul.list', pack.exams.map(e => {
      const pr = store.get('progress', 'exam:' + e.id);
      const status = pr?.done ? `Son: ${pr.score?.toLocaleString('tr-TR')} puan` : pr?.startedAt ? 'Devam ediyor' : '';
      return h('li', h('div.exam-row',
        h('div.grow', h('b', e.title || e.id), h('div.small.muted', [e.kind, e.date, visibleQs(e).length + ' soru', status].filter(Boolean).join(' · '))),
        pr?.done ? h('a.btn.small', { href: '#/cikmis/sonuc/' + encodeURIComponent(e.id) }, 'Sonuç') : null,
        h('a.btn.small.primary', { href: '#/cikmis/sinav/' + encodeURIComponent(e.id) }, pr?.startedAt && !pr.done ? 'Devam' : (e.full ? 'Tam deneme' : 'Çöz'))));
    })),
    h('h3', 'Tipe göre çalış'),
    h('ul.list.compact', Object.keys(TYPES).filter(t => types[t]).map(t =>
      h('li', h('a', { href: '#/cikmis/tip/' + t }, h('b', typeName(t)), h('span.small.muted', `${types[t]} soru`))))),
    h('p.small.muted', 'Paket yalnızca bu cihazda; senkrona sadece cevapların gider.'),
    ...uploader(redraw),
    h('button.btn.danger.wide', { onclick: async () => { if (confirm('Paket bu cihazdan silinsin mi?')) { await clearPack(); redraw(); } } }, 'Paketi sil')
  );
}

// --- Tam deneme / sınav modu
function examMode(root, e) {
  const qs = visibleQs(e);
  const pid = 'exam:' + e.id;
  let pr = store.get('progress', pid);
  if (!pr || pr.done) pr = { id: pid, examId: e.id, answers: {}, flags: {}, cur: 0, startedAt: Date.now(), done: false, attempts: pr?.attempts || 0 };
  const save = () => { pr = store.put('progress', pr); };
  save();
  const total = (e.durationMin || 180) * 60;
  const timer = h('span.timer');
  const tick = () => {
    const left = Math.max(0, total - Math.floor((Date.now() - pr.startedAt) / 1000));
    timer.textContent = `${Math.floor(left / 3600)}:${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    timer.classList.toggle('bad-t', left < 600);
    if (!left) finish(true);
  };
  const iv = setInterval(tick, 1000);
  const grid = h('div.optik.hidden');
  const main = h('div');
  const bar = h('div.readbar',
    h('a.btn.small', { href: '#/cikmis' }, '‹'), h('b.grow.ellipsis', e.title || e.id), timer,
    h('button.btn.small', { onclick: () => { grid.classList.toggle('hidden'); drawGrid(); } }, 'Optik'),
    h('button.btn.small.primary', { onclick: () => finish(false) }, 'Bitir'));
  root.append(bar, grid, main);

  function drawGrid() {
    if (grid.classList.contains('hidden')) return;
    grid.innerHTML = '';
    qs.forEach((q, i) => grid.append(h('button' + (pr.answers[q.n] != null ? '.ans' : '') + (pr.flags[q.n] ? '.flag' : '') + (i === pr.cur ? '.cur' : ''),
      { onclick: () => { pr.cur = i; save(); draw(); } }, q.n)));
    const blank = qs.filter(q => pr.answers[q.n] == null).length, fl = qs.filter(q => pr.flags[q.n]).length;
    grid.append(h('div.small.muted.full', `Boş ${blank} · İşaretli ${fl}`));
  }

  function draw() {
    const q = qs[pr.cur];
    main.innerHTML = '';
    if (!q) return;
    const g = groupOf(e, q);
    const src = { source: e.title || 'Çıkmış', note: `Soru ${q.n}` };
    const long = q.type !== 'ceviri-tr-en' && String(q.q || '').length > 140;
    add(main,
      h('div.qhead', h('span.muted', `Soru ${q.n} · ${pr.cur + 1}/${qs.length}`),
        h('span', q.keySource === 'claude' ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null, h('span.chip', typeName(q.type)))),
      g?.text ? h('div.stem.tap', tappable(g.text, src).el) : null,
      long ? h('div.q.tap', tappable(q.q, src).el) : h('div.q', q.q),
      h('div.opts', q.options.map((o, k) => h('button.opt' + (pr.answers[q.n] === k ? '.chosen' : ''), {
        onclick: () => {
          if (pr.answers[q.n] === k) delete pr.answers[q.n]; else pr.answers[q.n] = k;
          save(); draw(); drawGrid();
        }
      }, h('span.ol', 'ABCDE'[k]), h('span', o)))),
      h('div.row',
        h('button.btn', { disabled: pr.cur === 0, onclick: () => { pr.cur--; save(); draw(); drawGrid(); } }, '‹ Önceki'),
        h('button.btn.grow' + (pr.flags[q.n] ? '.primary' : ''), { onclick: () => { pr.flags[q.n] = !pr.flags[q.n]; if (!pr.flags[q.n]) delete pr.flags[q.n]; save(); draw(); drawGrid(); } }, pr.flags[q.n] ? 'İşaretli' : 'İşaretle'),
        h('button.btn', { disabled: pr.cur >= qs.length - 1, onclick: () => { pr.cur++; save(); draw(); drawGrid(); } }, 'Sonraki ›'))
    );
    window.scrollTo(0, 0);
  }

  let finished = false;
  function finish(auto) {
    if (finished) return;
    if (!auto) {
      const blank = qs.filter(q => pr.answers[q.n] == null).length;
      if (!confirm(`Sınav bitirilsin mi?${blank ? ` (${blank} boş)` : ''}`)) return;
    }
    finished = true; clearInterval(iv);
    const sections = {};
    let right = 0;
    for (const q of qs) {
      const k = SECTION_OF[q.type] || 'diger';
      const s = sections[k] ||= { d: 0, y: 0, b: 0, n: 0 };
      s.n++;
      const a = pr.answers[q.n];
      if (a == null) { s.b++; continue; }
      const ok = a === q.answer;
      if (ok) { s.d++; right++; } else s.y++;
      answer(`${e.id}:${q.n}`, ok, { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' });
    }
    const score = +(right * 1.25).toFixed(2);
    store.put('mocks', { id: uid('m'), date: dayKey(), name: e.title || e.id, sections, src: 'cikmis', examId: e.id, score });
    pr = { ...pr, done: true, finishedAt: Date.now(), score, sections, attempts: (pr.attempts || 0) + 1 };
    save();
    location.hash = '#/cikmis/sonuc/' + encodeURIComponent(e.id);
  }

  tick(); draw();
  return () => clearInterval(iv);
}

function result(root, e) {
  const pr = store.get('progress', 'exam:' + e.id);
  const qs = visibleQs(e);
  if (!pr?.done) { location.hash = '#/cikmis'; return; }
  const LBL = { bosluk: 'Cümlede boşluk', cloze: 'Cloze test', tamamlama: 'Cümle tamamlama', 'en-tr': 'Çeviri İng→Tr', 'tr-en': 'Çeviri Tr→İng',
    paragraf: 'Paragraf tamamlama', ilgisiz: 'İlgisiz cümle', okuma: 'Okuma', yakin: 'Yakın anlam', diyalog: 'Diyalog', diger: 'Diğer' };
  const wrong = qs.filter(q => pr.answers[q.n] !== q.answer);
  root.append(
    h('a.btn.small', { href: '#/cikmis' }, '‹ Çıkmış'),
    h('h2', e.title || e.id),
    h('div.hero', h('div', h('div.big', (pr.score || 0).toLocaleString('tr-TR')), h('div.small', 'tahmini puan')), h('div.hero-r', 'Doğru × 1,25')),
    h('table.mock', h('tr', h('th', 'Bölüm'), h('th', 'D'), h('th', 'Y'), h('th', 'B')),
      Object.entries(pr.sections || {}).map(([k, s]) => h('tr', h('td', LBL[k] || k, h('span.small.muted', ` ${s.n}`)), h('td', s.d), h('td', s.y), h('td', s.b)))),
    h('p.small.muted', 'Sonuç Eksiklerim → deneme geçmişine yazıldı.'),
    h('h3', `Yanlış / boş (${wrong.length})`),
    h('div', wrong.map(q => h('details.card',
      h('summary', h('b', `Soru ${q.n}`), ' ', h('span.small.muted', typeName(q.type)), q.keySource === 'claude' ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null),
      groupOf(e, q)?.text ? h('div.stem.small', groupOf(e, q).text) : null,
      h('div.q', q.q),
      h('div.small', `Senin: ${pr.answers[q.n] != null ? 'ABCDE'[pr.answers[q.n]] : 'boş'} · Doğru: ${'ABCDE'[q.answer]}) ${q.options[q.answer]}`),
      q.explain ? h('div.explain', q.explain) : null))),
    h('a.btn.primary.wide', { href: '#/cikmis/sinav/' + encodeURIComponent(e.id) }, 'Tekrar çöz')
  );
}

async function typeMode(root, type) {
  const pack = await getPack();
  const items = [];
  for (const e of pack?.exams || []) for (const q of visibleQs(e)) if (q.type === type) items.push(xItem(e, q));
  const seen = new Set(store.all('grammarLog').map(l => l.q));
  const order = [...shuffle(items.filter(i => !seen.has(i.key))), ...shuffle(items.filter(i => seen.has(i.key)))].slice(0, 10);
  const el = h('div');
  root.append(h('a.btn.small', { href: '#/cikmis' }, '‹ Çıkmış'), h('h2', typeName(type)), el);
  if (!order.length) { el.append(h('p.muted', 'Bu tipte soru yok')); return; }
  runQuiz(el, order, { extra: lessonLink, onAnswer: (it, ok) => answer(it.key, ok, it.info) });
}
