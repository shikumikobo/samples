'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { getService, type ServiceRow } from '@/features/booking/api';
import { formatDuration, formatWhen, formatYen, type Slot } from '@/features/booking/format';
import { loadDraft, saveDraft } from '@/features/booking/draft';
import { SlotPicker } from '@/features/booking/SlotPicker';
import { Steps } from '@/features/booking/Steps';
import '@/features/booking/booking.css';

export default function Page() {
  const { words: w, customerId } = useApp();
  const router = useRouter();
  const [service, setService] = useState<ServiceRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const d = loadDraft();
    if (!d.serviceId) {
      setMissing(true);
      return;
    }
    setStaffId(d.staffId);
    setSlot(d.slot);
    let alive = true;
    withRole('customer', customerId, (tx) => getService(tx, d.serviceId!))
      .then((s) => {
        if (!alive) return;
        if (s) setService(s);
        else setMissing(true);
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId]);

  function changeStaff(id: string | null) {
    setStaffId(id);
    setSlot(null);
  }
  function next() {
    if (!service || !slot) return;
    saveDraft({ serviceId: service.id, staffId, slot });
    router.push('/book/confirm/');
  }

  if (missing)
    return (
      <section className="page customer">
        <h1>{w.page_book_time}</h1>
        <p className="bk-info">先に{w.service}を選んでください。</p>
        <Link className="bk-btn" href="/book/">
          {w.service}を選ぶ
        </Link>
      </section>
    );

  return (
    <section className="page customer">
      <Steps current={2} service={w.service} />
      <h1>{w.page_book_time}</h1>
      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {service && customerId && (
        <>
          <p className="lead">
            <strong>{service.name}</strong>　{formatYen(service.price)}（税込）／{formatDuration(service.duration_min)}　<Link href="/book/">{w.service}を変える</Link>
          </p>
          <SlotPicker service={service} customerId={customerId} staffId={staffId} onStaffChange={changeStaff} selected={slot} onSelect={setSlot} onProceed={service.kind === 'timed' ? next : undefined} />
          {service.kind !== 'timed' && (
            <>
              <div className="bk-info" aria-live="polite">
                {slot ? (
                  <>
                    選んだ日時：<strong>{formatWhen(slot.starts_at, slot.ends_at)}</strong>
                  </>
                ) : (
                  '日にちと時間を選んでください。'
                )}
              </div>
              <div className="bk-actions">
                <button className="bk-btn" disabled={!slot} onClick={next}>
                  確認へ進む
                </button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
