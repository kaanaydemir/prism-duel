# Arena analizi (2026-11-21)

Durum: analiz bitti, **plan sahibin onayını bekliyor**. Bu çalışmada oyun kodu değişmedi.
Ham raporlar ve ölçüm dosyaları `shots/arena-analysis/` altında (git dışı); bu belge onların özeti.

## 1. Sahip kararları (2026-11-21)

1. **Tek arena: Neon.** Sky Temple askıda; kodu durur, üzerinde çalışılmaz. ("Riot yıllarca tek harita yaptı.")
2. **Hedef görsel oyuna konmaz.** Arena kodla, ayrı ve canlandırılabilir parçalardan çizilir
   (çatlak animasyonu, dalgalanan bayrak gibi şeyler yapılabilmeli).
3. **Hedef sabit:** `docs/v3/ref/hedef-neon-son.png`. Yeni hedef görseli üretilmeyecek.
4. **Kodlamadan önce önizleme onayı.** Önizleme: `docs/v3/ref/analiz-onizleme.png`
   (hedef görünüm + oyunun gerçek canavarları, kartları ve arayüzü).
5. Arena bittikten sonra içerik: 10 canavar, 5 büyü, 5 tuzak (5'erli gruplar hâlinde).
6. Dallar: `main`, `dev`, `mobile`. Geliştirme `dev` dalında.

## 2. Neden hiçbir deneme tutmadı

21 günde 16 deneme, 8 farklı hedef görsel, 5 farklı yapan; hiçbir oyun içi arenaya "güzel" denmedi.

| # | Neden | Kanıt |
|---|---|---|
| 1 | Hedef sürekli değişti | Ardışık hedefler arası fark 10–21 birim; tek bir denemenin kat ettiği en büyük yol 5,7 |
| 2 | Hedefler yapılabilir değildi | ChatGPT kare sayısını, sahne boyunu ve canavarları değiştirdi; ilk uyumlu hedef 21 Kasım'daki |
| 3 | Ton yapısı ters | Hedefte saha en koyu büyük alan (parlaklık 35), salon daha aydınlık (63). Oyunda saha en parlak alan (55–62), salon koyu (31) |
| 4 | Zenginlik yanlış yerde arandı | Hedefte zenginlik büyük şekillerdeki ışık ve renk, sahanın çevresinde. Oyunda küçük ayrıntı eklendi; telefonda "karışık" görünüyor |
| 5 | Çözünürlük ve palet asıl engel değil | Hedef 640×360'a ve oyunun 69 rengine indirilince hâlâ hedef gibi görünüyor (`docs/v3/ref/analiz-640-deney.png`) |
| 6 | Yanlış şey kontrol edildi | Tip denetimi, eski görünümün değişmemesi, palet saflığı; 3× büyütülmüş kırpıntılar. Telefon boyutunda, dolu sahada bakılmadı |
| 7 | Zemin tek ayarla ileri geri çevrildi | Sahne üstü parlaklığı: 58 → 94 → 49 → 44 → 83 → 51 → 40 |
| 8 | Canavarlar arenaya hiç tasarlanmadı | Hedeflerdeki canavarlar ChatGPT'nin yeniden boyadıkları; gerçek canavarlarla tek maket Sky Temple içindi |
| 9 | Ortak kayıt yoktu | Beş ayrı oturum; 6 Kasım'dan sonra hiçbir belge güncellenmedi; `CLAUDE.md` eski kuralları taşıyor |

Hedefine en çok yaklaşan deneme Sky Temple oldu. Farkı: boş arena hedefi, gerçek yerleşimden yazılmış
istem, kodlamadan önce gerçek canavarlarla maket, renklerin hedeften örneklenmesi, ışığın hesapla verilmesi,
her sürümde hedef–sonuç yan yana.

### Yürütücü oturumun hataları (tekrarlanmayacak)

- 13 Kasım'da "zemin daha yüksek çözünürlüklü olsun" önerisini geçersiz bir gerekçeyle reddetti.
- HD-2D isteğini beş dakikalık zayıf bir denemeyle geçiştirdi.
- Ölçmeden "hedefe çok yaklaştık" dedi.
- Hedefle ölçerek karşılaştırma sözünü 11 Kasım'da verdi, uygulamadı.
- "OK" cevabını "istediğim bu" diye yorumladı; "OK" yalnızca "devam et" demek.

## 3. Sahibin isteği (kendi sözlerinden ve seçtiği 14 görselden)

1. Canavarlar koyu, soğuk ve sade bir zeminden ışık ve renkle öne çıksın (5 kez söylendi).
2. Sahanın çevresi göz alıcı olsun, iç karartıcı olmasın: küçük ayrıntıyla değil, sıcak ve neon ışıkla.
3. Oyundaki sonuç onaylanan görselle birebir olsun; her parça canlandırılabilir kalsın.

Değişmezler: karelerin içi boş; boş ve dolu kare bir bakışta ayrılır; işlevsiz yuva yok; hologramlar parlak;
seyirci yok; düellocular platformda; kalın 2,5B sahne; kamera aynı.

## 4. Ölçülü hedef (640×360, dolu saha `stBoard`, telefon boyutunda)

| Ölçüt | Hedef | Oyun (21 Kasım) |
|---|---|---|
| Canavarın altındaki zemin parlaklığı | 30–40 (hedef 34–37) | 55–62 |
| Zemin rengi | soğuk lacivert, ton 230–240°, doygunluk 0,35–0,45 | sıcak mor-kahve, ton ~311° |
| Zeminin canavar çevresindeki dalgalanması | ≤ 10 | 13–38 |
| Canavar − zemin parlaklık farkı (ortalama / en kötü) | ≥ +40 / ≥ +20 | yöntemine göre +23…+44 / +8…+10 |
| Kare çizgileri | canavarların ortancasından koyu | canavarlardan parlak |
| Saha üstünde canlı camgöbeği + kırmızı payı | ≤ %11 | ölçüme göre %9–21 |
| Salon zemini parlaklığı | 60 ± 8 | 31 |
| Sahne duvarları parlaklığı | 45–55 | 22 |
| Sıcak ışık payı / renklilik | ≥ %15 / ≥ 85 | %8 / 66 |
| Çevre ortalaması, sahneden | parlak ya da eşit | çok daha koyu |
| Zemin altı sınırı | hiçbir yerde 28'in altına inmez | — |

Not: farklı ölçüm yöntemleri farklı mutlak değer veriyor; her turda **aynı maske ve aynı betik** kullanılacak.
Saha ölçütleri gerekli ama yeterli değil: 9 Kasım'daki yapı bunlara yakındı, salonu koyu olduğu için kabul görmedi.

## 5. Canavar kuralları (44 canavarın tamamından)

- Bütün canavarların dış çizgisi aynı: neredeyse siyah (`#07070f`). Zemin parlaklığı 26'nın altına inerse
  çizgi kaybolur; Sky Temple'ın koyu kareleri (19) bu yüzden canavarı yutuyor.
- En iyi zemin: düz lacivert, parlaklık 34 civarı (`#1e2135` – `#212439`).
- Hedef zeminde 44 canavarın 7'si hâlâ zayıf kalıyor (koyu olanlar, örnek: Abyss Magus). Bunlara kenar ışığı şart.
- Önizlemede etkisi ölçülen dokunuşlar: **kenar ışığı** (+9) ve **hafif renk canlandırma** (+6).
  Temas gölgesi, renk havuzu, yansıma ve parlama ölçülebilir fark yaratmadı.
- Oyunda kenar ışığı, renk havuzu ve gölge için ayrı nesneler zaten var; ayar gerekiyor, yeni sistem değil.
- Canavarların %30'u 1,5 kareden geniş: kare çizgileri tam görünmeye güvenemez.

## 6. Önizlemeden öğrenilenler

- Hedefin zemini ve çevresi, gerçek canavarlarla da çalışıyor: fark +44 → +66.
- Aynı tasarım 640×360 ızgarada da aynı görünüyor ve aynı sayıları veriyor: **kaldıraç çözünürlük değil, ton ve renk.**
- İnce ızgarada 1 piksellik kare çizgisi telefonda kayboluyor; çizgiler oyun pikselinde kalmalı.
- Önizlemenin çevresi hâlâ bir boyama (63 bin renk; oyunda 3,4 bin). Kodla çizilen sonuç daha sert olacak;
  bu henüz denenmedi ve planın ilk riskidir.
- Önizlemedeki kusurlar: hologram figürleri yok, isim etiketleri lekeli, sahnenin üst köşesi ~4 piksel kayık.

## 7. Plan (onay bekliyor)

Her adımın sonunda: sabit hedefle yan yana, telefon boyutunda, dolu sahada karşılaştırma + yukarıdaki ölçütler +
telefonda deneme sürümü. "OK" yetmez; sahip "hedefle uyuşuyor" derse adım kapanır.

| Adım | İş | Kapanış ölçütü |
|---|---|---|
| 0 | Kayıt: bu belge, `CLAUDE.md` kurallarının güncellenmesi, varsayılan arena Neon, seçici gizli | Sahip onayı |
| 1 | Saha üstü ve canavarlar: düz lacivert zemin, ince ve loş kare çizgileri, kenar ışığı, hafif renk canlandırma | Fark ≥ +40 / ≥ +20; zemin 30–40 |
| 2 | Sahne kenarı ve duvarları: altın/bronz kenar, aydınlık duvar panelleri | Duvar 45–55 |
| 3 | Salon zemini: ıslak, yansıtan zemin; sıcak ve soğuk ışık havuzları | Salon 60 ± 8 |
| 4 | Arka duvar ve eşyalar: bayraklar (dalgalanır), mangallar (alev), kristaller, halı, kaideler | Sıcak pay ≥ %15 |
| 5 | Işık geçişi: yumuşak, hesaplanan ışık; parlak hologramlar; Volkan / Gelgit uyarlaması | Renklilik ≥ 85 |
| 6 | Bitiriş: başlık ekranı, mağaza görselleri, video, sürüm | — |

Yöntem (Sky Temple'dan alınanlar): renkler hedeften örneklenir; ışık elle değil hesapla verilir; her parça
ayrı katman; tek oturum sahiplenir; her turda aynı ölçüm.

## 8. Açık sorular (sahibe)

1. Önizleme hedef olarak doğru mu; değişmesini istediği bir şey var mı (sis, kare çizgileri, amblem)?
2. Canavarlar: (A) çizimler aynen kalsın, yalnızca kenar ışığı ve hafif canlandırma; (B) yeniden boyansın.
   Varsayım: A.
3. Arena canavarlarla aynı pikselde mi kalsın (öneri), yoksa daha ince mi çizilsin?
4. Sahayı büyütmek: eldeki kartlar yarı gizli dursun mu? Varsayım: hayır.
