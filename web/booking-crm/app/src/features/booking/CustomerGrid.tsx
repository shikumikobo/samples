'use client';
// お客さん用の日時の表：縦＝時間（15分刻み）、横＝担当者。空いている時間のセルを押すと、メニューの所要時間ぶんが自動で選ばれる。
// 他人の予約の名前は出さない（「埋まっている」だけ）。計算は、お店の空き表と同じ features/shop/grid.ts を使う。
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/app-state';
import { withRole } from '@/lib/db';
import { errorMessage } from '@/lib/errors';
import { busyAt, cellState, fits, gridRows, gridWindow, inSelection, isBusyStart, minToHm, toMin, type GridInput, type Selection } from '@/features/shop/grid';
import { toTs } from '@/features/shop/lib';
import { loadCustomerGrid, type CustomerGridData } from './gridApi';
import { dayOf, formatWhen, timeOf, type Slot } from './format';
import type { StaffRow } from './api';
import './booking.css';

export function CustomerGrid({
  service,
  staff,
  staffId,
  day,
  customerId,
  selected,
  onSelect,
  onProceed,
  proceedLabel = 'この時間で進む',
}: {
  service: { id: string; duration_min: number };
  staff: StaffRow[];
  staffId: string | null;
  day: string;
  customerId: string;
  selected: Slot | null;
  onSelect: (s: Slot | null) => void;
  onProceed?: () => void;
  proceedLabel?: string;
}) {
  const { words: w } = useApp();
  const dur = service.duration_min;
  const [data, setData] = useState<CustomerGridData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setMsg(null);
    withRole('customer', customerId, (tx) => loadCustomerGrid(tx, day))
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId, day]);

  const shown = useMemo(() => staff.filter((s) => !staffId || s.id === staffId), [staff, staffId]);
  const inp: GridInput | null = data ? { day, staff: shown, hours: data.hours, off: data.off, busy: data.busy, notBefore: data.notBefore, lastDay: data.lastDay } : null;
  const rows = gridRows(inp ? gridWindow(inp) : null);
  const sel: Selection | null = selected && dayOf(selected.starts_at) === day ? { staffId: selected.staff_id, start: toMin(timeOf(selected.starts_at)) } : null;
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? '';

  // 表が出たら、最初に選べる時間が見える位置へ動かす（表の中だけ。ページは動かさない）
  useEffect(() => {
    const box = wrap.current;
    if (!box || !inp || rows.length === 0) return;
    const first = box.querySelector<HTMLElement>('button.cg-start');
    if (first) box.scrollTop = Math.max(0, first.offsetTop - 64);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, staffId]);

  function press(sid: string, m: number) {
    if (!inp) return;
    const f = fits(inp, sid, m, dur);
    if (!f.ok) {
      setMsg(f.reason);
      return;
    }
    setMsg(null);
    if (sel && sel.staffId === sid && sel.start === m) {
      onSelect(null);
      return;
    }
    onSelect({ staff_id: sid, starts_at: toTs(day, minToHm(m)), ends_at: toTs(day, minToHm(m + dur)), remaining: 1, session_id: null });
  }

  return (
    <div className="cg">
      <div className="cg-sum" role="status" aria-live="polite">
        <div className="txt">
          {msg ? (
            <p className="err" role="alert">
              {msg}
            </p>
          ) : selected && sel ? (
            <p>
              <strong>{formatWhen(selected.starts_at, selected.ends_at)}</strong>（{dur}分）　{w.staff}：{staffName(selected.staff_id)}
            </p>
          ) : (
            <p className="muted">空いている時間のセルを押すと、そこから{dur}分ぶんが自動で選ばれます。</p>
          )}
        </div>
        {onProceed && (
          <button className="bk-btn" disabled={!selected || !sel} onClick={onProceed}>
            {proceedLabel}
          </button>
        )}
      </div>

      <ul className="cg-legend" aria-label="表の見方">
        <li><span className="sw free" />空き</li>
        <li><span className="sw busy" />埋まっている</li>
        <li><span className="sw closed" />営業時間外</li>
        <li><span className="sw off" />休み</li>
        <li><span className="sw late" />受付できない時間</li>
        <li><span className="sw sel" />選んだ時間</li>
      </ul>

      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {!data && !error && <p className="muted">空きを調べています…</p>}
      {data && rows.length === 0 && <p className="bk-info">この日は、{w.staff}が全員お休み、または営業時間がありません。別の日を選んでください。</p>}
      {inp && rows.length > 0 && (
        <div className="cg-wrap" ref={wrap}>
          <table className="cg-table" aria-label="空き時間の表">
            <thead>
              <tr>
                <th scope="col" className="gt">時間</th>
                {shown.map((s) => (
                  <th scope="col" key={s.id}>
                    <span className="nm">{s.name}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, ri) => (
                <tr key={m} className={m % 60 === 0 ? 'hour' : ''}>
                  <th scope="row" className={m % 60 === 0 ? 'gt' : 'gt half'}>{minToHm(m)}</th>
                  {shown.map((s) => {
                    const st = cellState(inp, s.id, m);
                    if (st === 'free') {
                      const f = fits(inp, s.id, m, dur);
                      const inSel = inSelection(sel, s.id, m, dur);
                      const isStart = !!sel && sel.staffId === s.id && sel.start === m;
                      return (
                        <td key={s.id} className={`g free${inSel ? ' sel' : ''}${f.ok ? '' : ' nofit'}`}>
                          <button
                            className={f.ok ? 'cg-start' : 'cg-short'}
                            onClick={() => press(s.id, m)}
                            aria-pressed={isStart}
                            aria-label={`${minToHm(m)} ${s.name} ${f.ok ? '空き' : '空きですが、この時間からは入りません'}`}
                          >
                            {f.ok ? (isStart ? '開始' : minToHm(m)) : ''}
                          </button>
                        </td>
                      );
                    }
                    if (st === 'busy') {
                      const b = busyAt(inp, s.id, m);
                      return (
                        <td key={s.id} className="g busy" title="埋まっています">
                          {b && isBusyStart(b, m, rows[0]) ? '埋まり' : ''}
                        </td>
                      );
                    }
                    return (
                      <td key={s.id} className={`g ${st}`} title={st === 'off' ? '休み' : st === 'closed' ? '営業時間外' : '受付できない時間（直前・先すぎ）'}>
                        {st === 'off' && ri === 0 ? '休み' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
