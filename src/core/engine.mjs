import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, delimiter, dirname, basename } from "node:path";
import { createInterface } from "node:readline";
import { RESPONSE_SCHEMA, modelArguments, parseResponse } from "./content.mjs";

export function cleanEnvironment(environment = process.env) {
  const cleaned = { ...environment };
  const removed = new Set(["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL", "OPENAI_ORG_ID", "OPENAI_ORGANIZATION", "OPENAI_PROJECT_ID"]);
  for (const key of Object.keys(cleaned)) if (removed.has(key.toUpperCase())) delete cleaned[key];
  return cleaned;
}

export function resolveCodex(explicit = "") {
  if (explicit.trim()) {
    if (!existsSync(explicit.trim()) || !explicit.toLowerCase().endsWith(".exe")) throw new Error("The configured Codex path must point to a native codex.exe file.");
    return explicit.trim();
  }
  const roots = [...(process.env.PATH ?? "").split(delimiter), join(process.env.APPDATA ?? "", "npm")].filter(Boolean);
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const triplet = arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
  for (const root of roots) {
    for (const file of [
      join(root, "codex.exe"),
      join(root, "node_modules", "@openai", "codex", "node_modules", "@openai", `codex-win32-${arch}`, "vendor", triplet, "bin", "codex.exe"),
      join(root, "node_modules", "@openai", "codex", "vendor", triplet, "bin", "codex.exe"),
    ]) if (existsSync(file)) return file;
  }
  throw new Error("Install Codex for Windows with npm install -g @openai/codex, run codex login, then restart Raycast. For a custom install, set its executable path in extension preferences.");
}

export function runChild(executable, args, { input = "", cwd, signal, timeout = 180000, spawnImpl = spawn } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Request stopped."));
    const child = spawnImpl(executable, args, { cwd, env: cleanEnvironment(), shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "", settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort);
      if (error) { child.kill(); reject(error); } else resolve(value);
    };
    const abort = () => finish(new Error("Request stopped."));
    const timer = setTimeout(() => finish(new Error("Codex timed out. Nothing was replaced.")), timeout);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 4e6) finish(new Error("The response stream was too large.")); });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-100000); });
    child.on("error", () => finish(new Error("Could not start Codex. Check its executable path and installation.")));
    child.on("close", (code) => finish(null, { code, stdout, stderr }));
    child.stdin.on("error", () => finish(new Error("Could not send the request to Codex.")));
    child.stdin.end(input, "utf8");
  });
}

export async function assertLogin(executable, options = {}) {
  const result = await runChild(executable, ["--config", 'forced_login_method="chatgpt"', "login", "status"], { ...options, timeout: 15000 });
  if (result.code !== 0 || !/logged in using chatgpt/i.test(result.stdout + result.stderr)) {
    throw new Error("Sign in to Codex with ChatGPT: run codex login in Windows PowerShell, then select Sign in with ChatGPT. API-key logins are not used.");
  }
}

export async function generate({ executable, prompt, model = "", mode = "ask", signal, run = runChild, checkLogin = null }) {
  // The inference process itself enforces ChatGPT auth below. A separate
  // login-status process before every turn needlessly adds startup latency.
  if (checkLogin) await checkLogin(executable, { signal });
  const directory = await mkdtemp(join(tmpdir(), "raycast-text-companion-"));
  const replyPath = join(directory, "reply.json");
  try {
    const schemaPath = join(directory, "schema.json");
    await writeFile(schemaPath, JSON.stringify(RESPONSE_SCHEMA), "utf8");
    const args = ["--ask-for-approval", "never", "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check",
      "--sandbox", "read-only", "--color", "never", "--config", 'forced_login_method="chatgpt"', "--config", 'model_provider="openai"',
      "--config", "features.shell_tool=false", "--config", 'web_search="disabled"', ...modelArguments(model),
      "--output-schema", schemaPath, "--output-last-message", replyPath, "-"];
    const result = await run(executable, args, { input: prompt, cwd: directory, signal });
    if (result.code !== 0) throw new Error("Codex could not complete the request. Check codex login status, your selected model, subscription limits, connection and CLI version. Nothing was replaced.");
    let raw;
    try { raw = await readFile(replyPath, "utf8"); } catch { throw new Error("Codex did not produce a final structured reply. Nothing was replaced."); }
    return parseResponse(raw, mode);
  } finally {
    // This is exclusively the private mkdtemp directory created above.
    if (dirname(directory) === tmpdir() && basename(directory).startsWith("raycast-text-companion-")) await rm(directory, { recursive: true, force: true });
  }
}

export class ModelRpc {
  constructor(child) {
    this.child = child; this.nextId = 1; this.pending = new Map(); this.closed = false;
    this.lines = createInterface({ input: child.stdout });
    this.lines.on("line", (line) => {
      let message;
      try { message = JSON.parse(line); } catch { return; }
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error("Codex model discovery failed.")); else entry.resolve(message.result);
    });
    child.stderr.resume();
    child.stdin.on("error", () => this.close()); child.on("error", () => this.close()); child.on("close", () => this.close());
  }
  request(method, params, timeout = 15000) {
    if (this.closed) return Promise.reject(new Error("Model discovery stopped."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Model discovery timed out.")); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  notify(method, params = {}) { this.child.stdin.write(JSON.stringify({ method, params }) + "\n"); }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(new Error("Model discovery stopped.")); }
    this.pending.clear(); this.lines.close(); this.child.kill();
  }
}

export async function listModels(executable, { signal, spawnImpl = spawn, checkLogin = assertLogin } = {}) {
  await checkLogin(executable, { signal });
  if (signal?.aborted) throw new Error("Request stopped.");
  const child = spawnImpl(executable, ["--config", 'forced_login_method="chatgpt"', "--config", 'model_provider="openai"', "app-server"],
    { env: cleanEnvironment(), windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] });
  const rpc = new ModelRpc(child);
  const abort = () => rpc.close(); signal?.addEventListener("abort", abort, { once: true });
  try {
    await rpc.request("initialize", { clientInfo: { name: "raycast_text_companion", title: "Text Companion", version: "1.0.0" } });
    rpc.notify("initialized");
    const entries = []; let cursor; let pages = 0;
    do {
      const page = await rpc.request("model/list", { includeHidden: false, limit: 100, ...(cursor ? { cursor } : {}) });
      pages++;
      if (!Array.isArray(page?.data)) throw new Error("Invalid model catalog.");
      entries.push(...page.data.filter((m) => !m.hidden && typeof m.model === "string").map((m) => ({ id: m.model, name: m.displayName || m.model })));
      cursor = page.nextCursor;
      if (entries.length > 1000 || pages > 20) throw new Error("Unexpected model catalog size.");
    } while (cursor);
    return entries;
  } finally { signal?.removeEventListener("abort", abort); rpc.close(); }
}

export async function cachedModels() {
  try {
    const cache = JSON.parse(await readFile(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "models_cache.json"), "utf8"));
    return cache.models.filter((m) => m.visibility === "list").map((m) => ({ id: m.slug, name: m.display_name || m.slug }));
  } catch { return []; }
}
