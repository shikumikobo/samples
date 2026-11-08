'use client';
import Link from 'next/link';
import { useApp } from '@/lib/app-state';
import { InstallHint } from '@/components/InstallHint';
import { formatDay, getToday } from '@/lib/demo-date';

/** 最初の画面。サロン／教室とお客さん／お店は、上の帯の切り替えで選ぶ（ここからは入り口に進む） */
export default function Home() {
  const { words: w, setRole } = useApp();
  return (
    <section className="page customer">
      <h1>{w.page_home}</h1>
      <p className="lead">
        {w.shopName}（架空）の予約と顧客管理の見本です。上の切り替えで、{w.modeName}と、{w.customer}・お店を選べます。デモの今日は{formatDay(getToday())}です。
      </p>
      <div className="entry">
        <Link href="/book/" className="entry-card" onClick={() => setRole('customer')}>
          <strong>{w.customer}として{w.book}</strong>
          <span>{w.service}と日時を選んで取る画面</span>
        </Link>
        <Link href="/today/" className="entry-card shop" onClick={() => setRole('shop')}>
          <strong>お店として見る</strong>
          <span>今日の{w.booked}、予約表、{w.customer}のカルテ</span>
        </Link>
      </div>
      <InstallHint />
    </section>
  );
}
