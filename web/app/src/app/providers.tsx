'use client';
import { useEffect, type ReactNode } from 'react';
import { SessionProvider } from '@/lib/auth';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // サービスワーカー：画面と静的ファイルを保存し、機内モードでも開けるようにする
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return <SessionProvider>{children}</SessionProvider>;
}
