// Runner toolbox routes — surface the registry to the frontend.
//
//   GET  /api/tools                    list { name, description, category, input } for all tools
//   GET  /api/tools/:name              same, single tool
//   POST /api/tools/:name              { input: {...}, twinId?, taskId? } → { result, elapsedMs }

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registry } from '../services/tools/index.js';
import { toJsonSchema } from '../services/tools/json-schema.js';
import { ToolError } from '../services/tools/types.js';

const InvokeBody = z.object({
  input: z.record(z.unknown()).default({}),
  twinId: z.string().optional(),
  taskId: z.string().optional(),
});

function describe(tool: ReturnType<typeof registry.list>[number]) {
  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    input: toJsonSchema(tool.input, `${tool.name}_input`),
    output: tool.output ? toJsonSchema(tool.output, `${tool.name}_output`) : null,
  };
}

export async function toolsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/tools', async () => {
    const tools = registry.list().map(describe);
    return { tools, count: tools.length };
  });

  app.get('/tools/:name', async (req) => {
    const { name } = req.params as { name: string };
    const tool = registry.get(name);
    if (!tool) throw app.httpErrors.notFound(`Unknown tool: ${name}`);
    return describe(tool);
  });

  app.post('/tools/:name', async (req) => {
    const { name } = req.params as { name: string };
    const body = InvokeBody.parse(req.body ?? {});
    try {
      const out = await registry.execute(name, body.input, {
        twinId: body.twinId ?? '42',
        taskId: body.taskId,
        log: req.log as never,
      });
      return out;
    } catch (err) {
      if (err instanceof ToolError) {
        throw app.httpErrors.unprocessableEntity(err.message);
      }
      throw err;
    }
  });
}
