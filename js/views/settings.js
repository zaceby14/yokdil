// Ayarlar: senkron, tema, ters kart, yeni limit, dışa/içe aktar, sıfırla
import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, toast, fmtTime, dayKey } from '../util.js';
import { applyTheme } from '../theme.js';
import { usedSample } from '../data.js';
import { week } from '../plan.js';
import { fetchPrivate, meta as pmeta, status as pstat } from '../private.js';
import { loadStars, hasStars } from '../stars.js';

const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist,repo&description=yokdil';

export default async function render(root) {
  const s = store.settings();
  const w = await week();
  await loadStars();

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

  const pinfo = h('div.small');
  const drawP = () => {
    const m = pmeta();
    pinfo.className = 'small ' + (pstat.state === 'error' ? 'bad-t' : 'muted');
    pinfo.textContent = pstat.state === 'loading' ? 'Sorular indiriliyor…' : pstat.state === 'error' ? 'Sorular: ' + pstat.msg
      : m.at ? `Sorular: ${m.n ?? '?'} sınav${m.nr ? ` · ${m.nr} okuma` : ''} · ${fmtTime(m.at)}` : (sync.getToken() ? 'Sorular henüz indirilmedi' : 'Gizli sorular için anahtar gir');
  };
  drawP();
  const offP = (await import('../private.js')).onStatus(drawP);
  const seg = (opts, cur, on) => h('div.seg', opts.map(([v, l]) => h('button' + (cur === v ? '.active' : ''), { onclick: () => on(v) }, l)));
  const limit = h('input.num', { type: 'number', min: 0, max: 60, placeholder: String(w.newWords ?? 15), value: s.newLimit ?? '' });
  limit.onchange = () => { store.setSetting('newLimit', limit.value === '' ? null : Math.max(0, +limit.value)); toast('Kaydedildi'); };
  const goal = h('input.num', { type: 'number', min: 100, max: 10000, step: 100, value: s.vocabGoal || 2000 });
  goal.onchange = () => { store.setSetting('vocabGoal', Math.max(100, +goal.value || 2000)); toast('Kaydedildi'); };
  const gc = h('input.num', { type: 'number', min: 3, max: 20, value: s.grammarCount });
  gc.onchange = () => { store.setSetting('grammarCount', Math.min(20, Math.max(3, +gc.value || 8))); toast('Kaydedildi'); };

  const tgt = h('input.num', { type: 'number', min: 40, max: 100, step: 5, placeholder: '70', value: s.targetScore ?? '', 'aria-label': 'Hedef puan' });
  tgt.onchange = () => { store.setSetting('targetScore', tgt.value === '' ? null : Math.min(100, Math.max(40, +tgt.value))); toast('Kaydedildi'); };
  const rg = h('input.num', { type: 'number', min: 60, max: 300, step: 10, value: s.readGoal || 120, 'aria-label': 'Okuma hızı hedefi' });
  rg.onchange = () => { store.setSetting('readGoal', Math.min(300, Math.max(60, +rg.value || 120))); toast('Kaydedildi'); };
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
      h('h3', 'GitHub anahtarı'),
      h('p.small', 'Tek anahtar iki iş görür: senkron + gizli sorular.'),
      h('ol.small.steps', h('li', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'Anahtar oluştur'), ' (classic; "gist" + "repo" işaretli gelir)'),
        h('li', 'Buraya yapıştır → Kaydet')),
      tok,
      h('div.row',
        h('button.btn.primary.grow', { onclick: () => { sync.setToken(tok.value); if (tok.value.trim()) { sync.syncNow(); fetchPrivate({ force: true }).then(drawP); } toast('Kaydedildi'); } }, 'Kaydet'),
        h('button.btn', { onclick: () => sync.syncNow() }, 'Şimdi senkronla'),
        sync.getToken() ? h('button.btn', { onclick: () => { sync.setToken(''); tok.value = ''; } }, 'Kapat') : null),
      stat,
      h('div.row.between', pinfo, sync.getToken() ? h('button.btn.small', { onclick: async e => { e.currentTarget.disabled = true; const r = await fetchPrivate({ force: true }); toast(r.error ? 'Hata: ' + r.error : r.changed ? 'Sorular güncellendi' : 'Sorular güncel'); drawP(); e.target.disabled = false; } }, 'Soruları güncelle') : null),
      h('p.small.muted', 'Anahtar yalnızca bu cihazda saklanır. Soru metinleri senkrona girmez.')
    ),
    h('section.card',
      h('h3', 'Görünüm'),
      h('div.field', h('span', 'Tema'), seg([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']], s.theme, v => { store.setSetting('theme', v); applyTheme(); render2(); })),
      h('label.switch', h('input', { type: 'checkbox', checked: s.reverse, onchange: e => store.setSetting('reverse', e.target.checked) }), h('span', 'Ters kart (Tr → İng)'))
    ),
    h('section.card',
      h('h3', 'Çalışma'),
      h('div.field', h('span', 'Günlük yeni kelime'), limit), h('p.small.muted', `Boş = programdan (${w.newWords ?? 15}).`),
      hasStars() ? h('label.switch', h('input', { type: 'checkbox', name: 'starFirst', checked: !!s.starFirst, onchange: e => store.setSetting('starFirst', e.target.checked) }), h('span', 'Yeni kelimelerde çok çıkanları öne al')) : null,
      h('div.field', h('span', 'Günlük gramer sorusu'), gc),
      h('label.switch', h('input', { type: 'checkbox', checked: s.autoAdd !== false, onchange: e => store.setSetting('autoAdd', e.target.checked) }), h('span', 'Yanlış cevaptaki kelimeyi karta ekle')),
      h('label.switch', h('input', { type: 'checkbox', checked: s.readHl !== false, onchange: e => store.setSetting('readHl', e.target.checked) }), h('span', 'Okumada bilmediğin kelimeleri işaretle')),
      h('div.field', h('span', 'Kelime hedefi'), goal),
      h('div.field', h('span', 'Hedef puan'), tgt), h('p.small.muted', h('a', { href: '#/dersler/arac/net' }, 'Hedef net tablosu ›')),
      h('div.field', h('span', 'Okuma hızı hedefi (kelime/dk)'), rg),
      h('label.switch', h('input', { type: 'checkbox', checked: s.secClock !== false, onchange: e => store.setSetting('secClock', e.target.checked) }), h('span', 'Denemede bölüm süresi göstergesi')),
      h('label.switch', h('input', { type: 'checkbox', checked: s.finalMode !== false, onchange: e => store.setSetting('finalMode', e.target.checked) }), h('span', 'Son 14 gün modu (yeni kelime azalır)')),
      h('label.switch', h('input', { type: 'checkbox', checked: !!s.showDialog, onchange: e => store.setSetting('showDialog', e.target.checked) }), h('span', 'Diyalog sorularını göster (YDS)')),
      h('label.switch', h('input', { type: 'checkbox', checked: s.activeRead !== false, onchange: e => store.setSetting('activeRead', e.target.checked) }), h('span', 'Okumada "ana fikir" kutuları'))
    ),
    h('section.card',
      h('h3', 'Odak'),
      h('div.field', h('span', 'Çalışma (dk)'), num('focusWork', 25, 5, 90)),
      h('div.field', h('span', 'Mola (dk)'), num('focusBreak', 5, 1, 30)),
      h('label.switch', h('input', { type: 'checkbox', checked: s.eveTip !== false, onchange: e => store.setSetting('eveTip', e.target.checked) }), h('span', 'Akşam (17:00 sonrası) uyku ipucu'))
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
  function render2() { off(); offP(); root.innerHTML = ''; render(root); }
  function num(k, def, min, max) {
    const i = h('input.num', { type: 'number', min, max, value: s[k] || def });
    i.onchange = () => { store.setSetting(k, Math.min(max, Math.max(min, +i.value || def))); toast('Kaydedildi'); };
    return i;
  }
  return () => { off(); offP(); };
}

function exportJSON() {
  const blob = new Blob([JSON.stringify({ v: 1, exportedAt: Date.now(), data: store.snapshot() }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `yokdil-yedek-${dayKey()}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
