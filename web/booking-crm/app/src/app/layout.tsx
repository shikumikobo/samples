import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { BIZ_UDPGothic, BIZ_UDGothic } from 'next/font/google';
import { Providers } from './providers';

// 本文・見出しは BIZ UDPGothic、番号・金額は BIZ UDGothic（等幅で桁がそろう）。ビルドのときに取り込み、自分のサーバーから配る
const ui = BIZ_UDPGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-ui' });
const num = BIZ_UDGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-num' });

export const metadata: Metadata = {
  title: '予約と顧客管理（見本）｜しくみ工房',
  description: '架空のサロン／教室の予約と顧客管理。お客さんの予約ページ、お店の予約表とカルテ、二重予約の防止を、ブラウザの中だけで体験できます。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: '予約と顧客管理', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2f5d50',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${ui.variable} ${num.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
