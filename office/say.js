#!/usr/bin/env node
// Agent status reporter for the PsychoAI office.
// Usage: node office/say.js <agent> <state> "<message>"
//   agent: firca | seda | usta | derya | qartal | ahad
//   state: idle | working | thinking | done | problem
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AGENTS = ["firca", "seda", "usta", "derya", "qartal", "ahad"];
const STATES = ["idle", "working", "thinking", "done", "problem"];
const [agent, state, ...rest] = process.argv.slice(2);
const message = rest.join(" ").trim();

if (!AGENTS.includes(agent) || !STATES.includes(state)) {
  console.error(`usage: node office/say.js <${AGENTS.join("|")}> <${STATES.join("|")}> "<message>"`);
  process.exit(1);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "status");
mkdirSync(dir, { recursive: true });
const entry = { agent, state, message, at: new Date().toISOString() };
writeFileSync(join(dir, `${agent}.json`), JSON.stringify(entry));
appendFileSync(join(dir, "log.jsonl"), JSON.stringify(entry) + "\n");
console.log(`[office] ${agent} → ${state}: ${message}`);
