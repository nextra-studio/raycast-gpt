import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const state = { app: { path: "C:/Editor.exe", name: "Editor" }, text: "original", storage: new Map(), pasted: [], preferences: {} };
globalThis.__textCompanionMock = {
  Clipboard: { paste: async (text) => state.pasted.push(text) },
  getFrontmostApplication: async () => state.app,
  getSelectedText: async () => state.text,
  getPreferenceValues: () => state.preferences,
  LocalStorage: { getItem: async (key) => state.storage.get(key), setItem: async (key, value) => state.storage.set(key, value) },
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "@raycast/api") return { url: "mock:raycast", shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "mock:raycast") return { format: "module", source: "export const {Clipboard,getFrontmostApplication,getSelectedText,getPreferenceValues,LocalStorage}=globalThis.__textCompanionMock;", shortCircuit: true };
    return next(url, context);
  },
});
const { captureSelection, replaceSelection, loadSettings, saveSettings } = await import("../src/platform.ts");
test("platform captures selected text without reading or copying the clipboard", async () => {
  const source = await captureSelection();
  assert.equal(source.text, "original"); assert.equal(source.appId, "C:/Editor.exe"); assert.deepEqual(state.pasted, []);
});
test("platform pastes only a structured draft after re-reading the native selection", async () => {
  const source = await captureSelection();
  await replaceSelection(source, "replacement only");
  assert.deepEqual(state.pasted, ["replacement only"]);
});
test("platform stops when the source selection changes", async () => {
  const source = await captureSelection(); state.text = "changed";
  const count = state.pasted.length;
  await assert.rejects(replaceSelection(source, "must not paste"), /selection changed/);
  assert.equal(state.pasted.length, count); state.text = "original";
});
test("platform refuses its own Raycast text fields", async () => {
  const app = state.app; state.app = { path: "Raycast.exe", name: "Raycast" };
  await assert.rejects(captureSelection(), /Select text in an editor/); state.app = app;
});
test("shared settings persist model, language and writing style locally", async () => {
  const settings = { model: "chosen", language: "Japanese", writingStyle: "My own voice", quickFixInstructions: "Keep slang", shortcuts: [{ id: "1", name: "Shorter", prompt: "Make it shorter" }] };
  await saveSettings(settings); assert.deepEqual(await loadSettings(), settings);
});
test("native extension preferences override older in-command settings", async () => {
  state.preferences = { defaultModel: "native-model", translationLanguage: "French", writingStyle: "Native style", quickFixInstructions: "Keep contractions" };
  const settings = await loadSettings();
  assert.equal(settings.model, "native-model"); assert.equal(settings.language, "French"); assert.equal(settings.writingStyle, "Native style");
  assert.equal(settings.shortcuts.length, 1);
  assert.equal(settings.quickFixInstructions, "Keep contractions");
});
test("custom model overrides the native dropdown and writing style can be cleared", async () => {
  state.preferences = { defaultModel: "native-model", customModel: "custom-model", writingStyle: "" };
  const settings = await loadSettings();
  assert.equal(settings.model, "custom-model"); assert.equal(settings.writingStyle, "");
  state.preferences = {};
});
