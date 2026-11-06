'use client';
// 今日：今日の予定と、対応漏れの警告。職人は自分の現場だけ（DB の RLS が決める）。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { useSession } from '@/lib/auth';
import { q, withRole } from '@/lib/db';
import { getToday, setToday, DEFAULT_TODAY } from '@/lib/demo-date';
import { computeAlerts, DEFAULT_ALERT_SETTINGS, type AlertSite, type SiteAlert } from '@/features/alerts';

interface TodaySchedule {
  id: string;
  site_id: string;
  site_name: string;
  start_time: string | null;
  work: string;
  staff_name: string | null;
  memo: string | null;
}

export default function TodayPage() {
  return (
    <AppShell>
      <TodayBody />
    </AppShell>
  );
}

function TodayBody() {
  const { user } = useSession();
  const [today, setTodayState] = useState(DEFAULT_TODAY);
  const [schedules, setSchedules] = useState<TodaySchedule[] | null>(null);
  const [alerts, setAlerts] = useState<SiteAlert[]>([]);
  const [error, setError] = useState('');

  useEffect(() => setTodayState(getToday()), []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    setError('');
    withRole(user, async (tx) => {
      const sch = await q<TodaySchedule>(
        tx,
        `select s.id, s.site_id, st.name as site_name, s.start_time, s.work, u.name as staff_name, s.memo
           from schedules s join sites st on st.id = s.site_id left join app_users u on u.id = s.staff_id
          where s.day = $1::date and s.status <> '取消' order by s.start_time nulls first, s.id`,
        [today],
      );
      const sites = await q<AlertSite>(
        tx,
        `select id, name, status::text as status, staff_id, received_on::text as received_on,
                planned_start::text as planned_start, planned_end::text as planned_end from sites`,
      );
      return { sch, sites };
    })
      .then(({ sch, sites }) => {
        if (!live) return;
        setSchedules(sch);
        setAlerts(computeAlerts(sites, { ...DEFAULT_ALERT_SETTINGS, today }));
      })
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
    };
  }, [user, today]);

  return (
    <>
      <h1>今日</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          基準日（デモ）：
          <input
            type="date"
            value={today}
            onChange={(e) => {
              setToday(e.target.value);
              setTodayState(e.target.value || DEFAULT_TODAY);
            }}
          />
        </label>
        <span className="muted">架空のデータの日付に合わせて、今日を {DEFAULT_TODAY} にしています。</span>
      </div>
      {error && <p className="alert">読み込みに失敗しました：{error}</p>}

      <h2>対応漏れ</h2>
      {alerts.length === 0 && schedules && <p className="muted">対応漏れはありません。</p>}
      {alerts.map((a) => (
        <div key={a.kind + a.siteId} className="alert">
          <strong>{a.siteName}</strong>　{a.message}　<Link href={`/sites/detail/?id=${a.siteId}`}>開く</Link>
        </div>
      ))}

      <h2>{user?.role === 'worker' ? '自分の今日の予定' : '今日の予定'}</h2>
      {!schedules && !error && <p className="muted">読み込み中…</p>}
      {schedules && schedules.length === 0 && <p className="muted">今日の予定はありません。</p>}
      {schedules?.map((s) => (
        <div key={s.id} className="card">
          <div className="row">
            <strong>{s.start_time ?? '終日'}</strong>
            <span>{s.work}</span>
            {s.staff_name && <span className="badge">{s.staff_name}</span>}
          </div>
          <div>
            <Link href={`/sites/detail/?id=${s.site_id}`}>{s.site_name}</Link>
          </div>
          {s.memo && <div className="muted">{s.memo}</div>}
        </div>
      ))}
    </>
  );
}
