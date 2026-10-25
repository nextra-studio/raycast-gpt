import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
const root = new URL("../", import.meta.url);
test("manifest has exactly the three agreed Windows commands", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  assert.deepEqual(manifest.platforms, ["Windows"]);
  assert.equal(manifest.title, "GPT Tools");
  assert.deepEqual(manifest.commands.map((command) => command.title), ["Quick Fix", "Rewrite", "Ask AI"]);
  for (const command of manifest.commands) await access(new URL(`src/${command.name}.${command.mode === "no-view" ? "ts" : "tsx"}`, root));
  await access(new URL(`assets/${manifest.icon}`, root));
});
test("native extension settings expose model, language and writing preferences", async () => {
  const manifest = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  for (const name of ["defaultModel", "customModel", "translationLanguage", "writingStyle", "quickFixInstructions", "codexExecutable"]) assert.ok(manifest.preferences.some((entry) => entry.name === name));
  assert.equal(manifest.preferences.find((entry) => entry.name === "defaultModel").type, "dropdown");
});
