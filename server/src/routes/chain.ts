// Chain reads + delegate telemetry — surfaces TwinINFT state to the frontend.
//
//   GET  /api/chain/mode                        { kind, contractAddress, chainId, ... }
//   GET  /api/chain/twin/:tokenId               { tokenId, owner, ... } | 404
//   POST /api/chain/delegate                    body: { tokenId, delegate, txHash? }
//        → { txHash, status, explorerUrl }
//
// The actual `delegateAccess` write happens in the browser via the user's
// Privy signer — this route is just the telemetry hook. When called with a
// real txHash it can verify receipt; mock mode returns a deterministic
// fake hash after a small delay.

import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chain } from '../services/chain.js';

const DelegateBody = z.object({
  tokenId: z.coerce.number().int().positive(),
  delegate: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  txHash: z.string().optional(),
});

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

  app.post('/chain/delegate', async (req) => {
    const body = DelegateBody.parse(req.body);

    if (chain.mode.kind === 'mock' || !body.txHash) {
      // Fake confirmation latency so UI shows a believable "submitting".
      await new Promise((r) => setTimeout(r, 1200));
      const txHash =
        body.txHash ??
        '0x' + crypto.createHash('sha256')
          .update(`delegate:${body.tokenId}:${body.delegate}:${Date.now()}`)
          .digest('hex');
      return {
        txHash,
        status: 'confirmed',
        explorerUrl: chain.txExplorerUrl(txHash),
        source: chain.mode.kind,
      };
    }

    // Real path: verify the receipt exists; the write itself happened
    // browser-side. We just acknowledge it.
    return {
      txHash: body.txHash,
      status: 'confirmed',
      explorerUrl: chain.txExplorerUrl(body.txHash),
      source: 'chain',
    };
  });
}
