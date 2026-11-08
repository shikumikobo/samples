'use client';
// お店側の画面で共通に使う部品：お店の画面の入口、読み込み、操作の実行、空き枠の選択。
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { formatDay } from '@/lib/demo-date';
import { range, type Rsv } from './lib';
import { loadSlots, type ServiceRow, type Slot, type StaffRow, type Tx } from './queries';
import './shop.css';

/** お店の画面の入口。お店でなければ、切り替えを案内する */
export function ShopPage({ title, children }: { title: string; children: ReactNode }) {
  const { role, setRole, words: w } = useApp();
  if (role !== 'shop') {
    return (
      <section className="page shop sh">
        <h1>{title}</h1>
        <div className="card">
          <p>この画面は、{w.shopSide}の人向けです。</p>
          <button className="primary" onClick={() => setRole('shop')}>
            {w.shopSide}の画面に切り替える
          </button>
        </div>
      </section>
    );
  }
  return (
    <section className="page shop sh">
      <h1>{title}</h1>
      {children}
    </section>
  );
}

/** shop の役割で読み込む。reload() で読み直す */
export function useShopLoad<T>(fn: (tx: Tx) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    withRole('shop', null, (tx) => fn(tx))
      .then((d) => {
        if (alive) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, reload };
}

/** 操作の結果の表示（成功・失敗） */
export type Flash = { kind: 'ok' | 'err'; text: string } | null;
export function useAct(reload: () => void) {
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState(false);
  const act = useCallback(
    async (fn: (tx: Tx) => Promise<unknown>, okText: string): Promise<boolean> => {
      setBusy(true);
      try {
        await withRole('shop', null, (tx) => fn(tx));
        setFlash({ kind: 'ok', text: okText });
        reload();
        return true;
      } catch (e) {
        setFlash({ kind: 'err', text: errorMessage(e) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [reload],
  );
  return { act, flash, setFlash, busy };
}
export function FlashView({ flash }: { flash: Flash }) {
  if (!flash) return null;
  return (
    <p className={flash.kind === 'ok' ? 'sh-flash ok' : 'sh-flash err'} role={flash.kind === 'err' ? 'alert' : 'status'}>
      {flash.text}
    </p>
  );
}
export function LoadState({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <p className="sh-flash err" role="alert">{error}</p>;
  if (loading) return <p className="muted">読み込み中…</p>;
  return null;
}

/** 空き枠を日ごとに出し、選んだものを返す（作成にも変更にも使う） */
export function SlotPicker({
  service,
  staff,
  staffId,
  initialDay,
  actionLabel,
  disabled,
  onPick,
}: {
  service: ServiceRow | undefined;
  staff: StaffRow[];
  staffId: string | null;
  initialDay: string;
  actionLabel: string;
  disabled?: boolean;
  onPick: (s: Slot) => void;
}) {
  const { words: w, mode } = useApp();
  const [day, setDay] = useState(initialDay);
  const { data, error } = useShopLoad((tx) => (service && day ? loadSlots(tx, service.id, staffId, day) : Promise.resolve([] as Slot[])), [service?.id, staffId, day]);
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? '';
  return (
    <div className="sh-slots">
      <label className="sh-field">
        <span>日付</span>
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      {day && <p className="muted">{formatDay(day)}の{mode === 'class' ? '枠' : '空き'}</p>}
      <LoadState error={error} loading={!data && !!service} />
      {data && data.length === 0 && <p className="muted">この日に取れる{mode === 'class' ? '枠' : '時間'}はありません。</p>}
      <div className="sh-slotlist">
        {data?.map((s) => (
          <button key={`${s.staff_id}-${s.starts_at}`} disabled={disabled || s.remaining <= 0} onClick={() => onPick(s)} aria-label={`${actionLabel} ${range(s.starts_at, s.ends_at)} ${name(s.staff_id)}`}>
            <strong className="num">{range(s.starts_at, s.ends_at)}</strong>
            <span>{name(s.staff_id)}</span>
            {s.session_id && <small>{w.remaining} {s.remaining}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatusBadge({ r, label }: { r: Pick<Rsv, 'status'>; label: string }) {
  return <span className={`sh-status ${r.status}`}>{label}</span>;
}
