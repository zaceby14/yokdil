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
import { updateDay, tick } from '../plan.js';
import { aids } from '../data.js';
import { SECTION_OF, SEC_LBL, HALF_N, HALF_MIN, secClock, planRows, stepOf } from '../strategy.js';
import { reasonList, reasonChips, reasonSummary } from '../reasons.js';
import { KISA, scalePlan, kisaScore } from '../kisa.js';
import { resolve as resolveKey } from '../qbank.js';
export { SECTION_OF, SEC_LBL };

const OSYM = 'https://www.osym.gov.tr/TR,23801/yokdil-cikmis-sorular.html';
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

// Yarım deneme: ilk 40 soru / 90 dk; ilerleme ayrı kayıtta (exam:<id>~yarim)
const HALF = 'yarim';
const pidOf = (e, half) => 'exam:' + e.id + (half ? '~' + HALF : '');
const halfQs = (e, half) => half ? visibleQs(e).slice(0, HALF_N) : visibleQs(e);
const sfx = half => half ? '/' + HALF : '';
// Kısa deneme (sanal sınav: özgün sorular): aynı motor; anahtar/bilgi sorunun kendisinden, ana sayfa #/deneme
const baseOf = e => e.kisa ? '#/deneme' : '#/cikmis';
const shortQ = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return /^\(\d+\)$/.test(t) ? '' : t.length > 70 ? t.slice(0, 68) + '…' : t; };
const qkey = (e, q) => q.key || `${e.id}:${q.n}`;
const qinfo = (e, q) => q.info ? { ...q.info, src: 'kisa' } : { kind: 'cikmis', topic: q.topic || '', dtype: q.type || '', src: 'cikmis' };
const secCounts = secs => Object.fromEntries(secs.map(sc => [sc.k, sc.idx.length]));
// Süre planı: kısa denemede bölüm hedefleri soru sayısına oranlanır
// Süre planı: kısa ve yarım denemede bölüm hedefleri soru sayısına oranlanır (1 çeviri sorusuna 15 dk düşmesin)
const planOf = (e, tp, counts, half) => !tp ? null : e.kisa || half ? scalePlan(tp, counts, planRows) : tp;
export { examMode as runExam, result as examResult, wrongMode as examWrong };

export default async function render(root, [mode, id, arg, a2]) {
  if (mode === 'sinav') { const e = await getExam(id); if (e) return examMode(root, e, arg); }
  if (mode === 'sonuc') { const e = await getExam(id); if (e) return result(root, e, arg === HALF); }
  if (mode === 'yanlis') { const e = await getExam(id); if (e) return wrongMode(root, e, arg, a2 === HALF); }
  if (mode === 'tip') return typeMode(root, id, arg);
  return home(root);
}

function uploader(onDone) {
  const f = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  f.onchange = async () => {
    try {
      const p = JSON.parse(await f.files[0].text());
      const r = await savePack(p);
      toast(`Yüklendi: ${r.exams.length} sınav${r.readings?.length ? ` · ${r.readings.length} okuma` : ''}`); onDone();
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
      const hp = store.get('progress', pidOf(e, true));
      const secRow = secs.length > 1 ? h('details.secpick', h('summary', 'Yarım deneme · bölüm bölüm çöz'),
        h('div.chips',
          h('a.chip.pick.half-link', { href: `#/cikmis/sinav/${encodeURIComponent(e.id)}/${HALF}` }, hp?.startedAt && !hp.done ? `Yarım deneme: devam` : `Yarım deneme: ilk ${HALF_N} soru · ${HALF_MIN} dk`),
          hp?.done ? h('a.chip.pick', { href: `#/cikmis/sonuc/${encodeURIComponent(e.id)}/${HALF}` }, 'Yarım sonucu') : null,
          secs.map(sc => h('a.chip.pick', { href: `#/cikmis/sinav/${encodeURIComponent(e.id)}/${sc.k}` }, `${SEC_LBL[sc.k] || sc.k} ${sc.from}–${sc.to}`)))) : null;
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
  const half = startSec === HALF;
  const qs = halfQs(e, half);
  const secs = sectionsOf(qs);
  const secOf = i => secs.findIndex(sc => sc.idx.includes(i));
  const pid = pidOf(e, half);
  let pr = store.get('progress', pid);
  if (!pr || pr.done) pr = { id: pid, examId: e.id, answers: {}, flags: {}, cur: 0, startedAt: Date.now(), elapsed: 0, done: false, attempts: pr?.attempts || 0, secTime: {}, ...(half ? { half: true } : {}), ...(e.kisa ? { kisa: e.kisa.size } : {}) };
  pr.locked ||= {};
  pr.secTime ||= {};
  if (startSec && !half) { const si = secs.findIndex(sc => sc.k === startSec); if (si >= 0) pr.cur = secs[si].idx[0]; }
  if (pr.cur >= qs.length) pr.cur = 0;
  const total = (half ? HALF_MIN : (e.durationMin || 180)) * 60;
  if (pr.elapsed == null) pr.elapsed = Math.min(total - 60, Math.floor((Date.now() - pr.startedAt) / 1000));
  const save = (silent = false) => { pr = store.put('progress', pr, { silent }); };
  save();
  document.body.classList.add('qmode');
  const timer = h('span.timer');
  let lastT = Date.now(), sinceSave = 0, interim = null;
  const tick = () => {
    const now = Date.now();
    if (document.visibilityState === 'visible') {
      const d = Math.round((now - lastT) / 1000), dd = Math.min(d, 5);
      pr.elapsed += dd; sinceSave += d;
      // Bölüm bazlı süre (bölüm sonu ekranı o bölüme yazılır)
      const k = secs[interim ?? secOf(pr.cur)]?.k;
      if (k && dd > 0) pr.secTime[k] = (pr.secTime[k] || 0) + dd;
    }
    lastT = now;
    drawClock();
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
  // Bölüm süre göstergesi: "Bu bölüm: 12/20 dk" (süre planına göre; aşınca renk değişir; × ile kapanır)
  const clock = h('div.secclock.hidden', { role: 'status' });
  let plan = null;
  function drawClock() {
    const c = plan && store.settings().secClock !== false ? secClock(plan, secs[interim ?? secOf(pr.cur)]?.k, pr.secTime) : null;
    clock.classList.toggle('hidden', !c);
    if (!c) return;
    const txt = `Bu bölüm: ${c.used}/${c.target} dk`;
    clock.classList.toggle('over', c.over);
    if (clock.dataset.k !== txt + c.over) {
      clock.dataset.k = txt + c.over;
      clock.innerHTML = '';
      add(clock, h('span', txt), c.over ? h('span.small', ' · süre aşıldı') : null,
        h('button.icon-x.small', { type: 'button', 'aria-label': 'bölüm süresini gizle', onclick: () => { store.setSetting('secClock', false); toast('Gizlendi · Ayarlar → Çalışma\'dan açılır'); drawClock(); } }, '×'));
    }
  }
  aids().then(a => { const tp = planOf(e, a?.timePlan, secCounts(secs), half); plan = tp && planRows(tp).length ? tp : null; drawClock(); }).catch(() => {});
  const bar = h('div.readbar',
    h('a.btn.small', { href: baseOf(e), 'aria-label': 'geri' }, '‹'), h('b.grow.ellipsis', e.title || e.id), timer,
    h('button.btn.small', { onclick: () => { grid.classList.toggle('hidden'); drawGrid(); } }, 'Optik'),
    h('button.btn.small.primary', { onclick: () => finish(false) }, 'Bitir'));
  root.append(bar, half ? h('div.small.muted.half-note', `Yarım deneme: ilk ${qs.length} soru · ${HALF_MIN} dk · süre bitince kendiliğinden biter`)
    : e.kisa ? h('div.small.muted.half-note.kisa-note', `Özgün sorular · ${qs.length} soru · ${e.durationMin} dk · ipucu yok · süre bitince biter`) : null, secs.length > 1 ? strip : null, clock, grid, main);

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
      answer(qkey(e, q), ok, qinfo(e, q));
      if (!ok) autos.push(fromWrong({ q: q.q, options: q.options, answer: q.answer, stem: groupOf(e, q)?.text, info: qinfo(e, q) }, a, { quiet: true }).catch(() => 0));
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
    drawStrip(); drawClock();
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
    const src = { source: e.kisa ? 'Kısa deneme' : e.title || 'Çıkmış', note: `Soru ${q.n}` };
    setCtx({ type: 'soru', key: qkey(e, q), label: `${e.title || e.id} · Soru ${q.n}` });
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
          : pr.cur >= qs.length - 1 && half ? h('button.btn.primary.main-act', { onclick: () => finish(false) }, 'Bitir ›')
          : h('button.btn.main-act', { disabled: pr.cur >= qs.length - 1, onclick: () => { pr.cur++; save(); draw(); drawGrid(); } }, 'Sonraki ›'))
    );
    drawStrip(); drawClock();
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
        if (!done) autos.push(fromWrong({ q: q.q, options: q.options, answer: q.answer, stem: groupOf(e, q)?.text, info: qinfo(e, q) }, a, { quiet: true }).catch(() => 0));
      }
      if (!done) answer(qkey(e, q), ok, qinfo(e, q));
    });
    Promise.all(autos).then(ns => { const n = ns.reduce((x, y) => x + y, 0); if (n) toast(`+${n} kelime karta eklendi`); });
    // Tahmini YÖKDİL puanı yalnız tam denemede (doğru × 1,25). Kısa ve yarım: doğru / soru × 100 (puan değil, yüzde)
    const score = e.kisa || half ? kisaScore(right, qs.length) : +(right * 1.25).toFixed(2);
    store.put('mocks', { id: uid('m'), date: dayKey(), name: (e.title || e.id) + (half ? ` · ilk ${qs.length}` : ''), sections, src: e.kisa ? 'kisa' : 'cikmis', examId: e.id, score,
      times: { ...pr.secTime }, elapsed: pr.elapsed, ...(half ? { half: true, right, n: qs.length, pct: true } : {}), ...(e.kisa ? { kind: 'kisa', size: e.kisa.size, right, n: qs.length } : {}) });
    updateDay({ mock: true });
    if (e.kisa) tick('kisa');
    pr = { ...pr, done: true, finishedAt: Date.now(), score, right, sections, attempts: (pr.attempts || 0) + 1 };
    pr = store.put('progress', pr);
    location.hash = baseOf(e) + '/sonuc/' + encodeURIComponent(e.id) + sfx(half);
  }

  tick(); draw();
  return () => { clearInterval(iv); if (!finished) { tick(); store.put('progress', pr); } };
}

// Zayıf bölüm için ders (soru tipi taktik dersi)
async function weakLessonBtn(secKey) {
  const l = await findLesson([TYPE_LESSON[SEC_TYPE[secKey]], 'soru-tipi-taktikleri'].filter(Boolean));
  return l ? h('button.btn.wide.weak-lesson', { onclick: () => openLesson(l.id) }, `En zayıf bölüm: ${SEC_LBL[secKey] || secKey} → Ders: ${l.title}`) : null;
}

// Sonuç üst kutusu: tam denemede tahmini puan; kısa/yarımda "x/y doğru (%z)" (sınav puanı değil)
export function heroOf(e, half, right, qs, pr) {
  if (!e.kisa && !half) return h('div.hero', h('div', h('div.big', (pr.score || 0).toLocaleString('tr-TR')), h('div.small', 'tahmini puan')), h('div.hero-r', 'Doğru × 1,25'));
  const pct = Math.round(right / Math.max(1, qs.length) * 100);
  const noRead = half && !qs.some(q => SECTION_OF[q.type] === 'okuma');
  return h('div.hero.hero-pct', h('div', h('div.big', `${right}/${qs.length}`), h('div.small', `doğru (%${pct})`)),
    h('div.hero-r', e.kisa ? 'Mini deneme sınav puanı değildir.' : 'Tahmini puan yalnız tam denemede.', noRead ? h('div.small.no-read', 'Okuma bölümü yok.') : null));
}

function result(root, e, half = false) {
  const pid = pidOf(e, half);
  const pr = store.get('progress', pid);
  const qs = halfQs(e, half);
  if (!pr?.done) { location.hash = baseOf(e); return; }
  const wrong = qs.filter(q => pr.answers[q.n] !== q.answer);
  const keyOf = q => qkey(e, q);
  const base = baseOf(e);
  const bySec = {};
  for (const q of wrong) (bySec[SECTION_OF[q.type] || 'diger'] ||= []).push(q);
  const order = Object.keys(pr.sections || {});
  const weak = order.map(k => ({ k, s: pr.sections[k] })).filter(x => x.s.n >= 3 && (x.s.d + x.s.y) >= 3).sort((a, b) => a.s.d / a.s.n - b.s.d / b.s.n)[0];
  const lessonSlot = h('div');
  if (weak && weak.s.d / weak.s.n < 0.7) weakLessonBtn(weak.k).then(b => b && lessonSlot.append(b));
  const groups = h('div.secgroups');
  const timeSlot = h('div'), sumSlot = h('div'), stepSlot = h('div');
  const right = pr.right ?? order.reduce((a, k) => a + (pr.sections[k].d || 0), 0);
  root.append(
    h('a.btn.small', { href: base }, e.kisa ? '‹ Deneme' : '‹ Çıkmış'),
    h('h2', (e.title || e.id) + (half ? ` · ilk ${qs.length} soru` : '')),
    heroOf(e, half, right, qs, pr),
    h('table.mock', h('tr', h('th', 'Bölüm'), h('th', 'D'), h('th', 'Y'), h('th', 'B')),
      order.map(k => { const s = pr.sections[k]; return h('tr.secrow', { onclick: () => { const d = groups.querySelector(`[data-sec="${k}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'start', behavior: 'smooth' }); } } },
        h('td', SEC_LBL[k] || k, h('span.small.muted', ` ${s.n}`)), h('td', s.d), h('td', s.y), h('td', s.b)); })),
    timeSlot,
    lessonSlot,
    h('p.small.muted', 'Bölüme dokun → o bölümün yanlışları. Sonuç Eksiklerim → deneme geçmişine yazıldı.'),
    stepSlot,
    h('h3', `Yanlış / boş (${wrong.length})`),
    sumSlot,
    groups,
    e.kisa ? h('a.btn.primary.wide.kisa-new', { href: '#/deneme/yeni/' + e.kisa.size }, `Yeni ${KISA[e.kisa.size]?.label.toLocaleLowerCase('tr-TR') || ''} deneme`) : null,
    h('a.btn' + (e.kisa ? '' : '.primary') + '.wide', { href: base + '/sinav/' + encodeURIComponent(e.id) + sfx(half) }, half ? 'Yarım denemeyi tekrar çöz' : e.kisa ? 'Aynı denemeyi tekrar çöz' : 'Tüm sınavı tekrar çöz')
  );
  const drawGroups = reasons => {
    groups.innerHTML = '';
    const drawSum = () => {
      sumSlot.innerHTML = '';
      if (!reasons.length || !wrong.length) return;
      const marked = wrong.filter(q => store.get('reasons', keyOf(q))).length;
      sumSlot.append(h('section.card.reason-card', h('h3', 'Neden yanlış?'),
        h('p.small.muted', `Bölümü aç, her yanlışın altında nedenine dokun (${marked}/${wrong.length} işaretli).`),
        reasonSummary(reasons, wrong.map(keyOf))));
    };
    let first = true;
    for (const k of order) {
      const list = bySec[k];
      if (!list?.length) continue;
      groups.append(h('details.card.secgroup', { 'data-sec': k },
        h('summary', h('b', SEC_LBL[k] || k), h('span.small.muted', ` · ${list.length} yanlış/boş`)),
        h('a.btn.wide.retry-sec', { href: `${base}/yanlis/${encodeURIComponent(e.id)}/${k}${sfx(half)}` }, 'Bu bölümün yanlışlarını tekrar çöz'),
        ...list.map(q => h('div.qwrong-wrap', h('details.qwrong',
          h('summary', h('span.qw-arrow', '▸ '), h('b', `Soru ${q.n}`), ' ', h('span.small.qw-stem', shortQ(q.q)), ' ', h('span.small.muted', `Senin: ${pr.answers[q.n] != null ? 'ABCDE'[pr.answers[q.n]] : 'boş'} · Doğru: ${'ABCDE'[q.answer]}`), q.keySource === 'claude' ? h('span.chip.bad.small', 'anahtar doğrulanmadı') : null),
          groupOf(e, q)?.text ? h('div.stem.small', groupOf(e, q).text) : null,
          h('div.q', q.q),
          pr.answers[q.n] != null ? h('div.small.bad-t', `Senin: ${'ABCDE'[pr.answers[q.n]]}) ${q.options[pr.answers[q.n]]}`) : null,
          h('div.small.good-t', `Doğru: ${'ABCDE'[q.answer]}) ${q.options[q.answer]}`),
          realExplain(q.explain) ? h('div.explain', realExplain(q.explain)) : null),
          reasonChips(reasons, keyOf(q), { src: e.kisa ? 'kisa' : 'cikmis', dtype: q.type || '', topic: q.topic || '' }, drawSum)))));
      first = false;
    }
    drawSum();
  };
  drawGroups([]);
  aids().then(async a => {
    if (!root.isConnected) return;
    // Bölüm başına: net, harcanan dk, hedef dk, soru başı sn
    const times = pr.secTime || {};
    if (Object.values(times).some(v => v > 0)) {
      const tp = planOf(e, a?.timePlan, Object.fromEntries(order.map(k => [k, pr.sections[k].n])), half);
      const plan = tp ? planRows(tp) : [];
      const used = new Set(), rows = [];
      for (const k of order) {
        if (used.has(k)) continue;
        const p = plan.find(r => r.secs.includes(k));
        const ks = (p ? p.secs : [k]).filter(x => pr.sections[x]);
        ks.forEach(x => used.add(x));
        const n = ks.reduce((s, x) => s + pr.sections[x].n, 0), d = ks.reduce((s, x) => s + pr.sections[x].d, 0), t = ks.reduce((s, x) => s + (times[x] || 0), 0);
        rows.push({ label: ks.length > 1 ? p.label : SEC_LBL[k] || k, n, d, t, target: p?.minutes || 0 });
      }
      const min = t => t ? Math.max(1, Math.round(t / 60)) : 0;
      timeSlot.append(h('h3', 'Süre'), h('div.tblwrap', h('table.mock.timetable',
        h('tr', h('th', 'Bölüm'), h('th', 'Doğru'), h('th', 'dk'), plan.length ? h('th', 'Hedef') : null, h('th', 'sn/soru')),
        rows.map(r => h('tr', h('td', r.label.replace(/\s*\(\d+[–-]\d+\)\s*$/, '')), h('td', r.d),
          h('td' + (r.target && r.t > r.target * 60 ? '.bad-t' : ''), r.t ? min(r.t) : '–'), plan.length ? h('td', r.target || '–') : null, h('td', r.t ? Math.max(1, Math.round(r.t / r.n)) : '–'))),
        h('tr.total', h('td', 'Toplam'), h('td', right), h('td', min(pr.elapsed || 0)), plan.length ? h('td', half ? HALF_MIN : e.kisa ? e.durationMin : (a?.timePlan?.total || e.durationMin || 180)) : null, h('td', pr.elapsed ? Math.round(pr.elapsed / qs.length) : '–')))),
        h('p.small.muted', plan.length ? 'Kırmızı: hedef süre aşıldı.' : null));
    }
    // 20 dk analiz adımları (kontrol listesi)
    const steps = (Array.isArray(a?.mockAnalysis) ? a.mockAnalysis : []).map(stepOf).filter(x => x?.title);
    if (steps.length) {
      const sid = `analiz:${pid}:${pr.attempts || 1}`;
      const tot = steps.reduce((s, x) => s + x.min, 0) || Math.max(0, ...steps.map(x => x.end || 0));
      const box = h('section.card.analysis');
      const drawSteps = () => {
        const done = store.get('progress', sid)?.done || {};
        box.innerHTML = '';
        box.append(h('h3', tot ? `${tot} dk analiz` : 'Deneme analizi', h('span.small.muted', ` · ${steps.filter((_, i) => done[i]).length}/${steps.length}`)),
          h('ul.checklist', steps.map((x, i) => h('li' + (done[i] ? '.done' : ''),
            h('button.check', { type: 'button', role: 'checkbox', 'aria-checked': done[i] ? 'true' : 'false', 'aria-label': x.title, onclick: () => { store.patch('progress', sid, { done: { ...done, [i]: !done[i] } }); drawSteps(); } }, done[i] ? '✓' : ''),
            h('div.grow', h('b', x.title), x.min ? h('span.small.muted', ` · ${x.min} dk`) : null, x.text ? h('div.small.muted', x.text) : null)))));
      };
      drawSteps();
      stepSlot.append(box);
    }
    const reasons = await reasonList();
    if (reasons.length) drawGroups(reasons);
  }).catch(err => console.warn('analiz', err));
}

// Sonuç ekranından: bir bölümün yanlışlarını tekrar çöz
function wrongMode(root, e, sec, half = false) {
  const pr = store.get('progress', pidOf(e, half));
  const qs = halfQs(e, half).filter(q => (SECTION_OF[q.type] || 'diger') === sec && pr?.answers?.[q.n] !== q.answer);
  const el = h('div');
  root.append(h('a.btn.small', { href: baseOf(e) + '/sonuc/' + encodeURIComponent(e.id) + sfx(half) }, '‹ Sonuç'), h('h2', `${SEC_LBL[sec] || sec} · yanlışlar`), el);
  if (!qs.length) { el.append(h('p.muted', 'Bu bölümde yanlış yok.')); return; }
  const go = its => runQuiz(el, its, { extra: lessonLink, name: `${e.title || e.id} · ${SEC_LBL[sec] || sec}`, source: e.kisa ? 'Kısa deneme' : 'Çıkmış',
    onAnswer: (it, ok, k, m) => answer(it.key, ok, e.kisa ? { ...it.info, src: 'kisa' } : it.info, m) });
  if (!e.kisa) return go(qs.map(q => xItem(e, q)));
  // Kısa deneme: özgün soruyu kendi bankasından kur
  return Promise.all(qs.map(q => resolveKey(q.key))).then(its => go(its.filter(Boolean)));
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
