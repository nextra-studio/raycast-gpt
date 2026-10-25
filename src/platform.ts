import { Clipboard, getFrontmostApplication, getPreferenceValues, getSelectedText, LocalStorage } from "@raycast/api";
import { normalizeSettings, replaceVerified } from "./core/content.mjs";
import { resolveCodex } from "./core/engine.mjs";
import type { Selection, Settings } from "./types";

const SETTINGS_KEY = "text-companion-settings-v1";
export async function loadSettings(): Promise<Settings> {
  const raw = await LocalStorage.getItem<string>(SETTINGS_KEY);
  let saved: Settings;
  try { saved = normalizeSettings(raw ? JSON.parse(raw) : null); } catch { saved = normalizeSettings(null); }
  const preferences = getPreferenceValues<{
    defaultModel?: string; customModel?: string; translationLanguage?: string; writingStyle?: string; quickFixInstructions?: string;
  }>();
  // Raycast's extension preferences are the single source for shared defaults.
  // Retain old local values only when running against an older manifest.
  return {
    ...saved,
    model: preferences.customModel?.trim() || (preferences.defaultModel ?? saved.model),
    language: preferences.translationLanguage?.trim() || saved.language,
    writingStyle: preferences.writingStyle ?? saved.writingStyle,
    quickFixInstructions: preferences.quickFixInstructions ?? saved.quickFixInstructions,
  };
}
export async function saveSettings(settings: Settings) {
  await LocalStorage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
}
export function executable(): string {
  const preferences = getPreferenceValues<{ codexExecutable?: string }>();
  return resolveCodex(preferences.codexExecutable ?? "");
}
export async function captureSelection(): Promise<Selection> {
  // Native Raycast selection/context APIs; no clipboard reads or emulated Ctrl+C.
  const before = await getFrontmostApplication();
  let text: string;
  try { text = await getSelectedText(); }
  catch { throw new Error("Raycast could not read the selected text. Try a direct command hotkey with the editor focused. If that also fails, use Rewrite with pasted text. Your selection was not replaced."); }
  const after = await getFrontmostApplication();
  const appId = before.path || before.bundleId || "";
  if (!appId || appId !== (after.path || after.bundleId || "")) throw new Error("The active application changed while reading the selection.");
  if (/^raycast(?:\.exe)?$/i.test(before.name)) throw new Error("Select text in an editor and run this command with its hotkey.");
  if (!text.trim()) throw new Error("Select some text in an editor first.");
  if (text.length > 20000) throw new Error("Select at most 20,000 characters at a time.");
  return { text, appId, appName: before.name };
}
export async function replaceSelection(selection: Selection | null, text: string) {
  await replaceVerified(selection, text, { capture: captureSelection, paste: (value: string) => Clipboard.paste(value) });
}
