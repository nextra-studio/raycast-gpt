# GPT Tools

A native Raycast Windows extension with three commands, using the official local Codex CLI and your saved ChatGPT subscription sign-in. No standalone windows, PowerShell dialogs or API-key fields.

## The three commands

**Quick Fix** makes minimal spelling, grammar, capitalization and punctuation corrections. It uses your saved model and attempts to replace the same selected text. It has its own Quick Fix instructions preference; Rewrite instructions do not apply.

**Rewrite** transforms selected or pasted text in your own voice. Add instructions, translate to your preferred language, review a separate replacement draft, and continue revising. It uses your writing preferences unless your explicit request overrides them.

**Ask AI** handles general chat, explanations and summaries, with optional selected text as context. It does not use your writing-style preferences. You can continue a conversation and switch models between turns.

Only these three commands appear in Raycast search. Translation, saved prompts and settings live inside them.

## Quick install (Windows)

1. Install [Node.js 24 LTS](https://nodejs.org) and keep Raycast running.
2. Clone or download this repo and double-click **Install.cmd**. It installs the Codex CLI if it is missing, opens the ChatGPT sign-in if you are not logged in, then builds the extension and loads it into Raycast.

No API key is needed: the extension uses the Codex CLI with your ChatGPT subscription. The sections below describe the manual steps.

## Install and try

This package contains the extension source, not a prebuilt Store download. It has not been published to the Raycast Store.

1. Install a current Raycast for Windows with extension development support and **Node.js 24 LTS** from https://nodejs.org. Keep Raycast running and signed in.
2. Extract the entire package to a permanent folder such as `C:\Users\tatsu\Documents\Raycast-Text-Companion`. This is an extension project; it does not go in your Script Commands directory.
3. Install/update the native Windows Codex CLI and sign in in Windows PowerShell:

   ```powershell
   npm install -g @openai/codex
   codex login
   codex login status
   ```

   Choose **Sign in with ChatGPT**, using your subscription account. Status must report **Logged in using ChatGPT**. If your CLI is currently signed in with an API key, `codex logout` followed by `codex login` changes the CLI's login method. Signing into the ChatGPT website alone does not authenticate the CLI.

4. Restart Raycast after installing Codex so it inherits PATH changes.
5. Double-click **Install.cmd** in this package. It installs dependencies, checks TypeScript, runs tests, builds the extension and starts Raycast's development loader. Keep its terminal open during the first test. This is the normal local development installation path; no Store publishing or Pro subscription is performed by this package.
6. Search for **Ask AI**, **Rewrite** or **Quick Fix**, with the **GPT Tools** subtitle. Configure unused global hotkeys in Raycast for selection-based use.

You can run the same steps manually from the extracted folder:

```powershell
npm install
npm run typecheck
npm test
npm run build
npm run dev
```

If Raycast needs you to authorize extension development or sign in, follow its native prompt. If npm or Codex's PowerShell shim is blocked by your execution policy, use a normal Command Prompt for setup (`npm.cmd` / `codex.cmd`), or follow your organization's permitted setup process. This installer does not change PowerShell execution policy.

### First test

Open a normal editor, type `i has a meeting tomorow`, select it and trigger **Quick Fix** with its hotkey. Keep the editor and selection unchanged until it finishes. Review the correction; your editor's Undo can reverse it.

Then select a short paragraph and open **Rewrite**. Enter `Make it clearer while keeping my wording`, choose a model and submit. Inspect the **Replacement draft**. Use **Copy Draft** or the explicit **Replace Selection** action.

In **Ask AI**, ask `Explain this phrase`. You should get a reply without a replacement action. Ask `Rewrite it as a shorter sentence` to get a separate draft. A reply never becomes replacement text just because it contains quoted words.

## Native Raycast interface

Rewrite and Ask AI open as a list: type an instruction or question in the search bar, pick a style (or Explain/Summarize in Ask AI), and see your selected text in the side panel. The model picker sits in the top-right of the search bar. If no selection can be captured, the clipboard text is used; Ctrl+K offers Edit Text and Paste from Clipboard, saved prompts, model refresh and Settings.

The result screen shows **Reply** and **Replacement draft** separately. For Rewrite with a captured source selection, Replace Selection is the first action (Enter). Copy Draft remains a secondary action. In Ask AI, Copy Draft remains first, with Replace Selection available as a separate action. No draft means no replacement action. Continue Conversation opens a native Raycast message form with the model selector. Earlier turns and the current draft are included in subsequent requests. View Conversation and View Original Text are available in the action menu.

Conversations remain in the current navigation session. Closing the command starts a fresh conversation on the next launch; this version does not save a chat-history database.

## Settings and saved prompts

Open **Raycast Settings → Extensions → GPT Tools**, or use **Rewrite / Ask AI → action menu → Settings** (Ctrl+, on Windows). Shared defaults live on that native extension preferences screen. Reopen the command after changing them.

- **Model:** a shared default for all three commands. A per-request model selection does not silently change the saved default. Codex recommended leaves the choice to Codex; selecting a named model passes that model ID explicitly.
- **Custom model ID:** optional manual ID if a model is not listed. A filled custom ID overrides the model dropdown. Availability is checked by Codex when the request runs.
- **Translate To:** remembered target language. You can also specify a different language directly in a rewrite request.
- **Your Writing Style:** applies only to Rewrite. The initial text preserves your natural, simple voice and avoids corporate phrasing, sentence dashes and semicolons. You can change or clear it.
- **Saved Prompts:** use the Rewrite / Ask AI action menu → Manage Saved Prompts to add, edit or remove up to 30 named instructions. Return to its parent screen and Save Changes to keep edits. Prompts appear in the action menu of Rewrite and Ask AI. They use the behavior of the command in which they are launched.

Model, language and writing preferences are stored by Raycast's native preference system; saved prompts use local Raycast storage. If you use a custom Codex installation, open the extension preferences and enter the full native `codex.exe` path. Standard native and npm Windows installs are detected automatically; `.cmd` and `.ps1` shims are not executed by the extension.

In-command models are loaded from the saved local catalog immediately. Refresh Models explicitly fetches Codex's `model/list` endpoint; it is not run automatically when opening a command. Native preferences use a snapshot of the local Codex model catalog, refreshed before development startup and build; the custom model ID field covers additional models. Cached entries do not guarantee access. The extension cannot add ChatGPT web-only models to your subscription's Codex catalog.

## How replacement stays separate from chat

Every model response must satisfy a JSON schema with two fields:

```json
{
  "response": "A conversational answer or explanation",
  "replacement": "Only the complete text to copy or replace"
}
```

`replacement` can instead be `null`. Explanations are instructed to return `null`. Quick Fix and Rewrite require a nonempty draft. The extension validates both fields and never extracts text by searching quotes, Markdown fences or the displayed reply. Copy Draft and Replace Selection receive only the validated replacement field. Copy Reply is a separate action.

This separates content structurally, but it cannot prove that the model's draft preserves all facts or perfectly follows instructions. Review drafts before applying them.

## Selection, clipboard and privacy

The extension uses Raycast's native `getSelectedText`, `getFrontmostApplication` and `Clipboard.paste` APIs. It is independent of Outlook and can be used with editors that support those APIs. Capturing text does not first copy it to the clipboard.

At launch it records the source application identity and exact selected text. Before replacing, it reads them again and refuses replacement when they differ or cannot be read. Pasted context without an attached source selection can be copied, but it cannot be used to guess a replacement target. Quick Fix serializes its runs using a local lock. If a completed correction cannot be applied, its failure toast offers Copy Corrected Text.

Raycast's public API identifies the application and selected text; this implementation does not have an atomic range/document replacement operation. Two windows of the same app with identical selected text cannot be distinguished by those checks. Editor support, input timing and paste behavior need live verification. Keep the source selection unchanged while working, and use Copy Draft if you have moved elsewhere. Replacement is plain text and may affect rich formatting. The extension delegates clipboard paste behavior to Raycast and does not promise to preserve every clipboard format.

The selected/context text, conversation and relevant prompt are sent online through Codex. Authentication stays in the CLI's normal auth storage. The extension does not read tokens or keep API keys, and removes API-key/access-token environment overrides from child processes. It forces ChatGPT authentication and the OpenAI provider. Requests use your plan's Codex access and limits.

Generation runs in a new temporary folder with a read-only sandbox, ignored user configuration/rules, an ephemeral session, disabled shell tool and web search, and explicit instructions not to use tools. No sandbox-bypass flags are used. Temporary response/schema files are removed after handled success or failure. Crashes can leave temporary files; Codex can also keep its own diagnostics and caches. This is an AI text integration, not an offline model.

## Validation status

53 automated tests pass using local fake child processes and mocked Raycast APIs. They cover structured reply/draft separation, quotes/Unicode, style isolation, native preference precedence, settings, model arguments/discovery, authentication mode, process cancellation/timeouts, temporary-file cleanup and selection guards. The full TypeScript check against installed Raycast and React dependencies passes.

The official Raycast rebuild needs to write into the user's Raycast registration directory. This chat's sandbox blocked that write, and automatic approval review rejected escalation. Run Install.cmd in your own terminal to refresh the registered development extension. Live editor behavior has not been verified. No live model requests were made during development tests.

Dependencies are now installed locally, and the updated package includes a lockfile. The visible title is GPT Tools; the internal package ID remains unchanged to update the existing installation. The locally drawn icon is ChatGPT-inspired with a pencil badge; it is not an official OpenAI app icon.

## Official references

- Local extension development: https://developers.raycast.com/basics/create-your-first-extension
- Raycast manifest and Windows support: https://developers.raycast.com/information/manifest
- Selected text: https://developers.raycast.com/api-reference/environment#getselectedtext
- Pasting into the selection: https://developers.raycast.com/api-reference/clipboard#clipboard.paste
- Codex authentication: https://learn.chatgpt.com/docs/auth
- Codex CLI/schema output: https://learn.chatgpt.com/docs/cli/reference
- Codex model discovery: https://learn.chatgpt.com/docs/app-server

## Version 1.2.0

Quick Fix instructions and Rewrite instructions are separate fields in Raycast Settings -> Extensions -> GPT Tools. Quick Fix instructions apply only to Quick Fix. Rewrite now puts Replace Selection first when a source selection is attached, while retaining Copy Draft. The updated icon uses a white background.
