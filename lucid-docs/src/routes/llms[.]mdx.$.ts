import { createFileRoute, notFound } from '@tanstack/react-router';
import { source } from '@/lib/source';

export const Route = createFileRoute('/llms.mdx/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = params._splat?.split('/') ?? [];
        const page = source.getPage(slugs);
        if (!page) throw notFound();

        const processed = await page.data.getText('processed');
        const content = `# ${page.data.title} (${page.url})\n\n${processed}`;

        return new Response(content, {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });
      },
    },
  },
});
