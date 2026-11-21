# YÖKDİL Fen

28 Şubat 2027 YÖKDİL Fen sınavı için kişisel çalışma uygulaması. Telefon ve bilgisayarda çalışır, internetsiz de açılır.

## Ne var?
- **Bugün:** kalan gün, haftanın hedefi, görevler (Kart tekrarı · Yeni kelime · Gramer · Hata tekrarı ≤8 · Okuma; dakikalar gerçek sayıdan), *Yoğun gün*, seri (haftada 1 joker; deneme günü sayılır), yarım kalan oturum/deneme bandı.
- **Okuma:** hazır parçalar + kendi metnin (More to Read / Ikigai). Kelimeye dokun → karta ekle. Uzun bas ya da *Öbek* ile birden çok kelime seç.
- **Kartlar:** aralıklı tekrar (Tekrar / Zor / İyi / Kolay), manuel kart, liste. *Kelime tara* ile bildiklerini ele; *Boşluk doldurma* oyunu. Yanlış cevaptaki kelimeler otomatik karta eklenir.
- **Sorular:** Gramer (günlük set: konu ağırlığı + seviye L1→L3, çift boşluk; hata tekrarı; kural notları), Alıştırma (tüm soru tipleri), Çıkmış (gizli repodan; bölüm bölüm çözme, ÖSYM/Yayınevi filtresi). Bitişte yanlış listesi, "Yanlışları tekrar çöz", sıradaki görev. Sorudaki kelimeye dokun → karta ekle; şıkta uzun bas → kelime.
- **Dersler:** ana menüde; üstte *Araçlar* (karar ağacı, bağlaç kartları, zaman tablosu, kopya kağıtları, şık eleme, kişisel kurallar). Her dersin başında 30 sn formül. Soru çözerken "Ders" o sorunun konusunun/tipinin dersini yanda açar; cevaptan önce "İpucu".
- **Notlar:** telefonda üst çubukta *Not* (masaüstünde sağ altta); bağlam otomatik kaydedilir, notu karta çevir.
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
