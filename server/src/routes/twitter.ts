// Twitter routes — auth-url, exchange, tweets.
// Each route validates input with zod and delegates the heavy lifting to
// services/twitter.ts.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { generatePkce, generateState } from '../lib/pkce.js';
import { createMemoryStateStore } from '../lib/state-store.js';
import { TwitterClient } from '../services/twitter.js';

const ExchangeBody = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const TweetsQuery = z.object({
  userId: z.string().min(1),
  max: z.coerce.number().int().min(1).max(100).optional(),
});

export async function twitterRoutes(app: FastifyInstance): Promise<void> {
  if (!config.TWITTER_CLIENT_ID) {
    app.log.warn(
      'TWITTER_CLIENT_ID not set — /api/twitter routes will return 503 until configured.',
    );
  }

  const twitter = new TwitterClient({
    clientId: config.TWITTER_CLIENT_ID ?? '',
    clientSecret: config.TWITTER_CLIENT_SECRET,
    redirectUri: config.TWITTER_REDIRECT_URI,
  });

  const stateStore = createMemoryStateStore();

  function requireConfigured() {
    if (!config.TWITTER_CLIENT_ID) {
      throw app.httpErrors.serviceUnavailable(
        'Twitter OAuth not configured. Set TWITTER_CLIENT_ID in server/.env',
      );
    }
  }

  // GET /api/twitter/auth-url
  // Returns { url, state } for the SPA to navigate to. ?redirect=1 → 302 to URL.
  app.get('/twitter/auth-url', async (req, reply) => {
    requireConfigured();
    const state = generateState();
    const { verifier, challenge } = generatePkce();
    stateStore.put(state, { verifier });

    const url = twitter.buildAuthorizeUrl({ state, codeChallenge: challenge });
    if ((req.query as { redirect?: string }).redirect === '1') {
      return reply.redirect(url);
    }
    return { url, state };
  });

  // POST /api/twitter/exchange  { code, state }
  // Server-side because Twitter token endpoint has no CORS allowance.
  app.post('/twitter/exchange', async (req) => {
    requireConfigured();
    const body = ExchangeBody.parse(req.body);
    const cached = stateStore.take(body.state);
    if (!cached) {
      throw app.httpErrors.badRequest('Unknown or expired state.');
    }
    const token = await twitter.exchangeCode({
      code: body.code,
      codeVerifier: cached.verifier,
    });
    const me = await twitter.getMe(token.accessToken);
    return { token, user: me };
  });

  // GET /api/twitter/tweets?userId=...&max=20
  // Caller supplies token via Authorization: Bearer <token>.
  app.get('/twitter/tweets', async (req) => {
    requireConfigured();
    const auth = req.headers.authorization ?? '';
    const accessToken = auth.replace(/^Bearer\s+/i, '').trim();
    if (!accessToken) {
      throw app.httpErrors.unauthorized('Missing Authorization: Bearer <accessToken>');
    }
    const q = TweetsQuery.parse(req.query);
    const tweets = await twitter.listTweets({
      accessToken,
      userId: q.userId,
      max: q.max,
    });
    return { tweets, count: tweets.length };
  });
}
