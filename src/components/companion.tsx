import { Action, ActionPanel, Clipboard, Detail, Form, Icon, List, openExtensionPreferences, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { createPrompt } from "../core/content.mjs";
import { cachedModels, generate, listModels } from "../core/engine.mjs";
import { captureSelection, executable, loadSettings, replaceSelection } from "../platform";
import { ModelField, SettingsView } from "./settings";
import type { Model, Reply, Selection, Settings, Turn } from "../types";

type Conversation = { mode: "ask" | "rewrite"; settings: Settings; models: Model[]; selection: Selection | null; context: string };

const STYLES = [
  { id: "clarity", title: "Improve clarity", subtitle: "Cleaner and easier to read", icon: Icon.Wand, prompt: "Improve clarity while preserving my voice." },
  { id: "shorter", title: "Make shorter", subtitle: "Tighter, same meaning", icon: Icon.Minus, prompt: "Make it shorter and tighter while keeping the meaning and my voice." },
  { id: "casual", title: "More casual", subtitle: "Relaxed, conversational", icon: Icon.Emoji, prompt: "Make the tone more casual and conversational while keeping the meaning." },
  { id: "formal", title: "More formal", subtitle: "Professional tone", icon: Icon.Building, prompt: "Make the tone more formal and professional while keeping the meaning." },
  { id: "grammar", title: "Fix grammar only", subtitle: "Spelling and punctuation, no rewording", icon: Icon.Checkmark, prompt: "Fix grammar, spelling and punctuation only. Do not change wording or style." },
];

function draftBlock(text: string) {
  // Pick a fence longer than any backtick run in the content. Rendering never drives replacement.
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${text}\n${fence}`;
}

function quote(text: string) {
  const clipped = text.length > 1500 ? `${text.slice(0, 1500)}…` : text;
  return clipped.split("\n").map((line) => `> ${line}`).join("\n");
}

function EditText({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const { pop } = useNavigation();
  return <Form navigationTitle="Edit Text" actions={<ActionPanel>
    <Action.SubmitForm title="Use This Text" icon={Icon.Check} onSubmit={(values: { text: string }) => { onSave(values.text); pop(); }} />
  </ActionPanel>}>
    <Form.TextArea id="text" title="Text" defaultValue={value} />
  </Form>;
}

export default function Companion({ mode }: { mode: "ask" | "rewrite" }) {
  const [settings, setSettings] = useState<Settings>();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [context, setContext] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [model, setModel] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const { push } = useNavigation();
  const alive = useRef(true);
  const rewrite = mode === "rewrite";

  useEffect(() => {
    alive.current = true;
    async function initialize() {
      const stored = await loadSettings();
      if (!alive.current) return;
      setSettings(stored); setModel(stored.model);
      try {
        const captured = await captureSelection();
        if (!alive.current) return;
        setSelection(captured); setContext(captured.text); setNote(`Selected in ${captured.appName}`);
      } catch (e) {
        if (alive.current) setNote(rewrite ? (e as Error).message : "");
        // Fall back to the clipboard so rewriting still works when the app blocks selection capture.
        const clip = (await Clipboard.readText().catch(() => undefined)) ?? "";
        if (alive.current && rewrite && clip.trim()) { setContext(clip); setNote("Using clipboard text (no selection found)"); }
      }
      if (alive.current) setLoading(false);
      const cached = await cachedModels();
      if (alive.current && cached.length) setModels(cached);
    }
    initialize().catch((e) => { if (alive.current) { setLoading(false); setNote((e as Error).message); } });
    return () => { alive.current = false; };
  }, [mode]);

  async function refreshModels() {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Refreshing Codex models" });
    try { setModels(await listModels(executable())); toast.style = Toast.Style.Success; toast.title = "Models refreshed"; }
    catch (e) { toast.style = Toast.Style.Failure; toast.title = "Could not refresh models"; toast.message = (e as Error).message; }
  }
  function applySettings(next: Settings) { setSettings(next); setModel(next.model); }
  function begin(instruction: string) {
    if (!settings) return;
    if (!instruction.trim()) { void showToast({ style: Toast.Style.Failure, title: "Type a question first" }); return; }
    if (rewrite && !context.trim()) { void showToast({ style: Toast.Style.Failure, title: "No text to rewrite", message: "Choose Edit Text to paste some." }); return; }
    const conversation: Conversation = { mode, selection, context, models, settings: { ...settings, model } };
    push(<ResultView conversation={conversation} request={instruction} history={[]} draft={null} />);
  }
  const extra = query.trim();
  const withExtra = (prompt: string) => extra ? `${prompt} Additional instructions: ${extra}` : prompt;
  const translate = `Translate the text into ${settings?.language || "Dutch"}. Return the complete translation as the replacement draft.`;

  const textPanel = context.trim()
    ? `${note ? `*${note}*\n\n` : ""}${quote(context)}`
    : `**No text yet.**\n\n${note ? `${note}\n\n` : ""}Select text in any app before opening this command, or choose **Edit Text** (Ctrl+K) to paste some.`;
  const detail = (heading: string, body: string) => <List.Item.Detail markdown={`### ${heading}\n\n${body}\n\n---\n\n**${rewrite ? "Your text" : "Context"}**\n\n${textPanel}`} />;

  function actions(run: () => void, title: string) {
    return <ActionPanel>
      <Action title={title} icon={Icon.Stars} onAction={run} />
      <ActionPanel.Section>
        <Action title="Edit Text" icon={Icon.Pencil} shortcut={{ modifiers: ["ctrl"], key: "e" }} onAction={() => push(<EditText value={context} onSave={setContext} />)} />
        <Action title="Paste Text from Clipboard" icon={Icon.Clipboard} shortcut={{ modifiers: ["ctrl", "shift"], key: "v" }} onAction={async () => { const clip = await Clipboard.readText(); if (clip) { setContext(clip); setNote("Using clipboard text"); } }} />
      </ActionPanel.Section>
      <ActionPanel.Section>
        <Action title="Open Extension Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
        {settings && <Action title="Manage Saved Prompts" icon={Icon.List} onAction={() => push(<SettingsView settings={settings} models={models} onSave={applySettings} />)} />}
        <Action title="Refresh Models" icon={Icon.ArrowClockwise} onAction={refreshModels} />
      </ActionPanel.Section>
    </ActionPanel>;
  }

  const saved = settings?.shortcuts ?? [];
  const modelOptions = model && !models.some((item) => item.id === model) ? [{ id: model, name: model }, ...models] : models;
  const dropdown = <List.Dropdown tooltip="Model" value={model || "__default"} onChange={(value) => setModel(value === "__default" ? "" : value)}>
    <List.Dropdown.Item value="__default" title="Codex recommended" />
    {modelOptions.map((item) => <List.Dropdown.Item key={item.id} value={item.id} title={item.name} />)}
  </List.Dropdown>;

  return <List navigationTitle={rewrite ? "Rewrite" : "Ask AI"} isLoading={loading} isShowingDetail filtering={false} onSearchTextChange={setQuery} searchText={query}
    searchBarPlaceholder={rewrite ? "Add instructions (optional), then pick a style…" : "Ask a question…"} searchBarAccessory={dropdown}>
    {extra && <List.Section title={rewrite ? "Custom" : "Question"}>
      <List.Item title={rewrite ? `Rewrite: ${extra}` : `Ask: ${extra}`} icon={Icon.Stars}
        detail={detail(rewrite ? "Custom rewrite" : "Ask", rewrite ? `Rewrite using your instruction: _${extra}_` : `Send your question${context.trim() ? " together with the context" : ""}.`)}
        actions={actions(() => begin(rewrite ? `Rewrite the text. ${extra}` : extra), rewrite ? "Rewrite" : "Ask")} />
    </List.Section>}
    {rewrite
      ? <List.Section title="Styles">
        {STYLES.map((item) => <List.Item key={item.id} title={item.title} subtitle={item.subtitle} icon={item.icon}
          detail={detail(item.title, `${item.prompt}${extra ? `\n\n_Plus: ${extra}_` : ""}`)} actions={actions(() => begin(withExtra(item.prompt)), item.title)} />)}
        <List.Item title={`Translate to ${settings?.language || "Preferred Language"}`} icon={Icon.Globe} detail={detail("Translate", translate)} actions={actions(() => begin(translate), "Translate")} />
      </List.Section>
      : <List.Section title="Quick actions">
        <List.Item title="Explain selected text" icon={Icon.QuestionMark} detail={detail("Explain", "Explain the supplied text clearly.")}
          actions={actions(() => begin("Explain the supplied text clearly. This is an explanation, not a replacement draft."), "Explain")} />
        <List.Item title="Summarize selected text" icon={Icon.Text} detail={detail("Summarize", "Summarize the supplied text.")}
          actions={actions(() => begin("Summarize the supplied text. Put the summary in the replacement draft so I can choose to copy or replace it."), "Summarize")} />
      </List.Section>}
    {saved.length > 0 && <List.Section title="Saved prompts">
      {saved.map((shortcut) => <List.Item key={shortcut.id} title={shortcut.name} icon={Icon.Bookmark} detail={detail(shortcut.name, shortcut.prompt)}
        actions={actions(() => begin(withExtra(shortcut.prompt)), shortcut.name)} />)}
    </List.Section>}
  </List>;
}

function ResultView({ conversation, request, history, draft }: { conversation: Conversation; request: string; history: Turn[]; draft: string | null }) {
  const [reply, setReply] = useState<Reply>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [applying, setApplying] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const { push } = useNavigation();

  useEffect(() => {
    let mounted = true;
    const abort = new AbortController(); controller.current = abort;
    async function run() {
      try {
        const prompt = createPrompt({ mode: conversation.mode, source: conversation.context, draft, history, request, settings: conversation.settings });
        const result = await generate({ executable: executable(), prompt, model: conversation.settings.model, mode: conversation.mode, signal: abort.signal });
        if (mounted) setReply(result);
      } catch (e) { if (mounted) setError((e as Error).message); }
      finally { if (mounted) setBusy(false); }
    }
    void run();
    return () => { mounted = false; abort.abort(); };
  }, []);

  async function apply() {
    if (!reply?.replacement || applying) return;
    setApplying(true);
    try { await replaceSelection(conversation.selection, reply.replacement); await showToast({ style: Toast.Style.Success, title: "Draft pasted into the selection" }); }
    catch (e) { await showToast({ style: Toast.Style.Failure, title: "Could not replace the selection", message: (e as Error).message }); }
    finally { setApplying(false); }
  }
  const turns: Turn[] = reply ? [...history, { request, ...reply }] : history;
  let markdown = busy ? "# Working…\n\nPreparing your response. You can stop from the action menu." : error ? `# Could not complete the request\n\n${error}` : "";
  if (reply) {
    markdown = reply.response ? `## Reply\n\n${reply.response}` : "";
    if (reply.replacement !== null) markdown += `\n\n## Replacement draft\n\n${draftBlock(reply.replacement)}`;
    else markdown += "\n\n*This answer has no replacement draft.*";
    if (history.length) markdown += `\n\n---\n\n${history.length} earlier ${history.length === 1 ? "turn" : "turns"} included in this conversation.`;
  }
  return <Detail navigationTitle={conversation.mode === "rewrite" ? "Rewrite · Review" : "Ask AI · Reply"} isLoading={busy || applying} markdown={markdown}
    metadata={<Detail.Metadata>
      <Detail.Metadata.Label title="Model" text={conversation.settings.model || "Codex recommended"} />
      <Detail.Metadata.Label title="Source" text={conversation.selection?.appName || "Pasted context / general chat"} />
      <Detail.Metadata.Label title="Draft" text={reply?.replacement ? "Ready to review" : "No replacement"} />
    </Detail.Metadata>}
    actions={<ActionPanel>
      {busy && <Action title="Stop Request" icon={Icon.Stop} onAction={() => controller.current?.abort()} />}
      {reply && <>
        {reply.replacement !== null && conversation.selection && conversation.mode === "rewrite" && <Action title="Replace Selection" icon={Icon.ArrowRight} onAction={apply} />}
        {reply.replacement !== null && <Action.CopyToClipboard title="Copy Draft" content={reply.replacement} />}
        {reply.replacement !== null && conversation.selection && conversation.mode === "ask" && <Action title="Replace Selection" icon={Icon.ArrowRight} shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }} onAction={apply} />}
        <Action title="Continue Conversation" icon={Icon.Message} onAction={() => push(<FollowUp conversation={conversation} history={turns} draft={reply.replacement ?? draft} />)} />
        {reply.response && <Action.CopyToClipboard title="Copy Reply" content={reply.response} />}
        <Action title="View Conversation" icon={Icon.List} onAction={() => push(<Detail navigationTitle="Conversation" markdown={turns.map((turn, index) =>
          `## You · ${index + 1}\n\n${turn.request}\n\n## Assistant\n\n${turn.response}${turn.replacement !== null ? `\n\n### Draft\n\n${draftBlock(turn.replacement)}` : ""}`).join("\n\n---\n\n")} />)} />
        {conversation.context && <Action title="View Original Text" icon={Icon.Text} onAction={() => push(<Detail navigationTitle="Original Text" markdown={draftBlock(conversation.context)} />)} />}
      </>}
      {error && <Action title="Try Again" icon={Icon.ArrowClockwise} onAction={() => push(<ResultView conversation={conversation} request={request} history={history} draft={draft} />)} />}
    </ActionPanel>} />;
}

function FollowUp({ conversation, history, draft }: { conversation: Conversation; history: Turn[]; draft: string | null }) {
  const { push } = useNavigation();
  const [model, setModel] = useState(conversation.settings.model);
  return <Form navigationTitle="Continue Conversation" actions={<ActionPanel>
    <Action.SubmitForm title="Send" icon={Icon.Message} onSubmit={(values: { message: string }) => {
      if (!values.message.trim()) return;
      push(<ResultView conversation={{ ...conversation, settings: { ...conversation.settings, model } }} request={values.message} history={history} draft={draft} />);
    }} />
  </ActionPanel>}>
    <Form.TextArea id="message" title="Message" placeholder="Make it shorter, keep the second paragraph, explain that change..." />
    <ModelField models={conversation.models} value={model} onChange={setModel} />
    <Form.Description text="The selected text, current draft and earlier turns stay in this conversation." />
  </Form>;
}
