# Arena ölçümü (`tools/arena-check.mjs`, 2026-11-21)

Arenanın her turu **tek bir araçla, aynı maske ve aynı hesapla** ölçülür (ARENA_ANALIZ.md §2, §4). Yalnızca Node gerekir.

**Çalıştırma:** `node tools/arena-check.mjs --label <ad> [--compare baseline] [--scenario stBoard] [--arena neon]`
Çıktı: `shots/arena-check/<ad>/report.md` (tablo), `report.json` (ham sayılar, canavar başına değerler, bölgeler),
`sheet.png` (hedef | yapı, renkli ve gri, ×2), `layers/masks.png` ve `layers/target-masks.png` (maskeleri gözle kontrol için).

**Ne ölçer:** `?dev=steam&s=stBoard&look=v3&arena=neon`, 640×360, saat dondurulmuş, düello sahnesi baştan kurulur ve
9100 ms oyun zamanına adımlanır (8000 ms + iki hologram heykeli tam görünene kadar). Duel sahnesi gruplar halinde siyah ve
beyaz üstüne yeniden çizilir; böylece her katmanın gerçek alfası bulunur (arena, kare karoları, kartlar, her canavar, HUD).
Bölgeler oyunun kendi geometrisinden gelir (yeniden yerleşimde kendiliğinden kayar): sahne üstü = `layout-nt.ts PLATE_POLY`;
oyun yüzeyi = sahne üstü − kare çizgileri − kartlar − canavarlar − HUD; zemin halkası = her canavarın 5 px çevresi (oyun
yüzeyinde); duvar = aşağı bakan kenarların altındaki `FACE_H` bandı; salon zemini ve arka duvar = sahne köşelerine göre
dikdörtgenler; HUD = `layout.ts UI` dikdörtgenleri ∪ HUD katmanı. Parlaklık Rec. 601 (0–255). Hedef resim
(`docs/v3/ref/hedef-neon-son.png`) 640×360'a kutu örneklenir, elle konmuş bölgeleri ve önbellekteki sayıları
`tools/arena-check.target.json` içindedir (`--retarget` yeniden hesaplar). Tanımların tamamı aracın başlık yorumunda.

**Tablo nasıl okunur:** her satır ölçüt | hedef (ARENA_ANALIZ §4) | hedef resmin değeri | bu yapı | PASS/FAIL.
`--compare` ile son sütun önceki çalışmaya göre değişimi verir. Canavar başına tablo en zayıf canavarı gösterir.

**Taban çizgisi (`--label baseline`, 21 Kasım, 0/14 geçer):**

| Ölçüt | Hedef | Hedef resim | Yapı |
|---|---|---|---|
| Zemin parlaklığı (halka) / dalgalanma | 30–40 / ≤10 | 37,2 / 15,0 | 63,4 / 28,4 |
| Yüzey tonu / doygunluğu | 230–240° / 0,35–0,45 | 240° / 0,39 | 338° / 0,25 |
| Canavar − zemin ort. / en kötü | ≥+40 / ≥+20 | +73,7 / +39,6 | +28,7 / −12,4 (abyss_magus) |
| Kare çizgisi − canavar ortancası | < 0 | −15,4 | 0,0 |
| Canlı camgöbeği+kırmızı % | ≤11 | 6,9 | 22,3 |
| Salon zemini / sahne duvarı | 52–68 / 45–55 | 63,0 / 49,3 | 39,9 / 22,0 |
| Sıcak ışık % / renklilik | ≥15 / ≥85 | 18,6 / 89,3 | 9,2 / 65,1 |
| Çevre − sahne / en koyu zemin (8×8) | ≥0 / ≥28 | +4,8 / 20,2 | −28,8 / 23,3 |

**Gürültü tabanı:** aynı yapıda iki çalışma piksel piksel aynı kare verir; bütün sayıların farkı 0,00.
Kare zamanı değişirse (canavar idle, sis, alev, hologram titremesi) fark: zemin ±1,5, dalgalanma ±3, en kötü canavar ±4,
diğerleri ≤1,2. Bir değişiklik canlandırma zamanlamasını da değiştiriyorsa bu kadarlık oynamayı gerçek iyileşme sayma.
**Sınırlar:** hedef resim kendi iki ölçütünü geçmiyor (dalgalanma 15, en koyu zemin 20: gölge ve çizgi araları sayılıyor);
hedefin canavar maskesi kaba (kutu + renk farkı). Dış kenardaki dolu pedler kare çizgisi sayılır. "Çizgi − canavar" 0,0: iki ortanca aynı palet rengi.
