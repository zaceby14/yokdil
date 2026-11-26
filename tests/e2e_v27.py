# v27: yeni kelime akışı (Tanış → Hatırla → Pekiştir), serbest pratik (bonus), eski akış ayarı.
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765/'); SH = '/home/claude/shots/v27'; os.makedirs(SH, exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    pg = c.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'ERR_FAILED' not in m.text and 'Failed to load' not in m.text and errors.append(m.text))
    pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(400)
    ev = pg.evaluate
    T = ev("import('./js/util.js').then(u => u.dayKey())")
    ev("import('./js/store.js').then(m => { for (const x of m.all('cards')) m.del('cards', x.id); m.setSetting('newLimit', 6); })")
    pg.goto(BASE + '#/kartlar'); pg.wait_for_timeout(600)
    check(pg.locator('a.free-btn').count() == 0, 'kart yokken serbest pratik düğmesi yok (çıkmaz yol yok)')
    pg.goto(BASE + '#/kartlar/yeni'); pg.wait_for_timeout(1500)
    guessed = 0; meets = 0; failed_once = False; steps = 0
    shot_done = set()
    while steps < 80:
        steps += 1
        head = pg.inner_text('.nf-head') if pg.locator('.nf-head').count() else ''
        if pg.locator('.endcard').count(): break
        if head.startswith('Tanış'):
            if pg.locator('.opts .opt').count():
                if 'tanis-tahmin' not in shot_done: pg.screenshot(path=f'{SH}/tanis-tahmin.png'); shot_done.add('tanis-tahmin')
                pg.locator('.opts .opt').first.click(); guessed += 1; pg.wait_for_timeout(250)
            if 'tanis-kart' not in shot_done: pg.screenshot(path=f'{SH}/tanis-kart.png', full_page=True); shot_done.add('tanis-kart')
            check(pg.locator('.grades').count() == 0, 'Tanış: not düğmesi yok (yalnız Devam)') if meets == 0 else None
            pg.click('.nf-next'); meets += 1; pg.wait_for_timeout(250)
        elif head.startswith('Hatırla') or head.startswith('Pekiştir'):
            pg.click('.nf-show'); pg.wait_for_timeout(150)
            if head.startswith('Hatırla') and 'hatirla' not in shot_done: pg.screenshot(path=f'{SH}/hatirla.png'); shot_done.add('hatirla')
            if head.startswith('Hatırla') and not failed_once: pg.click('.nf-no'); failed_once = True
            else: pg.click('.nf-yes')
            pg.wait_for_timeout(200)
        else:
            pg.wait_for_timeout(300)
    check(meets == 6 and guessed >= 1, f'6 kelime tanıştırıldı, tahmin adımı var (tahmin {guessed})')
    check('yeni kelime öğrenildi' in pg.inner_text('main') and '5/6' in pg.inner_text('main'), f'bitiş: 5/6 takılmadan ({pg.inner_text(".endcard")[:80] if pg.locator(".endcard").count() else None})')
    pg.screenshot(path=f'{SH}/bitis.png', full_page=True)
    check(pg.locator('.free-wait').count() == 1 and "'de açılır" in pg.inner_text('.free-wait'), 'bitiş: serbest pratik "HH:MM\'de açılır" (10 dk dinlenme)')
    cs = ev("import('./js/store.js').then(m => m.all('cards').map(c => ({ s: c.state, i: c.intro, int: c.interval, ag: (c.agDays||[]).length })))")
    check(len(cs) == 6 and all(x['i'] == T for x in cs) and sum(x['s'] == 'learning' for x in cs) == 1 and sum(x['s'] == 'review' and x['int'] == 1 for x in cs) == 5 and all(x['ag'] == 0 for x in cs),
          f'takvim: 5 kelime yarın, 1 kelime 10 dk + merdiven; Tekrar günü yazılmadı ({cs})')
    nd = ev(f"import('./js/store.js').then(m => (m.get('days', '{T}') || {{}}).newDone)")
    check(nd == 6, f'yeni sayısı 6 ({nd})')
    # Serbest pratik: 10 dk sonrasını taklit et
    ev("import('./js/store.js').then(m => { for (const c of m.all('cards')) m.put('cards', { ...c, lastReview: Date.now() - 3600e3 }); })")
    pg.goto(BASE + '#/kartlar/serbest'); pg.wait_for_timeout(1800)
    n = pg.locator('.qhead').count()
    check(pg.locator('.opt').count() >= 4 and 'bonus' in pg.inner_text('main'), 'serbest pratik: soru açıldı, bonus etiketi')
    pg.screenshot(path=f'{SH}/serbest.png', full_page=True)
    due0 = ev("import('./js/store.js').then(m => Object.fromEntries(m.all('cards').map(c => [c.id, c.due])))")
    # ilk soruyu bilerek yanlış cevapla
    ans = ev("(() => { const o = [...document.querySelectorAll('.opt')]; return o.length; })()")
    pg.locator('.opt').nth(0).click(); pg.wait_for_timeout(300)
    wrong = pg.locator('.opt.bad, .opt.wrong').count() > 0
    due1 = ev("import('./js/store.js').then(m => Object.fromEntries(m.all('cards').map(c => [c.id, { due: c.due, ag: (c.agDays||[]).length }])))")
    changed = [k for k in due1 if due1[k]['due'] != due0.get(k)]
    check((len(changed) == 1) == wrong and all(v['ag'] == 0 for v in due1.values()), f'serbest: yanlış → kart bugüne, doğru → dokunulmaz; Tekrar günü yok (yanlış={wrong}, değişen={len(changed)})')
    # Ayar: eski akış
    ev("import('./js/store.js').then(m => { m.setSetting('newFlow', false); m.setSetting('newLimit', 8); })")
    pg.goto(BASE + '#/kartlar'); pg.wait_for_timeout(300); pg.goto(BASE + '#/kartlar/yeni'); pg.wait_for_timeout(1200)
    check(pg.locator('.nf-head').count() == 0 and pg.locator('.flash').count() >= 1, 'ayar kapalı: eski kart akışı')
    ev("import('./js/store.js').then(m => { m.setSetting('newFlow', true); m.setSetting('newLimit', null); })")
    b.close()
print(f'Konsol hataları: {len(errors)}'); [print(' ', e) for e in errors[:5]]; print(f'Başarısız: {len(fails)}'); sys.exit(1 if fails or errors else 0)
