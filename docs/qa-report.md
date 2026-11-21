# PsychoAI — QA hesabatı (Qartal, Task 7)

Tarix: 2026-11-20. Yoxlama: `npx vitest run`, `npx vite build`, açar axtarışı, 3 real `/api/analyze` sorğusu,
headless brauzerdə tam axın (`tests/e2e/qa-flow.mjs`, Live/token/analyze mock-larla — kvota xərclənmir).
Ekran şəkilləri: `docs/qa/screens/` (20 ekran × 360/1280 × açıq/qaranlıq = 80 şəkil).

Təkrar işə salmaq:
```
npx vite --port 5175 --strictPort
QA_CHANNEL=msedge node tests/e2e/qa-flow.mjs        # Playwright Chromium yüklənmirsə sistem Edge-i (headless)
```

## Nəticə: 98/98 avtomatik yoxlama keçdi

| Yoxlama | Nəticə |
|---|---|
| `npx vitest run` (74 test) | ✅ |
| `npx vite build` | ✅ |
| Açar (son 6 simvol) `src/`, `dist/`, `api/`, `tests/`, `docs/`, git-də | ✅ yoxdur |
| `/api/analyze`: 3.8-flash 429 → ehtiyat modelə keçid → 200 | ✅ (düzəlişdən sonra, 5.4 san, `gemini-3.6-flash`) |
| RF1 Mikrofon rədd edilir → azərbaycanca izah, "Yenidən cəhd et" + "Geri qayıt", token istənmir | ✅ |
| RF1+ Mikrofon tapılmır → "Mikrofon tapılmadı" (əvvəl səhvən "icazə verilmədi" yazırdı) | ✅ düzəldildi |
| RF2 Bağlantı kəsilir → transkript qalır, "Yenidən qoşul" işləyir, yeni setup köhnə söhbəti daşıyır, "Görüşü tamamla" əlçatandır | ✅ |
| RF3 Cihaz saatı +3 gün, server eyni gün → kilidli; server ertəsi gün → açılır; `/api/time` yoxdur → bağlı (offline) | ✅ |
| RF4 Analiz 502 → level COMPLETED, summary=null, gündəlik kilid işləyir; "Xülasəni yenidən hazırla" sonra xülasə+tapşırıq+proqram yazır | ✅ |
| RF5 Böhran ifadəsi → dərhal dəstək kartı, `tel:112` | ✅ (mobildə kart düymələri örtülürdü — düzəldildi) |
| Token xətası → "Görüş otağını aça bilmədim" | ✅ |
| Tam axın: ad → Bu gün → əhval əvvəl → otaq (səs, yazı, səssiz) → tamamla → əhval sonra → təhlil → nəticə (xülasə, 2 tapşırıq, 5 levellik proqram) | ✅ |
| Bu gün / Görüş otağı gündəlik kilidi göstərir | ✅ |
| Yol Xəritəsi: dolu günü seçəndə sonrakılar sürüşür, eyni gündə 2 level yoxdur, sıra qorunur, bu günə heç nə düşmür | ✅ |
| Tapşırıqlar: işarə + qeyd reload-dan sonra qalır | ✅ |
| Vəziyyətim: SVG qrafik çəkilir | ✅ |
| 360px-də üfüqi sürüşmə (bütün ekranlar, açıq və qaranlıq) | ✅ yoxdur |
| Konsol xətaları (bütün axınlarda) | ✅ yoxdur (yalnız mock-lanmış 502-nin şəbəkə qeydi) |
| UI mətnində türkcə söz / qırıq hərf (ə, ı, İ, ğ, ş, ç) | ✅ tapılmadı; şriftlərdə ə düzgün görünür |

## Qartalın düzəlişləri

1. **`api/analyze.js`**: `thinkingConfig: { thinkingLevel: "low" }` əlavə olundu. Əvvəl hər üç model öz vaxt pəncərəsində
   (22/18/20 san) cavab vermədi → istifadəçi həmişə 502 alırdı. İndi ~5 san. 429 artıq əvvəldən ehtiyat modelə keçirdi (kodda və real sorğuda təsdiqləndi).
2. **`src/styles/room.css`**: mobildə böhran kartı (46dvh) + transkript yerə sığmırdı, "112-yə zəng et" alt idarəetmə panelinin
   üstünə düşürdü və "Söhbətə davam et" görünmürdü. İndi slot sıxılır/sürüşür, kart görünəndə orb kiçilir, 112 düyməsi tam görünür.
3. **`src/ui/room.js`**: mikrofon tapılmayanda / məşğul olanda / brauzer dəstəkləməyəndə LiveSession-un dəqiq mesajı göstərilir
   (əvvəl həmişə "Mikrofona icazə verilmədi" və ya "İnternet bağlantısı kəsildi" yazırdı).
4. **`src/voice/live.js`**: xəta mesajları "sən"dən "siz" müraciətinə keçirildi (UI-nin qalan hissəsi ilə eyni ton).
5. **`src/ui/welcome.js`**: forma `novalidate` — boş adda brauzerin öz (ingiliscə/rusca) pəncərəsi əvəzinə azərbaycanca xəta görünür.
6. **`tests/e2e/qa-flow.mjs`** + `tests/e2e/analyze-fixture.json`: təkrar işə salına bilən headless QA ssenarisi; `playwright@1.49.1` devDependency.

## Açıq məsələlər (ciddiyyətə görə)

| # | Sahib | Ciddiyyət | Problem | Təklif |
|---|---|---|---|---|
| 1 | Usta / Ahad | Orta | `gemini-3.8-flash` pulsuz limiti gündə 20 sorğudur; limit bitəndə hər analiz əvvəl 429 alır, sonra 3.6-ya keçir (işləyir, amma əsas model faktiki olaraq 3.6-dır). | Ya ödənişli tier, ya da `MODEL`-i 3.6-flash edib 3.8-i ehtiyata qoymaq. |
| 2 | Usta | Aşağı | `analyze.js`-də 4xx (429-dan başqa) gələndə dövr dayanır (`break`). Əgər bir model `thinkingConfig`-i rədd etsə (400), ehtiyat modellər sınanmayacaq. | 400-də də növbəti modelə keçmək (`continue`), yalnız JSON parse xətasında dayanmaq. |
| 3 | Fırça | Orta | Vəziyyətim qrafiki 360px-də çox kiçikdir: viewBox 640 → ~300px, ox yazıları ~5–6px, oxunmur. Tək görüşdə yalnız 3 kiçik nöqtə görünür. | Konteyner eninə görə viewBox-u dəyişmək (mobildə W≈360) və ya SVG yazı ölçüsünü mobildə 2× etmək; nöqtə radiusunu böyütmək. |
| 4 | Fırça | Aşağı | Yol Xəritəsində "Günü dəyiş"/gün seçimindən sonra `paint()` bütün DOM-u əvəz edir, fokus itir (klaviatura istifadəçisi səhifənin başına qayıdır). | `paint()`-dən sonra fokusu açılan düyməyə / seçilmiş günə qaytarmaq. |
| 5 | Fırça | Aşağı | Böhran kartı mobildə görünəndə kiçilmiş orbun üstünə "Siz danışırsınız" yazısı düşür. | Bu halda `.orb-caption`-ı gizlətmək və ya orbun altına çəkmək. |
| 6 | Fırça | Aşağı | Transkriptdə "siz" etiketi kiçik hərflə, "PSİXOLOQ" böyük hərflə görünür. | Hər ikisini eyni üslubda vermək. |
| 7 | Fırça | Aşağı | Toast (məs. "Level 2: 1 dekabr") səhifə dəyişəndə də bir neçə saniyə qalır. | Route dəyişəndə toast-u bağlamaq (kritik deyil). |

Dərya: problem yoxdur — real analiz cavabı səlis azərbaycanca idi, böhran testləri (57) keçir.

## Əl ilə yoxlanmalı (Ahad, real mikrofonla)

1. Chrome/Edge-də ilk görüş: mikrofon icazəsi pəncərəsi çıxır, icazədən sonra psixoloq özü salamlaşır (Kore səsi, azərbaycanca).
2. Səs keyfiyyəti: cavab kəsik-kəsik/xırıltılı deyil; orb danışanda böyüyür.
3. Psixoloq danışarkən sözünü kəsin — səs dərhal dayanmalıdır (interrupt).
4. Qulaqcıqsız (dinamiklə) danışın — exo səbəbindən AI özünü kəsməməlidir.
5. Transkript: sizin və psixoloqun sözləri azərbaycanca düzgün yazılır (ə, ğ, ı).
6. "Səssiz" → AI sizi eşitmir; "Səsi aç" → yenidən eşidir. "Yaz" ilə mesaj göndərin → AI səslə cavab verir.
7. Söhbət zamanı Wi-Fi-ı 10 san söndürün → "Bağlantı kəsildi", transkript qalır; açıb "Yenidən qoşul" → AI salamı təkrarlamadan davam edir.
8. Mikrofon icazəsini rədd edin (kilid işarəsi → Bloklamaq) → aydın azərbaycanca izah, səhifə sınmır.
9. Böhran ifadəsi deyin (məs. "bəzən yaşamaq istəmirəm") → dəstək kartı və 112 düyməsi dərhal görünür; telefonda düymə zəng açır.
10. 10+ dəqiqəlik söhbət → bağlantı qopmur; "Görüşü tamamla" → əhval → nəticə 10 saniyəyə qədər gəlir.
11. Telefonda (iOS Safari və Android Chrome) eyni axın; ekranı kilidləyib açanda səs bərpa olunur.
