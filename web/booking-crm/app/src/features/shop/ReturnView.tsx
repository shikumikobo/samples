'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/demo-date';
import { buildContactMessage, trialKind } from './lib';
import { loadCustomers, loadDue, loadToday, type DueRow } from './queries';
import { LoadState, ShopPage, useShopLoad } from './ui';

export function ReturnView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_return}>
      <ReturnBody />
    </ShopPage>
  );
}

function ReturnBody() {
  const { words: w, mode } = useApp();
  const [open, setOpen] = useState<DueRow | null>(null);
  const { data, error } = useShopLoad(async (tx) => {
    const today = await loadToday(tx);
    return { today, due: await loadDue(tx, today), customers: await loadCustomers(tx) };
  }, [mode]);
  if (!data) return <LoadState error={error} loading />;
  const converted = data.customers.filter((c) => trialKind(c) === 'converted').length;

  return (
    <>
      <p className="lead">{w.return_desc}（過ぎた日数が多い順）</p>
      <p className="sh-small">{w.trial}から通常に来た{w.customer}：{converted}人</p>
      {open && <MessagePanel row={open} onClose={() => setOpen(null)} />}
      <div className="card">
        <ul className="sh-list">
          {data.due.map((d) => (
            <li key={d.customer_id}>
              <span className="grow">
                <Link className="link" href={`/customers/detail/?id=${d.customer_id}`}><strong>{d.customer_name}</strong></Link>
                <br />
                <span className="sh-small">{d.service_name}　前回 {formatDay(d.last_visit)}</span>
              </span>
              <span className="badge">目安を {d.due_since_days} 日過ぎ</span>
              <span className="num sh-small">{d.phone}</span>
              <button onClick={() => setOpen(d)}>連絡の文を作る</button>
            </li>
          ))}
          {data.due.length === 0 && <li>いま連絡する{w.customer}はいません。</li>}
        </ul>
      </div>
    </>
  );
}

function MessagePanel({ row, onClose }: { row: DueRow; onClose: () => void }) {
  const { words: w, mode } = useApp();
  const text = buildContactMessage(mode, { name: row.customer_name, serviceName: row.service_name, lastVisit: row.last_visit, shopName: w.shopName });
  const [copied, setCopied] = useState<'ok' | 'ng' | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('ok');
    } catch {
      // クリップボードが使えないときは、文を選択して手でコピーしてもらう
      const el = document.getElementById('sh-msg') as HTMLTextAreaElement | null;
      el?.focus();
      el?.select();
      setCopied('ng');
    }
  }
  return (
    <section className="sh-panel" aria-label="連絡の文">
      <header>
        <h2>{row.customer_name}への連絡の文</h2>
        <button onClick={onClose}>閉じる</button>
      </header>
      <textarea id="sh-msg" className="sh-msg" value={text} readOnly aria-label="連絡の文" />
      <p className="row">
        <button className="primary" onClick={copy}>コピーする</button>
        {copied === 'ok' && <span role="status">コピーしました。メールや LINE に貼って使ってください。</span>}
        {copied === 'ng' && <span role="status">文を選びました。手でコピーしてください。</span>}
      </p>
      <p className="sh-small">このデモは、メールや LINE を実際には送りません。</p>
    </section>
  );
}
