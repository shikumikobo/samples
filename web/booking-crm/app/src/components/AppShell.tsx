'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useApp } from '@/lib/app-state';
import { MODES, WORDS } from '@/lib/words';
import type { Role } from '@/lib/db';

const CUSTOMER_NAV = [
  { href: '/book/', key: 'nav_book' },
  { href: '/my/', key: 'nav_my' },
] as const;
const SHOP_NAV = [
  { href: '/today/', key: 'nav_today' },
  { href: '/calendar/', key: 'nav_calendar' },
  { href: '/customers/', key: 'nav_customers' },
  { href: '/return/', key: 'nav_return' },
  { href: '/settings/', key: 'nav_settings' },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const { words: w, mode, role, busy } = app;
  const router = useRouter();
  const path = usePathname() ?? '/';
  const [asking, setAsking] = useState(false);
  const nav = role === 'shop' ? SHOP_NAV : CUSTOMER_NAV;

  function pickRole(r: Role) {
    if (r === role) return;
    app.setRole(r);
    router.push(r === 'shop' ? '/today/' : '/book/');
  }

  return (
    <>
      <header className="top">
        <div className="top-row">
          <Link href="/" className="brand" aria-label="最初の画面へ">
            <span className="brand-mark" aria-hidden="true">予</span>
            <span>
              <strong>{app.ready ? w.shopName : '予約と顧客管理'}</strong>
              <small>見本</small>
            </span>
          </Link>
          <div className="switches">
            <div className="seg" role="group" aria-label="サロンか教室か">
              {MODES.map((m) => (
                <button key={m} aria-pressed={m === mode} disabled={busy} onClick={() => app.setMode(m)}>
                  {WORDS[m].modeName}
                </button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="お客さんかお店か">
              {(['customer', 'shop'] as const).map((r) => (
                <button key={r} aria-pressed={r === role} onClick={() => pickRole(r)}>
                  {r === 'customer' ? w.customer : w.shopSide}
                </button>
              ))}
            </div>
          </div>
        </div>
        {role === 'customer' && app.customers.length > 0 && (
          <label className="who">
            <span>{w.customer}として使う人</span>
            <select value={app.customerId ?? ''} onChange={(e) => app.setCustomerId(e.target.value)}>
              {app.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <nav className="nav" aria-label="メニュー">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? 'page' : undefined}>
              {w[n.key]}
            </Link>
          ))}
        </nav>
      </header>

      <aside className="demo-note" aria-label="デモの案内">
        <span>架空のお店のデモです。データはこのブラウザの中にだけあります</span>
        {asking ? (
          <span className="row">
            <span>{w.modeName}の架空のデータを、最初の状態に戻します。</span>
            <button className="primary" disabled={busy} onClick={() => app.reset()}>
              {busy ? '戻しています…' : '戻す'}
            </button>
            <button disabled={busy} onClick={() => setAsking(false)}>
              やめる
            </button>
          </span>
        ) : (
          <button onClick={() => setAsking(true)} disabled={busy}>
            最初に戻す
          </button>
        )}
      </aside>

      <main className="main">{app.ready ? children : <p className="muted">読み込み中…</p>}</main>
    </>
  );
}
