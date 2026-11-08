'use client';
// 担当（講師）の選択と、日付・空き枠の選択。/book/time/ と /my/（日時の変更）で共有する。
// サロン型（timed）は、縦＝時間（15分）・横＝担当者の表（CustomerGrid）。クラス型は、枠の一覧。
import { useEffect, useMemo, useState } from 'react';
import { withRole } from '@/lib/db';
import { useApp } from '@/lib/app-state';
import { errorMessage } from '@/lib/errors';
import { bookingWords } from './words';
import { getService, listStaff, loadSlots, type ServiceRow, type StaffRow } from './api';
import { CustomerGrid } from './CustomerGrid';
import { dedupeAnyStaff, groupByDay, shortDay, timeOf, timeRange, type Slot } from './format';
import './booking.css';

const FIRST_DAYS = 14;

export function SlotPicker({
  service,
  customerId,
  staffId,
  onStaffChange,
  selected,
  onSelect,
  onProceed,
  proceedLabel,
}: {
  service: Pick<ServiceRow, 'id' | 'kind'> & { duration_min?: number };
  customerId: string;
  staffId: string | null;
  onStaffChange: (id: string | null) => void;
  selected: Slot | null;
  onSelect: (s: Slot | null) => void;
  /** 渡すと、表の上の固定の帯に「この時間で進む」を出す（サロン型のみ） */
  onProceed?: () => void;
  proceedLabel?: string;
}) {
  const { words: w, mode } = useApp();
  const bw = bookingWords(mode);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(selected ? selected.starts_at.slice(0, 10) : null);
  const [showAllDays, setShowAllDays] = useState(false);
  const [duration, setDuration] = useState<number | null>(service.duration_min ?? null);

  // 所要時間がまだ分からないとき（/my/ から呼ばれたとき）は、メニューから読む
  useEffect(() => {
    if (service.duration_min != null) {
      setDuration(service.duration_min);
      return;
    }
    let alive = true;
    withRole('customer', customerId, (tx) => getService(tx, service.id))
      .then((r) => alive && r && setDuration(r.duration_min))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId, service.id, service.duration_min]);

  useEffect(() => {
    let alive = true;
    withRole('customer', customerId, (tx) => listStaff(tx))
      .then((s) => alive && setStaff(s))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId]);

  useEffect(() => {
    let alive = true;
    setSlots(null);
    withRole('customer', customerId, (tx) => loadSlots(tx, service.id, staffId))
      .then((s) => alive && setSlots(staffId || service.kind === 'timed' ? s : dedupeAnyStaff(s)))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [customerId, service.id, staffId]);

  const days = useMemo(() => groupByDay(slots ?? []).filter((g) => service.kind === 'class' || g.slots.some((s) => s.remaining > 0)), [slots, service.kind]);
  const activeDay = day && days.some((d) => d.day === day) ? day : (days[0]?.day ?? null);
  const staffName = (id: string) => staff.find((s) => s.id === id)?.name ?? '';
  const visibleDays = showAllDays ? days : days.slice(0, FIRST_DAYS);
  const current = days.find((d) => d.day === activeDay);
  const timed = service.kind === 'timed';
  const pickDay = (d: string) => {
    setDay(d);
    // 別の日に動いたら、選んでいた時間は外す（表は1日ぶんだけ出すため）
    if (selected && selected.starts_at.slice(0, 10) !== d) onSelect(null);
  };

  return (
    <div>
      <div className="bk-field">
        <label htmlFor="bk-staff">{w.staff}</label>
        <select id="bk-staff" value={staffId ?? ''} onChange={(e) => onStaffChange(e.target.value || null)}>
          <option value="">{bw.anyStaff}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{s.title}）
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p className="bk-alert" role="alert">
          {error}
        </p>
      )}
      {slots === null && !error && <p className="muted">空きを調べています…</p>}
      {slots !== null && days.length === 0 && <p className="bk-info">この条件で取れる日時はありません。{w.staff}を変えてみてください。</p>}

      {days.length > 0 && (
        <>
          <h2 style={{ marginTop: 0 }}>日にち</h2>
          <div className="bk-days" role="group" aria-label="日にち">
            {visibleDays.map((d) => (
              <button key={d.day} aria-pressed={d.day === activeDay} onClick={() => pickDay(d.day)}>
                {shortDay(d.day)}
              </button>
            ))}
            {!showAllDays && days.length > FIRST_DAYS && <button onClick={() => setShowAllDays(true)}>さらに先の日を見る</button>}
          </div>
          {current && timed && duration != null && activeDay && (
            <>
              <h2>時間（{shortDay(current.day)}）</h2>
              <CustomerGrid
                service={{ id: service.id, duration_min: duration }}
                staff={staff}
                staffId={staffId}
                day={activeDay}
                customerId={customerId}
                selected={selected}
                onSelect={onSelect}
                onProceed={onProceed}
                proceedLabel={proceedLabel}
              />
            </>
          )}
          {current && !timed && (
            <>
              <h2>時間（{shortDay(current.day)}）</h2>
              <div className="bk-slots" role="group" aria-label="時間">
                {current.slots.map((s) => {
                  const full = s.remaining <= 0;
                  const isSel = selected?.starts_at === s.starts_at && selected.staff_id === s.staff_id && selected.session_id === s.session_id;
                  return (
                    <button key={`${s.starts_at}-${s.staff_id}`} disabled={full} aria-pressed={isSel} onClick={() => onSelect(s)}>
                      <span>{service.kind === 'class' ? timeRange(s.starts_at, s.ends_at) : timeOf(s.starts_at)}</span>
                      {service.kind === 'class' && (
                        <small>
                          {staffName(s.staff_id)} ／ {full ? '満席' : `${w.remaining}${s.remaining}名`}
                        </small>
                      )}
                      {service.kind === 'timed' && !staffId && <small>{staffName(s.staff_id)}</small>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
