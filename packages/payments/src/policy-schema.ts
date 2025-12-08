import { z } from 'zod';

const OutgoingLimitSchema = z.object({
  maxPaymentUsd: z.number().positive().optional(),
  maxTotalUsd: z.number().positive().optional(),
  windowMs: z.number().int().positive().optional(),
});

const OutgoingLimitsConfigSchema = z.object({
  global: OutgoingLimitSchema.optional(),
  perTarget: z.record(z.string(), OutgoingLimitSchema).optional(),
  perEndpoint: z.record(z.string(), OutgoingLimitSchema).optional(),
});

const IncomingLimitSchema = z.object({
  maxPaymentUsd: z.number().positive().optional(),
  maxTotalUsd: z.number().positive().optional(),
  windowMs: z.number().int().positive().optional(),
});

const IncomingLimitsConfigSchema = z.object({
  global: IncomingLimitSchema.optional(),
  perSender: z.record(z.string(), IncomingLimitSchema).optional(),
  perEndpoint: z.record(z.string(), IncomingLimitSchema).optional(),
});

const RateLimitConfigSchema = z.object({
  maxPayments: z.number().int().positive(),
  windowMs: z.number().int().positive(),
});

export const PaymentPolicyGroupSchema = z.object({
  name: z.string().min(1),
  outgoingLimits: OutgoingLimitsConfigSchema.optional(),
  incomingLimits: IncomingLimitsConfigSchema.optional(),
  allowedRecipients: z.array(z.string()).optional(),
  blockedRecipients: z.array(z.string()).optional(),
  allowedSenders: z.array(z.string()).optional(),
  blockedSenders: z.array(z.string()).optional(),
  rateLimits: RateLimitConfigSchema.optional(),
});

/**
 * Zod schema for PaymentPolicyGroup array.
 */
export const PaymentPolicyGroupsSchema = z.array(PaymentPolicyGroupSchema);

