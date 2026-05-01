// Build a configured Fastify instance. Separated from index.ts so tests
// can construct an app without binding a port.

import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { config, corsOrigins, isProd } from './config.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { twitterRoutes } from './routes/twitter.js';
import { chatRoutes } from './routes/chat.js';
import { taskRoutes } from './routes/task.js';
import { storageRoutes } from './routes/storage.js';
import { memoryRoutes } from './routes/memory.js';
import { personaRoutes } from './routes/persona.js';
import { chainRoutes } from './routes/chain.js';
import { finetuneRoutes } from './routes/finetune.js';
import { toolsRoutes } from './routes/tools.js';
import { feedbackRoutes } from './routes/feedback.js';
import { uploadRoutes } from './routes/upload.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: isProd
      ? { level: config.LOG_LEVEL }
      : {
          level: config.LOG_LEVEL,
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        },
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(sensible);
  await app.register(cors, {
    origin: corsOrigins,
    credentials: true,
  });
  await app.register(multipart, {
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB cap per upload
  });

  registerErrorHandler(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(twitterRoutes);
      await api.register(chatRoutes);
      await api.register(taskRoutes);
      await api.register(storageRoutes);
      await api.register(memoryRoutes);
      await api.register(personaRoutes);
      await api.register(chainRoutes);
      await api.register(finetuneRoutes);
      await api.register(toolsRoutes);
      await api.register(feedbackRoutes);
      await api.register(uploadRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
