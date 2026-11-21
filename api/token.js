// POST /api/token -> { token, model: "gemini-3.8-live" }
// Creates a single-use Gemini ephemeral auth token, so the browser never sees GEMINI_API_KEY.
// Browser usage: wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=<token>
// The model is locked by the token (fieldMask "model"); the client's own setup (systemInstruction, voice, ...) is honored.
// One token = one WebSocket connection; a reconnect needs a fresh token.
export const MODEL = "gemini-3.8-live";

export async function handler(req) {
  if (req.method !== "POST") return Response.json({ error: "method-not-allowed" }, { status: 405 });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "server-misconfigured" }, { status: 500 });

  const now = Date.now();
  const body = {
    uses: 1,
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
    newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
    bidiGenerateContentSetup: { model: `models/${MODEL}` },
    fieldMask: "model",
  };
  try {
    const r = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.name) {
      console.error("auth_tokens failed", r.status, j?.error?.message);
      return Response.json({ error: "token-failed" }, { status: 502 });
    }
    return Response.json({ token: j.name, model: MODEL }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("auth_tokens error", e?.message);
    return Response.json({ error: "token-failed" }, { status: 502 });
  }
}

export { handler as POST };
