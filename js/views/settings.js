// Ayarlar: Temel (anahtar, hedef puan, tema, günlük yeni kelime) + Gelişmiş ▸ (gerisi)
import * as store from '../store.js';
import * as sync from '../sync.js';
import { h, toast, fmtTime, dayKey } from '../util.js';
import { applyTheme } from '../theme.js';
import { usedSample } from '../data.js';
import { week } from '../plan.js';
import { REVIEW_CAP } from '../srs.js';
import { progVocab } from '../strategy.js';
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
    stat.textContent = { off: 'Senkron kapalı (anahtar yok). Uygulama yine tam çalışır.', syncing: 'Senkronlanıyor…', pending: 'Gönderilecek… · ' + t, error: 'Senkron yapılamadı: ' + st.msg + ' · ' + t }[st.state] || t;
    stat.className = 'small ' + (st.state === 'error' ? 'bad-t' : 'muted');
  };
  drawStat(sync.status);
  const off = sync.onStatus(drawStat);

  const pinfo = h('div.small');
  const drawP = () => {
    const m = pmeta();
    pinfo.className = 'small ' + (pstat.state === 'error' ? 'bad-t' : 'muted');
    pinfo.textContent = pstat.state === 'loading' ? 'Sorular indiriliyor…' : pstat.state === 'error' ? 'Sorular: ' + pstat.msg
      : m.at ? `Sorular: ${m.n ?? '?'} sınav${m.nr ? ` · ${m.nr} okuma` : ''} · ${fmtTime(m.at)}` : (sync.getToken() ? 'Sorular henüz indirilmedi' : 'Çıkmış sorular: yukarıdaki aynı anahtarla iner');
  };
  drawP();
  const offP = (await import('../private.js')).onStatus(drawP);
  const seg = (opts, cur, on) => h('div.seg', opts.map(([v, l]) => h('button' + (cur === v ? '.active' : ''), { onclick: () => on(v) }, l)));
  const limit = h('input.num', { type: 'number', min: 0, max: 60, placeholder: String(w.newWords ?? 15), value: s.newLimit ?? '' });
  limit.onchange = () => { store.setSetting('newLimit', limit.value === '' ? null : Math.max(0, +limit.value)); toast('Kaydedildi'); };
  const goal = h('input.num', { type: 'number', min: 100, max: 10000, step: 100, value: s.vocabGoal || progVocab(w.prog) });
  goal.onchange = () => { store.setSetting('vocabGoal', Math.max(100, +goal.value || progVocab(w.prog))); toast('Kaydedildi'); };
  const cap = h('input.num', { type: 'number', min: 20, max: 300, step: 10, value: s.reviewCap || REVIEW_CAP, 'aria-label': 'Günlük kart tekrarı tavanı' });
  cap.onchange = () => { store.setSetting('reviewCap', Math.min(300, Math.max(20, +cap.value || REVIEW_CAP))); toast('Kaydedildi'); };
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

  const sw = (key, label, on, name) => h('label.switch', h('input', { type: 'checkbox', name: name || key, checked: on, onchange: e => store.setSetting(key, e.target.checked) }), h('span', label));
  // Temel: anahtar, hedef puan, tema, günlük yeni kelime. Gerisi "Gelişmiş ▸" altında (kapalı)
  root.append(
    h('h2', 'Ayarlar'),
    h('p.small.muted.screen-why', 'Çoğu kişi yalnız üstteki 4 ayarı kullanır.'),
    h('section.card.set-key',
      h('h3', 'GitHub anahtarı'),
      h('p.small', 'Tek anahtar: cihazlar arası senkron + çıkmış sorular.'),
      h('ol.small.steps', h('li', h('a', { href: TOKEN_URL, target: '_blank', rel: 'noopener' }, 'Anahtar oluştur'), ' ("gist" ve "repo" kutuları işaretli gelir)'),
        h('li', 'Buraya yapıştır → Kaydet')),
      tok,
      h('div.row',
        h('button.btn.primary.grow', { onclick: () => { sync.setToken(tok.value); if (tok.value.trim()) { sync.syncNow(); fetchPrivate({ force: true }).then(drawP); } toast('Kaydedildi'); } }, 'Kaydet'),
        h('button.btn', { onclick: () => sync.syncNow() }, 'Şimdi senkronla'),
        sync.getToken() ? h('button.btn', { onclick: () => { sync.setToken(''); tok.value = ''; } }, 'Kapat') : null),
      stat,
      h('div.row.between', pinfo, sync.getToken() ? h('button.btn.small', { onclick: async e => { e.currentTarget.disabled = true; const r = await fetchPrivate({ force: true }); toast(r.error ? 'Hata: ' + r.error : r.changed ? 'Sorular güncellendi' : 'Sorular güncel'); drawP(); e.target.disabled = false; } }, 'Soruları güncelle') : null),
      h('p.small.muted', 'Anahtar yalnız bu cihazda kalır. Soru metinleri senkrona girmez.')
    ),
    h('section.card.set-basic',
      h('h3', 'Temel'),
      h('div.field', h('span', 'Hedef puan'), tgt), h('p.small.muted', 'Deneme grafiğindeki çizgi. ', h('a', { href: '#/dersler/arac/net' }, 'Kaç doğru gerekir? ›')),
      h('div.field', h('span', 'Tema'), seg([['system', 'Otomatik'], ['light', 'Açık'], ['dark', 'Koyu']], s.theme, v => { store.setSetting('theme', v); applyTheme(); render2(); })),
      h('div.field', h('span', 'Günde yeni kelime'), limit), h('p.small.muted', `Boş bırakırsan programdaki sayı (${w.newWords ?? 15}).`)
    ),
    h('details.card.set-adv',
      h('summary', h('b', 'Gelişmiş ▸'), h('span.small.muted', ' kelime, soru, okuma, deneme, odak, yedek')),
      h('h3', 'Kelime'),
      sw('reverse', 'Kartı bazen Türkçeden sor (Tr → İng)', !!s.reverse),
      hasStars() ? sw('starFirst', 'Yeni kelimelerde sınavda çok çıkanlar önce', !!s.starFirst) : null,
      sw('autoAdd', 'Yanlış cevaptaki kelimeyi karta ekle', s.autoAdd !== false),
      h('div.field', h('span', 'Kelime hedefi (sınava kadar)'), goal),
      h('h3', 'Sorular'),
      h('div.field', h('span', 'Günlük gramer sorusu'), gc),
      sw('warmup', 'Sorulardan önce zayıf konunun kural kartı', s.warmup !== false),
      sw('adapt', 'Anlık uyum: yanlışta pekiştirme sorusu, 3 doğruda daha zor soru', s.adapt !== false),
      h('div.field', h('span', 'Günlük kart tekrarı tavanı'), cap), h('p.small.muted', `Fazlası sonraki günlere yayılır (varsayılan ${REVIEW_CAP}).`),
      sw('showDialog', 'Diyalog sorularını da göster (YDS\'de var, YÖKDİL\'de yok)', !!s.showDialog),
      h('h3', 'Okuma'),
      sw('readHl', 'Bilmediğin kelimelerin altını çiz', s.readHl !== false),
      sw('activeRead', 'Paragraf sonunda "+ Ana fikir yaz" düğmesi', s.activeRead !== false),
      h('div.field', h('span', 'Okuma hızı hedefi (kelime/dk)'), rg),
      h('h3', 'Deneme'),
      sw('secClock', 'Denemede "Bu bölüm: x/y dk" göstergesi', s.secClock !== false),
      sw('kisaGizli', 'Kısa denemede okumaya kaynaklarımdan parça kat', !!s.kisaGizli),
      sw('finalMode', 'Son 14 günde yeni kelimeyi azalt', s.finalMode !== false),
      h('h3', 'Odak'),
      h('div.field', h('span', 'Çalışma (dk)'), num('focusWork', 25, 5, 90)),
      h('div.field', h('span', 'Mola (dk)'), num('focusBreak', 5, 1, 30)),
      sw('focusOnTask', 'Bugün\'deki ▶ ile odak sayacı başlasın', s.focusOnTask === true),
      sw('eveTip', 'Akşam (17:00 sonrası) kısa mola hatırlatması', s.eveTip !== false),
      h('h3', 'Yedek'),
      h('div.row',
        h('button.btn.grow', { onclick: exportJSON }, 'Yedeği indir'),
        h('button.btn.grow', { onclick: () => file.click() }, 'Yedekten yükle'), file),
      h('button.btn.danger.wide', {
        onclick: () => {
          if (!confirm('Bu cihazdaki tüm veriler silinsin mi?')) return;
          store.resetAll(); toast('Sıfırlandı'); setTimeout(() => location.reload(), 400);
        }
      }, 'Bu cihazı sıfırla'),
      h('p.small.muted', 'Anahtar varsa veriler GitHub\'dan geri gelir.'),
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
