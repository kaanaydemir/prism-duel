# Füzyon storyboard — Prizma Füzyonu → Trinity Crystal Wyrm

Oyunun en büyük anı. Kod: `src/cinematics/fusion/trinity.ts` (+ `_fx.ts`), ses: `src/audio/v3/fusion.ts`,
cut-in: `src/art/cutins-v3/trinity_crystal_wyrm.ts`. Yalnız `?look=v3`; v1 aynen eski zincirden geçer (yer tutucu).

Süreler sahne zamanı (ms); v3 temposu (×1,35) ve hız ayarı (1×/2×/3×, Space ile ileri sarma) hepsine aynı
saatten uygulanır. Toplam ≈ 5,2 s sahne zamanı (≈ 7 s gerçek, cut-in dahil); azaltılmış hareket ≈ 4,3 s.

Kimlik: üç baş = Mi majör akorunun üç notası (C = E, B = G#, A = B). Her ses bu akor üzerine kurulu; üç iplik
renkleri saldırı örgüsüyle aynı: A **macenta**, B **altın**, C **turkuaz**.

| # | Vuruş | ms | Görüntü | Işık | Ses |
|---|-------|----|---------|------|-----|
| 1 | Açılış | 0–300 | Büyü kartı v3 açılışıyla elden düellocunun yanına uçar (set ise karo üstünde dikilir), rün halkası, isim plakası | kartın turkuaz havuzu; arena kararmaya başlar (dim 0,55) | `spellOpen` |
| 2 | Prizma doğar | 300–560 | Kartın enerjisi kavisle hedef bölgenin üstüne uçar ve **dönen kristal prizmaya** dönüşür (tam piksel adımlarla büyür, sağ kenarında gökkuşağı saçağı); küçük yıldız parlaması | prizmada cyan hava ışığı + zemin havuzu | `fusionPrism` (akoru çıkan cam arpej) |
| 3 | Kırılma | 560–760 | Harcanmış kart prizmaya **beyaz ışın** atar; prizma onu **gökkuşağına** böler: her malzemeye kendi renginde bir ışın (üzerinde akan parlak tireler), zeminde altı renkli yelpaze | macenta/altın/turkuaz zemin havuzları | `fusionSplit` (ışın vınlaması → stereo yayılan altı cam nota) |
| 4 | Toplanma | 760–1900 | Malzemeler sırayla (150 ms arayla) cevap verir: el kartı elden yükselir, beyaz parlar, **ejderin ışık formu** (kendi karesi beyaz/cyan ışık bantlarıyla) ondan kopar, boş kart mezarlığa düşer; sahadaki ejder beyaz parlar, ışık formu kalkar (kapalı kart önce açılır), kartı mezarlığa gider; ekipmanı kural gereği kırılır. Formlar tam pikselde geniş bir kavisle prizmanın yörüngesine **süzülür**, arkalarında iplik renginde art-görüntüler; yörüngede üç adımda sönüp **kuyruklu yıldıza** dökülür | her malzemede iplik renginde parlama; ışın geri çekilir | `fusionGather` (koro + synth yatağı, yükselen; sürekli) · her malzeme `fusionCall` (cam çığlık + vınlama, perde E→G#→B) |
| 5 | Sarmal | 1900–2620 | Füzyon Destesi kartını verir (desteden prizmaya mor bir çizgi, sayaç bir azalır). Üç yıldız önce karonun çevresine **dalar**, sonra hızlanıp daralarak prizmaya doğru **yükselen üç iplikli sarmal** örer (izleri sütunu çizer); karoya füzyon mührü (çember + dönen üçgen + üç renkli düğüm) kendini çizer; prizma hızlanır, akkorlaşır; parçacıklar içeri çekilir; kamera hafifçe prizmaya kayar | üç iplik ışığı yıldızları izler; dim 0,72 | `fusionHelix` (dönen üç ton, hızlanan girdap, sıklaşan cam tıkırtılar) · `fusionDeckDraw` |
| 6 | Çöküş | 2620–2990 | **Nefes alma**: her şey içeri emilir, iplikler noktaya kapanır, prizma tek piksel çizgiye iner; en karanlık an | dim 0,9 | `fusionCollapse` (ters cam şişmesi → sub düşüş) → **70 ms sessizlik** |
| 7 | Kör edici nokta | 2990–3220 | Yıldız (çapraz ışınlar 100 px'e açılıp söner), zeminde **gökkuşağı şok halkaları** tüm arenaya yayılır (+ ikinci yankı), arenanın kendi büyük şok dalgası (react.ts) ve portre ekranlarında glitch; 110 ms hit-stop, 4 px sarsıntı; karoda **ışık sütunu** belirir; harcanmış büyü kartı mezarlığa gider | beyaz flaş + halka; projektörler bir an parlar (dim −0,85) sonra 0,4 | `fusionBurst` (sub patlama, cam patlaması, tüm akor, uzun parlak kuyruk) |
| 8 | Doğuş | 3220–5060 | Koza sütunun içinde beyaz doğar (iki kare beyaz, bir kare cyan), `summon` anim'i SUMMON_BEATS ile: **f2 iniş** (toz, altın halka, 3 px sarsıntı, sütun söner) · **f3** cam içten yanar (çekirdekten ışınlar) · **f4–5 kanatlar açılır**: prizma kanatları zemine gökkuşağı kırar (iki yelpaze + üç renkli havuz) · **f7/f9/f11** A, B, C başları sırayla kalkıp kükrer (her biri kendi renginde ağız patlaması + kendi sesi) · **f12 üçlü kükreme**: çekirdekten 14 gökkuşağı ışını, gökkuşağı halkası, sahibinin renginde arena süpürmesi, 4 px sarsıntı | sütun/çekirdek/ağız flaşları, kanat kırılma havuzları, f12'de projektör patlaması | `trinityLand` · `trinityFlare` · `trinityUnfold` · `trinityRoarA` (yüksek, keskin, B5) · `trinityRoarB` (soylu, pirinç, G#5) · `trinityRoarC` (derin, göğüs, E5) · `trinityTriple` |
| 9 | Cut-in | f12 + 140 → +900 | "TRINITY CRYSTAL WYRM!" bandı ejderin ayaklarının altından geçer; portrede üç baş (macenta / altın / cyan) sırayla kükrer; gövde bu sırada yerleşir (f13–15) ve idle'a döner | — | `trinityCutin` (prizma parıltısı + akor vuruşu; genel cut-in sesleri söndürülür) |
| 10 | Yerleşme | +900 → +1100 | Rozet (4500 / 3800) belirir, yukarıdan gökkuşağı kıvılcımları süzülür; ışık normale döner, kamera dinlenmeye | dim 0, havuzlar söner | `fusionSparkle` |

Kapsam: P2 (aynalı, P2 kartları gizli elden doğar), yalnız el / yalnız saha / karışık malzeme, kapalı saha malzemesi,
ekipmanlı malzeme (kural kırılması kendi zamanında oynar), bot. Azaltılmış hareket: aynı vuruşlar daha kısa, sarmal
yok (formlar düz yükselir), sarsıntı / hit-stop / beyaz yıkama yok, yarı parçacık. Arena v4 dışı tahtalarda Füzyon
Destesi yığını ve tepki katmanı yoksa o parçalar sessizce atlanır. Sonunda hiçbir nesne, tween, ses kalmaz.
