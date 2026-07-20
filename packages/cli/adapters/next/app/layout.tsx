import type { Metadata } from 'next';

import { AppKitProvider } from '@/components/AppKitProvider';
import './globals.css';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: 'Agent service',
  description: 'Inspect and invoke this agent service.',
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
