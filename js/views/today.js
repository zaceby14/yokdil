// Bugün: geri sayım, hafta/faz, görevler, yoğun gün, seri
import * as store from '../store.js';
import { h, dayKey, fmtDate, diffDays } from '../util.js';
import { week, daysToExam, dayRec, tick, updateDay, taskList, streak, weekdayHint, newLimit } from '../plan.js';
import { dueCount } from '../srs.js';
import { dueMistakes } from '../mistakes.js';

export default async function render(root) {
  const today = dayKey();
  const w = await week();
  const left = await daysToExam();
  const draw = async () => {
    const r = dayRec();
    const due = dueCount();
    const errs = dueMistakes().length;
    const nl = r.busy ? 0 : await newLimit();
    const gN = r.busy ? 3 : store.settings().grammarCount;
    if (!due && (r.reviews || 0) >= 0 && !r.tasks?.kart && store.all('cards').some(c => c.state && c.state !== 'new')) tick('kart');
    const rr = dayRec();
    const T = {
      kart: { label: 'Kart tekrarı', sub: due ? `${due} kart` : 'Bekleyen yok', go: '#/kartlar' },
      gramer: { label: 'Gramer', sub: `${gN} soru${errs ? ` + ${errs} hata` : ''}`, go: '#/gramer/gunluk' },
      okuma: { label: 'Okuma', sub: '20 dk + bilinmeyen kelime', go: '#/okuma' },
      yeni: { label: 'Yeni kelime', sub: `${Math.max(0, nl - (rr.newDone || 0))} / ${nl}`, go: '#/kartlar/yeni' }
    };
    const tpl = w.prog.daily?.[rr.busy ? 'busy' : 'normal'] || [];
    const mins = taskList(rr.busy).map((k, i) => tpl[i]?.min);
    const totalMin = mins.reduce((a, b) => a + (b || 0), 0);
    const apply = w.prog.apply || [];
    const toApply = apply[0] ? diffDays(today, apply[0]) : 99;
    const applyOn = apply[1] && toApply <= 7 && today <= apply[1];
    root.innerHTML = '';
    root.append(
      h('div.hero',
        h('div', h('div.big', left > 0 ? left : 0), h('div.small', 'gün kaldı')),
        h('div.hero-r',
          h('div', w.beforeStart ? `Başlangıç: ${fmtDate(w.prog.start)}` : `Hafta ${w.n} · ${w.phase}`),
          w.goal ? h('div.small.muted', w.goal) : null,
          h('div.streak', 'Seri: ', h('b', streak()), ' gün'))
      ),
      applyOn ? h('a.banner', { href: 'https://ais.osym.gov.tr', target: '_blank', rel: 'noopener' }, `Başvuru: ${fmtDate(apply[0])}–${fmtDate(apply[1])} · ÖSYM AİS`) : null,
      ...(w.prog.notes || []).filter(n => n.date === today).map(n => h('div.banner', `${fmtDate(n.date)}: ${n.text}`)),
      weekdayHint() ? h('div.note', w.weekend || weekdayHint()) : null,
      h('div.row.between',
        h('h2', 'Bugün', totalMin ? h('span.small.muted', ` · ${totalMin} dk`) : null),
        h('button.btn' + (rr.busy ? '.primary' : ''), {
          onclick: () => { updateDay({ busy: !rr.busy }); draw(); }
        }, rr.busy ? 'Yoğun gün: açık' : 'Yoğun gün')
      ),
      rr.busy ? h('p.small.muted', 'Kart tekrarı + 3 gramer. Seri bozulmaz.') : null,
      h('ul.tasks', taskList(rr.busy).map((k, ti) => {
        const done = !!rr.tasks?.[k];
        return h('li' + (done ? '.done' : ''),
          h('button.check', { 'aria-label': 'tamamlandı', onclick: () => { tick(k, !done); draw(); } }, done ? '✓' : ''),
          h('a.task', { href: T[k].go }, h('b', T[k].label), h('span.small.muted', T[k].sub)),
          mins[ti] ? h('span.small.muted', mins[ti] + ' dk') : null, h('span.chev', '›'));
      })),
      w.phase !== 'Temel' && !rr.busy ? h('a.card.link', { href: '#/alistirma' }, h('b', 'Soru tipi alıştırması'), h('span.small.muted', ' ' + ((w.drills || []).join(', ') || 'karışık'))) : null,
      w.phase === 'Deneme' ? h('a.card.link', { href: '#/cikmis' },
        h('b', 'Tam deneme (180 dk)'), h('span.small.muted', ' Çıkmış sorular')) : null,
      h('div.small.muted.center.pad', `Sınav: ${fmtDate(w.prog.exam)} · Puan ≈ doğru × 1,25`)
    );
  };
  await draw();
}
