import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';

const documentationStatuses = [
  'stable',
  'next',
  'experimental',
  'deprecated',
  'hosted',
] as const;

const documentationProducts = [
  'sdk',
  'router',
  'hosted-platform',
  'provider',
] as const;

const documentationPageTypes = [
  'guide',
  'reference',
  'index',
  'boundary',
] as const;

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      status: z.enum(documentationStatuses),
      verifiedVersion: z.string().min(1),
      verifiedAt: z
        .union([z.iso.date(), z.date()])
        .transform(value =>
          typeof value === 'string'
            ? value
            : value.toISOString().slice(0, 'YYYY-MM-DD'.length)
        ),
      product: z.enum(documentationProducts),
      pageType: z.enum(documentationPageTypes).optional(),
    }),
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
