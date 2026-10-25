export type Mode = "ask" | "rewrite" | "quick";
export type Shortcut = { id: string; name: string; prompt: string };
export type Settings = { model: string; language: string; writingStyle: string; quickFixInstructions: string; shortcuts: Shortcut[] };
export type Selection = { text: string; appId: string; appName: string };
export type Reply = { response: string; replacement: string | null };
export type Turn = { request: string; response: string; replacement: string | null };
export type Model = { id: string; name: string };
