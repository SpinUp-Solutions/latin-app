import '../styles/globals.css';
import type { Metadata } from 'next';
import React from 'react';
import { Inter } from 'next/font/google';
import { Providers } from '@/src/components/providers';
import { Toaster } from '@/src/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Wake Forest University Latin',
    template: '%s | Wake Forest University Latin',
  },
  description: 'Learn Latin through modern, interactive lessons at WakeForest University',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
