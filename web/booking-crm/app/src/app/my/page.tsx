'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Transaction } from '@electric-sql/pglite';
import { NEW_CUSTOMER_ID, useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { ERROR_TEXT, errorCode, errorMessage } from '@/lib/errors';
import { cancelReservation, changeSlot, getNow, listMine, type MineRow } from '@/features/booking/api';
import { deadlineLabel, formatWhen, formatYen, isPastDeadline, nextStep, type Slot } from '@/features/booking/format';
import { bookingWords } from '@/features/booking/words';
import { saveNotice } from '@/features/booking/draft';
import { SlotPicker } from '@/features/booking/SlotPicker';
import '@/features/booking/booking.css';

type Panel = { id: string; kind: 'change' | 'cancel' } | null;

// キャンセルの理由（お店のメモに「【お客さんの理由】…」として残る。お客さんには見せない）
const CANCEL_REASONS = (mode: 'salon' | 'class') => [
  { key: 'schedule', label: '予定が合わなくなった' },
  { key: 'health', label: '体調・都合' },
  { key: 'other_shop', label: mode === 'class' ? 'ほかの教室にした' : 'ほかのお店にした' },
  { key: 'other', label: 'その他（自由記入）' },
  { key: 'none', label: '答えない' },
];

export default function Page() {
  const { words: w, mode, customerId } = useApp();
  const bw = bookingWords(mode);
  const router = useRouter();
  const [rows, setRows] = useState<MineRow[] | null>(null);
  const [now, setNow] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ id: string; text: string; step: string } | null>(null);
  const [reasonKey, setReasonKey] = useState('none');
  const [reasonText, setReasonText] = useState('');

  // はじめての方には「私の予約」が無い。予約の画面に戻して、案内を出す
  useEffect(() => {
    if (customerId !== NEW_CUSTOMER_ID) return;
    saveNotice(`はじめての方には「${w.nav_my}」はありません。${bw.reservation}すると、次回から名前を選んで確かめられます。`);
    router.replace('/book/');
  }, [customerId, router, w.nav_my, bw.reservation]);

  const load = useCallback(async () => {
    if (!customerId || customerId === NEW_CUSTOMER_ID) return;
    try {
      const r = await withRole('customer', customerId, async (tx) => ({ rows: await listMine(tx), now: await getNow(tx) }));
      setRows(r.rows);
      setNow(r.now);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [customerId]);

  useEffect(() => {
    setRows(null);
    setPanel(null);
    setNotice(null);
    load();
  }, [load, mode]);

  function open(id: string, kind: 'change' | 'cancel', current?: MineRow) {
    setPanel({ id, kind });
    setStaffId(current?.staff_id ?? null);
    setSlot(null);
    setFailure(null);
    setNotice(null);
    setReasonKey('none');
    setReasonText('');
  }

  const doChange = (r: MineRow) => {
    if (!slot) return;
    return runTx(r, (tx) => changeSlot(tx, r.id, slot), `日時を変更しました。（${formatWhen(slot.starts_at, slot.ends_at)}）`);
  };
  const cancelReason = (): string | null => {
    if (reasonKey === 'none') return null;
    const label = CANCEL_REASONS(mode).find((x) => x.key === reasonKey)?.label ?? '';
    if (reasonKey === 'other') return reasonText.trim() ? `その他：${reasonText.trim()}` : 'その他';
    return label;
  };
  const doCancel = (r: MineRow) => runTx(r, (tx) => cancelReservation(tx, r.id, cancelReason()), `${bw.reservation}をキャンセルしました。`);

  async function runTx(r: MineRow, fn: (tx: Transaction) => Promise<unknown>, done: string) {
    setBusy(true);
    setFailure(null);
    try {
      await withRole('customer', customerId!, fn);
      setPanel(null);
      setNotice(done);
    } catch (e) {
      setFailure({ id: r.id, text: errorMessage(e), step: nextStep(errorCode(e), w).text });
    } finally {
      setBusy(false);
      await load();
    }
  }

  const upcoming = (rows ?? []).filter((r) => r.status === 'booked').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = (rows ?? []).filter((r) => r.status !== 'booked');
  const statusLabel = (s: MineRow['status']) => ({ booked: w.booked, visited: w.visited, canceled: w.canceled, noshow: w.noshow })[s];

  return (
    <section className="page customer">
      <h1>{w.page_my}</h1>
      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="bk-info" role="status">
          {notice}
        </p>
      )}
      {!rows && !error && <p className="muted">読み込み中…</p>}

      {rows && (
        <>
          <h2>{bw.upcoming}</h2>
          {upcoming.length === 0 && (
            <>
              <p className="muted">{bw.noUpcoming}</p>
              <Link className="bk-btn" href="/book/">
                {w.book}
              </Link>
            </>
          )}
          {upcoming.map((r) => {
            const late = isPastDeadline(r.starts_at, now);
            const opened = panel?.id === r.id ? panel.kind : null;
            return (
              <article key={r.id} className="bk-res">
                <span className="badge status">{statusLabel(r.status)}</span>
                <h3>{r.service_name}</h3>
                <div className="when">{formatWhen(r.starts_at, r.ends_at)}</div>
                <div className="muted">
                  {w.staff}：{r.staff_name}／{formatYen(r.price)}（当日お店で）
                </div>
                <div className="btns">
                  <button className="bk-btn ghost" disabled={late || busy} onClick={() => open(r.id, 'change', r)}>
                    {bw.change}
                  </button>
                  <button className="bk-btn danger" disabled={late || busy} onClick={() => open(r.id, 'cancel')}>
                    {bw.cancel}
                  </button>
                </div>
                {late ? (
                  <p className="bk-deadline" role="note">
                    {ERROR_TEXT.DEADLINE_PASSED}
                  </p>
                ) : (
                  <p className="bk-deadline">変更・キャンセルは{deadlineLabel(r.starts_at)}</p>
                )}

                {failure?.id === r.id && (
                  <div className="bk-alert" role="alert" style={{ marginTop: 12 }}>
                    <p>
                      <strong>{failure.text}</strong>
                    </p>
                    <p>{failure.step}</p>
                    <p>この{bw.reservation}は、もとのままです。</p>
                  </div>
                )}

                {opened === 'cancel' && (
                  <div className="panel">
                    <p>
                      <strong>{formatWhen(r.starts_at, r.ends_at)}</strong>の{bw.reservation}をキャンセルします。よろしいですか？
                    </p>
                    <fieldset className="bk-reasons">
                      <legend>キャンセルの理由（お店の参考にします。答えなくても構いません）</legend>
                      {CANCEL_REASONS(mode).map((x) => (
                        <label key={x.key} className="bk-reason">
                          <input type="radio" name={`cancel-reason-${r.id}`} checked={reasonKey === x.key} onChange={() => setReasonKey(x.key)} />
                          {x.label}
                        </label>
                      ))}
                      {reasonKey === 'other' && (
                        <input type="text" className="bk-reason-text" aria-label="キャンセルの理由" maxLength={100} placeholder="理由を入力" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
                      )}
                    </fieldset>
                    <div className="bk-actions">
                      <button className="bk-btn danger" disabled={busy} onClick={() => doCancel(r)}>
                        キャンセルを確定する
                      </button>
                      <button className="bk-btn ghost" disabled={busy} onClick={() => setPanel(null)}>
                        やめる
                      </button>
                    </div>
                  </div>
                )}

                {opened === 'change' && customerId && (
                  <div className="panel">
                    <p>新しい日時を選んでください。確定するまで、いまの{bw.reservation}はそのままです。</p>
                    <SlotPicker
                      service={{ id: r.service_id, kind: r.kind }}
                      customerId={customerId}
                      staffId={staffId}
                      onStaffChange={(id) => {
                        setStaffId(id);
                        setSlot(null);
                      }}
                      selected={slot}
                      onSelect={setSlot}
                    />
                    <div className="bk-info" aria-live="polite">
                      {slot ? (
                        <>
                          {formatWhen(r.starts_at, r.ends_at)} → <strong>{formatWhen(slot.starts_at, slot.ends_at)}</strong>
                        </>
                      ) : (
                        '新しい日時を選んでください。'
                      )}
                    </div>
                    <div className="bk-actions">
                      <button className="bk-btn" disabled={!slot || busy} onClick={() => doChange(r)}>
                        {busy ? '変更しています…' : 'この日時に変更する'}
                      </button>
                      <button className="bk-btn ghost" disabled={busy} onClick={() => setPanel(null)}>
                        やめる
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}

          <h2>{bw.history}</h2>
          {past.length === 0 && <p className="muted">{bw.noHistory}</p>}
          {past.map((r) => (
            <article key={r.id} className="bk-res past">
              <span className="badge status">{statusLabel(r.status)}</span>
              <h3>{r.service_name}</h3>
              <div className="when">{formatWhen(r.starts_at, r.ends_at)}</div>
              <div className="muted">
                {w.staff}：{r.staff_name}／{formatYen(r.price)}
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
