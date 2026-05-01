// Tool registry types. A Tool is a typed unit of work the orchestrator (or
// the Tools page directly) can invoke. Inputs validated by zod, outputs
// validated optionally. Each tool declares a category for grouping in the UI.

import type { z, ZodTypeAny } from 'zod';

export type ToolCategory = 'memory' | 'storage' | 'compute' | 'workflow';

export interface ToolContext {
  /** master twin id — used by memory tools to scope KV streams. Default '42'. */
  twinId: string;
  /** orchestrator-spawned task id, if any (for log correlation). */
  taskId?: string;
  /** structured logger (Fastify request log when invoked via /api/tools). */
  log?: { info: (msg: unknown, ...args: unknown[]) => void; warn?: (msg: unknown, ...args: unknown[]) => void };
}

export interface Tool<I extends ZodTypeAny = ZodTypeAny, O extends ZodTypeAny = ZodTypeAny> {
  name: string;
  description: string;
  category: ToolCategory;
  /** zod schema for the tool's input. Validated at execute time. */
  input: I;
  /** optional output schema. If present, results are validated post-execute. */
  output?: O;
  /** the actual implementation. */
  execute: (input: z.infer<I>, ctx: ToolContext) => Promise<z.infer<O> | unknown>;
}

export class ToolError extends Error {
  constructor(message: string, override readonly cause?: unknown) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolResult {
  result: unknown;
  elapsedMs: number;
}
