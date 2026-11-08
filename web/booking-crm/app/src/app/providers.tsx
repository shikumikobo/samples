'use client';
import { useEffect, type ReactNode } from 'react';
import { AppProvider } from '@/lib/app-state';
import { AppShell } from '@/components/AppShell';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    // サービスワーカー：画面と静的ファイルを保存し、機内モードでも開けるようにする
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready)
        .then((reg) => {
          // 初めて開いたときに読み込んだファイルも、サービスワーカーに保存してもらう
          const urls = performance.getEntriesByType('resource').map((r) => r.name);
          reg.active?.postMessage({ type: 'cache-urls', urls });
        })
        .catch(() => {});
    }
  }, []);
  return (
    <AppProvider>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
