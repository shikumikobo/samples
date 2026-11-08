'use client';
// 空きを見つける表：縦＝時間（15分刻み）、横＝担当者。メニューを選んだ状態で、開始のセルを押すと、所要時間ぶんが自動で選ばれる。
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/app-state';
import { addDays, formatDay } from '@/lib/demo-date';
import {
  busyAt,
  cellState,
  fits,
  gridRows,
  gridWindow,
  inSelection,
  isBusyStart,
  minToHm,
  selectionLabel,
  type GridInput,
  type Selection,
} from './grid';
import { loadGrid } from './gridQueries';
import { toTs } from './lib';
import type { ServiceRow, StaffRow } from './queries';
import { LoadState, useShopLoad } from './ui';

export interface PickedSlot {
  staff_id: string;
  starts_at: string;
  session_id: null;
}

export function FreeGrid({
  service,
  staff,
  staffId,
  initialDay,
  actionLabel,
  disabled,
  excludeId,
  onPick,
}: {
  service: ServiceRow;
  staff: StaffRow[];
  staffId: string | null;
  initialDay: string;
  actionLabel: string;
  disabled?: boolean;
  excludeId?: string | null;
  onPick: (s: PickedSlot) => void;
}) {
  const { words: w } = useApp();
  const [day, setDay] = useState(initialDay);
  const [sel, setSel] = useState<Selection | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, error, reload } = useShopLoad((tx) => loadGrid(tx, day), [day]);

  // メニュー・日付・担当の絞り込みを変えたら、選びなおし
  useEffect(() => {
    setSel(null);
    setMsg(null);
  }, [service.id, day, staffId]);
  // 操作が終わったら（失敗したときも）、最新の予約で表を引きなおす
  const wasDisabled = useRef(false);
  useEffect(() => {
    if (wasDisabled.current && !disabled) reload();
    wasDisabled.current = !!disabled;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled]);

  const dur = service.duration_min;
  const shownStaff = (data?.staff ?? staff).filter((s) => !staffId || s.id === staffId);
  const inp: GridInput | null = data ? { day, staff: data.staff, hours: data.hours, off: data.off, busy: data.busy, notBefore: data.notBefore, lastDay: data.lastDay, excludeId } : null;
  const win = inp ? gridWindow({ ...inp, staff: shownStaff }) : null;
  const rows = gridRows(win);
  const staffName = (id: string) => data?.staff.find((s) => s.id === id)?.name ?? '';

  function press(sid: string, m: number) {
    if (!inp || disabled) return;
    const f = fits(inp, sid, m, dur);
    if (!f.ok) {
      setSel(null);
      setMsg(f.reason);
      return;
    }
    setMsg(null);
    setSel(sel && sel.staffId === sid && sel.start === m ? null : { staffId: sid, start: m });
  }

  return (
    <div className="sh-freegrid">
      <div className="sh-bar">
        <button onClick={() => setDay(addDays(day, -1))} aria-label="表の前の日">◀</button>
        <button onClick={() => data && setDay(data.today)} aria-label="表を今日にする">今日</button>
        <button onClick={() => setDay(addDays(day, 1))} aria-label="表の次の日">▶</button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="表の日付" />
        <strong>{formatDay(day)}</strong>
      </div>

      <ul className="sh-legend" aria-label="表の見方">
        <li><span className="sw free" />空き</li>
        <li><span className="sw busy" />予約あり</li>
        <li><span className="sw closed" />営業時間外</li>
        <li><span className="sw off" />休み</li>
        <li><span className="sw late" />受付できない（直前・先すぎ）</li>
        <li><span className="sw sel" />選んだ時間</li>
      </ul>

      <div className="sh-gridsum" role="status">
        <div className="txt">
          {msg ? (
            <p className="err" role="alert">{msg}</p>
          ) : sel ? (
            <p>
              <strong className="num">{selectionLabel(sel, dur)}</strong>（{dur}分）　{w.staff}：{staffName(sel.staffId)}　{service.name}
            </p>
          ) : (
            <p className="muted">
              {service.name}（{dur}分）：空いているセルを押すと、そこから{dur}分ぶんが自動で選ばれます。
            </p>
          )}
        </div>
        <button className="primary" disabled={disabled || !sel} onClick={() => sel && onPick({ staff_id: sel.staffId, starts_at: toTs(day, minToHm(sel.start)), session_id: null })}>
          {actionLabel}
        </button>
      </div>

      <LoadState error={error} loading={!data} />
      {data && rows.length === 0 && <p className="muted">この日は、{w.staff}が全員お休み、または営業時間がありません。</p>}
      {inp && rows.length > 0 && (
        <div className="sh-gridwrap">
          <table className="sh-grid" aria-label={`${formatDay(day)}の空き表`}>
            <thead>
              <tr>
                <th scope="col" className="gt">時間</th>
                {shownStaff.map((s) => (
                  <th scope="col" key={s.id}>
                    {s.name}
                    <small>{s.title}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m, ri) => (
                <tr key={m} className={m % 60 === 0 ? 'hour' : ''}>
                  <th scope="row" className={m % 60 === 0 ? 'gt' : 'gt half'}>{minToHm(m)}</th>
                  {shownStaff.map((s) => {
                    const st = cellState(inp, s.id, m);
                    const isSel = inSelection(sel, s.id, m, dur);
                    if (st === 'free') {
                      const f = fits(inp, s.id, m, dur);
                      const isStart = sel?.staffId === s.id && sel.start === m;
                      return (
                        <td key={s.id} className={`g free${isSel ? ' sel' : ''}${!f.ok ? ' nofit' : ''}`}>
                          <button
                            onClick={() => press(s.id, m)}
                            aria-pressed={isStart}
                            aria-label={`${s.name} ${minToHm(m)}${f.ok ? '' : '（選べません）'}`}
                            title={f.ok ? undefined : f.reason}
                            disabled={disabled}
                          >
                            {isStart ? '開始' : ''}
                          </button>
                        </td>
                      );
                    }
                    if (st === 'busy') {
                      const b = busyAt(inp, s.id, m);
                      return (
                        <td key={s.id} className="g busy" title={b ? `${b.customer_name} さん` : '予約あり'}>
                          {b && isBusyStart(b, m, rows[0]) ? b.customer_name : ''}
                        </td>
                      );
                    }
                    const offRow = st === 'off' ? data?.off.find((o) => o.staff_id === s.id) : null;
                    return (
                      <td key={s.id} className={`g ${st}`} title={st === 'off' ? `休み${offRow?.note ? `：${offRow.note}` : ''}` : st === 'closed' ? '営業時間外' : '受付できない時間（直前・先すぎ）'}>
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
