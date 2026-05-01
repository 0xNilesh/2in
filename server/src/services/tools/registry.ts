// Tool registry. One singleton instance owns all registered tools.
//
//   register(tool)              — add a tool
//   get(name)                   — fetch by name
//   list()                      — enumerate (for /api/tools list)
//   execute(name, input, ctx)   — validate input → call → optionally validate
//                                 output → return { result, elapsedMs }
//
// Throws ToolError on unknown tools or validation failures so the route
// layer can map cleanly to HTTP statuses.

import type { Tool, ToolContext, ToolResult } from './types.js';
import { ToolError } from './types.js';

export class Registry {
  private readonly tools = new Map<string, Tool>();

  register<T extends Tool>(tool: T): T {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return tool;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) throw new ToolError(`Unknown tool: ${name}`);

    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new ToolError(
        `Invalid input for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`).join('; ')}`,
        parsed.error,
      );
    }

    const startedAt = Date.now();
    let result: unknown;
    try {
      result = await tool.execute(parsed.data, ctx);
    } catch (err) {
      throw new ToolError(`${name} failed: ${(err as Error).message ?? 'unknown_error'}`, err);
    }

    if (tool.output) {
      const out = tool.output.safeParse(result);
      if (!out.success) {
        throw new ToolError(`${name} returned invalid output: ${out.error.message}`, out.error);
      }
      result = out.data;
    }

    return { result, elapsedMs: Date.now() - startedAt };
  }
}

export const registry = new Registry();
