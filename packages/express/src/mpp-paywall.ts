import type { Express, Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import type { EntrypointDef } from '@lucid-agents/types/core';
import type { MppRuntime } from '@lucid-agents/types/mpp';

/**
 * Register MPP payment middleware on an Express route.
 */
export function withMpp({
  app,
  path,
  entrypoint,
  kind,
  mpp,
}: {
  app: Express;
  path: string;
  entrypoint: EntrypointDef;
  kind: 'invoke' | 'stream';
  mpp: MppRuntime | undefined;
}): boolean {
  if (!mpp?.isActive) return false;

  const requirement = mpp.requirements(entrypoint, kind);
  if (!requirement.required) return false;

  app.post(path, (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => {
    // If request already has a Payment header, let it through
    const paymentHeader = req.headers['payment'] as string | undefined;
    if (paymentHeader) {
      return next();
    }

    // Send 402 challenge response
    const challengeResponse = requirement.response.clone();
    res.status(challengeResponse.status);
    challengeResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    challengeResponse.text().then(body => res.send(body));
  });

  return true;
}
