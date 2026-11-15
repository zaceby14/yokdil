// Ayarlar: senkron, tema, ters kart, yeni limit, dışa/içe aktar, sıfırla
import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, toast, fmtTime, dayKey } from '../util.js';
import { applyTheme } from '../theme.js';
import { usedSample } from '../data.js';
import { week } from '../plan.js';

export default async function render(root) {
  const s = store.settings();
  const w = await week();

  // Senkron
  const tok = h('input', { type: 'password', placeholder: 'ghp_…', value: sync.getToken(), autocomplete: 'off' });
  const stat = h('div.small');
  const drawStat = st => {
    const t = st.at ? 'Son senkron: ' + fmtTime(st.at) : 'Henüz senkron yok';
    stat.textContent = { off: 'Kapalı (token yok) — uygulama yine tam çalışır.', syncing: 'Senkronlanıyor…', pending: 'Gönderilecek… · ' + t, error: 'Hata: ' + st.msg + ' · ' + t }[st.state] || t;
    stat.className = 'small ' + (st.state === 'error' ? 'bad-t' : 'muted');
  };
  drawStat(sync.status);
  const off = sync.onStatus(drawStat);

  const seg = (opts, cur, on) => h('div.seg', opts.map(([v, l]) => h('button' + (cur === v ? '.active' : ''), { onclick: () => on(v) }, l)));
  const limit = h('input.num', { type: 'number', min: 0, max: 60, placeholder: String(w.newWords ?? 15), value: s.newLimit ?? '' });
  limit.onchange = () => { store.setSetting('newLimit', limit.value === '' ? null : Math.max(0, +limit.value)); toast('Kaydedildi'); };
  const gc = h('input.num', { type: 'number', min: 3, max: 20, value: s.grammarCount });
  gc.onchange = () => { store.setSetting('grammarCount', Math.min(20, Math.max(3, +gc.value || 8))); toast('Kaydedildi'); };

  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden' });
  file.onchange = async () => {
    try {
      const j = JSON.parse(await file.files[0].text());
      store.mergeIn(j.data || j);
      toast('İçe aktarıldı'); sync.schedule(); location.reload();
    } catch { toast('Dosya okunamadı'); }
  };

  root.append(
    h('h2', 'Ayarlar'),
    h('section.card',
      h('h3', 'Senkron (GitHub Gist)'),
      h('p.small', '1) ', h('a', { href: 'https://github.com/settings/tokens/new?scopes=gist&description=yokdil', target: '_blank', rel: 'noopener' }, 'Token oluştur'), ' (sadece gist) → 2) buraya yapıştır → Kaydet.'),
      tok,
      h('div.row',
        h('button.btn.primary.grow', { onclick: () => { sync.setToken(tok.value); if (tok.value.trim()) sync.syncNow(); toast('Kaydedildi'); } }, 'Kaydet'),
        h('button.btn', { onclick: () => sync.syncNow() }, 'Şimdi senkronla'),
        sync.getToken() ? h('button.btn', { onclick: () => { sync.setToken(''); tok.value = ''; } }, 'Kapat') : null),
      stat,
      h('p.small.muted', 'Token yalnızca bu cihazda saklanır. Her cihaza bir kez gir.')
    ),
    h('section.card',
      h('h3', 'Görünüm'),
      h('div.field', h('span', 'Tema'), seg([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']], s.theme, v => { store.setSetting('theme', v); applyTheme(); render2(); })),
      h('label.switch', h('input', { type: 'checkbox', checked: s.reverse, onchange: e => store.setSetting('reverse', e.target.checked) }), h('span', 'Ters kart (Tr → İng)'))
    ),
    h('section.card',
      h('h3', 'Çalışma'),
      h('div.field', h('span', 'Günlük yeni kelime'), limit), h('p.small.muted', `Boş = programdan (${w.newWords ?? 15}).`),
      h('div.field', h('span', 'Günlük gramer sorusu'), gc),
      h('label.switch', h('input', { type: 'checkbox', checked: !!s.showDialog, onchange: e => store.setSetting('showDialog', e.target.checked) }), h('span', 'Diyalog sorularını göster (YDS)'))
    ),
    h('section.card',
      h('h3', 'Veri'),
      h('div.row',
        h('button.btn.grow', { onclick: exportJSON }, 'Dışa aktar'),
        h('button.btn.grow', { onclick: () => file.click() }, 'İçe aktar'), file),
      h('button.btn.danger.wide', {
        onclick: () => {
          if (!confirm('Bu cihazdaki tüm veriler silinsin mi?')) return;
          store.resetAll(); toast('Sıfırlandı'); setTimeout(() => location.reload(), 400);
        }
      }, 'Sıfırla'),
      h('p.small.muted', 'Senkron açıksa veriler gist\'ten geri gelir.'),
      usedSample.size ? h('p.small.bad-t', 'Örnek veri kullanılıyor: ' + [...usedSample].join(', ')) : null
    )
  );
  function render2() { off(); root.innerHTML = ''; render(root); }
  return off;
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ v: 1, exportedAt: Date.now(), data: store.snapshot() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `yokdil-yedek-${dayKey()}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
