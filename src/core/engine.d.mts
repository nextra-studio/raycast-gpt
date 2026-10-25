import type { Mode, Model, Reply } from "../types";
export function cleanEnvironment(environment?: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function resolveCodex(explicit?: string): string;
export function assertLogin(executable: string, options?: { signal?: AbortSignal }): Promise<void>;
export function generate(options: { executable: string; prompt: string; model?: string; mode?: Mode; signal?: AbortSignal }): Promise<Reply>;
export function listModels(executable: string, options?: { signal?: AbortSignal }): Promise<Model[]>;
export function cachedModels(): Promise<Model[]>;
