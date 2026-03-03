import { z } from 'zod';

export const xmptEnvelopeSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  transport: z.string().min(1),
  createdAt: z.string().datetime(),
  replyTo: z.string().min(1).optional(),
  payload: z.unknown(),
});

export const xmptSendInputSchema = z.object({
  to: z.string().min(1),
  payload: z.unknown(),
  threadId: z.string().min(1).optional(),
  replyTo: z.string().min(1).optional(),
});

export const xmptReplySchema = z.object({
  threadId: z.string().min(1),
  payload: z.unknown(),
});

export const agentmailPollResponseSchema = z.union([
  z.array(xmptEnvelopeSchema),
  z.object({
    messages: z.array(xmptEnvelopeSchema),
    nextCursor: z.string().optional(),
  }),
]);
