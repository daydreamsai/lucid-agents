import { createRoute } from '@hono/zod-openapi';
import { HealthSchema } from '../schemas';

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['Platform'],
  summary: 'Health check',
  description: 'Check if the service is running and healthy.',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: HealthSchema,
        },
      },
      description: 'Service is healthy',
    },
  },
});
