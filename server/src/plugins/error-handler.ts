// Centralized error handling for the Fastify app.
//
// Strategy:
//   - zod                  → 400 with field issues
//   - TwitterApiError      → mirror upstream status, surface message + detail
//   - errors with explicit statusCode (Fastify httpErrors / app code)
//                          → pass through with their message
//   - everything else      → 500 internal_error (message scrubbed)
//
// The last case is the only one that hides the message — bare `throw` from
// somewhere in the code path indicates a bug, and we don't want to leak it.

import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { TwitterApiError } from '../services/twitter.js';

interface MaybeFastifyHttpError extends FastifyError {
  error?: string;
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: MaybeFastifyHttpError, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: 'invalid_request',
        issues: err.flatten().fieldErrors,
      });
    }

    if (err instanceof TwitterApiError) {
      req.log.warn({ err }, 'twitter api error');
      return reply.status(err.status).send({
        error: 'twitter_error',
        message: err.message,
        detail: err.detail,
      });
    }

    if (err.validation) {
      return reply.status(400).send({
        error: 'invalid_request',
        validation: err.validation,
      });
    }

    if (typeof err.statusCode === 'number') {
      const status = err.statusCode;
      req.log.info({ err }, 'http error');
      return reply.status(status).send({
        error: err.error ?? (status >= 500 ? 'service_error' : 'request_error'),
        message: err.message,
      });
    }

    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      error: 'internal_error',
      message: 'Something went wrong.',
    });
  });
}
