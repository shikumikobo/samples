'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { listMine, type MineRow } from '@/features/booking/api';
import { deadlineLabel, formatWhen, formatYen } from '@/features/booking/format';
import { loadLastReservation } from '@/features/booking/draft';
import { bookingWords } from '@/features/booking/words';
import { Steps } from '@/features/booking/Steps';
import '@/features/booking/booking.css';

export default function Page() {
  const { words: w, mode, customerId, customers } = useApp();
  const bw = bookingWords(mode);
  const [row, setRow] = useState<MineRow | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const id = loadLastReservation();
    if (!id) {
      setRow(null);
      return;
    }
    let alive = true;
    withRole('customer', customerId, (tx) => listMine(tx))
      .then((rows) => alive && setRow(rows.find((r) => r.id === id) ?? null))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId, mode]);

  const me = customers.find((c) => c.id === customerId);
  return (
    <section className="page customer">
      <Steps current={4} service={w.service} />
      <h1>{w.page_book_done}</h1>
      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {row === undefined && !error && <p className="muted">読み込み中…</p>}
      {row === null && (
        <>
          <p className="bk-info">表示できる{bw.reservation}がありません。</p>
          <Link className="bk-btn" href="/my/">
            {w.nav_my}を見る
          </Link>
        </>
      )}
      {row && (
        <>
          <p className="lead">
            {me ? `${me.name} さん、` : ''}ありがとうございます。{bw.reservation}を受け付けました。
          </p>
          <dl className="bk-summary">
            <div>
              <dt>{bw.reservation}番号</dt>
              <dd className="num">{row.id}</dd>
            </div>
            <div>
              <dt>{w.service}</dt>
              <dd>{row.service_name}</dd>
            </div>
            <div>
              <dt>日時</dt>
              <dd>
                <strong>{formatWhen(row.starts_at, row.ends_at)}</strong>
              </dd>
            </div>
            <div>
              <dt>{w.staff}</dt>
              <dd>{row.staff_name}</dd>
            </div>
            <div>
              <dt>料金</dt>
              <dd>
                <span className="bk-price">{formatYen(row.price)}</span>（税込）／お支払いは当日お店で
              </dd>
            </div>
          </dl>
          <div className="bk-info">
            <strong>変更・キャンセルについて</strong>
            <br />
            {deadlineLabel(row.starts_at)}、「{w.nav_my}」から日時の変更とキャンセルができます。期限を過ぎたらお店にご連絡ください。
          </div>
          <div className="bk-actions">
            <Link className="bk-btn" href="/my/">
              {w.nav_my}を見る
            </Link>
            <Link className="bk-btn ghost" href="/book/">
              続けて{w.book}
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
