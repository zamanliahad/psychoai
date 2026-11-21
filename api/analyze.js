import * as prompts from "../src/psych/prompts.js";

const { ANALYZE_INSTRUCTIONS, ANALYZE_SCHEMA } = prompts;

// POST /api/analyze  body { level, transcript, state }
// -> { summary, tasks:[{title,instructions}], mood:{score:1-10,note}, program?:[{n,title,focus,brief}] }
// On any failure returns 502 { error }; the client must still complete the session (analysis = null).
export const MODEL = "gemini-3.8-flash";
// Used only when MODEL is overloaded / times out (seen on 2026-11-20: 3.8 and 3.7 returned 503).
// Free tier gives each model ~20 requests/day, so we chain many models (2026-11-20 measurements:
// 2.5-flash ~7 s, 3.5-flash-lite ~11 s, flash-lite-latest ~13 s with low thinking).
export const FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-flash-lite-latest"];

// Models that answered 429 (daily quota) are skipped for a while on this warm instance.
const exhausted = new Map(); // model -> until (ms)
const QUOTA_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const BUSY_COOLDOWN_MS = 2 * 60 * 1000;

function thinkingFor(model) {
  // 2.5 models use a token budget; 3.x models use thinkingLevel.
  return model.startsWith("gemini-2.5") ? { thinkingBudget: 0 } : { thinkingLevel: "low" };
}

function transcriptText(transcript) {
  if (typeof transcript === "string") return transcript;
  if (!Array.isArray(transcript)) return "";
  return transcript
    .filter((t) => t && t.text)
    .map((t) => `${t.who === "ai" ? "Psixoloq" : "İstifadəçi"}: ${t.text}`)
    .join("\n");
}

function context(state, level) {
  if (!state || typeof state !== "object") return "";
  const prev = (state.levels || []).filter((l) => l.status === "COMPLETED" && l.summary).map((l) => `Level ${l.n} (${l.title}): ${l.summary}`);
  const tasks = (state.tasks || []).map((t) => `- [${t.done ? "x" : " "}] ${t.title}${t.note ? ` — qeyd: ${t.note}` : ""}`);
  const cur = (state.levels || []).find((l) => l.n === level);
  return [
    state.profile?.name ? `Ad: ${state.profile.name}` : "",
    state.profile?.programSummary ? `Proqram: ${state.profile.programSummary}` : "",
    cur ? `Bu levelin mövzusu: ${cur.title}. ${cur.focus || ""} ${cur.brief || ""}` : "",
    prev.length ? `Əvvəlki seanslar:\n${prev.join("\n")}` : "",
    tasks.length ? `Tapşırıqlar:\n${tasks.join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

// Prefer Dərya's optional buildAnalyzeInput (psych content lives in src/psych); fall back to our own format.
function userMessage(input, level, text) {
  if (typeof prompts.buildAnalyzeInput === "function") {
    try {
      const prev = context(input.state, level);
      const msg = prompts.buildAnalyzeInput({ level, transcript: input.transcript, state: input.state });
      return prev ? `${msg}\n\nKONTEKST:\n${prev}` : msg;
    } catch (e) {
      console.error("buildAnalyzeInput failed", e?.message);
    }
  }
  return `Level: ${level}\n\n${context(input.state, level)}\n\nSeansın transkripti:\n${text}`;
}

function normalize(raw, level) {
  const out = {
    summary: typeof raw?.summary === "string" ? raw.summary : "",
    tasks: (Array.isArray(raw?.tasks) ? raw.tasks : [])
      .filter((t) => t && t.title)
      .slice(0, 3)
      .map((t) => ({ title: String(t.title), instructions: String(t.instructions || "") })),
    mood: {
      score: Math.min(10, Math.max(1, Math.round(Number(raw?.mood?.score) || 5))),
      note: String(raw?.mood?.note || ""),
    },
  };
  if (!out.summary) throw new Error("empty summary");
  if (Array.isArray(raw?.program) && raw.program.length) {
    out.program = raw.program
      .filter((p) => p && Number.isFinite(Number(p.n)) && p.title)
      .map((p) => ({ n: Number(p.n), title: String(p.title), focus: String(p.focus || ""), brief: String(p.brief || "") }));
    if (!out.program.length) delete out.program;
  }
  return out;
}

export async function handler(req) {
  if (req.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "server-misconfigured" }, { status: 500 });

  let input;
  try {
    input = await req.json();
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  const level = Number(input?.level);
  const text = transcriptText(input?.transcript);
  if (!Number.isFinite(level) || !text.trim()) return Response.json({ error: "bad-request" }, { status: 400 });

  // ANALYZE_SCHEMA may be in Gemini OpenAPI form (type: "OBJECT") or plain JSON Schema (type: "object").
  const geminiForm = /"type"\s*:\s*"(OBJECT|STRING|ARRAY|INTEGER|NUMBER)"/.test(JSON.stringify(ANALYZE_SCHEMA));
  const body = {
    systemInstruction: { parts: [{ text: ANALYZE_INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: userMessage(input, level, text) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      [geminiForm ? "responseSchema" : "responseJsonSchema"]: ANALYZE_SCHEMA,
    },
  };

  // Any failure (quota 429, overload 503, 400, timeout, bad JSON) -> next model. Quota/overload are remembered.
  const deadline = Date.now() + 55000;
  const now = Date.now();
  const chain = [MODEL, ...FALLBACK_MODELS].filter((m) => !(exhausted.get(m) > now));
  if (!chain.length) chain.push(...FALLBACK_MODELS.slice(0, 2)); // everything marked: try anyway
  for (const model of chain) {
    const left = deadline - Date.now();
    if (left < 6000) break;
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ ...body, generationConfig: { ...body.generationConfig, thinkingConfig: thinkingFor(model) } }),
        signal: AbortSignal.timeout(Math.min(20000, left)),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error("analyze failed", model, r.status, j?.error?.message?.slice(0, 120));
        if (r.status === 429) exhausted.set(model, Date.now() + QUOTA_COOLDOWN_MS);
        else if (r.status >= 500) exhausted.set(model, Date.now() + BUSY_COOLDOWN_MS);
        continue;
      }
      const raw = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
      const result = normalize(JSON.parse(raw), level);
      return Response.json(result, { headers: { "cache-control": "no-store", "x-analyze-model": model } });
    } catch (e) {
      console.error("analyze error", model, e?.name, e?.message?.slice(0, 120));
      if (e?.name === "TimeoutError") exhausted.set(model, Date.now() + BUSY_COOLDOWN_MS);
    }
  }
  return Response.json({ error: "analyze-failed" }, { status: 502 });
}

export { handler as POST };
