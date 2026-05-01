// Chain reads — surfaces TwinINFT state to the frontend.
//
//   GET /api/chain/mode               { kind, contractAddress, chainId, ... }
//   GET /api/chain/twin/:tokenId      { tokenId, owner, dataHash, ... } | 404

import type { FastifyInstance } from 'fastify';
import { chain } from '../services/chain.js';

export async function chainRoutes(app: FastifyInstance): Promise<void> {
  app.get('/chain/mode', async () => chain.mode);

  app.get('/chain/twin/:tokenId', async (req) => {
    const id = Number((req.params as { tokenId: string }).tokenId);
    if (!Number.isFinite(id) || id < 1) {
      throw app.httpErrors.badRequest('tokenId must be a positive integer');
    }
    const state = await chain.getTwin(id);
    if (!state) throw app.httpErrors.notFound(`No twin #${id}`);
    return state;
  });
}
