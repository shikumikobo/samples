import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@/styles/globals.css';
import { BIZ_UDPGothic, BIZ_UDGothic, Shippori_Mincho, Zen_Maru_Gothic } from 'next/font/google';
import { THEME_BOOT } from '@/lib/theme';
import { Providers } from './providers';

// 本文・見出しは BIZ UDPGothic、番号・金額は BIZ UDGothic（等幅で桁がそろう）。ビルドのときに取り込み、自分のサーバーから配る
const ui = BIZ_UDPGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-ui' });
const num = BIZ_UDGothic({ weight: ['400', '700'], display: 'swap', preload: false, variable: '--font-num' });
// 見出しの書体（設定で選ぶ）：明朝・丸ゴシック。ゴシックは上の BIZ UDPGothic
const mincho = Shippori_Mincho({ weight: ['500', '700'], display: 'swap', preload: false, variable: '--font-mincho' });
const maru = Zen_Maru_Gothic({ weight: ['500', '700'], display: 'swap', preload: false, variable: '--font-maru' });

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
  themeColor: '#B04A62',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${ui.variable} ${num.variable} ${mincho.variable} ${maru.variable}`} data-color="rose" data-font="mincho" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
