# Yol haritası

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
- Çeviri sorularında cümle parçalama yardımı (ana bağlaç / özne / fiil renkli)
- Sınava son 14 gün: yeni kelime otomatik azalt, tekrar + deneme modu
- Okuma hızı grafiği (haftalık) ve hedef hız çizgisi
- Tarama listesine kendi notlarındaki kelimeleri de katma seçeneği
- Boşluk oyununda kelimenin çekimli halleri (forms.json family) ile şık üretme
- Otomatik kartlarda çevrimdışı eklenen boş anlamları çevrimiçi olunca toplu doldurma
- Hata kutusuna kelime sorusu yanlışlarında ilgili kartı bağlama
- Odak bitince arka planda bildirim (Notification API)
- Otomatik kartta gramer işlev kelimelerini (either, both…) eleme
- Kart oturumunda "bugün çalışılan" sayacını oturumlar arasında koruma
