import type { EntrypointDef } from '@lucid-agents/types/core';
import { ZodValidationError } from '@lucid-agents/types/core';
import { z } from 'zod';

function isZodSchema(value: unknown): value is z.ZodTypeAny {
  return Boolean(value && typeof value === 'object' && 'safeParse' in value);
}

/**
 * Validates input against entrypoint input schema.
 * @throws {ZodValidationError} If validation fails
 */
export function parseInput(entrypoint: EntrypointDef, value: unknown): unknown {
  const schema = entrypoint.input;
  if (!schema) return value;
  if (!isZodSchema(schema)) return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ZodValidationError('input', parsed.error.issues);
  }
  return parsed.data;
}

/**
 * Validates output against entrypoint output schema.
 * @throws {ZodValidationError} If validation fails
 */
export function parseOutput(entrypoint: EntrypointDef, value: unknown): unknown {
  const schema = entrypoint.output;
  if (!schema) return value;
  if (!isZodSchema(schema)) return value;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ZodValidationError('output', parsed.error.issues);
  }
  return parsed.data;
}

