import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { BIZ_UDPGothic, BIZ_UDGothic } from 'next/font/google';
import { Providers } from './providers';

// 本文・見出しは BIZ UDPGothic（文字幅が詰まって読みやすい）。番号・金額は BIZ UDGothic（等幅で桁がそろう）。ビルドのときに取り込み、自分のサーバーから配る（端末に入っていなくても同じ字になる）
const ui = BIZ_UDPGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-ui' });
const num = BIZ_UDGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-num' });

export const metadata: Metadata = {
  title: '現場管理（見本）｜しくみ工房',
  description: '架空の工務店の現場管理アプリ。ログインと4つの役割、外部への専用ページ、権限は DB 側で守る作りを、ブラウザの中だけで体験できます。',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
  appleWebApp: { capable: true, title: '現場管理', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#17324d',
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
