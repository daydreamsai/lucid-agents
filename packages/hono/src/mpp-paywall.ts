import type { Hono } from 'hono';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { MppRuntime } from '@lucid-agents/types/mpp';

/**
 * Register MPP payment middleware on a route.
 *
 * If the entrypoint has a price and the agent has an active MPP runtime,
 * this middleware returns a 402 Payment Required response with
 * WWW-Authenticate headers before the handler executes.
 */
export function withMpp({
  app,
  path,
  entrypoint,
  kind,
  mpp,
}: {
  app: Hono;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  mpp: MppRuntime | undefined;
}): boolean {
  if (!mpp?.isActive) return false;

  const requirement = mpp.requirements(entrypoint, kind);
  if (!requirement.required) return false;

  app.post(path, async (c, next) => {
    // If request already has a Payment header, let it through
    // (credential verification is handled downstream by mppx server SDK)
    const paymentHeader = c.req.header('Payment');
    if (paymentHeader) {
      return next();
    }

    // Return the 402 challenge response
    return requirement.response.clone();
  });

  return true;
}
