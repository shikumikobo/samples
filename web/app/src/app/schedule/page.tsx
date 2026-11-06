'use client';
import { AppShell } from '@/components/AppShell';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/lib/auth';
import { withRole } from '@/lib/db';
import { useRedirectExternal } from '@/features/portal/useRedirectExternal';
import { addDays, dayLabel, fmt, weekDays, weekStart } from '@/features/schedule/week';
import styles from './schedule.module.css';

type Row = {
  id: string; day: string; start_time: string | null; work: string; memo: string | null;
  status: string; site_id: string; site_name: string; staff_id: string | null; staff_name: string | null;
};

function ScheduleBody() {
  const { user } = useSession();
  const external = useRedirectExternal(user?.role);
  const [start, setStart] = useState(() => weekStart(fmt(new Date())));
  const [staff, setStaff] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || external) return;
    let alive = true;
    setRows(null);
    withRole(user, async (db) => {
      // RLS が、職人には自分の予定だけを返す
      const r = await db.query<Row>(
        `select s.id, s.day::text as day, s.start_time, s.work, s.memo, s.status, s.site_id,
                si.name as site_name, s.staff_id, u.name as staff_name
           from schedules s
           join sites si on si.id = s.site_id
           left join app_users u on u.id = s.staff_id
          where s.day between $1::date and $2::date and s.status <> '取消'
          order by s.day, s.start_time nulls first, s.id`,
        [start, addDays(start, 6)],
      );
      return r.rows;
    })
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [user, external, start]);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    (rows ?? []).forEach((r) => r.staff_id && m.set(r.staff_id, r.staff_name ?? r.staff_id));
    return [...m.entries()];
  }, [rows]);

  if (!user || external) return null;
  const days = weekDays(start);
  const shown = (rows ?? []).filter((r) => !staff || r.staff_id === staff);
  const today = fmt(new Date());
  const own = user.role === 'worker';

  return (
    <div className={styles.page}>
      <h1>担当者ごとの予定</h1>
      <p className={styles.lead}>
        {own ? 'あなたの予定だけが表示されます。' : '週ごとの予定です。担当者で絞り込めます。'}
      </p>

      <div className={styles.bar}>
        <button type="button" onClick={() => setStart(addDays(start, -7))}>← 前の週</button>
        <strong>{dayLabel(days[0])} 〜 {dayLabel(days[6])}</strong>
        <button type="button" onClick={() => setStart(addDays(start, 7))}>次の週 →</button>
        <button type="button" onClick={() => setStart(weekStart(today))}>今週</button>
        {!own && (
          <label className={styles.filter}>
            担当者
            <select value={staff} onChange={(e) => setStaff(e.target.value)}>
              <option value="">全員</option>
              {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {error && <p role="alert" className={styles.error}>読み込めませんでした：{error}</p>}
      {!rows && !error && <p>読み込んでいます…</p>}

      {rows && (
        <div className={styles.week}>
          {days.map((d) => {
            const list = shown.filter((r) => r.day === d);
            return (
              <section key={d} className={`${styles.day} ${d === today ? styles.today : ''}`} aria-label={dayLabel(d)}>
                <h2>{dayLabel(d)}</h2>
                {list.length === 0 && <p className={styles.empty}>予定なし</p>}
                <ul>
                  {list.map((r) => (
                    <li key={r.id} className={styles.item}>
                      <span className={styles.time}>{r.start_time ?? '終日'}</span>
                      <span className={styles.work}>{r.work}</span>
                      <span className={styles.site}>{r.site_name}</span>
                      {!own && <span className={styles.who}>{r.staff_name ?? '担当未定'}</span>}
                      {r.memo && <span className={styles.memo}>{r.memo}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <AppShell>
      <ScheduleBody />
    </AppShell>
  );
}
