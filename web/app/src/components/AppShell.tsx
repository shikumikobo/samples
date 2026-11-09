'use client';
// 社内用（社長・社員・職人）の枠。上のナビ。スマホ（幅720px 以下）は下のタブ。
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DemoBanner } from './DemoBanner';
import { RoleSwitcher } from './RoleSwitcher';
import { InstallButton } from '@/lib/install';
import { useRequireSession } from '@/lib/auth';
import { useCan } from '@/lib/permissions';
import { useRedirectExternal } from '@/features/portal/useRedirectExternal';

interface NavItem {
  href: string;
  label: string;
  need?: string;
}
const NAV: NavItem[] = [
  { href: '/today/', label: '今日' },
  { href: '/sites/', label: '現場' },
  { href: '/schedule/', label: '予定' },
  { href: '/users/', label: 'ユーザー', need: 'user.manage' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, ready, signOut } = useRequireSession();
  const { can } = useCan(user?.role);
  useRedirectExternal(user?.role); // 外部（お客さん・協力業者）は専用ページに戻す
  const path = usePathname() ?? '';
  const items = NAV.filter((n) => !n.need || can(n.need));
  const current = (href: string) => (path.startsWith(href.slice(0, -1)) ? 'page' : undefined);
  return (
    <>
      <DemoBanner />
      <header className="shell-top">
        <span className="brand">現場管理（見本）</span>
        <nav aria-label="メニュー">
          {items.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <RoleSwitcher />
        <InstallButton className="top-install" />
        <button onClick={signOut} style={{ minHeight: 36 }}>
          入り直す
        </button>
      </header>
      <main className="main">{ready && user ? children : <p className="muted">読み込み中…</p>}</main>
      <nav className="tabbar" aria-label="メニュー（スマホ）">
        {items.map((n) => (
          <Link key={n.href} href={n.href} aria-current={current(n.href)}>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
