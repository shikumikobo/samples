'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorCode, errorMessage, type ErrorCode } from '@/lib/errors';
import { getService, getStaff, registerCustomer, reserveSlot, type ServiceRow, type StaffRow } from '@/features/booking/api';
import { formatDuration, formatWhen, formatYen, nextStep } from '@/features/booking/format';
import { clearDraft, loadDraft, saveLastReservation, type Draft } from '@/features/booking/draft';
import { validateNewCustomer, type NewCustomer, type NewCustomerErrors } from '@/features/booking/validate';
import { bookingWords } from '@/features/booking/words';
import { Steps } from '@/features/booking/Steps';
import '@/features/booking/booking.css';

const EMPTY: NewCustomer = { name: '', kana: '', phone: '', email: '' };

export default function Page() {
  const app = useApp();
  const { words: w, mode, customerId, customers } = app;
  const bw = bookingWords(mode);
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [service, setService] = useState<ServiceRow | null>(null);
  const [staff, setStaff] = useState<StaffRow | null>(null);
  const [who, setWho] = useState<'existing' | 'new'>('existing');
  const [form, setForm] = useState<NewCustomer>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<NewCustomerErrors>({});
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ text: string; code: ErrorCode | null } | null>(null);

  useEffect(() => {
    if (!customerId) return;
    const d = loadDraft();
    setDraft(d);
    if (!d.serviceId || !d.slot) return;
    let alive = true;
    withRole('customer', customerId, async (tx) => ({ s: await getService(tx, d.serviceId!), t: await getStaff(tx, d.slot!.staff_id) }))
      .then((r) => {
        if (!alive) return;
        setService(r.s);
        setStaff(r.t);
      })
      .catch((e) => alive && setFailure({ text: errorMessage(e), code: errorCode(e) }));
    return () => {
      alive = false;
    };
  }, [customerId]);

  if (draft && (!draft.serviceId || !draft.slot))
    return (
      <section className="page customer">
        <h1>{w.page_book_confirm}</h1>
        <p className="bk-info">日時がまだ選ばれていません。{w.service}と日時を選んでください。</p>
        <Link className="bk-btn" href="/book/">
          {w.service}を選ぶ
        </Link>
      </section>
    );

  const me = customers.find((c) => c.id === customerId);
  const slot = draft?.slot ?? null;
  const showForm = who === 'new' || !me;

  async function submit() {
    if (!service || !slot) return;
    setFailure(null);
    let cid = customerId;
    if (showForm) {
      const errs = validateNewCustomer(form);
      setFieldErrors(errs);
      if (Object.keys(errs).length > 0) return;
    }
    setBusy(true);
    try {
      if (showForm) {
        cid = registeredId;
        if (!cid) {
          cid = await withRole('shop', null, (tx) => registerCustomer(tx, form));
          setRegisteredId(cid);
        }
        app.setCustomerId(cid);
      }
      if (!cid) throw new Error('FORBIDDEN');
      const who_ = cid;
      const id = await withRole('customer', who_, (tx) => reserveSlot(tx, who_, service.id, slot));
      saveLastReservation(id);
      clearDraft();
      // 新しく登録したお客さんは、画面上部の一覧を読み直すため、ページごと開き直す
      if (showForm) window.location.assign('/book/done/');
      else router.push('/book/done/');
    } catch (e) {
      setFailure({ text: errorMessage(e), code: errorCode(e) });
      setBusy(false);
    }
  }

  const step = failure ? nextStep(failure.code, w) : null;
  const set = (k: keyof NewCustomer) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <section className="page customer">
      <Steps current={3} service={w.service} />
      <h1>{w.page_book_confirm}</h1>
      {service && slot && (
        <dl className="bk-summary">
          <div>
            <dt>{w.service}</dt>
            <dd>
              {service.name}
              {service.is_trial && (
                <>
                  　<span className="badge">{bw.trialLabel}</span>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>日時</dt>
            <dd>
              <strong>{formatWhen(slot.starts_at, slot.ends_at)}</strong>（{formatDuration(service.duration_min)}）
            </dd>
          </div>
          <div>
            <dt>{w.staff}</dt>
            <dd>{staff?.name}</dd>
          </div>
          <div>
            <dt>料金</dt>
            <dd>
              <span className="bk-price">{formatYen(service.price)}</span>（税込）
            </dd>
          </div>
          <div>
            <dt>お支払い</dt>
            <dd>当日お店で</dd>
          </div>
        </dl>
      )}

      <h2>{w.customer}の情報</h2>
      {me && (
        <div className="bk-modes" role="group" aria-label={`${w.customer}の情報`}>
          <button aria-pressed={who === 'existing'} onClick={() => setWho('existing')}>
            {me.name} さん
          </button>
          <button aria-pressed={who === 'new'} onClick={() => setWho('new')}>
            はじめての方
          </button>
        </div>
      )}
      {showForm ? (
        <div>
          <p className="muted">はじめての方は、お名前と連絡先を入力してください。</p>
          <div className="bk-field">
            <label htmlFor="bk-name">お名前（必須）</label>
            <input id="bk-name" autoComplete="name" value={form.name} onChange={set('name')} aria-invalid={!!fieldErrors.name} />
            {fieldErrors.name && <span className="err">{fieldErrors.name}</span>}
          </div>
          <div className="bk-field">
            <label htmlFor="bk-kana">ふりがな</label>
            <input id="bk-kana" value={form.kana} onChange={set('kana')} />
          </div>
          <div className="bk-field">
            <label htmlFor="bk-phone">電話番号（必須）</label>
            <input id="bk-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="090-0000-0000" value={form.phone} onChange={set('phone')} aria-invalid={!!fieldErrors.phone} />
            {fieldErrors.phone && <span className="err">{fieldErrors.phone}</span>}
          </div>
          <div className="bk-field">
            <label htmlFor="bk-email">メールアドレス（必須）</label>
            <input id="bk-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} aria-invalid={!!fieldErrors.email} />
            {fieldErrors.email && <span className="err">{fieldErrors.email}</span>}
          </div>
        </div>
      ) : (
        <p className="muted">
          {me?.name} さんとして{bw.reservation}します。
        </p>
      )}

      {failure && step && (
        <div className="bk-alert" role="alert">
          <p>
            <strong>{failure.text}</strong>
          </p>
          <p>{step.text}</p>
          {step.href && (
            <Link className="bk-btn ghost" href={step.href}>
              {step.label}
            </Link>
          )}
        </div>
      )}

      <p className="muted">
        {bw.reservation}の変更・キャンセルは、前日の終わりまで「{w.nav_my}」からできます。
      </p>
      <div className="bk-actions">
        <button className="bk-btn" disabled={busy || !service || !slot} onClick={submit}>
          {busy ? `${bw.reservation}しています…` : `この内容で${w.book}`}
        </button>
        <Link className="bk-btn ghost" href="/book/time/">
          日時を選び直す
        </Link>
      </div>
    </section>
  );
}
