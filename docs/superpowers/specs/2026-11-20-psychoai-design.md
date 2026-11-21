# PsychoAI — dizayn sənədi (2026-11-20)

## Niyə
ICT dərsi üçün müəllimin tələb etdiyi layihədir. Bu, sayt şəklində bir AI psixoloqdur: Azərbaycan dilində **səsli canlı söhbət** aparır, seansları təqvimlə planlayır və istifadəçinin psixoloji vəziyyətini izləyir. Ahadın dostunun ideyasıdır, əsas plan `Downloads/implementation_plan.md` faylındadır.

**Uğur:** müəllimin qarşısında açılır, psixoloq azərbaycanca təbii danışır, söhbət kəsilmir, sayt gözəl görünür.

## Məqsədlər
1. Gemini Live ilə real vaxtda azərbaycanca səsli seans: danışmaq, sözünü kəsmək, canlı yazı (transkript), istəsən yazıb göndərmək.
2. Səviyyə (level) proqramı: Level 1 tanışlıqdır, ondan sonra AI 5–7 günlük fərdi proqram qurur. **Gündə 1 level** olur.
3. Təqvim / Yol Xəritəsi: növbəti levellərin günlərini göstərir və onları seçmək olur.
4. Tapşırıqlar: hər seansdan sonra 2–3 praktiki tapşırıq verilir. İşarələyirsən, qeyd yazırsan, növbəti seansda psixoloq bunları soruşur.
5. **Əhval izləmə** (dostunun "psixoloji durumunu track edir" istəyi): seansdan əvvəl və sonra 1–10 əhval qeydi, AI-ın hər seansdan sonra qısa qiymətləndirməsi, zamanla dəyişən qrafik.
6. "Sakit Məkan" görünüşü: krem, adaçayı yaşılı və gil rəngləri, səsə reaksiya verən nəfəs dairəsi (orb), telefonda da rahat açılır.

## Nə etmirik
- Android tətbiqi etmirik, yalnız saytdır.
- Zəng etmir, bildiriş göndərmir. Görüşü yalnız istifadəçi özü başladır.
- Real klinik məhsul deyil: diaqnoz qoymur, dərman tövsiyə etmir.
- Azure və başqa səs xidmətləri istifadə olunmur, yalnız Gemini.

## Qırmızı xətlər (texniki işləsə belə uğursuzluq sayılır)
- Psixoloqun türkcəyə keçməsi və ya qırıq azərbaycanca danışması.
- API açarının saytın kodunda görünməsi.
- Böhran anında (özünə zərər) düzgün reaksiya verməməsi. 112 / yaxınlara müraciət mesajı **mütləq** olmalıdır.

## Yanaşmalar (seçildi)
- **Səs:** A — Gemini Live (`gemini-3.8-live`) seçildi. Sınaqda azərbaycanca B-dən (Gemini eşidir → yazır → TTS) yaxşı idi və söhbət daha canlıdır. Ahad seçdi.
- **Hosting:** Vercel, portfolio kimi. *(Claude-un qərarı)*
- **Açarın qorunması:** Vercel serverless funksiyası hər seans üçün qısaömürlü (ephemeral) Live token verir. Brauzer əsl açarı heç vaxt görmür. *(Claude-un qərarı)*
- **Məlumat:** v1-də brauzerin yaddaşında saxlanır (localStorage/IndexedDB), giriş tələb olunmur. Dərs nümayişi üçün sadə və etibarlıdır. Firebase/Google girişi sonra əlavə oluna bilər. *(Claude-un qərarı. Planda Firebase var idi, amma hesab qurmaq və açarlar işi çox uzadır.)*
- **"Gündə 1 level" kilidi:** tarix brauzerdə saxlanır, saatı dəyişməmək üçün serverin vaxtı (`/api/time`) ilə yoxlanılır. *(Claude-un qərarı)*
- **Seansdan sonra analiz:** seansın transkripti `gemini-3.8-flash`-a JSON sxemi ilə göndərilir. Nəticədə xülasə, tapşırıqlar, əhval qiymətləndirməsi və (Level 1-dən sonra) proqram xəritəsi gəlir. Bu da serverless funksiya ilə edilir.
- **Stack:** Vite + vanilla JS/TS, framework yoxdur. Sayt yüngül olsun, agentlər asan işləsin. *(Claude-un qərarı)*

## Səhifələr
- **Bu gün:** aktiv level kartı, "Görüşə başla" düyməsi və ya kilid tarixi, əhval qeydi.
- **Görüş otağı:** nəfəs dairəsi (orb), canlı transkript, mikrofonu söndürmə, yazı xətti, "Görüşü tamamla" düyməsi.
- **Yol Xəritəsi:** levellər və təqvim, gün seçmək.
- **Tapşırıqlar:** siyahı, işarələmə, refleksiya qeydi.
- **Vəziyyətim:** əhval qrafiki və seans xülasələri.

## Agent komandası (5 agent, rəhbər — Ahad)
Ahad komandaya rəhbərlik edir və hər mərhələni təsdiqləyir. Claude koordinator kimi işləyir: agentləri işə salır, nəticələri Ahada çatdırır.

| Agent | İşi |
|---|---|
| **Fırça** | Arayüz və dizayn: səhifələr, orb, animasiyalar, mobil görünüş |
| **Səda** | Səs: Gemini Live bağlantısı, mikrofon, səsin oxunması, kəsilmələr, əks-səda; azərbaycanca keyfiyyət |
| **Usta** | Backend və fayllar: Vercel funksiyaları (token, analiz, vaxt), məlumat qatı, fayllardakı problemlər |
| **Dərya** | Psixoloq məzmunu: sistem təlimatları (azərbaycanca), CBT tapşırıqları, böhran təhlükəsizliyi, level proqramı |
| **Qartal** | QA: hər xüsusiyyəti yoxlayır, problem tapır, kiçik problemləri düzəldir, böyüklərini aid agentə qaytarır |

Qaydalar: eyni faylı iki agent eyni anda redaktə etmir. Fayllar `Edit` ilə dəyişdirilir. Hər raund git commit ilə bağlanır. Deploy yalnız Ahadın icazəsi ilə edilir.

## Agent ofisi (vizual iş yeri)
- `http://localhost:4848`, Brave-də açılır. Ayrıca `office/` qovluğundadır və deploy edilmir.
- Gözəl, maraqlı bir ofis: hər agentin öz masası, rəngi və personajı var. Personaj vəziyyətinə görə hərəkət edir: işləyir, düşünür, gözləyir, hazırdır, problem var. Başının üstündə qısa mesaj çıxır. Ahadın ortada rəhbər masası var. Altda canlı iş jurnalı (log) göstərilir.
- Agentlər `node office/say.js <agent> <vəziyyət> "<mesaj>"` əmri ilə vəziyyətlərini bildirir. Səhifə hər saniyə yenilənir.

## Builder-in öhdəsinə qalanlar
Dəqiq rəng tonları, animasiya detalları, fayl strukturu, level proqramının JSON sxemi, testlərin forması.
