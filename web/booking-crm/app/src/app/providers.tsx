'use client';
import type { ReactNode } from 'react';
import { InstallProvider } from '@/lib/install';
import { AppProvider } from '@/lib/app-state';
import { AppShell } from '@/components/AppShell';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <InstallProvider>
      <AppProvider>
        <AppShell>{children}</AppShell>
      </AppProvider>
    </InstallProvider>
  );
}
