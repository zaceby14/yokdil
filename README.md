# YÖKDİL Fen

28 Şubat 2027 YÖKDİL Fen sınavı için kişisel çalışma uygulaması. Telefon ve bilgisayarda çalışır, internetsiz de açılır.

## Ne var?
- **Bugün:** kalan gün, haftanın hedefi, günlük görevler (45 dk), *Yoğun gün* (15 dk), seri.
- **Okuma:** hazır parçalar + kendi metnin (More to Read / Ikigai). Kelimeye dokun → karta ekle. Uzun bas ya da *Öbek* ile birden çok kelime seç.
- **Kartlar:** aralıklı tekrar (Tekrar / Zor / İyi / Kolay), manuel kart, liste. *Kelime tara* ile bildiklerini ele; *Boşluk doldurma* oyunu. Yanlış cevaptaki kelimeler otomatik karta eklenir.
- **Sorular:** Gramer (günlük set, hata kutusu, kural notları), Alıştırma (tüm soru tipleri), Çıkmış (kendi paketin), Dersler.
- **Eksikler:** doğruluk grafikleri, unutulan kelimeler, 8 haftalık ısı haritası, deneme sonuçları (puan = doğru × 1,25).

## Kullanım
Siteyi aç: https://zaceby14.github.io/yokdil/ → telefonda "Ana ekrana ekle".

## Senkron (telefon ↔ bilgisayar)
1. [Token oluştur](https://github.com/settings/tokens/new?scopes=gist&description=yokdil) (yalnızca **gist** yetkisi).
2. Uygulamada **Ayarlar → Senkron** kısmına yapıştır → **Kaydet**.
3. Her cihazda bir kez yap. Veriler gizli bir gist'te (`yokdil-sync.json`) tutulur.

Token olmadan da her şey çalışır; veriler sadece o cihazda kalır.

## Çıkmış sorular
ÖSYM soruları sitede yok. Kendi JSON paketini *Sorular → Çıkmış → Paketi yükle* ile cihaza yükle. Paket sadece o cihazda kalır; senkrona yalnızca cevapların gider.
Resmi sayfa: https://www.osym.gov.tr/TR,23801/yokdil-cikmis-sorular.html

## Geliştirici
Derleme yok. `python3 -m http.server` ile çalıştır. Testler: `node tests/merge.test.mjs`, `python3 tests/e2e.py`.
