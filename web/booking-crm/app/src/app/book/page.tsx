'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { listServices, type ServiceRow } from '@/features/booking/api';
import { formatDuration, formatYen } from '@/features/booking/format';
import { saveDraft, takeNotice } from '@/features/booking/draft';
import { bookingWords } from '@/features/booking/words';
import { Steps } from '@/features/booking/Steps';
import '@/features/booking/booking.css';

export default function Page() {
  const { words: w, mode, customerId } = useApp();
  const bw = bookingWords(mode);
  const router = useRouter();
  const [services, setServices] = useState<ServiceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setNotice(takeNotice());
  }, []);

  useEffect(() => {
    if (!customerId) return;
    let alive = true;
    withRole('customer', customerId, (tx) => listServices(tx))
      .then((s) => alive && setServices(s))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId, mode]);

  function pick(s: ServiceRow) {
    saveDraft({ serviceId: s.id, staffId: null, slot: null });
    router.push('/book/time/');
  }

  return (
    <section className="page customer">
      <Steps current={1} service={w.service} />
      <h1>{w.page_book}</h1>
      {notice && (
        <p className="bk-info" role="status">
          {notice}
        </p>
      )}
      <p className="lead">{w.service}をお選びください。お支払いは当日お店でお願いします。</p>
      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {!services && !error && <p className="muted">読み込み中…</p>}
      {services && (
        <ul className="bk-services">
          {services.map((s) => (
            <li key={s.id} className={`bk-service${s.is_trial ? ' trial' : ''}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/images/${s.image}`} alt="" loading="lazy" />
              {s.is_trial && <span className="bk-tag">{bw.trialLabel}</span>}
              <div className="body">
                <h2>{s.name}</h2>
                <p className="meta">
                  <span className="bk-price">{formatYen(s.price)}</span>
                  <span className="muted">（税込）</span>
                  <span>{formatDuration(s.duration_min)}</span>
                </p>
                <p className="muted">{s.description}</p>
                {s.is_trial && (
                  <p>
                    <strong>はじめての方だけ</strong>、1回ご利用いただけます。
                  </p>
                )}
                <button className="bk-btn" onClick={() => pick(s)} aria-label={`${s.name}を選ぶ`}>
                  この{w.service}を選ぶ
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
