'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { day, useRows } from '@/features/shared/data';
import { AppShell } from '@/components/AppShell';
import s from '@/features/shared/ui.module.css';

const PAGE_SIZE = 20;
// 状況のタブ（台帳の「現場の状況」と同じ値）
const TABS = ['すべて', '受付', '見積中', '受注', '着工', '完工', '請求済み', '入金済み', '完了', '失注'] as const;

/** 現場の一覧。何が見えるかは DB（RLS）が決める：職人は担当の現場だけ、外部は許可されたものだけ。 */
export default function SitesPage() {
  const { rows, error } = useRows(
    `select s.id, s.name, s.address, s.status, s.staff_id, u.name as staff_name, c.name as customer_name,
            s.planned_start, s.planned_end
       from sites s
       left join customers c on c.id = s.customer_id
       left join app_users u on u.id = s.staff_id
      order by s.id desc`,
    [],
  );
  const [tab, setTab] = useState<(typeof TABS)[number]>('すべて');
  const [q, setQ] = useState('');
  const [staff, setStaff] = useState('');
  const [period, setPeriod] = useState(''); // '' | 'thisMonth' | 'overdue'
  const [page, setPage] = useState(1);

  const list = rows ?? [];
  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    list.forEach((r) => r.staff_id && m.set(String(r.staff_id), String(r.staff_name ?? r.staff_id)));
    return [...m.entries()];
  }, [list]);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const filtered = list.filter((r) => {
    if (tab !== 'すべて' && r.status !== tab) return false;
    if (staff && r.staff_id !== staff) return false;
    if (period === 'thisMonth' && !String(r.planned_start ?? '').startsWith(month) && !String(r.planned_end ?? '').startsWith(month)) return false;
    if (period === 'overdue' && !(r.planned_end && String(r.planned_end).slice(0, 10) < today && ['受注', '着工'].includes(String(r.status)))) return false;
    if (q) {
      const t = `${r.id} ${r.name} ${r.customer_name ?? ''}`.toLowerCase();
      if (!t.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE_SIZE, cur * PAGE_SIZE);
  useEffect(() => setPage(1), [tab, q, staff, period]);

  return (
    <AppShell><div className={s.page}>
      <div className={s.head}>
        <h1 className={s.h1}>現場の一覧</h1>
        <span className={s.muted}>{rows === null ? '読み込んでいます…' : `${filtered.length} 件`}</span>
      </div>
      {error && <p className={s.error}>{error}</p>}

      <div className={s.tabs} role="tablist" aria-label="状況">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`${s.tab} ${tab === t ? s.tabOn : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>

      <div className={s.filters}>
        <input className={s.input} type="search" placeholder="現場名・顧客名・現場番号で探す" value={q} onChange={(e) => setQ(e.target.value)} aria-label="検索" />
        <select className={s.input} value={staff} onChange={(e) => setStaff(e.target.value)} aria-label="担当者">
          <option value="">担当者：すべて</option>
          {staffOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <select className={s.input} value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="期日">
          <option value="">期日：すべて</option>
          <option value="thisMonth">今月に着工・完工の予定</option>
          <option value="overdue">完工予定日を過ぎている</option>
        </select>
        <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => { setTab('すべて'); setQ(''); setStaff(''); setPeriod(''); }}>
          条件をクリア
        </button>
      </div>

      {rows !== null && shown.length === 0 ? (
        <p className={s.note}>条件に合う現場はありません。この役割で見られる現場だけが出ます。</p>
      ) : (
        <table className={`${s.table} ${s.stack}`}>
          <thead>
            <tr><th>現場番号</th><th>現場名</th><th>顧客</th><th>状況</th><th>担当</th><th>着工予定</th><th>完工予定</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const late = r.planned_end && String(r.planned_end).slice(0, 10) < today && ['受注', '着工'].includes(String(r.status));
              return (
                <tr key={r.id}>
                  <td data-label="現場番号">
                    <Link className={s.link} href={`/sites/detail/?id=${encodeURIComponent(String(r.id))}`}>{r.id}</Link>
                  </td>
                  <td data-label="現場名">{r.name}</td>
                  <td data-label="顧客">{r.customer_name ?? '—'}</td>
                  <td data-label="状況"><span className={s.badge}>{r.status}</span></td>
                  <td data-label="担当">{r.staff_name ?? '未定'}</td>
                  <td data-label="着工予定">{day(r.planned_start)}</td>
                  <td data-label="完工予定" className={late ? s.warn : undefined}>{day(r.planned_end)}{late ? '（遅れ）' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <nav className={s.pager} aria-label="ページ送り">
          <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={cur <= 1} onClick={() => setPage(cur - 1)}>前へ</button>
          <span>{cur} / {pages}</span>
          <button type="button" className={`${s.btn} ${s.btnGhost}`} disabled={cur >= pages} onClick={() => setPage(cur + 1)}>次へ</button>
        </nav>
      )}
    </div></AppShell>
  );
}
