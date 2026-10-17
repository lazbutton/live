#!/usr/bin/env node
/*
 * Serveur MCP local de l'admin OutLive (transport stdio).
 *
 * Lancé par Claude (app de bureau, Claude Code) : il charge .env.local du projet et
 * travaille directement sur la base Supabase avec la clé service, sans serveur web.
 *   node scripts/outlive-mcp.mjs            → mode normal
 *   node scripts/outlive-mcp.mjs --dry-run  → simulation : rien n'est écrit
 *
 * stdout est réservé au protocole (un message JSON par ligne) ; les journaux vont sur stderr.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Les bibliothèques ne doivent rien écrire sur stdout.
for (const method of ["log", "info", "warn", "debug"]) {
  console[method] = (...args) => process.stderr.write(`${args.map(String).join(" ")}\n`);
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trim().startsWith("#")) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const dryRun = process.argv.includes("--dry-run") || process.env.OUTLIVE_AGENT_DRY_RUN === "1";

const require = createRequire(path.join(root, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(path.join(root, "package.json"), {
  alias: { "@/": `${root}/` },
  interopDefault: true,
  moduleCache: true,
});

const { handleMcpMessage } = await jiti.import(path.join(root, "lib/agent/mcp.ts"));
const { createAgentContext } = await jiti.import(path.join(root, "lib/agent/context.ts"));

// Chaque appel d'outil dispose de 80 s : un lot plus long rend la main avec `remaining`.
const createContext = () => createAgentContext({ dryRun, deadline: Date.now() + 80_000 });

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("line", (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } });
    return;
  }
  const messages = Array.isArray(message) ? message : [message];
  for (const entry of messages) {
    handleMcpMessage(entry, createContext)
      .then((response) => {
        if (response) send(response);
      })
      .catch((error) => {
        send({ jsonrpc: "2.0", id: entry?.id ?? null, error: { code: -32603, message: String(error?.message || error) } });
      });
  }
});
input.on("close", () => process.exit(0));

process.stderr.write(`OutLive MCP prêt${dryRun ? " (simulation : rien n'est écrit)" : ""}.\n`);
