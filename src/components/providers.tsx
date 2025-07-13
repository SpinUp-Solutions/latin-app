'use client';

import React from 'react';
import { ThemeProvider } from 'next-themes';
import { Provider as ReduxProvider } from 'react-redux';
import { store } from '@/src/store';
import { AuthProvider } from '@/src/components/auth/auth-provider';
import { TooltipProvider } from '@/src/components/ui/core/tooltip-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <AuthProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ReduxProvider>
  );
}
