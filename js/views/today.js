// Bugün: geri sayım, hafta/faz, görevler, yoğun gün, seri
import * as store from '../store.js';
import { h, dayKey, fmtDate, diffDays, addDays } from '../util.js';
import { isStudied } from '../vocab.js';
import { week, daysToExam, dayRec, tick, updateDay, streakInfo, weekdayHint } from '../plan.js';
import { dueCount } from '../srs.js';
import { openSessions } from '../quiz.js';
import { tourCards } from '../memory.js';
import { todayTasks } from '../tasks.js';
import { getPack } from '../pack.js';
import { startFocus, running, lens } from '../focus.js';
import { getToken } from '../sync.js';

export default async function render(root) {
  const today = dayKey();
  const w = await week();
  const left = await daysToExam();
  const draw = async () => {
    const r = dayRec();
    const due = dueCount();
    if (!due && !r.tasks?.kart && store.all('cards').some(isStudied)) tick('kart');
    const tasks = await todayTasks();
    const rr = dayRec();
    const T = Object.fromEntries(tasks.map(t => [t.key, t]));
    const totalMin = tasks.filter(t => !t.done).reduce((a, t) => a + (t.min || 0), 0);
    const st = streakInfo();
    // Yarım kalan deneme (çıkmış)
    const exOpen = store.all('progress').filter(p => p.id?.startsWith('exam:') && p.startedAt && !p.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 1);
    const pack = exOpen.length ? await getPack().catch(() => null) : null;
    const apply = w.prog.apply || [];
    const toApply = apply[0] ? diffDays(today, apply[0]) : 99;
    const applyOn = apply[1] && toApply <= 7 && today <= apply[1];
    // Faz geçişi: yeni fazın ilk 3 günü kısa bildirim
    const prevW = (w.prog.weeks || []).find(x => x.n === w.n - 1);
    const phaseNew = !w.beforeStart && prevW && prevW.phase !== w.phase && diffDays(addDays(w.prog.start, (w.n - 1) * 7), today) < 3;
    const tour = rr.busy ? 0 : tourCards().length;
    const open = openSessions().slice(0, 2);
    const { work, brk } = lens();
    const focusBtn = k => h('button.btn.play', { 'aria-label': 'odakla başla', title: `${work} dk odak`, onclick: () => { startFocus(k, T[k]?.label || ''); location.hash = T[k]?.go || '#/bugun'; draw(); } }, '▶');
    root.innerHTML = '';
    root.append(
      h('div.hero',
        h('div', h('div.big', left > 0 ? left : 0), h('div.small', 'gün kaldı')),
        h('div.hero-r',
          h('div', w.beforeStart ? `Başlangıç: ${fmtDate(w.prog.start)}` : `Hafta ${w.n} · ${w.phase}`),
          w.goal ? h('div.small.muted', w.goal) : null,
          h('div.streak', 'Seri: ', h('b', st.n), ' gün', st.frozen.length ? h('span.small.muted', ' · joker kullanıldı') : null))
      ),
      !getToken() ? h('a.banner', { href: '#/ayarlar' }, 'Çıkmış sorular + senkron için GitHub anahtarını gir → Ayarlar') : null,
      phaseNew ? h('div.banner.phase', `Yeni faz: ${w.phase} · günde ${w.newWords ?? '-'} yeni kelime`) : null,
      applyOn ? h('a.banner', { href: 'https://ais.osym.gov.tr', target: '_blank', rel: 'noopener' }, `Başvuru: ${fmtDate(apply[0])}–${fmtDate(apply[1])} · ÖSYM AİS`) : null,
      ...(w.prog.notes || []).filter(n => n.date === today).map(n => h('div.banner', `${fmtDate(n.date)}: ${n.text}`)),
      weekdayHint() ? h('div.note', w.weekend || weekdayHint()) : null,
      ...exOpen.map(p => {
        const e = pack?.exams?.find(x => x.id === p.examId);
        const n = Object.keys(p.answers || {}).length;
        return h('a.banner.resume.exam-resume', { href: '#/cikmis/sinav/' + encodeURIComponent(p.examId) }, `Yarım kaldı: ${e?.title || p.examId} · ${n} cevap → Devam`);
      }),
      ...open.map(o => h('a.banner.resume', { href: o.route }, `Yarım kaldı: ${o.name || 'Oturum'} · ${Math.min((o.i || 0) + 1, o.total || 1)}/${o.total || '?'} → Devam`)),
      h('div.row.between',
        h('h2', 'Bugün', totalMin ? h('span.small.muted', ` · ${totalMin} dk`) : null),
        h('button.btn' + (rr.busy ? '.primary' : ''), {
          onclick: () => { updateDay({ busy: !rr.busy }); draw(); }
        }, rr.busy ? 'Yoğun gün: açık' : 'Yoğun gün')
      ),
      rr.busy ? h('p.small.muted', 'Kart tekrarı + 3 gramer. Seri bozulmaz.') : null,
      h('ul.tasks', tasks.map(t => {
        const k = t.key, done = t.done;
        return h('li' + (done ? '.done' : ''), { 'data-task': k },
          h('button.check', { 'aria-label': 'tamamlandı', onclick: () => { tick(k, !done); draw(); } }, done ? '✓' : ''),
          h('a.task', { href: t.go }, h('b', t.label), h('span.small.muted', t.sub)),
          t.min ? h('span.small.muted.tmin', '~' + t.min + ' dk') : null, done ? h('span.chev', '›') : focusBtn(k));
      })),
      (rr.reviews || rr.answered || rr.focusMin) ? h('p.small.muted.daysum', `Bugün: ${rr.reviews || 0} kart · ${rr.correct || 0}/${rr.answered || 0} soru doğru · ${Math.round((rr.readSec || 0) / 60)} dk okuma${rr.focusMin ? ` · ${rr.focusMin} dk odak` : ''}`) : null,
      tour ? h('ul.tasks.extra', h('li' + (rr.tasks?.hafiza ? '.done' : ''),
        h('button.check', { 'aria-label': 'tamamlandı', onclick: () => { tick('hafiza', !rr.tasks?.hafiza); draw(); } }, rr.tasks?.hafiza ? '✓' : ''),
        h('a.task', { href: '#/kartlar/hafiza' }, h('b', 'Hafıza turu'), h('span.small.muted', `${tour} kelime · seçmeli`)),
        h('span.small.muted', '3–5 dk'), h('span.chev', '›'))) : null,
      running() ? null : h('button.card.link.focus-start', { onclick: () => { startFocus('', 'Serbest'); draw(); } },
        h('b', `Odak oturumu · ${work} dk`), h('span.small.muted', ` çalış, ${brk} dk ayağa kalk`)),
      !rr.busy ? h('a.card.link', { href: '#/kartlar/tara' }, h('b', 'Kelime tara'), h('span.small.muted', ' bildiklerini 20\'şer ele')) : null,
      w.phase !== 'Temel' && !rr.busy ? h('a.card.link', { href: '#/alistirma' }, h('b', 'Soru tipi alıştırması'), h('span.small.muted', ' ' + ((w.drills || []).join(', ') || 'karışık'))) : null,
      w.mock ? h('a.card.link.mock-plan', { href: w.mock.exam ? '#/cikmis/sinav/' + encodeURIComponent(w.mock.exam) : '#/cikmis' },
        h('b', w.mock.kind === 'tam' ? 'Bu hafta tam deneme (180 dk)' : `Bu hafta yarım deneme (${w.mock.n || 40} soru)`),
        h('span.small.muted', ' ' + [w.mock.day, w.mock.title].filter(Boolean).join(' · '))) : null,
      h('a.card.link', { href: '#/eksikler' }, h('b', 'Eksiklerim'), h('span.small.muted', ' doğruluk, ısı haritası, deneme')),
      h('div.small.muted.center.pad', `Sınav: ${fmtDate(w.prog.exam)} · Puan ≈ doğru × 1,25`)
    );
  };
  await draw();
}
