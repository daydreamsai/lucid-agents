import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AppKitProvider } from '@/components/AppKitProvider';
import Header from '@/components/Header';
import './globals.css';
import { headers } from 'next/headers';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lucid Agent Platform',
  description: 'Full-stack agent platform with x402 micropayments',
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
      <body className={inter.className}>
        <AppKitProvider cookies={cookies}>
          <Header />
          {children}
        </AppKitProvider>
      </body>
    </html>
  );
}
