import type { Metadata, Viewport } from 'next';
import { resolveServiceUi } from '@lucid-agents/http/service-ui';

import { AppKitProvider } from '@/components/AppKitProvider';
import serviceUi from '@/service-ui.config';
import './globals.css';
import { headers } from 'next/headers';

const resolvedServiceUi = resolveServiceUi(serviceUi);

export const metadata: Metadata = {
  title: 'Agent service',
  description: 'Inspect and invoke this agent service.',
};

export const viewport: Viewport = {
  colorScheme: resolvedServiceUi.colorScheme,
  themeColor: resolvedServiceUi.tokens.colors.canvas,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersObj = await headers();
  const cookies = headersObj.get('cookie');
  return (
    <html lang="en">
      <body>
        <AppKitProvider cookies={cookies}>{children}</AppKitProvider>
      </body>
    </html>
  );
}
