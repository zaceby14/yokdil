# v28: eğitici önerileri — Bugün "Başla", Daha fazla, eleme, farkları göster, sayaç, 2 düğmeli kart, metinde göster, denemede ders yok.
import os, sys
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765/'); SH = '/home/claude/shots/v28'; os.makedirs(SH, exist_ok=True)
fails, errors = [], []
def check(c, m):
    print(('ok   ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, service_workers='block')
    c.route(lambda u: not u.startswith(BASE), lambda r: r.abort())
    pg = c.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(BASE + '#/bugun'); pg.wait_for_selector('.hero', timeout=15000); pg.wait_for_timeout(600)
    ev = pg.evaluate
    ev("import('./js/store.js').then(m => { m.setSetting('warmup', false); m.setSetting('adapt', true); })")
    pg.goto(BASE + '#/kartlar'); pg.wait_for_timeout(200); pg.goto(BASE + '#/bugun'); pg.wait_for_timeout(800)
    sb = pg.locator('.start-btn')
    check(sb.count() == 1 and 'Başla: ' in sb.inner_text(), f'Bugün: tek "Başla" düğmesi ({sb.inner_text() if sb.count() else None})')
    first = pg.locator('ul.tasks:not(.extra) > li[data-task]').first.get_attribute('data-task')
    check(first in ('gramer', 'kisa', 'deneme'), f'görev sırası gramer ile (deneme günü deneme ile) başlıyor ({first})')
    check(pg.locator('details.today-more').count() == 1 and not pg.locator('details.today-more').get_attribute('open'), 'ek kartlar "Daha fazla" altında kapalı')
    pg.screenshot(path=f'{SH}/bugun.png', full_page=True)
    # Gramer: sayaç + eleme + sade geri bildirim
    pg.goto(BASE + '#/gramer/gunluk'); pg.wait_for_timeout(1500)
    T = ev("import('./js/util.js').then(u => u.dayKey())")
    k0 = ev(f"import('./js/store.js').then(m => m.get('sessions', 'gunluk:{T}').keys[0])")
    a = ev(f"import('./js/qbank.js').then(q => q.resolve('{k0}')).then(it => it.answer)")
    wrongk = [i for i in range(5) if i != a][:2]
    box = pg.locator('.opt').nth(wrongk[1]).bounding_box()
    pg.mouse.move(box['x'] + box['width'] - 20, box['y'] + box['height'] / 2); pg.mouse.down(); pg.mouse.move(box['x'] + 20, box['y'] + box['height'] / 2, steps=6); pg.mouse.up(); pg.wait_for_timeout(200)
    check(pg.locator('.opt.struck').count() == 1, 'şık sola kaydırınca üstü çizildi')
    pg.screenshot(path=f'{SH}/eleme.png')
    pg.locator('.opt').nth(wrongk[0]).click(); pg.wait_for_timeout(400)
    check(pg.locator('.elim-note').count() == 1 and 'doğru eledin' in pg.inner_text('.elim-note'), 'geri bildirim: "1 yanlış şıkkı doğru eledin"')
    check(pg.locator('details.ex-more').count() == 1 and not pg.locator('details.ex-more').get_attribute('open'), 'ek öğeler "Daha ▸" altında')
    qh = pg.inner_text('.qhead')
    check('+1 pekiştirme' in qh or '/8' in qh, f'sayaç sabit + pekiştirme ayrı ({qh.strip()[:40]})')
    pg.click('.actbar .btn.primary'); pg.wait_for_timeout(300)
    qh2 = pg.inner_text('.qhead')
    check('2/8' in qh2 and '+1 pekiştirme' in qh2, f'2. soru: "2/8 · +1 pekiştirme" ({qh2.strip()[:50]})')
    pg.screenshot(path=f'{SH}/geri-bildirim.png', full_page=True)
    # Çeviri: farkları göster
    pg.goto(BASE + '#/alistirma/ceviri-en-tr'); pg.wait_for_timeout(1500)
    if pg.locator('button:has-text("Baştan başla")').count(): pg.click('button:has-text("Baştan başla")'); pg.wait_for_timeout(400)
    if pg.locator('.warm-go').count(): pg.click('.warm-go'); pg.wait_for_timeout(300)
    db = pg.locator('.diff-btn')
    check(db.count() == 1, 'çeviri: "Farkları göster" düğmesi')
    if db.count():
        db.click(); pg.wait_for_timeout(200)
        check(3 <= pg.locator('b.diffw').count() <= 20, f'farklı kelimeler vurgulandı ({pg.locator("b.diffw").count()})')
        pg.screenshot(path=f'{SH}/farklar.png', full_page=True)
    # Kart: öğreniliyor kartında 2 düğme
    ev("import('./js/store.js').then(m => { for (const x of m.all('cards')) m.del('cards', x.id); m.put('cards', { id: 'L1', word: 'deplete', tr: 'tüketmek', state: 'learning', ladder: 0, interval: 0, reps: 1, due: Date.now() - 1000, lastReview: Date.now() - 864e5 }); m.setSetting('newFlow', true); })")
    pg.goto(BASE + '#/kartlar/calis'); pg.wait_for_timeout(1000)
    pg.locator('.big-btn:has-text("Göster")').click(); pg.wait_for_timeout(200)
    gb = [x.inner_text().split('\n')[0] for x in pg.locator('.grades button').all()]
    check(gb == ['Bilemedim', 'Bildim'], f'öğreniliyor kartı: 2 düğme ({gb})')
    # Okuma: metinde göster
    pg.goto(BASE + '#/okuma/p/p091'); pg.wait_for_timeout(1200)
    pg.click('button:has-text("Soruları çöz")'); pg.wait_for_timeout(500)
    if pg.locator('button:has-text("Baştan başla")').count(): pg.click('button:has-text("Baştan başla")'); pg.wait_for_timeout(300)
    pg.locator('.opt').first.click(); pg.wait_for_timeout(400)
    eb = pg.locator('.evid-btn')
    check(eb.count() == 1, 'okuma: "Metinde göster" düğmesi')
    if eb.count():
        eb.click(); pg.wait_for_timeout(600)
        check(pg.locator('.evid-q').count() == 1 and pg.locator('.evid').count() >= 1, 'kanıt cümlesi gösterildi, paragraf vurgulandı')
        pg.screenshot(path=f'{SH}/metinde-goster.png')
    # Kısa deneme: ders düğmesi yok
    pg.goto(BASE + '#/deneme/yeni/mini'); pg.wait_for_timeout(800)
    pg.click('.kisa-go'); pg.wait_for_timeout(1500)
    check(pg.locator('.lesson-btn').count() == 0 and pg.locator('.elim-tip').count() == 1, 'deneme: Ders düğmesi yok, eleme ipucu var')
    b.close()
print(f'Konsol hataları: {len(errors)}'); [print(' ', e) for e in errors[:5]]; print(f'Başarısız: {len(fails)}'); sys.exit(1 if fails or errors else 0)
