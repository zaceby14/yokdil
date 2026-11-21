// Çıkmış sorular: paket cihazda (IndexedDB), senkrona yalnızca cevaplar/sonuçlar girer
import * as store from '../store.js';
import { h, add, uid, dayKey, toast, shuffle, typeName, TYPES, TYPE_LESSON, realExplain } from '../util.js';
import { getPack, savePack, clearPack, exam as getExam, groupOf } from '../pack.js';
import { answer } from '../mistakes.js';
import { fromWrong } from '../autocard.js';
import { runQuiz } from '../quiz.js';
import { xItem } from '../qbank.js';
import { tappable } from '../tappable.js';
import { soruTabs, lessonLink } from './hub.js';
import { getToken } from '../sync.js';
import { fetchPrivate, status as pstat, resetMeta } from '../private.js';
import { setCtx } from '../ctx.js';
import { openLesson, openFor, findLesson } from '../side.js';
import { updateDay } from '../plan.js';

const OSYM = 'https://www.osym.gov.tr/TR,23801/yokdil-cikmis-sorular.html';
// Soru tipi → deneme bölümü
export const SECTION_OF = {
  'bosluk': 'bosluk', 'cloze': 'cloze', 'cumle-tamamlama': 'tamamlama', 'ceviri-en-tr': 'en-tr', 'ceviri-tr-en': 'tr-en',
  'paragraf-tamamlama': 'paragraf', 'ilgisiz': 'ilgisiz', 'paragraf': 'okuma', 'yakin-anlam': 'yakin', 'diyalog': 'diyalog'
};
export const SEC_LBL = { bosluk: 'Cümlede boşluk', cloze: 'Cloze test', tamamlama: 'Cümle tamamlama', 'en-tr': 'Çeviri İng→Tr', 'tr-en': 'Çeviri Tr→İng',
  paragraf: 'Paragraf tamamlama', ilgisiz: 'İlgisiz cümle', okuma: 'Okuma', yakin: 'Yakın anlam', diyalog: 'Diyalog', diger: 'Diğer' };
const SEC_TYPE = { bosluk: 'bosluk', cloze: 'cloze', tamamlama: 'cumle-tamamlama', 'en-tr': 'ceviri-en-tr', 'tr-en': 'ceviri-tr-en',
  paragraf: 'paragraf-tamamlama', ilgisiz: 'ilgisiz', okuma: 'paragraf', yakin: 'yakin-anlam', diyalog: 'diyalog' };
// Saf: soru dizisini ardışık bölümlere ayır → [{k, idx:[sıra], from, to}]
export function sectionsOf(qs) {
  const out = [];
  qs.forEach((q, i) => {
    const k = SECTION_OF[q.type] || 'diger', last = out.at(-1);
    if (last && last.k === k) { last.idx.push(i); last.to = q.n; } else out.push({ k, idx: [i], from: q.n, to: q.n });
  });
  return out;
}
// Kaynak: ÖSYM (YÖKDİL/YDS) ya da yayınevi
export const isOsym = e => e.kind !== 'yayinevi';
const showDialog = () => !!store.settings().showDialog;
const visibleQs = e => (e.questions || []).filter(q => showDialog() || q.type !== 'diyalog').sort((a, b) => a.n - b.n);

export default async function render(root, [mode, id, arg]) {
  if (mode === 'sinav') { const e = await getExam(id); if (e) return examMode(root, e, arg); }
  if (mode === 'sonuc') { const e = await getExam(id); if (e) return result(root, e); }
  if (mode === 'yanlis') { const e = await getExam(id); if (e) return wrongMode(root, e, arg); }
  if (mode === 'tip') return typeMode(root, id, arg);
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
  return [f, h('button.btn.wide', { onclick: () => f.click() }, 'Dosyadan yükle')];
}

async function home(root) {
  const pack = await getPack();
  const redraw = () => { root.innerHTML = ''; home(root); };
  root.append(soruTabs('cikmis'), h('h2', 'Çıkmış sorular'));
  if (!pack?.exams?.length) {
    if (!getToken()) {
      root.append(
        h('div.card.row.between', h('span', 'Soruları görmek için Ayarlar\'dan GitHub anahtarını gir'), h('a.btn.primary', { href: '#/ayarlar' }, 'Ayarlar')),
        h('details.small', h('summary', 'Dosyadan yükle'), ...uploader(redraw),
          h('p.small', h('a', { href: OSYM, target: '_blank', rel: 'noopener' }, 'ÖSYM çıkmış sorular (resmi sayfa)'))));
      return;
    }
    const msg = h('div.card', pstat.state === 'error' ? h('span.bad-t', 'İndirilemedi: ' + pstat.msg) : 'Sorular indiriliyor…');
    root.append(msg, h('button.btn.wide', { onclick: () => { msg.textContent = 'Sorular indiriliyor…'; fetchPrivate({ force: true }).then(redraw); } }, 'Tekrar dene'),
      h('details.small', h('summary', 'Dosyadan yükle'), ...uploader(redraw)));
    if (pstat.state !== 'loading' && pstat.state !== 'error') fetchPrivate({ force: true }).then(r => { if (root.isConnected) redraw(); });
    return;
  }
  const types = {}, otypes = {};
  for (const e of pack.exams) for (const q of visibleQs(e)) { types[q.type] = (types[q.type] || 0) + 1; if (isOsym(e)) otypes[q.type] = (otypes[q.type] || 0) + 1; }
  const exams = pack.exams.filter(e => visibleQs(e).length).sort((a, b) => isOsym(b) - isOsym(a));
  root.append(
    h('h3', 'Sınavlar'),
    h('ul.list', exams.map(e => {
      const pr = store.get('progress', 'exam:' + e.id);
      const status = pr?.done ? `Son: ${pr.score?.toLocaleString('tr-TR')} puan` : pr?.startedAt ? 'Devam ediyor' : '';
      const secs = e.full ? sectionsOf(visibleQs(e)) : [];
      const secRow = secs.length > 1 ? h('details.secpick', h('summary', 'Bölüm bölüm çöz'),
        h('div.chips', secs.map(sc => h('a.chip.pick', { href: `#/cikmis/sinav/${encodeURIComponent(e.id)}/${sc.k}` }, `${SEC_LBL[sc.k] || sc.k} ${sc.from}–${sc.to}`)))) : null;
      return h('li', h('div.exam-row',
        h('div.grow', h('b', e.title || e.id), h('div.small.muted', [isOsym(e) ? 'ÖSYM' : 'Yayınevi', e.date, visibleQs(e).length + ' soru', status].filter(Boolean).join(' · '))),
        pr?.done ? h('a.btn.small', { href: '#/cikmis/sonuc/' + encodeURIComponent(e.id) }, 'Sonuç') : null,
        h('a.btn.small.primary', { href: '#/cikmis/sinav/' + encodeURIComponent(e.id) }, pr?.startedAt && !pr.done ? 'Devam' : (e.full ? 'Tam deneme' : 'Çöz'))), secRow);
    })),
    h('h3', 'Tipe göre çalış'),
    h('ul.list.compact', Object.keys(TYPES).filter(t => types[t]).map(t =>
      h('li', h('a', { href: '#/cikmis/tip/' + t }, h('b', typeName(t)), h('span.small.muted', `ÖSYM ${otypes[t] || 0} · toplam ${types[t]} soru`))))),
    h('p.small.muted', 'Sorular yalnızca bu cihazda; senkrona sadece cevapların gider.'),
    getToken() ? h('button.btn.wide', { onclick: async e => { e.currentTarget.disabled = true; const r = await fetchPrivate({ force: true }); toast(r.error ? 'Hata: ' + r.error : 'Sorular güncellendi'); redraw(); } }, 'Soruları güncelle') : null,
    h('details.small', h('summary', 'Dosya / sil'), ...uploader(redraw),
      h('button.btn.danger.wide', { onclick: async () => { if (confirm('Sorular bu cihazdan silinsin mi?')) { await clearPack(); resetMeta(); redraw(); } } }, 'Soruları sil'))
  );
}

// --- Tam deneme / sınav modu (bölüm bölüm de çözülebilir: bölüm sonu ara sonuç, bölüm kilitlenir)
function examMode(root, e, startSec) {
  const qs = visibleQs(e);
  const secs = sectionsOf(qs);
  const secOf = i => secs.findIndex(sc => sc.idx.includes(i));
  const pid = 'exam:' + e.id;
  let pr = store.get('progress', pid);
  if (!pr || pr.done) pr = { id: pid, examId: e.id, answers: {}, flags: {}, cur: 0, startedAt: Date.now(), elapsed: 0, done: false, attempts: pr?.attempts || 0 };
  pr.locked ||= {};
  if (startSec) { const si = secs.findIndex(sc => sc.k === startSec); if (si >= 0) pr.cur = secs[si].idx[0]; }
  const total = (e.durationMin || 180) * 60;
  if (pr.elapsed == null) pr.elapsed = Math.min(total - 60, Math.floor((Date.now() - pr.startedAt) / 1000));
  const save = (silent = false) => { pr = store.put('progress', pr, { silent }); };
  save();
  document.body.classList.add('qmode');
  const timer = h('span.timer');
  let lastT = Date.now(), sinceSave = 0, interim = null;
  const tick = () => {
    const now = Date.now();
    if (document.visibilityState === 'visible') { const d = Math.round((now - lastT) / 1000); pr.elapsed += Math.min(d, 5); sinceSave += d; }
    lastT = now;
    if (sinceSave >= 15) { sinceSave = 0; save(true); }
    const left = Math.max(0, total - pr.elapsed);
    timer.textContent = `${Math.floor(left / 3600)}:${String(Math.floor(left / 60) % 60).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    timer.classList.toggle('bad-t', left < 600);
    if (!left) finish(true);
  };
  const iv = setInterval(tick, 1000);
  const grid = h('div.optik.hidden');
  const strip = h('div.secstrip');
  const main = h('div');
  const bar = h('div.readbar',
    h('a.btn.small', { href: '#/cikmis', 'aria-label': 'geri' }, '‹'), h('b.grow.ellipsis', e.title || e.id), timer,
    h('button.btn.small', { onclick: () => { grid.classList.toggle('hidden'); drawGrid(); } }, 'Optik'),
    h('button.btn.small.primary', { onclick: () => finish(false) }, 'Bitir'));
  root.append(bar, secs.length > 1 ? strip : null, grid, main);

  const secStat = si => {
    const st = { d: 0, y: 0, b: 0, n: 0, a: 0 };
    for (const i of secs[si].idx) { const q = qs[i], a = pr.answers[q.n]; st.n++; if (a == null) st.b++; else { st.a++; a === q.answer ? st.d++ : st.y++; } }
    return st;
  };
  function drawStrip() {
    strip.innerHTML = '';
    const cs = secOf(pr.cur);
    secs.forEach((sc, si) => {
      const st = secStat(si);
      strip.append(h('button.chip' + (si === cs ? '.on' : '') + (pr.locked[si] ? '.ok' : ''), { onclick: () => { interim = null; pr.cur = sc.idx[0]; save(); draw(); } },
        `${SEC_LBL[sc.k] || sc.k} ${pr.locked[si] ? '✓' : st.a + '/' + st.n}`));
    });
  }
  function drawGrid() {
    if (grid.classList.contains('hidden')) return;
    grid.innerHTML = '';
    secs.forEach((sc, si) => {
      grid.append(h('div.optik-h', `${SEC_LBL[sc.k] || sc.k} · ${sc.from}–${sc.to}`));
      for (const i of sc.idx) {
        const q = qs[i];
        grid.append(h('button' + (pr.answers[q.n] != null ? '.ans' : '') + (pr.flags[q.n] ? '.flag' : '') + (i === pr.cur ? '.cur' : ''),
          { onclick: () => { interim = null; pr.cur = i; save(); draw(); } }, q.n));
      }
    });
    const blank = qs.filter(q => pr.answers[q.n] == null).length, fl = qs.filter(q => pr.flags[q.n]).length;
    grid.append(h('div.small.muted.full', `Boş ${blank} · İşaretli ${fl}`));
  }

  // Bölümü kontrol et: cevaplar kaydedilir (hata kutusu), bölüm kilitlenir
  function checkSection(si) {
    if (pr.locked[si]) return;
    const autos = [];
    for (const i of secs[si].idx) {
      const q = qs[i], a = pr.answers[q.n];
      if (a == null) continue;
      const ok = a === q.answer;
      answer(`${e.id}:${q.n}`, ok, { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' });
      if (!ok) autos.push(fromWrong({ q: q.q, options: q.options, answer: q.answer, stem: groupOf(e, q)?.text, info: { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '' } }, a, { quiet: true }).catch(() => 0));
    }
    Promise.all(autos).then(ns => { const n = ns.reduce((x, y) => x + y, 0); if (n) toast(`+${n} kelime karta eklendi`); });
    pr.locked[si] = true; save();
    updateDay({ mock: true });
  }

  function showInterim(si) {
    interim = si;
    main.innerHTML = '';
    const sc = secs[si], st = secStat(si);
    const next = secs[si + 1];
    add(main, h('section.card.interim',
      h('h3', `Bölüm sonu: ${SEC_LBL[sc.k] || sc.k}`),
      pr.locked[si] ? h('table.mock', h('tr', h('th', 'D'), h('th', 'Y'), h('th', 'B')), h('tr', h('td', st.d), h('td', st.y), h('td', st.b)))
        : h('p', `${st.a} / ${st.n} cevaplandı`),
      pr.locked[si] ? h('p.small.muted', 'Bölüm kilitlendi; yanlışlar hata kutusuna yazıldı.') : h('p.small.muted', 'Kontrol edince doğru/yanlış görünür ve bölüm kilitlenir.'),
      h('div.actbar',
        !pr.locked[si] ? h('button.btn.primary.wide.main-act', { onclick: () => { checkSection(si); showInterim(si); } }, 'Bölümü kontrol et') : null,
        next ? h('button.btn.wide' + (pr.locked[si] ? '.primary.main-act' : ''), { onclick: () => { interim = null; pr.cur = next.idx[0]; save(); draw(); } }, `Sonraki bölüm: ${SEC_LBL[next.k] || next.k} ›`)
          : h('button.btn.wide' + (pr.locked[si] ? '.primary.main-act' : ''), { onclick: () => finish(false) }, 'Sınavı bitir'),
        h('a.btn.wide', { href: '#/bugun' }, 'Ara ver (kaydedildi)'))));
    drawStrip();
    window.scrollTo(0, 0);
  }

  function draw() {
    if (interim != null) return showInterim(interim);
    const q = qs[pr.cur];
    main.innerHTML = '';
    if (!q) return;
    const si = secOf(pr.cur), locked = !!pr.locked[si];
    const lastOfSec = secs[si] && secs[si].idx.at(-1) === pr.cur;
    const g = groupOf(e, q);
    const src = { source: e.title || 'Çıkmış', note: `Soru ${q.n}` };
    setCtx({ type: 'soru', key: `${e.id}:${q.n}`, label: `${e.title || e.id} · Soru ${q.n}` });
    const trq = q.type === 'ceviri-tr-en', tro = q.type === 'ceviri-en-tr';
    const it = { q: q.q, info: { topic: q.topic || '', dtype: q.type || '' } };
    add(main,
      h('div.qhead', h('span.muted', `Soru ${q.n} · ${pr.cur + 1}/${qs.length}`),
        h('span.qtools', q.keySource === 'claude' ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null, h('span.chip', typeName(q.type)))),
      h('div.qbar', h('button.chip.lesson-btn', { type: 'button', onclick: () => openFor(it) }, 'Ders')),
      g?.text ? h('div.stem.tap', tappable(g.text, src).el) : null,
      trq ? h('div.q', q.q) : h('div.q.tap', tappable(q.q, src).el),
      h('div.opts' + (locked ? '.locked' : ''), q.options.map((o, k) => h('button.opt' + (pr.answers[q.n] === k ? '.chosen' : '') + (locked && k === q.answer ? '.right.done' : '') + (locked && pr.answers[q.n] === k && k !== q.answer ? '.wrong.done' : ''), {
        type: 'button',
        onclick: () => {
          if (locked) return;
          if (pr.answers[q.n] === k) delete pr.answers[q.n]; else pr.answers[q.n] = k;
          save(); draw(); drawGrid();
        }
      }, h('span.ol', 'ABCDE'[k]), tro ? h('span', String(o)) : h('span.otext', tappable(String(o), { ...src, inline: true, tapOpens: false, ctx: () => (trq || String(q.q || '').length > 400 ? '' : q.q) }).el)))),
      locked && realExplain(q.explain) ? h('div.explain', realExplain(q.explain)) : null,
      h('div.actbar.exam-nav',
        h('button.btn', { disabled: pr.cur === 0, onclick: () => { pr.cur--; save(); draw(); drawGrid(); } }, '‹ Önceki'),
        h('button.btn.grow' + (pr.flags[q.n] ? '.primary' : ''), { onclick: () => { pr.flags[q.n] = !pr.flags[q.n]; if (!pr.flags[q.n]) delete pr.flags[q.n]; save(); draw(); drawGrid(); } }, pr.flags[q.n] ? 'İşaretli' : 'İşaretle'),
        lastOfSec && secs.length > 1 ? h('button.btn.primary.main-act', { onclick: () => showInterim(si) }, 'Bölüm sonu ›')
          : h('button.btn.main-act', { disabled: pr.cur >= qs.length - 1, onclick: () => { pr.cur++; save(); draw(); drawGrid(); } }, 'Sonraki ›'))
    );
    drawStrip();
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
    const autos = [];
    qs.forEach((q, i) => {
      const k = SECTION_OF[q.type] || 'diger';
      const s = sections[k] ||= { d: 0, y: 0, b: 0, n: 0 };
      s.n++;
      const a = pr.answers[q.n];
      if (a == null) { s.b++; return; }
      const ok = a === q.answer;
      const done = pr.locked[secOf(i)]; // bölüm sonunda zaten kaydedildi
      if (ok) { s.d++; right++; } else {
        s.y++;
        if (!done) autos.push(fromWrong({ q: q.q, options: q.options, answer: q.answer, stem: groupOf(e, q)?.text, info: { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '' } }, a, { quiet: true }).catch(() => 0));
      }
      if (!done) answer(`${e.id}:${q.n}`, ok, { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' });
    });
    Promise.all(autos).then(ns => { const n = ns.reduce((x, y) => x + y, 0); if (n) toast(`+${n} kelime karta eklendi`); });
    const score = +(right * 1.25).toFixed(2);
    store.put('mocks', { id: uid('m'), date: dayKey(), name: e.title || e.id, sections, src: 'cikmis', examId: e.id, score });
    updateDay({ mock: true });
    pr = { ...pr, done: true, finishedAt: Date.now(), score, sections, attempts: (pr.attempts || 0) + 1 };
    pr = store.put('progress', pr);
    location.hash = '#/cikmis/sonuc/' + encodeURIComponent(e.id);
  }

  tick(); draw();
  return () => { clearInterval(iv); if (!finished) { tick(); store.put('progress', pr); } };
}

// Zayıf bölüm için ders (soru tipi taktik dersi)
async function weakLessonBtn(secKey) {
  const l = await findLesson([TYPE_LESSON[SEC_TYPE[secKey]], 'soru-tipi-taktikleri'].filter(Boolean));
  return l ? h('button.btn.wide.weak-lesson', { onclick: () => openLesson(l.id) }, `En zayıf bölüm: ${SEC_LBL[secKey] || secKey} → Ders: ${l.title}`) : null;
}

function result(root, e) {
  const pr = store.get('progress', 'exam:' + e.id);
  const qs = visibleQs(e);
  if (!pr?.done) { location.hash = '#/cikmis'; return; }
  const wrong = qs.filter(q => pr.answers[q.n] !== q.answer);
  const bySec = {};
  for (const q of wrong) (bySec[SECTION_OF[q.type] || 'diger'] ||= []).push(q);
  const order = Object.keys(pr.sections || {});
  const weak = order.map(k => ({ k, s: pr.sections[k] })).filter(x => x.s.n >= 3 && (x.s.d + x.s.y) >= 3).sort((a, b) => a.s.d / a.s.n - b.s.d / b.s.n)[0];
  const lessonSlot = h('div');
  if (weak && weak.s.d / weak.s.n < 0.7) weakLessonBtn(weak.k).then(b => b && lessonSlot.append(b));
  const groups = h('div.secgroups');
  root.append(
    h('a.btn.small', { href: '#/cikmis' }, '‹ Çıkmış'),
    h('h2', e.title || e.id),
    h('div.hero', h('div', h('div.big', (pr.score || 0).toLocaleString('tr-TR')), h('div.small', 'tahmini puan')), h('div.hero-r', 'Doğru × 1,25')),
    h('table.mock', h('tr', h('th', 'Bölüm'), h('th', 'D'), h('th', 'Y'), h('th', 'B')),
      order.map(k => { const s = pr.sections[k]; return h('tr.secrow', { onclick: () => { const d = groups.querySelector(`[data-sec="${k}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } } },
        h('td', SEC_LBL[k] || k, h('span.small.muted', ` ${s.n}`)), h('td', s.d), h('td', s.y), h('td', s.b)); })),
    lessonSlot,
    h('p.small.muted', 'Bölüme dokun → o bölümün yanlışları. Sonuç Eksiklerim → deneme geçmişine yazıldı.'),
    h('h3', `Yanlış / boş (${wrong.length})`),
    groups,
    h('a.btn.primary.wide', { href: '#/cikmis/sinav/' + encodeURIComponent(e.id) }, 'Tüm sınavı tekrar çöz')
  );
  for (const k of order) {
    const list = bySec[k];
    if (!list?.length) continue;
    groups.append(h('details.card.secgroup', { 'data-sec': k },
      h('summary', h('b', SEC_LBL[k] || k), h('span.small.muted', ` · ${list.length} yanlış/boş`)),
      h('a.btn.wide.retry-sec', { href: `#/cikmis/yanlis/${encodeURIComponent(e.id)}/${k}` }, 'Bu bölümün yanlışlarını tekrar çöz'),
      ...list.map(q => h('details.qwrong',
        h('summary', h('b', `Soru ${q.n}`), ' ', h('span.small.muted', `Senin: ${pr.answers[q.n] != null ? 'ABCDE'[pr.answers[q.n]] : 'boş'} · Doğru: ${'ABCDE'[q.answer]}`), q.keySource === 'claude' ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null),
        groupOf(e, q)?.text ? h('div.stem.small', groupOf(e, q).text) : null,
        h('div.q', q.q),
        h('div.small', `Doğru: ${'ABCDE'[q.answer]}) ${q.options[q.answer]}`),
        realExplain(q.explain) ? h('div.explain', realExplain(q.explain)) : null))));
  }
}

// Sonuç ekranından: bir bölümün yanlışlarını tekrar çöz
function wrongMode(root, e, sec) {
  const pr = store.get('progress', 'exam:' + e.id);
  const qs = visibleQs(e).filter(q => (SECTION_OF[q.type] || 'diger') === sec && pr?.answers?.[q.n] !== q.answer);
  const el = h('div');
  root.append(h('a.btn.small', { href: '#/cikmis/sonuc/' + encodeURIComponent(e.id) }, '‹ Sonuç'), h('h2', `${SEC_LBL[sec] || sec} · yanlışlar`), el);
  if (!qs.length) { el.append(h('p.muted', 'Bu bölümde yanlış yok.')); return; }
  runQuiz(el, qs.map(q => xItem(e, q)), { extra: lessonLink, name: `${e.title || e.id} · ${SEC_LBL[sec] || sec}`, source: 'Çıkmış',
    onAnswer: (it, ok, k, m) => answer(it.key, ok, it.info, m) });
}

// Tipe göre: kaynak filtresi (ÖSYM varsayılan / Yayınevi / Hepsi — Hepsi'nde ÖSYM önce)
async function typeMode(root, type, srcF = 'osym') {
  const pack = await getPack();
  const all = [];
  for (const e of pack?.exams || []) for (const q of visibleQs(e)) if (q.type === type) all.push({ it: xItem(e, q), osym: isOsym(e) });
  const pick = all.filter(x => srcF === 'hepsi' || (srcF === 'yayinevi') !== x.osym);
  const seen = new Set(store.all('grammarLog').map(l => l.q));
  const ord = list => [...shuffle(list.filter(x => !seen.has(x.it.key))), ...shuffle(list.filter(x => seen.has(x.it.key)))];
  const order = (srcF === 'hepsi' ? [...ord(pick.filter(x => x.osym)), ...ord(pick.filter(x => !x.osym))] : ord(pick)).slice(0, 10).map(x => x.it);
  const el = h('div');
  const cnt = k => all.filter(x => k === 'hepsi' || (k === 'yayinevi') !== x.osym).length;
  root.append(h('a.btn.small', { href: '#/cikmis' }, '‹ Çıkmış'), h('h2', typeName(type)),
    h('div.seg.small.srcseg', [['osym', 'ÖSYM'], ['yayinevi', 'Yayınevi'], ['hepsi', 'Hepsi']].map(([k, l]) =>
      h('a' + (srcF === k ? '.active' : ''), { href: `#/cikmis/tip/${type}/${k}` }, `${l} (${cnt(k)})`))), el);
  if (!order.length) { el.append(h('p.muted', 'Bu kaynakta bu tipte soru yok')); return; }
  runQuiz(el, order, { extra: lessonLink, sid: `cikmis-tip:${type}:${srcF}`, name: 'Çıkmış · ' + typeName(type), source: 'Çıkmış', onAnswer: (it, ok, k, m) => answer(it.key, ok, it.info, m) });
}
