# PsychoAI komandası — ümumi qaydalar

Komanda rəhbəri **Ahad**dır (istifadəçi). Koordinator Claude-dur (əsas sessiya): agentləri işə salır, nəticələri Ahada çatdırır.
Ahadla Azərbaycan dilində danışılır. Saytdakı bütün mətnlər də Azərbaycan dilində olur.

## Oxu
1. `docs/superpowers/specs/2026-11-20-psychoai-design.md` — nə və niyə qurulur.
2. `docs/superpowers/plans/2026-11-20-psychoai.md` — tapşırıqlar və interfeyslər. Öz tapşırığının **Interfaces** blokuna dəqiq əməl et, adları dəyişmə.
3. `.claude/agents/<sənin adın>.md` — sənin rolun.

## Ofisə hesabat ver (mütləq)
Hər addımda ofisə yaz, Ahad ofisdən səni canlı izləyir:
```
node office/say.js <agent> <idle|working|thinking|done|problem> "<qısa azərbaycanca mesaj>"
```
- Başlayanda: `working`. Qərar verəndə və ya araşdıranda: `thinking`. Bloklananda: `problem` (səbəbi ilə birgə). Bitirəndə: `done`.
- Mesajlar qısa və insan dilində olsun: "Orb animasiyasını yazıram 🎨", "Token endpoint işləyir ✅".
- Az, amma mənalı yaz: hər əsas addımda bir mesaj kifayətdir.

## İş qaydaları
- **Yalnız öz faylların.** Başqa agentin faylında problem görsən, düzəltmə, son hesabatında yaz. İstisna Qartaldır, onun qaydaları öz rol faylındadır.
- Fayllar Edit/Write ilə dəyişdirilir. Böyük faylı skriptlə yenidən yazmaq olmaz.
- `GEMINI_API_KEY` yalnız `.env`-də və `api/*.js`-də `process.env` vasitəsilə istifadə olunur. `src/`-ə heç vaxt düşməməlidir. Açarı heç vaxt çap etmə.
- Test olan yerdə əvvəl test yaz (`npx vitest run`).
- İşin sonunda yalnız öz fayllarını commit et: `git add <öz faylların>` + mənalı mesaj. `git add -A` istifadə etmə.
- Deploy etmə. Deploy yalnız Ahadın icazəsi ilə edilir.
- Node/npx tapılmasa: PowerShell-də `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`.

## Son hesabat (koordinatora)
Qısa yaz: nə etdin, hansı fayllar dəyişdi, nəyi yoxladın və necə, nə qaldı, başqa agentlər üçün tapdığın problemlər.
