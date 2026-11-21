# PsychoAI — Azərbaycan dilli AI psixoloq

**Canlı sayt:** https://psychoai-gamma.vercel.app

PsychoAI Azərbaycan dilində **səsli, canlı** söhbət aparan AI psixoloji dəstək saytıdır. ICT dərsi üçün hazırlanıb.

> ⚠️ PsychoAI süni intellekt əsaslı dəstəkdir, psixoloqu və ya həkimi əvəz etmir. Təcili vəziyyətdə **112**-yə zəng edin.

## Nə edir
- 🎙 **Canlı səsli seans.** Gemini Live (`gemini-3.8-live`) ilə real vaxtda danışır. Sözünü kəsə bilərsən, söhbət ekranda canlı yazı kimi görünür. İstəsən, yazı ilə də danışmaq olar.
- 🧭 **Fərdi proqram.** İlk görüş tanışlıqdır. Ondan sonra AI 5–7 günlük fərdi level proqramı qurur.
- 🔒 **Gündə bir level.** Kilid server vaxtına (Asia/Baku) görə işləyir, telefonun saatını dəyişməklə keçmək olmur.
- ✅ **Tapşırıqlar.** Hər seansdan sonra praktiki CBT tapşırıqları verilir. Növbəti seansda psixoloq onların nəticəsini soruşur.
- 📈 **Əhval izləmə.** Seansdan əvvəl və sonra əhval qeyd olunur, AI qiymətləndirməsi və qrafik var.
- 🆘 **Böhran təhlükəsizliyi.** Söhbətdə təhlükəli ifadələr tanınır və dərhal 112 dəstək kartı göstərilir.

## Texnologiya
- Vite + vanilla JavaScript (framework yoxdur)
- Gemini API: Live (səs), Flash (seans analizi)
- Vercel serverless funksiyaları (`api/`): API açarı brauzerə heç vaxt getmir, brauzer bir dəfəlik (ephemeral) token alır
- Məlumatlar brauzerdə (`localStorage`) saxlanır
- Vitest (74 test) + Playwright e2e

## Necə qurulub
Layihə 5 AI agentdən ibarət komanda ilə qurulub. Komandanın rəhbəri Ahad olub:

| Agent | İşi |
|---|---|
| 🎨 Fırça | Arayüz, nəfəs dairəsi (orb), animasiyalar |
| 🎙 Səda | Gemini Live səs mühərriki |
| 🔧 Usta | Backend, token, gündəlik kilid |
| 🧠 Dərya | Psixoloq təlimatları, böhran təhlükəsizliyi |
| 🦅 Qartal | Yoxlama (QA) və düzəlişlər |

Agentlərin rolları `.claude/agents/`, komanda qaydaları isə `AGENTS.md` faylındadır. Agentlərin işini canlı göstərən vizual ofis `office/` qovluğundadır. Dizayn və plan sənədləri `docs/` qovluğundadır.

## Lokal işə salmaq
```bash
npm install
echo GEMINI_API_KEY=<sənin-açarın> > .env   # aistudio.google.com/apikey
npm run dev        # sayt
npm test           # testlər
npm run office     # agent ofisi: http://localhost:4848
```

## Lisenziya
MIT — bax `LICENSE`.
