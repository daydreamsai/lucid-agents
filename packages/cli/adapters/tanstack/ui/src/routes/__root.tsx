import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { resolveServiceUi } from '@lucid-agents/http/service-ui';

import { AppKitProvider } from '../components/AppkitProvider';
import appCss from '../styles/global.css?url';
import serviceUi from '../../service-ui.config';

const resolvedServiceUi = resolveServiceUi(serviceUi);

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        name: 'theme-color',
        content: resolvedServiceUi.tokens.colors.canvas,
      },
      {
        name: 'color-scheme',
        content: resolvedServiceUi.colorScheme,
      },
      {
        title: 'Agent service',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AppKitProvider>{children}</AppKitProvider>
        <Scripts />
      </body>
    </html>
  );
}
