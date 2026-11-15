# YÖKDİL Fen

28 Şubat 2027 YÖKDİL Fen sınavı için kişisel çalışma uygulaması. Telefon ve bilgisayarda çalışır, internetsiz de açılır.

## Ne var?
- **Bugün:** kalan gün, haftanın hedefi, günlük görevler (45 dk), *Yoğun gün* (15 dk), seri.
- **Okuma:** hazır parçalar + kendi metnin (More to Read / Ikigai). Kelimeye dokun → karta ekle. Uzun bas ya da *Öbek* ile birden çok kelime seç.
- **Kartlar:** aralıklı tekrar (Tekrar / Zor / İyi / Kolay), manuel kart, liste. *Kelime tara* ile bildiklerini ele; *Boşluk doldurma* oyunu. Yanlış cevaptaki kelimeler otomatik karta eklenir.
- **Sorular:** Gramer (günlük set, hata kutusu, kural notları), Alıştırma (tüm soru tipleri), Çıkmış (gizli repodan otomatik). Sorudaki kelimeye dokun → karta ekle; şıkta uzun bas → kelime.
- **Dersler:** ana menüde; soru çözerken "Ders" ile yanda açılır (sayfadan çıkmadan).
- **Notlar:** her ekranda sağ altta *Not*; bağlam otomatik kaydedilir, notu karta çevir.
- **Hafıza:** "Tekrar" dediğin kelime 10 dk, 1, 3, 7, 14 gün sonra kesin gelir. Yazarak hatırla, eş anlam, kelime ailesi, hafıza turu.
- **Odak:** 25 dk çalış / 5 dk ayağa kalk; dakikalar ısı haritasına yazılır.
- **Eksikler:** doğruluk grafikleri, unutulan kelimeler, 8 haftalık ısı haritası, deneme sonuçları (puan = doğru × 1,25).

Yarım kalan her oturum kaydedilir: başka sekmeye geçip dönünce *Kaldığın yerden devam et*.

## Kullanım
Siteyi aç: https://zaceby14.github.io/yokdil/ → telefonda "Ana ekrana ekle".

## GitHub anahtarı (senkron + gizli sorular)
Tek anahtar iki iş görür.
1. [Anahtar oluştur](https://github.com/settings/tokens/new?scopes=gist,repo&description=yokdil) (classic; **gist** + **repo**).
2. **Ayarlar → GitHub anahtarı** kısmına yapıştır → **Kaydet**. Her cihazda bir kez.

- Senkron: veriler gizli bir gist'te (`yokdil-sync.json`).
- Çıkmış sorular: gizli repo `zaceby14/yokdil-ozel` → `paket.json` açılışta günde bir kez (ETag ile) indirilir, yalnızca cihazda (IndexedDB) tutulur. Soru metinleri senkrona girmez.

Anahtar olmadan da her şey çalışır (çıkmış sorular hariç; istersen *Çıkmış → Dosyadan yükle*).

## Çıkmış sorular
ÖSYM soruları açık sitede yok; gizli repodan anahtarla gelir.
Resmi sayfa: https://www.osym.gov.tr/TR,23801/yokdil-cikmis-sorular.html

## Geliştirici
Derleme yok. `python3 -m http.server` ile çalıştır. Testler: `node tests/merge.test.mjs`, `python3 tests/e2e.py`.
