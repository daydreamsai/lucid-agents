import type { Metadata, Viewport } from 'next';
import { resolveServiceUi } from '@lucid-agents/http/service-ui';
import type { ReactNode } from 'react';

import serviceUi from '@/service-ui.config';
import './globals.css';

const resolvedServiceUi = resolveServiceUi(serviceUi);

export const metadata: Metadata = {
  title: 'Agent service',
  description: 'Inspect and invoke this agent service.',
};

export const viewport: Viewport = {
  colorScheme: resolvedServiceUi.colorScheme,
  themeColor: resolvedServiceUi.tokens.colors.canvas,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
