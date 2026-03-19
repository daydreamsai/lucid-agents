import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  details: z.string().optional(),
  request_id: z.string().uuid(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
