# v15 uçtan uca: kurul (orta seviye) kalanları + arayüz dili. python3 tests/e2e_v15.py (sunucu: python3 -m http.server 8765)
import json, sys, os, re, datetime
from playwright.sync_api import sync_playwright

BASE = os.environ.get('BASE', 'http://localhost:8765/')
SHOTS = '/home/claude/shots/v15'
PACK = '/home/claude/private/cikmis-paket.json'  # gerçek gizli paket (yalnız yerel test; repoya girmez)
os.makedirs(SHOTS, exist_ok=True)
errors, fails = [], []
PACK_BODY = open(PACK, 'rb').read() if os.path.exists(PACK) else None
DATEJS = """(() => { const off = +(localStorage.getItem('test.dateoff') || 0); if (!off) return; const D = Date;
  class FD extends D { constructor(...a) { if (a.length) super(...a); else super(D.now() + off); } static now() { return D.now() + off; } }
  window.Date = FD; })();"""

def check(cond, msg):
    print(('ok   ' if cond else 'FAIL ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    exe = '/usr/bin/google-chrome' if os.path.exists('/usr/bin/google-chrome') else None
    b = p.chromium.launch(executable_path=exe, args=['--no-sandbox'])

    def newpage(tag, scheme='light'):
        c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block', color_scheme=scheme)
        c.add_init_script(DATEJS)
        c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
        if PACK_BODY: c.route(BASE + '__pack.json', lambda r: r.fulfill(status=200, body=PACK_BODY, headers={'Content-Type': 'application/json'}))
        pg = c.new_page()
        pg.on('console', lambda m: m.type == 'error' and errors.append(f'[{tag}] {m.text}'))
        pg.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))
        pg.on('dialog', lambda d: d.accept())
        pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(500)
        return c, pg

    ctx, page = newpage('v15')
    def ev(js): return page.evaluate(js)
    def go(r, t=600):
        if page.url == BASE + '#/' + r: page.goto(BASE + ('#/ayarlar' if r == 'bugun' else '#/bugun')); page.wait_for_timeout(250)
        page.goto(BASE + '#/' + r); page.wait_for_timeout(t)
    def shot(n, full=False): page.screenshot(path=f'{SHOTS}/{n}.png', full_page=full)
    def st(): page.wait_for_timeout(250); return ev("JSON.parse(localStorage.getItem('yokdil.v1')||'{}')")
    def fits(): return ev("document.documentElement.scrollWidth") <= 392

    # 0) Gizli paket (yerel test): IndexedDB'ye
    if PACK_BODY:
        n = ev("fetch('__pack.json').then(r => r.json()).then(p => import('./js/pack.js').then(m => m.savePack(p, 'gizli'))).then(x => x.exams.length)")
        check(n > 10, f'gizli paket yüklendi ({n} sınav)')

    # 1) Başlık: logo kısa, senkron yok → nokta gizli; odak sayacı küçük
    go('bugun', 500)
    check(ev("getComputedStyle(document.querySelector('.brand b')).display") == 'none' and page.locator('.brand').inner_text().strip() == 'YÖKDİL', 'dar ekranda logo "YÖKDİL"')
    check(page.locator('#syncDot.hidden').count() == 1, 'anahtar yokken senkron göstergesi yok')
    page.click('button.focus-start'); page.wait_for_timeout(400)
    hh = ev("document.querySelector('header.top').getBoundingClientRect().height")
    check(page.locator('#focusPill:not(.hidden)').count() == 1 and ev("getComputedStyle(document.querySelector('#focusPill .fp-l')).display") == 'none', 'odak sayacı küçük (yalnız süre)')
    check(hh <= 60 and ev("document.querySelector('header.top').scrollWidth <= 391"), f'başlık tek satır, taşmıyor ({hh}px)')
    shot('baslik-odak')
    ev("localStorage.removeItem('yokdil.focus')"); page.reload(); page.wait_for_timeout(600)
    # Senkron sorunu → net çip
    ev("localStorage.setItem('yokdil.token', 'ghp_test')"); page.reload(); page.wait_for_timeout(2500)
    chip = page.locator('#syncDot.sync-chip')
    check(chip.count() == 1 and 'Senkron yok' in chip.inner_text() and chip.bounding_box()['height'] >= 30, f'senkron hatasında net çip ("{chip.inner_text() if chip.count() else ""}")')
    check(ev("document.querySelector('header.top').scrollWidth <= 391"), 'çip başlığı taşırmıyor')
    shot('senkron-cip')
    chip.click(); page.wait_for_timeout(300)
    check('Tekrar deneniyor' in page.locator('#toast').inner_text(), 'çipe dokun → yeniden dene')
    ev("localStorage.removeItem('yokdil.token')"); page.reload(); page.wait_for_timeout(600)

    # 2) Yeni kartta Zor ≠ İyi
    go('kartlar/yeni', 800)
    page.click('button:has-text("Göster")'); page.wait_for_timeout(200)
    zh, iy = page.locator('.g-hard span').inner_text(), page.locator('.g-good span').inner_text()
    check(zh == 'bugün + 1 g' and iy == '1 g', f'yeni kartta Zor "{zh}" ≠ İyi "{iy}"')
    shot('kart-zor-iyi')
    w0 = page.locator('.fword').inner_text()
    page.click('.g-hard'); page.wait_for_timeout(200)
    again = False
    for _ in range(5):
        if page.locator('.flashcard .chip:has-text("bir kez daha")').count() and page.locator('.fword').inner_text() == w0: again = True; break
        if page.locator('button:has-text("Göster")').count() == 0: break
        page.click('button:has-text("Göster")'); page.wait_for_timeout(100); page.click('.g-good'); page.wait_for_timeout(150)
    check(again, f'Zor → aynı oturumda bir kez daha ({w0})')

    # 3) Ayarlar: Temel / Gelişmiş ▸
    go('ayarlar', 500)
    check(page.locator('details.set-adv').count() == 1 and not ev("document.querySelector('details.set-adv').open"), 'Ayarlar: Gelişmiş ▸ kapalı gelir')
    basic = page.locator('.set-basic')
    check(basic.locator('input[aria-label="Hedef puan"]').count() == 1 and basic.locator('.seg button').count() == 3 and basic.locator('input.num').count() == 2
          and page.locator('.set-key input[type=password]').is_visible(), 'Temel: anahtar, hedef puan, tema, günlük yeni kelime')
    check(not page.locator('input[name=warmup]').is_visible() and not page.locator('input[name=kisaGizli]').is_visible(), 'gerisi Gelişmiş altında')
    check('Siste' not in page.inner_text('.set-basic') and 'Otomatik' in page.inner_text('.set-basic'), 'tema: "Otomatik" (bölünmez)')
    shot('ayarlar-temel', True)
    page.click('details.set-adv > summary'); page.wait_for_timeout(200)
    check(page.locator('input[name=warmup]').is_visible() and page.locator('input[name=kisaGizli]').is_visible(), 'Gelişmiş açılınca diğer ayarlar')
    shot('ayarlar-gelismis', True)

    # 4) Okuma: kısa açıklama + "+ Ana fikir yaz" kapalı
    go('okuma/p/p001', 800)
    help_ = page.locator('.read-help').inner_text()
    check(help_.startswith('Kelimeye dokun') and len(help_) < 60 and page.locator('.read-legend').count() == 1, f'okuma açıklaması kısa ("{help_}") + işaret açıklaması')
    ideas = page.locator('details.idea:not(.trbox)')
    check(ideas.count() >= 1 and ideas.first.locator('summary').inner_text() == '+ Ana fikir yaz' and not ev("document.querySelector('details.idea').open"), '"+ Ana fikir yaz" kapalı düğme')
    ideas.first.locator('summary').click(); page.wait_for_timeout(150)
    check(ideas.first.locator('button:has-text("Ana fikri kaydet")').count() == 1, 'kaydet düğmesi ne kaydettiğini söylüyor')
    shot('okuma')

    # 5) Kelime tara: 50'şer + 1–2★ atla
    go('kartlar/tara', 700)
    check('1 / 50' in page.inner_text('.scan-card'), 'tarama 50\'şer')
    has_stars = page.locator('.scan-low').count() == 1
    check(has_stars, '"1–2★ kelimeleri atla" seçeneği')
    if has_stars:
        page.locator('input[name=scanSkipLow]').check(); page.wait_for_timeout(400)
        ws = ev("import('./js/views/scan.js').then(m => m.unseenCore(50)).then(async l => { const s = await import('./js/stars.js'); await s.loadStars(); return l.map(w => s.starOf(w.word) || 0); })")
        check(len(ws) > 0 and min(ws) >= 3, f'atla açık: listede 1–2★ yok (min {min(ws) if ws else "-"})')
        shot('tara')
        page.locator('input[name=scanSkipLow]').uncheck(); page.wait_for_timeout(300)

    # 6) Joker yazısı yalnız kullanıldığı gün
    def days(spec):
        ev(f"""import('./js/store.js').then(m => import('./js/util.js').then(u => {{ const t = u.dayKey();
          for (const d of m.all('days')) m.del('days', d.id); for (const i of {json.dumps(spec)}) m.put('days', {{ id: u.addDays(t, -i), tasks: {{ kart: true }} }}); }}))""")
        go('bugun', 500); return page.inner_text('.streak')
    s1 = days([0, 2, 3])
    check('joker' in s1, f'dün atlandı → "joker kullanıldı (dün)" ({s1})')
    s2 = days([0, 1, 3, 4])
    check('joker' not in s2 and 'seri 4' in s2, f'joker daha önce kullanıldı → yazı yok ({s2})')

    # 7) Kısa deneme: onay ekranı + gizli okuma seçeneği + sonuç ekranı
    go('deneme/yeni/mini', 700)
    sw = page.locator('.kisa-confirm input[name=kisaGizli]')
    if PACK_BODY:
        check(sw.count() == 1, 'onay ekranında "Okuma sorusuna kaynaklarımdan parça kat" seçeneği')
        sw.check(); page.wait_for_timeout(200)
    shot('kisa-onay')
    page.click('.kisa-go'); page.wait_for_timeout(1200)
    defs = [v for k, v in st()['progress'].items() if k.startswith('kisadef:')]
    units = defs[-1]['units'] if defs else []
    if PACK_BODY:
        check(any(u['id'].startswith('r:') for u in units if u['sec'] == 'okuma'), f'kısa denemede okuma gizli paketten ({[u["id"] for u in units if u["sec"] == "okuma"]})')
    check(page.locator('.hint-btn').count() == 0, 'sınav modunda İpucu yok (bilinçli)')
    # hepsine A de, bitir
    nq = ev("document.querySelectorAll('.optik button').length") or 20
    page.click('button:has-text("Optik")'); page.wait_for_timeout(200)
    nq = page.locator('.optik button').count()
    page.click('button:has-text("Optik")')
    for _ in range(nq + 12):
        if page.locator('.interim').count():
            nxt = page.locator('.interim button:has-text("Sonraki bölüm")')
            if nxt.count(): nxt.click(); page.wait_for_timeout(150); continue
            break
        if page.locator('.opt').count(): page.locator('.opt').nth(0).click(); page.wait_for_timeout(60)
        ma = page.locator('.exam-nav .main-act')
        if ma.is_disabled(): break
        ma.click(); page.wait_for_timeout(100)
    page.click('.readbar button:has-text("Bitir")'); page.wait_for_timeout(1500)
    check('/sonuc/' in page.url, 'kısa deneme bitti → sonuç')
    fx = page.locator('.fix-wrongs')
    order = ev("[...document.querySelector('main .page').children].map(e => e.className)")
    hi = next((i for i, c in enumerate(order) if 'hero' in c), -1)
    check(fx.count() == 1 and 'primary' in (fx.get_attribute('class') or '') and order[hi + 1].find('fix-wrongs') >= 0, f'sonuç: puanın hemen altında tek büyük "Yanlışlarımı çöz" ({fx.inner_text() if fx.count() else ""})')
    check(page.locator('main a.btn.primary, main button.btn.primary').count() == 1, 'sonuçta tek ana düğme')
    page.wait_for_timeout(500)
    check(page.locator('.analysis ul.checklist li:visible').count() == 3 and page.locator('.analysis details.steps-more').count() == 1, 'analiz: 3 madde + "Tümü ▸"')
    page.locator('.secgroup summary').first.click(); page.wait_for_timeout(250)
    row = page.locator('.secgroup[open] .qwrong-wrap .reasons').first
    labels = [row.locator('.chip.reason').nth(i).inner_text() for i in range(row.locator('.chip.reason').count())]
    check(labels == ['Kelime', 'Gramer', 'Süre'] and row.locator('.reason-more').count() == 1, f'neden çipleri: {labels} + Diğer ▸')
    shot('sonuc-ust')
    row.locator('.reason-more').click(); page.wait_for_timeout(150)
    labels2 = [row.locator('.chip.reason').nth(i).inner_text() for i in range(row.locator('.chip.reason').count())]
    check(labels2[3:] == ['Dikkat', 'İki şık', 'Metin'], f'Diğer ▸ → {labels2[3:]}')
    row.locator('.chip.reason:has-text("İki şık")').click(); page.wait_for_timeout(250)
    check(any(r.get('reason') == 'iki-sik' for r in st()['reasons'].values()), 'veri kimliği aynı (iki-sik)')
    check(fits(), 'sonuç ekranı taşmıyor')
    shot('sonuc', True)
    # Bildirim altta
    ev("import('./js/util.js').then(u => u.toast('+3 kelime karta eklendi', { bottom: true }))"); page.wait_for_timeout(400)
    tb = page.locator('#toast').bounding_box()
    check(tb and tb['y'] > 600, f'deneme sonucu bildirimi altta (y={tb["y"] if tb else None})')
    shot('sonuc-bildirim')
    nwrong = int(re.search(r'\((\d+)\)', fx.inner_text()).group(1))
    fx.click(); page.wait_for_timeout(900)
    check(page.locator('.opt').count() >= 2 and f'1/{nwrong}' in page.inner_text('.qhead'), f'"Yanlışlarımı çöz" → tüm yanlışlar ({nwrong})')

    # 8) Çıkmış listesi: örnek sorular + ✓ en iyi
    if PACK_BODY:
        pk = json.loads(PACK_BODY)
        samp = next(e for e in pk['exams'] if not e.get('full') and len(e['questions']) < 20)
        full = next(e for e in pk['exams'] if e.get('full'))
        ev(f"""import('./js/store.js').then(m => {{ m.put('mocks', {{ id: 'ms1', date: '2026-11-20', examId: '{samp['id']}', right: 5, n: {len(samp['questions'])}, score: 60, sample: true, pct: true, sections: {{}} }});
          m.put('mocks', {{ id: 'ms2', date: '2026-11-21', examId: '{samp['id']}', right: 6, n: {len(samp['questions'])}, score: 75, sample: true, pct: true, sections: {{}} }});
          m.put('mocks', {{ id: 'mf1', date: '2026-11-21', examId: '{full['id']}', right: 50, n: 80, score: 62.5, sections: {{ bosluk: {{ d: 10, y: 10, b: 0, n: 20 }} }} }}); }})""")
        go('cikmis', 1200)
        li_s = page.locator(f'.exam-row:has-text("{samp["title"]}")').first
        txt = li_s.inner_text()
        check(f'Örnek sorular ({len(samp["questions"])})' in txt and '✓' in txt and f'En iyi: 6/{len(samp["questions"])}' in txt, f'tam olmayan sınav: "Örnek sorular", ✓, en iyi sonuç ({txt[:80]!r})')
        li_f = page.locator(f'.exam-row:has-text("{full["title"]}")').first
        check('✓' in li_f.inner_text() and 'En iyi: 62,5 puan' in li_f.inner_text() and 'Örnek sorular' not in li_f.inner_text(), 'tam sınav: ✓ + en iyi puan')
        rows = [page.locator('.exam-row').nth(i).inner_text() for i in range(page.locator('.exam-row').count())]
        first_s = next(i for i, r in enumerate(rows) if 'Örnek sorular' in r)
        check(all('Örnek sorular' in r for r in rows[first_s:]), 'tam sınavlar önce, örnek sorular sonra')
        check(fits(), 'Çıkmış listesi taşmıyor')
        shot('cikmis-liste')
        # Son tam deneme hedef satırı örnek sorularla bozulmuyor
        go('bugun', 600)
        check('Son tam deneme 63' in page.inner_text('.goalline') if page.locator('.goalline').count() else False, 'Bugün hedef satırı örnek sorular değil tam denemeden')

        # 9) Çıkmış çeviri: otomatik Parçala (rol etiketi yok, cevaptan önce)
        go('cikmis/tip/ceviri-en-tr', 1200)
        if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(400)
        check(page.locator('.parts-btn').count() == 1, 'çıkmış çeviride "Parçala" var')
        page.click('.parts-btn'); page.wait_for_timeout(200)
        np = page.locator('.part').count()
        check(np >= 2 and page.locator('.part-role').count() == 0 and len(set(page.locator('.part').nth(i).get_attribute('class') for i in range(np))) >= 2, f'otomatik parçalama: {np} renkli blok, rol etiketi yok')
        check(fits(), 'Parçala taşmıyor')
        shot('cikmis-parcala')
        page.locator('.opt').nth(0).click(); page.wait_for_timeout(300)
        check(page.locator('.parts-btn').count() == 0 and page.locator('.explain .partsbox').count() == 0, 'cevaptan sonra otomatik bloklar kalkar (karşılık yok)')

        # 10) "5 soru çöz": çıkmışlar da katılır (etiketli, diyalog yok)
        ev("import('./js/store.js').then(m => m.setSetting('adapt', false))")
        go('gramer/pratik/baglac-zitlik', 1200)
        if page.locator('button:has-text("Baştan başla")').count(): page.click('button:has-text("Baştan başla")'); page.wait_for_timeout(400)
        keys = st()['sessions'].get('pratik:baglac-zitlik', {}).get('keys', [])
        xk = [k for k in keys if ':' in k and not k.startswith(('r:', 'ders:'))]
        check(len(keys) == 5 and 1 <= len(xk) <= 2, f'5 soru: {len(xk)} çıkmış ({keys})')
        labs = []
        for i in range(5):
            labs.append(page.locator('.qlabel').inner_text() if page.locator('.qlabel').count() else '')
            page.locator('.opt').nth(0).click(); page.wait_for_timeout(150)
            page.click('.actbar .btn.primary'); page.wait_for_timeout(200)
        check(sum(1 for l in labs if l.startswith('Çıkmış')) == len(xk), f'çıkmış sorular etiketli ({[l for l in labs if l.startswith("Çıkmış")]})')
        tps = ev(f"import('./js/pack.js').then(m => m.getPack()).then(p => {json.dumps(xk)}.map(k => {{ const i = k.lastIndexOf(':'); const e = p.exams.find(x => x.id === k.slice(0, i)); return e.questions.find(q => String(q.n) === k.slice(i + 1)); }}).map(q => [q.topic, q.type]))")
        check(all(t[0] == 'baglac-zitlik' and t[1] != 'diyalog' for t in tps), f'çıkmışlar aynı konudan, diyalog yok ({tps})')
        ev("import('./js/store.js').then(m => m.setSetting('adapt', true))")

    # 11) Tanı denemesi açıklaması (hafta 2 Cumartesi: 28 Kas 2026)
    off = int((datetime.datetime(2026, 11, 28, 12) - datetime.datetime.now()).total_seconds() * 1000)
    ev(f"localStorage.setItem('test.dateoff', '{off}')"); page.goto(BASE + '#/bugun'); page.reload(); page.wait_for_timeout(1200)
    t = page.locator('[data-task=kisa]')
    check(t.count() == 1 and 'Seviyeni görmek için; sonuç önemli değil' in t.inner_text() and 'okuma dahil' in t.inner_text(), f'tanı denemesi (YÖKDİL biçimi, okuma dahil) tek satır açıklama ({t.inner_text()[:90] if t.count() else ""!r})')
    shot('bugun-tani')
    ev("localStorage.removeItem('test.dateoff')"); page.reload(); page.wait_for_timeout(700)

    # 12) Eksikler: ikincil bölümler "Ayrıntı ▸" altında + kural kartı etkisi
    T = 'baglac-zitlik'
    ev(f"""import('./js/store.js').then(m => {{ const now = Date.now(), first = now - 5 * 86400e3;
      for (let i = 0; i < 6; i++) m.put('grammarLog', {{ id: 'eb' + i, q: 'xb' + i, correct: i < 2, at: first - 86400e3 - i * 1000, day: '2026-11-15', kind: 'gramer', topic: '{T}', dtype: 'bosluk' }});
      for (let i = 0; i < 5; i++) m.put('grammarLog', {{ id: 'ea' + i, q: 'xa' + i, correct: i < 4, at: first + 1000 + i, day: '2026-11-20', kind: 'gramer', topic: '{T}', dtype: 'bosluk' }});
      m.put('progress', {{ id: 'kkart:{T}', firstAt: first, lastAt: first, lastDay: '2026-11-17', views: 1 }}); }})""")
    go('eksikler', 900)
    det = page.locator('details.more-detail')
    check(det.count() == 1 and not ev("document.querySelector('details.more-detail').open"), 'Eksikler: "Ayrıntı ▸" kapalı gelir')
    vis = [h.inner_text() for h in page.locator('main section.card > h3:visible').all()]
    check(vis[:1] == ['Öncelikli 3 alan'] and 'Kelimeler' in vis and 'Deneme sonuçları' in vis and 'Gramer konu doğruluğu' not in vis, f'görünen bölümler: {vis}')
    shot('eksikler', True)
    page.locator('details.more-detail > summary').click(); page.wait_for_timeout(300)
    eff = page.locator(f'.arow[data-key="{T}"] .after-card.effect')
    check(eff.count() >= 1 and re.search(r'öncesi %\d+ → sonrası %\d+', eff.first.inner_text()), f'kural kartı etkisi: {eff.first.inner_text() if eff.count() else "-"}')
    shot('eksikler-ayrinti', True)

    # 13) Arayüz dili: iç terim / jargon yok (Bugün, Kartlar, Sorular, Deneme, Eksikler (açık), Ayarlar (açık), Okuma, Notlar)
    BAN = [r'\bmerdiven', r'\bSRS\b', r'\bease\b', r'\binterval\b', r'\blapse', r'\bmock\b', r'\bOlgun\b', r'Çekirdek liste', r'kuyru[gğ]', r'\btoken\b', r'Cloze test', r'Hedef net', r'[Öö]zgün', r'hata kutus', r'Günlük set', r'Claude', r'\bnull\b', r'undefined', r'NaN']
    bad = []
    for r in ['bugun', 'kartlar', 'kartlar/liste', 'gramer', 'alistirma', 'cikmis', 'deneme', 'eksikler', 'ayarlar', 'okuma', 'notlar', 'dersler']:
        go(r, 700)
        ev("document.querySelectorAll('details').forEach(d => d.open = true)")
        txt = page.inner_text('body') if r != 'dersler' else page.inner_text('header') + page.inner_text('section.tools') + page.inner_text('.screen-why')  # ders metinleri içerik (lessons.json)
        for pat in BAN:
            m = re.search(pat, txt)
            if m: bad.append(f'{r}: {txt[max(0, m.start() - 25):m.end() + 25]!r}')
    check(not bad, 'ekranlarda jargon yok' + ('' if not bad else ': ' + ' | '.join(bad[:6])))
    why = []
    for r in ['kartlar', 'gramer', 'alistirma', 'cikmis', 'deneme', 'eksikler', 'ayarlar', 'okuma', 'notlar', 'dersler']:
        go(r, 500)
        if page.locator('.screen-why, .kisa-why').count() == 0 and not (r == 'deneme' and 'Sınav gibi' in page.inner_text('main')): why.append(r)
    check(not why, f'her ana ekranda tek satır "ne işe yarar" ({why})')

    # Koyu tema görüntüleri
    ctx.close()
    ctx, page = newpage('v15-koyu', 'dark')
    for r in ['bugun', 'eksikler', 'ayarlar']:
        page.goto(BASE + '#/' + r); page.wait_for_timeout(600); page.screenshot(path=f'{SHOTS}/koyu-{r}.png', full_page=True)
    ctx.close()
    b.close()

ext = [e for e in errors if 'net::ERR_FAILED' not in e and 'ERR_INTERNET' not in e and 'Failed to load resource' not in e]
print(f'\nKonsol hataları: {len(ext)}')
for e in ext[:10]: print('  ', e)
print(f'Başarısız: {len(fails)}')
sys.exit(1 if fails or ext else 0)
