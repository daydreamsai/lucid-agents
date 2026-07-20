import type { Metadata, Viewport } from 'next';

import { AppKitProvider } from '@/components/AppKitProvider';
import './globals.css';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Agent service',
  description: 'Inspect and invoke this agent service.',
};

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0d0c',
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
