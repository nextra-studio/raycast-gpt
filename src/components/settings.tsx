import { Action, ActionPanel, Form, Icon, List, openExtensionPreferences, showToast, Toast, useNavigation } from "@raycast/api";
import { useState } from "react";
import { randomUUID } from "node:crypto";
import { saveSettings } from "../platform";
import type { Model, Settings, Shortcut } from "../types";

export function ModelField({ models, value, onChange, info }: { models: Model[]; value: string; onChange: (value: string) => void; info?: string }) {
  const options = value && !models.some((model) => model.id === value) ? [{ id: value, name: value }, ...models] : models;
  return <Form.Dropdown id="model" title="Model" value={value} onChange={onChange} info={info}>
    <Form.Dropdown.Item value="" title="Codex recommended" />
    {options.map((model) => <Form.Dropdown.Item key={model.id} value={model.id} title={model.name} />)}
  </Form.Dropdown>;
}

export function SettingsView({ settings, models, onSave }: { settings: Settings; models: Model[]; onSave: (value: Settings) => void }) {
  const { pop, push } = useNavigation();
  const [shortcuts, setShortcuts] = useState(settings.shortcuts);
  async function submit() {
    const next = { ...settings, shortcuts };
    await saveSettings(next); onSave(next); pop();
    await showToast({ style: Toast.Style.Success, title: "Saved prompts updated" });
  }
  return <Form navigationTitle="GPT Tools · Saved Prompts" actions={<ActionPanel>
    <Action title="Manage Saved Prompts" icon={Icon.List} onAction={() => push(<ShortcutsView shortcuts={shortcuts} onChange={setShortcuts} />)} />
    <Action.SubmitForm title="Save Changes" icon={Icon.Checkmark} onSubmit={submit} />
    <Action title="Model and Writing Preferences" icon={Icon.Gear} onAction={openExtensionPreferences} />
  </ActionPanel>}>
    <Form.Description text="Model, translation language and writing style are in Raycast Settings → Extensions → GPT Tools. Reopen the command after changing those preferences." />
    <Form.Description title="Saved Prompts" text={`${shortcuts.length} saved. Open Manage Saved Prompts to add, edit or remove instructions, then Save Changes here.`} />
  </Form>;
}

function ShortcutsView({ shortcuts: initial, onChange }: { shortcuts: Shortcut[]; onChange: (value: Shortcut[]) => void }) {
  const [shortcuts, setShortcuts] = useState(initial);
  const { push } = useNavigation();
  function update(next: Shortcut[]) { setShortcuts(next); onChange(next); }
  function edit(shortcut?: Shortcut) {
    if (!shortcut && shortcuts.length >= 30) { void showToast({ style: Toast.Style.Failure, title: "You can save up to 30 prompts" }); return; }
    push(<ShortcutEditor shortcut={shortcut} onSave={(saved) => update(shortcut ? shortcuts.map((s) => s.id === saved.id ? saved : s) : [...shortcuts, saved])} />);
  }
  return <List navigationTitle="Saved Prompts" searchBarPlaceholder="Find a saved prompt..." actions={<ActionPanel><Action title="Add Prompt" icon={Icon.Plus} onAction={() => edit()} /></ActionPanel>}>
    <List.EmptyView title="Your favorite instructions" description="Save prompts such as Make it shorter or Translate to Japanese." icon={Icon.Text} actions={<ActionPanel><Action title="Add Prompt" onAction={() => edit()} /></ActionPanel>} />
    {shortcuts.map((shortcut) => <List.Item key={shortcut.id} title={shortcut.name} subtitle={shortcut.prompt} icon={Icon.Text} actions={<ActionPanel>
      <Action title="Edit Prompt" onAction={() => edit(shortcut)} />
      <Action title="Add Prompt" icon={Icon.Plus} onAction={() => edit()} />
      <Action title="Remove Prompt" icon={Icon.Trash} style={Action.Style.Destructive} onAction={() => update(shortcuts.filter((s) => s.id !== shortcut.id))} />
    </ActionPanel>} />)}
  </List>;
}

function ShortcutEditor({ shortcut, onSave }: { shortcut?: Shortcut; onSave: (value: Shortcut) => void }) {
  const { pop } = useNavigation();
  const [error, setError] = useState<string>();
  return <Form navigationTitle={shortcut ? "Edit Prompt" : "Add Prompt"} actions={<ActionPanel>
    <Action.SubmitForm title="Save Prompt" onSubmit={(values: { name: string; prompt: string }) => {
      if (!values.name.trim() || !values.prompt.trim()) { setError("Enter a name and instructions."); return; }
      onSave({ id: shortcut?.id || randomUUID(), name: values.name.trim(), prompt: values.prompt.trim() }); pop();
    }} />
  </ActionPanel>}>
    <Form.TextField id="name" title="Name" defaultValue={shortcut?.name} error={error} />
    <Form.TextArea id="prompt" title="Instructions" defaultValue={shortcut?.prompt} placeholder="Make the text shorter while preserving every important detail." />
  </Form>;
}
