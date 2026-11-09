'use client';
// 外部（お客さん・協力業者）の専用ページの枠。文字を大きく、余白を広く。
import type { ReactNode } from 'react';
import { DemoBanner } from './DemoBanner';
import { RoleSwitcher } from './RoleSwitcher';
import { InstallButton } from '@/lib/install';
import { useRequireSession } from '@/lib/auth';

export function PortalShell({ children }: { children: ReactNode }) {
  const { user, ready, signOut } = useRequireSession();
  return (
    <div className="portal">
      <DemoBanner />
      <header className="portal-top">
        <span className="brand">サンプル工務店　お客さま専用ページ</span>
        <span className="row">
          <RoleSwitcher />
          <InstallButton className="top-install" />
          <button onClick={signOut}>入り直す</button>
        </span>
      </header>
      <main className="main">{ready && user ? children : <p className="muted">読み込み中…</p>}</main>
    </div>
  );
}
