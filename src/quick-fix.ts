import { Clipboard, closeMainWindow, environment, showHUD, showToast, Toast } from "@raycast/api";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createPrompt, preserveBoundaries } from "./core/content.mjs";
import { generate } from "./core/engine.mjs";
import { captureSelection, executable, loadSettings, replaceSelection } from "./platform";

export default async function QuickFix() {
  const lockPath = join(environment.supportPath, "quick-fix.lock");
  let owned = false;
  let toast: Toast | undefined;
  let correction: string | undefined;
  try {
    // A no-view command may be launched from the visible launcher. Restore the
    // editor before asking Windows for its current selection.
    await closeMainWindow();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await mkdir(environment.supportPath, { recursive: true });
    // Clear only this extension's stale lock after the maximum request time has passed.
    try { if (Date.now() - (await stat(lockPath)).mtimeMs > 300000) await unlink(lockPath); } catch { /* no prior lock */ }
    try { const file = await open(lockPath, "wx"); owned = true; await file.close(); }
    catch { throw new Error("Quick Fix is already running. If the previous run crashed, try again after five minutes."); }
    const source = await captureSelection();
    const settings = await loadSettings();
    toast = await showToast({ style: Toast.Style.Animated, title: "Fixing spelling and grammar…" });
    const reply = await generate({ executable: executable(), prompt: createPrompt({ mode: "quick", source: source.text, settings }), model: settings.model, mode: "quick" });
    correction = preserveBoundaries(reply.replacement as string, source.text);
    if (correction === source.text) { await toast.hide(); toast = undefined; await showHUD("No corrections needed"); return; }
    await replaceSelection(source, correction);
    await toast.hide(); toast = undefined;
    await showHUD("Text corrected");
  } catch (e) {
    await toast?.hide(); toast = undefined;
    await showToast({ style: Toast.Style.Failure, title: "Quick Fix stopped", message: (e as Error).message,
      ...(correction ? { primaryAction: { title: "Copy Corrected Text", onAction: async () => { await Clipboard.copy(correction as string); } } } : {}) });
  } finally {
    await toast?.hide();
    if (owned) await unlink(lockPath).catch(() => undefined);
  }
}
