import type { EntrypointDef } from '@lucid-agents/types/core';
import type {
  PaymentsConfig,
  X402PaymentProjection,
} from '@lucid-agents/types/payments';
import { decodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, ResourceServerExtension } from '@x402/core/types';
import type { x402ResourceServer } from '@x402/core/server';
import {
  BAZAAR,
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
  extractDiscoveryInfoFromExtension,
  validateDiscoveryExtension,
} from '@x402/extensions/bazaar';
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  extractAndValidatePaymentIdentifier,
  isValidPaymentId,
  paymentIdentifierSchema,
  paymentIdentifierResourceServerExtension,
} from '@x402/extensions/payment-identifier';
import {
  createOfferReceiptExtension,
  declareOfferReceiptExtension,
  type OfferReceiptDeclaration,
  type OfferReceiptIssuer,
} from '@x402/extensions/offer-receipt';
import { z } from 'zod';

import {
  compileX402Extensions,
  compileX402Offers,
  type CompiledX402Offers,
} from './x402-offers';

/** Configures official x402 reconciliation and discovery extensions. */
export type X402ReconciliationOptions = {
  paymentIdentifier?: {
    /** Require a valid identifier matching HTTP `Idempotency-Key`. */
    required?: boolean;
  };
  bazaar?: {
    enabled?: boolean;
  };
  offerReceipt?: OfferReceiptDeclaration & {
    /** Injected signing capability; private key material is never accepted. */
    issuer: OfferReceiptIssuer;
  };
};

/** Verified, non-secret reconciliation metadata from an x402 payload. */
export type X402Reconciliation = {
  paymentIdentifier?: string;
  extensions: Record<string, unknown>;
};

/** Compile configured x402 extensions for one entrypoint operation. */
export function compileReconciliationExtensions(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream' | 'task',
  compiled: CompiledX402Offers,
  options?: X402ReconciliationOptions
): Record<string, unknown> {
  const extensions = {
    ...(compileX402Extensions(compiled.offers, entrypoint.key) ?? {}),
  };
  if (kind === 'invoke' && options?.paymentIdentifier) {
    extensions[PAYMENT_IDENTIFIER] = declarePaymentIdentifierExtension(
      options.paymentIdentifier.required ?? true
    );
  }
  if (options?.bazaar?.enabled) {
    Object.assign(extensions, createBazaarDeclaration(entrypoint, kind));
  }
  if (options?.offerReceipt) {
    const { issuer: _issuer, ...declaration } = options.offerReceipt;
    Object.assign(extensions, declareOfferReceiptExtension(declaration));
  }
  return extensions;
}

/** Register configured official extensions with the x402 resource server. */
export function registerReconciliationExtensions(
  server: x402ResourceServer,
  options?: X402ReconciliationOptions
): void {
  const extensions: ResourceServerExtension[] = [];
  if (options?.paymentIdentifier) {
    extensions.push(paymentIdentifierResourceServerExtension);
  }
  if (options?.bazaar?.enabled) {
    extensions.push(bazaarResourceServerExtension);
  }
  if (options?.offerReceipt) {
    extensions.push(createOfferReceiptExtension(options.offerReceipt.issuer));
  }
  for (const extension of extensions) server.registerExtension(extension);
}

/** Validate and correlate an x402 payment identifier with idempotency. */
export function reconcilePaymentIdentifier(
  request: Request,
  required: boolean
):
  | { ok: true; paymentPayload?: PaymentPayload; metadata?: X402Reconciliation }
  | { ok: false; response: Response } {
  const encoded =
    request.headers.get('PAYMENT-SIGNATURE') ??
    request.headers.get('X-PAYMENT');
  if (!encoded) return { ok: true };

  let paymentPayload: PaymentPayload;
  try {
    paymentPayload = decodePaymentSignatureHeader(encoded);
  } catch {
    return {
      ok: false,
      response: reconciliationError(
        'invalid_payment_payload',
        'The payment payload is malformed.'
      ),
    };
  }
  const extracted = extractAndValidatePaymentIdentifier(paymentPayload);
  if (!extracted.validation.valid) {
    return {
      ok: false,
      response: reconciliationError(
        'invalid_payment_identifier',
        extracted.validation.errors?.join('; ') ??
          'The payment identifier is invalid.'
      ),
    };
  }
  const idempotencyKey = request.headers.get('Idempotency-Key');
  if (required && !extracted.id) {
    return {
      ok: false,
      response: reconciliationError(
        'payment_identifier_required',
        'The payment payload must include a payment identifier.'
      ),
    };
  }
  if (extracted.id && !idempotencyKey) {
    return {
      ok: false,
      response: reconciliationError(
        'idempotency_key_required',
        'Idempotency-Key is required when a payment identifier is supplied.'
      ),
    };
  }
  if (idempotencyKey && !isValidPaymentId(idempotencyKey)) {
    return {
      ok: false,
      response: reconciliationError(
        'invalid_idempotency_key',
        'Idempotency-Key must satisfy the x402 payment identifier format.'
      ),
    };
  }
  if (extracted.id !== idempotencyKey) {
    return {
      ok: false,
      response: reconciliationError(
        'payment_identifier_mismatch',
        'The payment identifier must equal Idempotency-Key.'
      ),
    };
  }
  return {
    ok: true,
    paymentPayload,
    metadata: {
      ...(extracted.id ? { paymentIdentifier: extracted.id } : {}),
      extensions: { ...(paymentPayload.extensions ?? {}) },
    },
  };
}

/** Project an entrypoint's x402 offers and extensions for discovery. */
export function projectX402Payment(
  entrypoint: EntrypointDef,
  kind: 'invoke' | 'stream' | 'task',
  config: PaymentsConfig,
  options?: X402ReconciliationOptions
): X402PaymentProjection | undefined {
  const compiled = compileX402Offers(entrypoint, config, kind);
  if (!compiled) return undefined;
  const extensions = compileReconciliationExtensions(
    entrypoint,
    kind,
    compiled,
    options
  );
  const bazaar = extensions[BAZAAR.key];
  if (bazaar) {
    const validation = validateDiscoveryExtension(bazaar as never);
    if (!validation.valid) {
      throw new Error(
        `Invalid Bazaar projection for entrypoint "${entrypoint.key}": ${validation.errors?.join('; ')}`
      );
    }
    extractDiscoveryInfoFromExtension(bazaar as never);
  }
  return {
    entrypointKey: entrypoint.key,
    kind,
    description: entrypoint.description,
    offers: compiled.offers.map(offer => offer.publicOffer),
    extensions,
  };
}

/** OpenAPI components contributed by the x402 reconciliation extensions. */
export const x402OpenApiComponents: Record<string, unknown> = {
  schemas: {
    X402PaymentIdentifier: {
      ...paymentIdentifierSchema.properties.id,
      description:
        'Correlation identifier that must equal the HTTP Idempotency-Key.',
    },
  },
};

function createBazaarDeclaration(
  entrypoint: EntrypointDef,
  _kind: 'invoke' | 'stream' | 'task'
): Record<string, unknown> {
  const inputSchema = entrypoint.input
    ? z.toJSONSchema(entrypoint.input)
    : { type: 'object', properties: {} };
  const outputSchema = entrypoint.output
    ? z.toJSONSchema(entrypoint.output)
    : {};
  return declareDiscoveryExtension({
    method: 'POST',
    bodyType: 'json',
    input: { input: exampleFromJsonSchema(inputSchema) },
    inputSchema: {
      properties: { input: inputSchema },
      required: ['input'],
    },
    output: {
      schema: {
        type: 'object',
        properties: { output: outputSchema },
      },
    },
  } as never);
}

function exampleFromJsonSchema(schema: unknown): unknown {
  if (!isRecord(schema)) return {};
  if (schema.type === 'string') return '';
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array') return [];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum[0];
  }
  if (isRecord(schema.properties)) {
    return Object.fromEntries(
      Object.entries(schema.properties).map(([key, value]) => [
        key,
        exampleFromJsonSchema(value),
      ])
    );
  }
  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reconciliationError(code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status: 400 });
}
