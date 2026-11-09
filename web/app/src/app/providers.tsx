'use client';
import type { ReactNode } from 'react';
import { InstallProvider } from '@/lib/install';
import { SessionProvider } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <InstallProvider>
      <SessionProvider>{children}</SessionProvider>
    </InstallProvider>
  );
}
