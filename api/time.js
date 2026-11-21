import { dayKey } from "../src/lib/day.js";

// GET /api/time -> { now: ISO, dayKey: "YYYY-MM-DD" } (Asia/Baku). Source of truth for the daily lock.
export async function handler(req) {
  const now = new Date();
  return Response.json({ now: now.toISOString(), dayKey: dayKey(now, "Asia/Baku") }, { headers: { "cache-control": "no-store" } });
}

// Vercel uses named HTTP-method exports as Web handlers.
export { handler as GET };
