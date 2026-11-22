// Bugün: geri sayım, hafta/faz, görevler, yoğun gün, seri
import * as store from '../store.js';
import { h, dayKey, fmtDate, diffDays, addDays, topicName, typeName } from '../util.js';
import { isStudied } from '../vocab.js';
import { week, daysToExam, dayRec, tick, updateDay, streakInfo, weekdayHint, finalMode, newLimit } from '../plan.js';
import { dueCount } from '../srs.js';
import { openSessions } from '../quiz.js';
import { tourCards } from '../memory.js';
import { todayTasks, mockHref } from '../tasks.js';
import { KISA } from '../kisa.js';
import { aids } from '../data.js';
import { applyState, examDayFor, ruleTasks, lastFullMock } from '../strategy.js';
import { getPack } from '../pack.js';
import { startFocus, running, lens } from '../focus.js';
import { getToken } from '../sync.js';

const rr0busy = () => !!dayRec().busy;

// Hedefe uzaklık (yalnız tam deneme): "Son tam deneme 56 · hedef 70 · fark 12 soru"
export function goalGap(score, goal) { const d = Math.max(0, goal - score); return { score, goal, q: Math.ceil(d / 1.25 - 1e-9) }; }
function goalLine() {
  const m = lastFullMock(store.all('mocks'));
  if (!m) return null;
  const sc = m.score ?? +(Object.values(m.sections || {}).reduce((s, x) => s + (+x?.d || 0), 0) * 1.25).toFixed(2);
  const g = goalGap(sc, +store.settings().targetScore || 70);
  return h('a.goalline.small', { href: '#/eksikler' }, `Son tam deneme ${Math.round(g.score)} · hedef ${g.goal} · `, h('b', g.q ? `fark ${g.q} soru` : 'hedefte'));
}

export default async function render(root) {
  const today = dayKey();
  const w = await week();
  const left = await daysToExam();
  const A = await aids().catch(() => null);
  const draw = async () => {
    const fin = await finalMode();
    if (fin.on && !dayRec().final) updateDay({ final: true });
    const r = dayRec();
    const due = dueCount();
    if (!due && !r.tasks?.kart && store.all('cards').some(isStudied)) tick('kart');
    const tasks = await todayTasks();
    const rr = dayRec();
    const T = Object.fromEntries(tasks.map(t => [t.key, t]));
    const totalMin = tasks.filter(t => !t.done && !t.optional).reduce((a, t) => a + (t.min || 0), 0);
    const mainT = tasks.filter(t => !t.optional), optT = tasks.filter(t => t.optional);
    const st = streakInfo();
    // Yarım kalan deneme (çıkmış)
    const exOpen = store.all('progress').filter(p => p.id?.startsWith('exam:') && p.startedAt && !p.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 1);
    const pack = exOpen.length ? await getPack().catch(() => null) : null;
    const apply = w.prog.apply || [];
    const ap = applyState(apply, w.prog.lateApply, today);
    const apText = !ap ? '' : ap.kind === 'soon' ? `Başvuruya ${ap.days} gün: ${fmtDate(apply[0])}–${fmtDate(apply[1])}`
      : ap.kind === 'open' ? `Başvuru açık · ${ap.days ? 'son ' + ap.days + ' gün' : 'BUGÜN son gün'} (${fmtDate(apply[1])})`
      : `Geç başvuru · ${ap.days ? ap.days + ' gün kaldı' : 'BUGÜN son gün'} (${fmtDate(w.prog.lateApply)})`;
    // Son 14 gün: sınav günü listesinden bugüne uyan maddeler
    const edGroups = fin.on ? examDayFor(A?.examDay, left) : [];
    const edDone = store.get('progress', 'examday')?.done || {};
    // Aynı kişisel kuraldan 2+ yanlış → kural kartı görevi
    const acks = Object.fromEntries(store.all('progress').filter(p => p.id?.startsWith('kural:')).map(p => [p.id.slice(6), p.ackAt || 0]));
    const rTasks = rr0busy() ? [] : ruleTasks(store.all('grammarLog'), A?.personalRules, acks, today).slice(0, 1);
    const nlNow = fin.on ? await newLimit() : 0;
    // Faz geçişi: yeni fazın ilk 3 günü kısa bildirim
    const prevW = (w.prog.weeks || []).find(x => x.n === w.n - 1);
    const phaseNew = !w.beforeStart && prevW && prevW.phase !== w.phase && diffDays(addDays(w.prog.start, (w.n - 1) * 7), today) < 3;
    const tour = rr.busy ? 0 : tourCards().length;
    const open = openSessions().slice(0, 2);
    const { work, brk } = lens();
    // ▶ odak: yalnız Ayarlar → "Görevle birlikte odak sayacı" açıksa (varsayılan kapalı); yoksa sade ›
    const focusBtn = k => store.settings().focusOnTask !== true ? h('a.chev.task-go', { href: T[k]?.go || '#/bugun', 'aria-label': 'göreve git' }, '›') : h('button.btn.play', { 'aria-label': 'odakla başla', title: `${work} dk odak`, onclick: () => { startFocus(k, T[k]?.label || ''); location.hash = T[k]?.go || '#/bugun'; draw(); } }, '▶');
    const taskLi = t => {
      const k = t.key, done = t.done;
      return h('li' + (done ? '.done' : ''), { 'data-task': k },
        h('button.check', { 'aria-label': 'tamamlandı', onclick: () => { tick(k, !done); draw(); } }, done ? '✓' : ''),
        h('a.task', { href: t.go }, h('b', t.label), h('span.small.muted', t.sub)),
        t.min ? h('span.small.muted.tmin', '~' + t.min + ' dk') : null, done ? h('span.chev', '›') : focusBtn(k));
    };
    root.innerHTML = '';
    root.append(
      h('div.hero',
        h('div', h('div.big', left > 0 ? left : 0), h('div.small', 'gün kaldı')),
        h('div.hero-r',
          h('div', w.beforeStart ? `Başlangıç: ${fmtDate(w.prog.start)}` : `Hafta ${w.n}/${(w.prog.weeks || []).length || w.n} · ${w.phase}`),
          w.goal ? h('div.small.muted', w.goal) : null,
          h('div.streak', 'Seri: ', h('b', st.n), ' gün', st.frozen.length ? h('span.small.muted', ' · joker kullanıldı') : null))
      ),
      goalLine(),
      !getToken() ? h('a.banner', { href: '#/ayarlar' }, 'Çıkmış sorular + senkron için GitHub anahtarını gir → Ayarlar') : null,
      phaseNew ? h('div.banner.phase', `Yeni faz: ${w.phase} · günde ${w.newWords ?? '-'} yeni kelime`) : null,
      ap ? h('a.banner.apply.' + ap.kind, { href: 'https://ais.osym.gov.tr', target: '_blank', rel: 'noopener' }, h('b', apText), h('span.small', ' · ÖSYM AİS ↗')) : null,
      fin.on ? h('div.banner.final', h('b', left === 0 ? 'Bugün sınav.' : `Son ${left} gün.`), ` Tekrar + deneme + hata tekrarı. Yeni kelime: ${nlNow ? 'en fazla ' + nlNow : 'yok'}.`) : null,
      ...edGroups.map(g => {
        const gi = (A.examDay || []).filter(x => x?.items?.length).indexOf(g);
        return h('section.card.examday-band', h('div.row.between', h('b', g.when || 'Sınav günü'), h('a.small', { href: '#/dersler/arac/gun' }, 'Tüm liste ›')),
          h('ul.checklist.compact', g.items.slice(0, 5).map((x, ii) => {
            const k = gi + ':' + ii, on = !!edDone[k], txt = typeof x === 'string' ? x : x?.text || x?.label || '';
            return h('li' + (on ? '.done' : ''), h('button.check', { type: 'button', role: 'checkbox', 'aria-checked': String(on), 'aria-label': txt,
              onclick: () => { store.patch('progress', 'examday', { done: { ...edDone, [k]: !on } }); draw(); } }, on ? '✓' : ''), h('span.grow', txt));
          })));
      }),
      ...(w.prog.notes || []).filter(n => n.date === today).map(n => h('div.banner', `${fmtDate(n.date)}: ${n.text}`)),
      weekdayHint() ? h('div.note', w.weekend || weekdayHint()) : null,
      ...exOpen.map(p => {
        const n = Object.keys(p.answers || {}).length;
        if (p.kisa) return h('a.banner.resume.exam-resume.kisa-resume', { href: '#/deneme/sinav/' + encodeURIComponent(p.examId) },
          `Yarım kaldı: Kısa deneme · ${KISA[p.kisa]?.label || ''} (${KISA[p.kisa]?.n || '?'} soru) · ${n} cevap → Devam`);
        const e = pack?.exams?.find(x => x.id === p.examId);
        return h('a.banner.resume.exam-resume', { href: '#/cikmis/sinav/' + encodeURIComponent(p.examId) + (p.half ? '/yarim' : '') }, `Yarım kaldı: ${e?.title || p.examId}${p.half ? ' (ilk 40)' : ''} · ${n} cevap → Devam`);
      }),
      ...open.map(o => h('a.banner.resume', { href: o.route }, `Yarım kaldı: ${o.name || 'Oturum'} · ${Math.min((o.i || 0) + 1, o.total || 1)}/${o.total || '?'} → Devam`)),
      h('div.row.between',
        h('h2', 'Bugün', totalMin ? h('span.small.muted', ` · ${totalMin} dk`) : null),
        h('button.btn' + (rr.busy ? '.primary' : ''), {
          onclick: () => { updateDay({ busy: !rr.busy }); draw(); }
        }, rr.busy ? 'Yoğun gün: açık' : 'Yoğun gün')
      ),
      rr.busy ? h('p.small.muted', 'Kart tekrarı + 3 gramer. Seri bozulmaz.') : null,
      optT.length ? h('p.small.muted.mockday-note', 'Deneme günü: kart tekrarı + deneme yeter.') : null,
      h('ul.tasks', mainT.map(taskLi)),
      optT.length ? h('details.optional-tasks', h('summary', h('b', 'İsteğe bağlı'), h('span.small.muted', ` · ${optT.length} görev`)), h('ul.tasks', optT.map(taskLi))) : null,
      (rr.reviews || rr.answered || rr.focusMin) ? h('p.small.muted.daysum', `Bugün: ${rr.reviews || 0} kart · ${rr.correct || 0}/${rr.answered || 0} soru doğru · ${Math.round((rr.readSec || 0) / 60)} dk okuma${rr.focusMin ? ` · ${rr.focusMin} dk odak` : ''}`) : null,
      rTasks.length ? h('ul.tasks.extra.rule-tasks', rTasks.map(t => h('li', { 'data-rule': t.topic },
        h('span.check.ghost', { 'aria-hidden': 'true' }, '!'),
        h('a.task', { href: '#/dersler/arac/kural/' + encodeURIComponent(t.topic) }, h('b', 'Kural kartı: ' + topicName(t.topic)), h('span.small.muted', 'bu hafta zorlandığın kural · 1 dk')),
        h('span.small.muted.tmin', '~1 dk'), h('span.chev', '›')))) : null,
      tour ? h('ul.tasks.extra', h('li' + (rr.tasks?.hafiza ? '.done' : ''),
        h('button.check', { 'aria-label': 'tamamlandı', onclick: () => { tick('hafiza', !rr.tasks?.hafiza); draw(); } }, rr.tasks?.hafiza ? '✓' : ''),
        h('a.task', { href: '#/kartlar/hafiza' }, h('b', 'Hafıza turu'), h('span.small.muted', `${tour} kelime · seçmeli`)),
        h('span.small.muted', '3–5 dk'), h('span.chev', '›'))) : null,
      running() ? null : h('button.card.link.focus-start', { onclick: () => { startFocus('', 'Serbest'); draw(); } },
        h('b', `Odak oturumu · ${work} dk`), h('span.small.muted', ` çalış, ${brk} dk ayağa kalk`)),
      !rr.busy && !fin.on ? h('a.card.link', { href: '#/kartlar/tara' }, h('b', 'Kelime tara'), h('span.small.muted', ' bildiklerini 20\'şer ele')) : null,
      fin.on && !rr.busy ? h('a.card.link', { href: '#/okuma' }, h('b', 'Okuma'), h('span.small.muted', ' isteğe bağlı · bir parça')) : null,
      w.phase !== 'Temel' && !rr.busy ? h('a.card.link', { href: '#/alistirma' }, h('b', 'Soru tipi alıştırması'), h('span.small.muted', ' ' + ((w.drills || []).map(typeName).join(' · ') || 'karışık'))) : null,
      w.mock && !T.deneme ? h('a.card.link.mock-plan', { href: mockHref(w.mock) },
        h('b', w.mock.kind === 'tam' ? 'Bu hafta tam deneme (180 dk)' : `Bu hafta yarım deneme (${w.mock.n || 40} soru · 90 dk)`),
        h('span.small.muted', ' ' + [w.mock.day, w.mock.title].filter(Boolean).join(' · '))) : null,
      w.kisa && KISA[w.kisa.size] && !T.kisa ? h('a.card.link.kisa-plan', { href: '#/deneme' },
        h('b', `Bu hafta kısa deneme (${KISA[w.kisa.size].n} soru · ${KISA[w.kisa.size].min} dk)`), h('span.small.muted', ' ' + (w.kisa.day || 'Paz') + ' · özgün sorular')) : null,
      h('a.card.link', { href: '#/eksikler' }, h('b', 'Eksiklerim'), h('span.small.muted', ' doğruluk, ısı haritası, deneme')),
      h('div.small.muted.center.pad', `Sınav: ${fmtDate(w.prog.exam)} · Puan ≈ doğru × 1,25`)
    );
  };
  await draw();
}
