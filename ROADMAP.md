# Yol haritası

## v7'de yapılanlar (sınav stratejisi + QA)
- [x] Araçlar: Süre planı, Hedef net (Ayarlar → Hedef puan), Sınav günü (tiklenebilir), Kaynaklar
- [x] Deneme: bölüm bazlı süre kaydı (`secTime`), "Bu bölüm: x/y dk" göstergesi (aşınca kırmızı, kapatılabilir); sonuçta net / dk / hedef / sn-soru
- [x] Deneme analizi: her yanlış/boş için neden çipi (`reasons` koleksiyonu, senkrona girer), dağılım + en sık nedenin tavsiyesi, 20 dk analiz listesi; Eksikler'de birikimli; alıştırma/gramer yanlışında da çip
- [x] Yarım deneme: ilk 40 soru / 90 dk (`#/cikmis/sinav/<id>/yarim`), ayrı kayıt, puan 80 soruya oranlı; programdaki yarım denemeler buna bağlı
- [x] Son 14 gün modu: yeni kelime ≤5 (son 3 gün 0), görevler kart + hata (12'ye kadar) + deneme + gramer, sınav günü bandı; Ayarlar'dan kapatılır
- [x] Başvuru bandı: 14 gün kala → açık (son gün sayacı) → geç başvuru
- [x] Çeviri: "Parçala" (rol renkli bloklar; cevaptan sonra karşılık + kontrol maddeleri)
- [x] Bağlamdan tahmin alıştırması; Eksikler'de "Çekirdek liste: X/1500 görüldü"
- [x] Aynı kişisel kuraldan 2 yanlış → Bugün'e kural kartı görevi ("Okudum" ile kapanır)
- [x] Okuma hızı haftalık grafiği + hedef hız çizgisi (Ayarlar → Okuma hızı hedefi, varsayılan 120)
- [x] Dersler: 8 katlanır grup + arama; yeni konu adları (Strateji, Kelime tahmini)
- [x] QA: klavye odak halkası; ham anahtarlar Türkçe ada çevrildi (okuma konusu, soru tipi); deneme grafiğinde kesilen etiket; kısa set/yarım denemede olmayan bölüm %0 sayılmıyor

## Kullanıcının istediği (ileride)
- Kelimelere YDS'de çıkma ihtimaline göre 5 üzerinden yıldız (çıkmış YDS/YÖKDİL sıklığına göre)

## v7 sonrası fikirler
- Sınav modunda İpucu (şimdilik yalnız alıştırma/gramer ekranlarında)
- Çıkmış çeviri sorularında da Parçala (içerik gerekir)
- Yarım deneme için bölüm hedef sürelerini 90 dk'ya göre ölçekleme
- Neden çiplerine göre otomatik görev (ör. "süre" çoksa süre planı kartı)

## v6'da yapılanlar (kurul raporu: öğrenci, gramer öğretmeni, sınav uzmanı)
- [x] Soru/sınav ekranlarında ana düğme hep erişilebilir: Not telefonda üst çubukta, bildirim üstte ve tıklamayı engellemez, Sonraki/Kontrol yapışkan alt çubukta (e2e: elementFromPoint)
- [x] Okurken/elle/nottan eklenen kelimeler (mine) yeni kuyruğun önünde; dünden kalanlar limit dolsa da gelir (en fazla +10)
- [x] Yanlıştan otomatik kart: bağlaç/edat/işlev kelimesi yok, kök (eat ← eating), anlamı yoksa kart yok, aynı kökten ikinci kart yok; boşluk oyununda aynı kökten iki şık yok; göç: eski bozuk Hata kartları silinir (SRS geçmişi olanlar kalır)
- [x] Hata tekrarı: günde en fazla 8 (en eski / en çok yanlış; tüm kaynaklar), Bugün'de ayrı görev "Hata tekrarı (n/8)"
- [x] Seri: görev / ≥10 dk odak / deneme günü sayar; haftada 1 joker
- [x] Kart tekrarı ve yeni kelime ayrı oturum; dakikalar gerçek sayıdan (kart ≈ 8 sn)
- [x] Bitiş ekranları: yanlış listesi (dokun → açıklama), "Yanlışları tekrar çöz", "Sıradaki: … ›"
- [x] Hafıza turu: en fazla 8 kelime, seçmeli (eş anlam / aile / anlam), Bugün'deki sayı = soru sayısı; okuma ✓ için < 400 kelime/dk ve ≥ 1 doğru
- [x] Çıkmış: bölüm bölüm çözme (bölüm şeridi, bölüm sonu ara sonuç + kilit), optikte bölüm başlıkları, Bugün'de yarım deneme bandı, sonuç bölüm bölüm katlanır, "Bu bölümün yanlışlarını tekrar çöz", zayıf bölüm dersi; tipe göre ÖSYM/Yayınevi/Hepsi; "Cevap: X" satırı gizli
- [x] Ders düğmesi: konu dersi → soru tipi taktik dersi → liste
- [x] Not → karta çevir Türkçe kelimeleri bölmüyor; dokunma hedefleri ≥ 44 px; dar ekranda tablolar kart görünümü
- [x] Araçlar (aids.json): karar ağacı, bağlaç kutup kartları, zaman tablosu, kopya kağıtları, şık eleme, kişisel kurallar (yanlışta otomatik)
- [x] İpucu (cevaptan önce; hint → ders formülü), ipucuyla doğru Eksikler'de ayrı; ders formül kutusu; çift boşluk (iki boşluk, "x / y")
- [x] Günlük gramer: konu ağırlığı (bağlaç/edat/çift boşluk/relative/zaman), az çıkan 7 konudan en fazla 1, seviye L1 → L2 → L3 (konu bazında %70)
- [x] program.json: az çıkan 7 konu 9. haftada; çift boşluk / bağlaç master / edat / relative / zaman ifadeleri haftaları; yakın anlam çıktı; 3 yarım (h2, h6, h9) + 5 tam ÖSYM (h10–14); faz 2'de kart 15 dk
- [x] Okuma paneli: çevrimdışı uyarısı, çoğul → kök

## v4'te yapılanlar
- [x] Çıkmış sorular gizli repodan (zaceby14/yokdil-ozel/paket.json) anahtarla otomatik: açılışta günde 1, "Soruları güncelle", ETag/304; manuel dosya yükleme duruyor
- [x] Tek anahtar rehberi (gist + repo); anahtarsız Çıkmış ekranında tek satır + düğme
- [x] Boş veri mesajı (Gramer / Alıştırma / Dersler / Okuma); SW v4: "Yeni sürüm hazır — Yenile" bandı, skipWaiting
- [x] Dersler ana menüde (mobil alt çubuk 5 öğe; Eksikler üst ikon + Bugün + yan menü)
- [x] Ders yan paneli: soru oturumundan ayrılmadan (masaüstü sağ panel, mobil tam ekran; geri tuşu kapatır)
- [x] Oturum kaydı (sessions): günlük gramer, hata kutusu, konu, alıştırma, ders testi, okuma soruları, çıkmış tip, boşluk, hafıza; "Kaldığın yerden devam et" + Bugün'de "Yarım kaldı"
- [x] Deneme sınavında kalan süre yalnızca ekran açıkken akar
- [x] Kullanım hataları: çift dokunuşta çift kayıt (kart notu, kart ekle), klavye açıkken alt çubuk gizli, uzun metin taşması, uzun basma sonrası yanlış şık seçimi
- [x] Hızlı not (her ekranda "Not"): bağlam otomatik; Notlar ekranı (ara, düzenle, sil, Tamamlandı, Karta çevir — tek tek ya da "kelime - anlam" satırları toplu)
- [x] Tüm soru ekranlarında kelimeye dokun → kelime paneli (şık: satıra dokun = seç, kelimeye uzun bas = panel; cevaptan sonra dokunmak yeter, bağlam boşluk doldurulmuş cümle)
- [x] SRS merdiveni: Tekrar → 10 dk, sonra 1-3-7-14 gün kesin; Zor (yeni) → yarın + oturumda bir kez daha
- [x] Alıştırmalar: Yazarak hatırla, Eş anlam, Kelime ailesi, Hafıza turu (Bugün görevi); telaffuz düğmesi
- [x] Odak oturumu (25/5, ayarlanabilir), mola ekranı, dakikalar ısı haritasına; aktif okuma "ana fikir" kutuları; 17:00 sonrası uyku ipucu
- [x] İçerik güncelleme: sözlük düzeltmeleri, elle düzenlenmemiş kartlara (userEdited yok) yansır; SRS alanlarına dokunulmaz

## v3'te yapılanlar
- "Biliyorum, gösterme" (yeni kartta), Bildiklerim filtresi + geri al
- Hızlı kelime tarama (#/kartlar/tara): 20'şer, Biliyorum / Bilmiyorum, kaydırma, geri al
- Mezuniyet: aralık ≥ 45 g + son 3 tekrarda unutma yok → "Öğrenildi"; haftada en fazla 5 kontrol
- Eksikler: bildiğin kelime (biliyorum + öğrenildi + olgun), hedef çizgisi, günlük gereken sayı
- Yanlış cevaptan otomatik kart (kelime ağırlıklı sorular), "anlam eksik" rozeti, ayardan kapatılır
- Okumada bilinmeyen çekirdek kelime vurgusu + parça sonu "yeni kelimeler" ekranı
- Boşluk doldurma oyunu (#/kartlar/bosluk), yanlış → kart bugüne

## Seçilen serbest özellikler
- Okuma hızı (kelime/dk) + doğruluk kaydı, sıradaki parçanın seviyesini buna göre önerme
- Tek elle kart akışı: karta dokun = göster, sağa = İyi, sola = Tekrar; klavye (boşluk, 1–4, K)
- Faz geçişi bildirimi (yeni fazın ilk 3 günü Bugün ekranında)

## Sonraki fikirler
- Günlük gramer setini Eksikler'deki soru tipi doğruluğuna göre de ağırlıklandır
- Tarama listesine kendi notlarındaki kelimeleri de katma seçeneği
- Boşluk oyununda kelimenin çekimli halleri (forms.json family) ile şık üretme
- Otomatik kartlarda çevrimdışı eklenen boş anlamları çevrimiçi olunca toplu doldurma
- Hata kutusuna kelime sorusu yanlışlarında ilgili kartı bağlama
- Odak bitince arka planda bildirim (Notification API)
- Otomatik kartta gramer işlev kelimelerini (either, both…) eleme
- Kart oturumunda "bugün çalışılan" sayacını oturumlar arasında koruma
