// PsychoAI agent office — local only (http://localhost:4848). Not deployed.
import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const statusDir = join(here, "status");

function readStatus() {
  const agents = {};
  let log = [];
  if (existsSync(statusDir)) {
    for (const f of readdirSync(statusDir)) {
      if (f.endsWith(".json")) {
        try { agents[f.slice(0, -5)] = JSON.parse(readFileSync(join(statusDir, f), "utf8")); } catch {}
      }
    }
    const logFile = join(statusDir, "log.jsonl");
    if (existsSync(logFile)) {
      log = readFileSync(logFile, "utf8").trim().split("\n").filter(Boolean).slice(-60)
        .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    }
  }
  return { agents, log, now: new Date().toISOString() };
}

createServer((req, res) => {
  if (req.url.startsWith("/status")) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(readStatus()));
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync(join(here, "index.html")));
}).listen(4848, "127.0.0.1", () => console.log("PsychoAI ofisi: http://localhost:4848"));
