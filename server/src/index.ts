// Entry point. Builds the server, starts it, and wires graceful shutdown.

import { buildServer } from './server.js';
import { config } from './config.js';
import { startStabilizeWorker, stopStabilizeWorker } from './services/memory.js';

async function main(): Promise<void> {
  const app = await buildServer();

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }

  // Background memory consolidation — promote high-reinforcement entries to
  // stable every minute. Cheap (no LLM calls).
  startStabilizeWorker(['42'], 60_000);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      stopStabilizeWorker();
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
