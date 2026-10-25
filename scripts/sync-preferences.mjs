import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
try {
  const cache = JSON.parse(await readFile(join(process.env.CODEX_HOME || join(homedir(), ".codex"), "models_cache.json"), "utf8"));
  const models = cache.models.filter((entry) => entry.visibility === "list" && typeof entry.slug === "string");
  if (!models.length) process.exit(0);
  const file = join(root, "package.json");
  const original = await readFile(file, "utf8");
  const manifest = JSON.parse(original);
  const preference = manifest.preferences.find((entry) => entry.name === "defaultModel");
  preference.data = [{ title: "Codex recommended", value: "" }, ...models.map((entry) => ({ title: entry.display_name || entry.slug, value: entry.slug }))];
  const updated = JSON.stringify(manifest, null, 2) + "\n";
  if (updated !== original) await writeFile(file, updated, "utf8");
} catch { /* Offline or no local model catalog: keep the existing options and custom ID field. */ }
