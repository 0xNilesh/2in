// Tiny wrapper around zod-to-json-schema. Centralised so we can swap the
// converter (or pin its options) in one place if the lib's defaults shift.

import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

export function toJsonSchema(schema: ZodTypeAny, name: string): unknown {
  return zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
    name,
  });
}
