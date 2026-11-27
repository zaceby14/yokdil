// Çoktan seçmeli soru oturumu (gramer, alıştırma, hata kutusu, okuma, ders, çıkmış, kelime oyunları)
// - Oturum ilerlemesi 'sessions' koleksiyonuna yazılır (sid): sayfadan çıkıp dönünce "Kaldığın yerden devam et".
// - Soru kökündeki kelimeye dokun = kelime paneli; şık satırına dokun = seç; şıktaki kelimeye UZUN bas = kelime paneli.
import { h, uid, add, realExplain, topicName, exEl } from './util.js';
import * as store from './store.js';
import { fromWrong, fillContext } from './autocard.js';
import { tappable } from './tappable.js';
import { setCtx } from './ctx.js';
import { openFor } from './side.js';
import { resolve as resolveKey, hintFor } from './qbank.js';
import { aids } from './data.js';
import { nextTaskBtn } from './tasks.js';
import { reasonList, reasonChips } from './reasons.js';
import { keyOf, ruleMatch } from './warm.js';

// Çeviri yardımı: kaynak cümleyi renkli bloklara böl (rol etiketli). reveal=true → karşılıklar (tgt) + kontrol maddeleri
const ROLE_C = [[/bağlaç|baglac|conj/i, 'c1'], [/özne|ozne|subj/i, 'c2'], [/yüklem|yuklem|fiil|verb/i, 'c3'], [/nesne|obj/i, 'c4'], [/zaman|yer|zarf|edat|adv|prep/i, 'c5'], [/relative|sıfat|sifat|niteleme|tamlama/i, 'c6']];
const roleCls = (role, i) => ROLE_C.find(([re]) => re.test(role || ''))?.[1] || 'c' + (i % 6 + 1);
export function partsBox(it, reveal) {
  const parts = (Array.isArray(it.parts) ? it.parts : []).filter(p => p && p.src);
  if (!parts.length) return null;
  const checks = (Array.isArray(it.check) ? it.check : []).map(c => typeof c === 'string' ? c : c?.text || c?.label || '').filter(Boolean);
  return h('div.partsbox' + (reveal ? '.revealed' : ''),
    h('div.parts', parts.map((p, i) => h('div.part.' + roleCls(p.role, i),
      p.role ? h('span.part-role', p.role) : null, h('span.part-src', p.src), reveal && p.tgt ? h('span.part-tgt', p.tgt) : null))),
    reveal && checks.length ? h('ul.part-check', checks.map(c => h('li', c))) : null);
}
const markHl = (q, w) => { const i = String(q).indexOf(w); return i < 0 ? [q] : [q.slice(0, i), h('mark', w), q.slice(i + w.length)]; };

// Kişisel kural kartı: ilgili konuda yanlış yapınca otomatik gösterilir
export async function ruleFor(topic, texts) {
  if (!topic) return null;
  const a = await aids().catch(() => null);
  if (!texts) return (a?.personalRules || []).find(r => r && r.topic === topic) || null;
  return ruleMatch(a?.personalRules, topic, texts);
}
export const ruleBox = r => h('div.rulecard', h('div.small.muted', 'Senin kuralın · ' + topicName(r.topic)), h('b', r.rule),
  exEl(r.ex),
  r.wrong || r.right ? h('div.small', r.wrong ? h('span.bad-t', '✗ ' + r.wrong + ' ') : null, r.right ? h('span.good-t', '✓ ' + r.right) : null) : null);

const L = 'ABCDE';

// Türkçe metin dokunulabilir olmasın
const trQ = it => it.info?.dtype === 'ceviri-tr-en';
const trOpts = it => it.info?.dtype === 'ceviri-en-tr' || !!it.plainOpts;

// items: [{key, stem, q, options, answer, explain, tip, label, info}]
// opts: onAnswer(item, ok) · onEnd({right,total}, root) · title · extra(it, ok) · auto (yanlışta otomatik kart)
//       sid (oturum kimliği) · name (Bugün'de görünen ad) · inline (öğeler kaydedilebilir düz nesne; resolve gerekmez)
//       resolve(key) (öğeyi yeniden kur; varsayılan qbank) · source (karta eklerken kaynak)
export function runQuiz(root, items, opts = {}) {
  const { sid } = opts;
  const saved = sid ? store.get('sessions', sid) : null;
  if (saved && !saved.done && (saved.i > 0 || Object.keys(saved.picks || {}).length)) {
    root.innerHTML = '';
    const n = saved.total || saved.keys?.length || 0;
    root.append(h('div.card.resume',
      h('b', 'Kaldığın yerden devam et'), h('div.small.muted', `${Math.min(saved.i + 1, n)} / ${n}`),
      h('div.row',
        h('button.btn.primary.grow', {
          onclick: async e => {
            e.currentTarget.disabled = true;
            let its = saved.inline || await Promise.all((saved.keys || []).map(k => (opts.resolve || resolveKey)(k)));
            if (!its.length || its.some(x => !x)) its = items; // çözülemedi → baştan
            else return start(its, saved);
            start(its, null);
          }
        }, 'Devam et'),
        h('button.btn', { onclick: () => start(items, null) }, 'Baştan başla'))));
    return;
  }
  start(items, null);

  function start(items, st) {
    // Devam: pekiştirme / zor işaretleri geri gelsin (sayaç doğru kalsın)
    if (st?.adapt) items = items.map((x, j) => st.adapt[j] ? { ...x, adapt: st.adapt[j] } : x);
    let i = st?.i || 0, right = st?.right || 0;
    const picks = { ...(st?.picks || {}) };
    const hints = { ...(st?.hints || {}) };
    // Oturum içi kural hatırlatması (opts.coach): aynı konudan 2. yanlış → sonraki sorunun üstünde tek seferlik kart
    const wrongN = {}, coached = new Set();
    const secs = [];
    const persist = () => {
      if (!sid) return;
      store.put('sessions', {
        id: sid, name: opts.name || opts.title || '', route: location.hash, i, right, picks, hints, total: items.length,
        keys: items.map(x => x.key), adapt: Object.fromEntries(items.map((x, j) => [j, x.adapt]).filter(([, a]) => a)), inline: opts.inline ? items : null, at: Date.now(), done: false
      });
    };
    if (!st) persist();

    const show = () => {
      root.innerHTML = '';
      root.classList.remove('answered');
      if (i >= items.length) {
        if (sid) store.del('sessions', sid);
        setCtx(null);
        document.body.classList.remove('qmode');
        endScreen(root, items, picks, right, opts);
        onEndOnce();
        return;
      }
      document.body.classList.add('qmode');
      const it = items[i];
      const ctxLabel = [opts.name || opts.title, `${i + 1}/${items.length}`, it.label].filter(Boolean).join(' · ');
      setCtx({ type: 'soru', key: it.key, label: ctxLabel });
      let answered = false;
      const src = { source: opts.source || it.label || 'Soru', note: it.info?.kind === 'cikmis' ? it.label : '' };
      const ctx = s => answered ? (fillContext(it) || s) : s;
      // Şıktaki kelimenin bağlamı: soru cümlesi (cevaptan sonra boşluk doldurulmuş)
      const qSent = () => {
        const q = String(it.q || ''), m = q.match(/^\s*\((\d+)\)\s*$/);
        if (m && it.stem) return (String(it.stem).replace(/\s+/g, ' ').match(/[^.!?]+[.!?]*/g) || []).find(x => x.includes(`(${m[1]})`))?.trim() || '';
        return q.length < 400 ? q : '';
      };
      const octx = s => answered ? (fillContext(it) || qSent() || s) : (qSent() || s);
      const exp = h('div.explain.hidden');
      let nextBusy = false;
      const next = h('button.btn.primary.wide.hidden', { onclick: () => { if (nextBusy) return; nextBusy = true; i++; persist(); show(); } }, i + 1 < items.length ? 'Sonraki' : 'Bitir');
      const reveal = (k, replay) => {
        answered = true;
        root.classList.add('answered');
        const ok = k === it.answer;
        opts_.forEach((b, j) => { b.classList.add('done'); if (j === it.answer) b.classList.add('right'); });
        if (!ok) opts_[k].classList.add('wrong');
        exp.classList.remove('hidden', 'is-right', 'is-wrong');
        exp.classList.add(ok ? 'is-right' : 'is-wrong');
        exp.innerHTML = '';
        const ex = realExplain(it.explain);
        const L = 'ABCDE';
        const mineWhy = !ok && Array.isArray(it.why) ? String(it.why[k] || '').trim() : '';
        exp.append(h('div.exhead', h('b', ok ? 'Doğru ✓' : 'Yanlış ✗')));
        if (it.anlam) exp.append(h('div.exrow2', h('span.exl', ['paragraf', 'ilgisiz', 'paragraf-tamamlama', 'okuma'].includes(it.info?.dtype) || it.info?.kind === 'okuma' ? 'Özet' : 'Cümle'), h('span', it.anlam)));
        if (ex) exp.append(h('div.exrow2', h('span.exl', `Doğru (${L[it.answer] || ''})`), h('span', ex)));
        if (mineWhy) exp.append(h('div.exrow2.mine', h('span.exl', `Senin seçimin (${L[k]})`), h('span', mineWhy)));
        const tipEl = it.tip ? h('div.tip', (it.why ? 'Kalıp / taktik: ' : 'Taktik: ') + it.tip) : null;
        if (tipEl) exp.append(tipEl);
        const more = h('details.ex-more', h('summary.small', 'Daha ▸'));
    // Yanlışta: kuralı not defterine (site + kâğıt defter)
    const tpc = it.info?.topic;
    if (!ok && tpc && (it.tip || ex) && !opts.exam) {
      const nb = h('button.btn.small.nb-add', { type: 'button' }, '📓 Kural notlarıma ekle');
      nb.onclick = e => {
        e.stopPropagation();
        store.put('notes', { id: uid('n'), topic: tpc, text: it.tip || ex, ex: it.anlam ? `${String(it.q || '').replace(/-{3,}|_{3,}/, (it.options || [])[it.answer] || '----')} (${it.anlam})` : '', origin: 'user', createdAt: Date.now() });
        nb.replaceWith(h('span.small.good-t', '✓ Eklendi: Sorular › Gramer › Kural notlarım. Defterine de kendi örnek cümleni yaz.'));
      };
      more.append(h('div.nb-row', nb));
    }
        hintBtn?.remove();
        // Tek kural kutusu: kişisel kural varsa "Kalıp" gizlenir
        if (!ok) ruleFor(it.info?.topic, [it.options[it.answer], it.options[k]].map(String)).then(r => { if (!r || !exp.isConnected) return; tipEl?.remove(); exp.insertBefore(ruleBox(r), exp.querySelector('.ex-more')); });
        // 2. yanlış aynı konudan: kural kartı burada, geri bildirimde (sonraki soruya değil)
        if (!ok && !replay && opts.coach) { const ck = keyOf(it.info); if (ck) { wrongN[ck] = (wrongN[ck] || 0) + 1; if (wrongN[ck] >= 2 && !coached.has(ck)) { coached.add(ck); import('./views/warmup.js').then(m => m.miniCard(ck)).then(el => { if (el && exp.isConnected) exp.insertBefore(el, exp.querySelector('.ex-more')); }).catch(() => {}); } } }
        // Eleme: kaç yanlış şıkkı doğru eledin
        const struck = opts_.filter(b => b.classList.contains('struck'));
        if (struck.length) { const goodX = struck.filter(b => b !== opts_[it.answer]).length; exp.insertBefore(h('div.small.elim-note' + (struck.includes(opts_[it.answer]) ? '.bad-t' : '.good-t'), struck.includes(opts_[it.answer]) ? `Dikkat: doğru şıkkı elemiştin.` : `${goodX} yanlış şıkkı doğru eledin ✓`), exp.querySelector('.exrow2')); }
        // Çeviri: blokların karşılıkları + kontrol maddeleri
        if (it.parts?.length) { partsBtn?.remove(); partsSlot.innerHTML = ''; const pb = it.autoParts ? null : partsBox(it, true); if (pb) exp.append(h('div.small.muted', 'Parça parça:'), pb); }
        // Yanlışta küçük "neden" çipleri (isteğe bağlı)
        if (!ok && it.info?.kind && opts.reasons !== false) reasonList().then(rs => { const row = reasonChips(rs, it.key, { src: it.info.kind, dtype: it.info.dtype || '', topic: it.info.topic || '' }); if (row && exp.isConnected) exp.insertBefore(row, exp.querySelector('.ex-more')); }).catch(() => {});
        const x = opts.extra?.(it, ok); if (x) Promise.resolve(x).then(n => n && more.append(n));
        more.append(h('div.small.muted', 'Kelimeye dokun → karta ekle'));
        const xt = opts.extraTop?.(it, ok); if (xt) exp.append(xt);
        exp.append(more, h('span.tap-hint.hidden'));
        // Hız: bu soruda geçen süre
        if (speed && !replay) { const sec = Math.round((Date.now() - t0) / 1000); secs.push(sec); speed.stop(); }
        next.classList.remove('hidden');
        if (!replay) {
          if (ok) right++;
          picks[i] = k; persist();
          opts.onAnswer?.(it, ok, k, { hint: !!hints[i] });
          // Anlık uyum: pekiştirme / zorlaştırma (opts.adapt; denemelerde yok)
          if (opts.adapt && store.settings().adapt !== false) {
            const note = opts.adapt.after(items, i, ok);
            if (note) exp.insertBefore(h('div.adapt-note', note), exp.querySelector('.ex-more'));
            next.textContent = i + 1 < items.length ? 'Sonraki' : 'Bitir';
            persist();
          }
          if (!ok && opts.auto !== false) fromWrong(it, k).catch(e => console.warn(e));
          exp.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        }
      };
      const optNode = o => trOpts(it) ? h('span.otext', o) : h('span.otext', tappable(String(o), { ...src, inline: true, tapOpens: false, ctx: octx }).el);
      const opts_ = it.options.map((o, k) => {
        const b = h('button.opt', {
          type: 'button',
          onclick: () => { if (answered || b._lp) { b._lp = false; return; } reveal(k, false); }
        }, h('span.ol', L[k]), optNode(o));
        strikeable(b, () => answered);
        return b;
      });
      const stem = it.stemNode ? h('div.stem.tap', it.stemNode()) : it.stem ? h('div.stem.tap', tappable(it.stem, { ...src, ctx }).el) : null;
      // Cloze: sorulan boşluğu vurgula ve göster
      const bn = it.stem && String(it.q || '').match(/^\s*\((\d+)\)/)?.[1];
      if (bn && stem) setTimeout(() => { const b = stem.querySelector(`.blank[data-b="${bn}"]`); if (b) { b.classList.add('on'); b.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 60);
      const q = it.qNode ? h('div.q.tap', it.qNode()) : it.q ? (it.hl ? h('div.q.hlq', { lang: 'en' }, markHl(it.q, it.hl)) : trQ(it) ? h('div.q', it.q) : h('div.q.tap', tappable(it.q, { ...src, ctx }).el)) : null;
      // Parçala: cevaptan önce kaynak cümle blokları (karşılıklar gizli)
      const partsSlot = h('div');
      let partsBtn = null;
      if (it.parts?.length && picks[i] == null) partsBtn = h('button.chip.parts-btn', { type: 'button', 'aria-expanded': 'false', onclick: () => {
        const open = !partsSlot.firstChild; partsSlot.innerHTML = ''; if (open) add(partsSlot, partsBox(it, false)); partsBtn.setAttribute('aria-expanded', String(open)); partsBtn.classList.toggle('on', open);
      } }, 'Parçala');
      // İpucu: cevaptan önce; kullanıldığı kaydedilir
      const hintBox = h('div.hintbox.hidden');
      let hintBtn = null;
      const showHint = txt => { hintBox.innerHTML = ''; hintBox.append(h('b', 'İpucu: '), txt); hintBox.classList.remove('hidden'); hintBtn?.remove(); };
      if (picks[i] == null) {
        hintBtn = h('button.chip.hint-btn.hidden', { type: 'button', onclick: async () => { const t = await hintFor(it); hints[i] = true; persist(); showHint(t); } }, 'İpucu');
        hintFor(it).then(t => { if (!t || !hintBtn) return; if (hints[i]) showHint(t); else hintBtn.classList.remove('hidden'); }).catch(() => {});
      }
      const diffBtn = picks[i] == null && longSimilar(it.options) ? h('button.chip.diff-btn', { type: 'button', onclick: () => { markDiffs(opts_, it.options); diffBtn.remove(); } }, 'Farkları göster') : null;
      // Hız çubuğu (5. haftadan; deneme dışında)
      const t0 = Date.now();
      const speed = picks[i] == null && opts.speed ? speedBar(opts.speed(it)) : null;
      add(root,
        h('div.qhead', h('span.muted', `${opts.title ? opts.title + ' · ' : ''}${counter(items, i)}`),
          h('span.qtools', it.adapt ? h('span.chip.small.adapt-chip', it.adapt === 'zor' ? 'daha zor' : 'pekiştirme') : null, it.unverified ? h('span.chip.bad.small', 'cevap kesin değil') : null, it.label ? h('span.chip.qlabel', it.label) : null)),
        qprog(items, i),
        speed?.el || null,
        h('div.qbar', hintBtn, partsBtn, diffBtn,
          opts.noLesson ? null : h('button.chip.lesson-btn', { type: 'button', title: 'Dersi yanda aç', onclick: () => openFor(it) }, 'Ders')),
        hintBox, stem, q, partsSlot,
        h('div.opts' + (it.tf ? '.tf' : ''), opts_), exp, h('div.actbar', next)
      );
      if (picks[i] != null) reveal(picks[i], true);

      if (i === 0 || picks[i] == null) window.scrollTo(0, 0);
    };
    let ended = false;
    const onEndOnce = () => {
      if (ended) return; ended = true;
      if (secs.length >= 3 && opts.speed) { const avg = Math.round(secs.reduce((a, b) => a + b, 0) / secs.length); root.querySelector('.endcard')?.append(h('p.small.speed-sum', `Ortalama ${avg} sn/soru · sınav hızı ${opts.speed(items[0])} sn`)); }
      opts.onEnd?.({ right, total: items.length }, root);
    };
    show();
  }
}

// Bitiş ekranı: sonuç + yanlışların kısa listesi (dokun → açıklama) + "Yanlışları tekrar çöz" + sıradaki görev
function endScreen(root, items, picks, right, opts) {
  const wrong = items.map((it, k) => ({ it, k, pick: picks[k] })).filter(x => x.pick != null && x.pick !== x.it.answer);
  const short = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 90 ? t.slice(0, 88) + '…' : t; };
  root.append(h('div.card.center.endcard',
    h('div.big', `${right} / ${items.length}`),
    h('p.muted', right === items.length ? 'Tamamı doğru' : `${wrong.length} yanlış`)));
  if (wrong.length) {
    root.append(h('section.card.wronglist', h('h3', 'Yanlışların'),
      ...wrong.map(({ it, pick }) => h('details',
        h('summary', h('span.small.muted', (it.label || '') + ' '), short(it.q && !/^\s*\(\d+\)\s*$/.test(it.q) ? it.q : it.stem || it.label)),
        h('div.small', h('span.bad-t', `Senin: ${L[pick]}) ${it.options[pick]}`), ' · ', h('span.good-t', `Doğru: ${L[it.answer]}) ${it.options[it.answer]}`)),
        realExplain(it.explain) ? h('div.explain', realExplain(it.explain)) : null)),
      h('button.btn.wide.retry-wrong', {
        onclick: () => {
          root.innerHTML = '';
          runQuiz(root, wrong.map(x => x.it), { ...opts, sid: null, title: 'Yanlışlar', name: 'Yanlışlar', onEnd: null, task: opts.task });
        }
      }, `Yanlışları tekrar çöz (${wrong.length})`)));
  }
  const slot = h('div.endnext');
  root.append(slot);
  if (opts.noNext) return;
  nextTaskBtn(opts.task).then(b => slot.append(b));
}

// Yarım kalan oturumlar (Bugün ekranı için)
export const openSessions = () => store.all('sessions').filter(s => !s.done && s.route && (s.i > 0 || Object.keys(s.picks || {}).length))
  .sort((a, b) => (b.at || 0) - (a.at || 0));

// Sayaç: pekiştirme soruları ayrı sayılır ("3/8 · +2 pekiştirme")
// İnce ilerleme çubuğu: önceki sorudan bu soruya doğru dolar (yalnız transform)
function qprog(items, i) {
  const n = items.filter(x => x.adapt !== 'pekistir').length || items.length;
  const pos = Math.max(1, items.slice(0, i + 1).filter(x => x.adapt !== 'pekistir').length);
  const p = Math.min(1, pos / n), p0 = Math.min(1, Math.max(0, (pos - 1) / n));
  return h('div.qprog', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': pos, 'aria-label': 'İlerleme' }, h('i', { style: `--p:${p};--p0:${p0}` }));
}

export function counter(items, i) {
  const extra = items.filter(x => x.adapt === 'pekistir').length;
  const before = items.slice(0, i + 1).filter(x => x.adapt !== 'pekistir').length;
  return extra ? `${Math.max(1, before)}/${items.length - extra} · +${extra} pekiştirme` : `${i + 1}/${items.length}`;
}
// Şık eleme: harfe uzun bas ya da şıkkı sola kaydır → üstü çizili (cevap sayılmaz)
function strikeable(b, locked) {
  let t = null, x0 = 0;
  const toggle = () => { if (locked()) return; b.classList.toggle('struck'); b._lp = true; navigator.vibrate?.(15); };
  // Uzun basma yalnız şık harfinde (kelimeye uzun basma kelime panelini açar); kaydırma her yerde
  b.addEventListener('pointerdown', e => { x0 = e.clientX; if (e.target.closest('.ol')) t = setTimeout(toggle, 450); });
  b.addEventListener('pointerup', e => { clearTimeout(t); if (x0 - e.clientX > 60) toggle(); });
  b.addEventListener('pointerleave', () => clearTimeout(t));
  b.addEventListener('contextmenu', e => { e.preventDefault(); });
}
// Saf: uzun ve birbirine benzeyen şıklar mı (çeviri, cümle tamamlama)
export function longSimilar(options) {
  const os = (options || []).map(o => String(o));
  if (os.length < 4 || os.reduce((a, o) => a + o.split(/\s+/).length, 0) / os.length < 7) return false;
  const sets = os.map(o => new Set(o.toLowerCase().match(/[\p{L}']+/gu) || []));
  const common = [...sets[0]].filter(w => sets.every(s => s.has(w))).length;
  return common / Math.max(1, sets[0].size) >= 0.4;
}
// Saf: her şıkta, şıkların çoğunda olmayan kelimeler
export function diffWords(options) {
  const toks = options.map(o => String(o).match(/[\p{L}']+|[^\p{L}']+/gu) || []);
  const sets = toks.map(t => new Set(t.map(x => x.toLowerCase())));
  // Şıkların çoğunda olmayan (azınlıkta kalan) kelime = fark
  const n = sets.length;
  return toks.map(t => t.map(x => ({ x, d: /[\p{L}]/u.test(x) && sets.filter(s => s.has(x.toLowerCase())).length < n - 1 })));
}
function markDiffs(btns, options) {
  diffWords(options).forEach((parts, k) => {
    const span = btns[k]?.querySelector('.otext');
    if (!span) return;
    span.innerHTML = '';
    for (const p of parts) span.append(p.d ? h('b.diffw', p.x) : document.createTextNode(p.x));
  });
}
// Hız çubuğu: hedef saniyede dolar, aşınca turuncu (ceza yok)
function speedBar(target) {
  if (!target) return null;
  const bar = h('i'), el = h('div.speedbar', { title: `Sınav hızı: ${target} sn/soru` }, bar);
  const t0 = Date.now();
  const iv = setInterval(() => { if (!el.isConnected) return clearInterval(iv); const r = (Date.now() - t0) / 1000 / target; bar.style.width = Math.min(100, r * 100) + '%'; el.classList.toggle('over', r > 1); }, 500);
  return { el, stop: () => clearInterval(iv) };
}
