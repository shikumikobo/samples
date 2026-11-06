'use client';
// 現場の詳細。静的書き出し（output: 'export'）なので、URL は /sites/detail?id=現場番号 の1ページ方式にした。
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AuditPanel } from '@/features/audit/AuditPanel';
import { FilesPanel } from '@/features/files/FilesPanel';
import { QuotePanel } from '@/features/quotes/QuotePanel';
import { SharingPanel } from '@/features/sharing/SharingPanel';
import { day, usePermissions, useRows, yen } from '@/features/shared/data';
import { AppShell } from '@/components/AppShell';
import s from '@/features/shared/ui.module.css';

const TABS = [
  { key: 'summary', label: '概要' },
  { key: 'schedule', label: '予定' },
  { key: 'quote', label: '見積' },
  { key: 'files', label: 'ファイル' },
  { key: 'sharing', label: '外部への共有' },
  { key: 'audit', label: '履歴' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function Detail() {
  const id = useSearchParams().get('id') ?? '';
  const [tab, setTab] = useState<TabKey>('summary');
  const { can } = usePermissions();
  const site = useRows(
    `select s.id, s.name, s.address, s.status, s.received_on, s.planned_start, s.planned_end,
            c.name as customer_name, u.name as staff_name, f.contract_amount
       from sites s
       left join customers c on c.id = s.customer_id
       left join app_users u on u.id = s.staff_id
       left join site_finance f on f.site_id = s.id
      where s.id = $1`,
    [id],
    id !== '',
  );
  if (!id) return <AppShell><div className={s.page}><p className={s.note}>現場が選ばれていません。<Link className={s.link} href="/sites/">一覧へ</Link></p></div></AppShell>;
  if (site.rows === null) return <AppShell><div className={s.page}><p className={s.muted}>読み込んでいます…</p></div></AppShell>;
  const r = site.rows[0];
  if (!r) {
    // 無い現場と、見る権限のない現場は、DB の結果では区別できない（同じ「見つかりません」にする）
    return <AppShell><div className={s.page}><p className={s.note}>この現場は見つからないか、この役割では見られません。<Link className={s.link} href="/sites/">一覧へ</Link></p></div></AppShell>;
  }
  const visible = TABS.filter((t) => {
    if (t.key === 'sharing') return can('site.edit') || can('file.manage');
    if (t.key === 'audit') return can('audit.view');
    return true;
  });
  return (
    <AppShell><div className={s.page}>
      <div className={s.head}>
        <h1 className={s.h1}>{r.name}</h1>
        <span><span className={s.badge}>{r.status}</span> <Link className={s.link} href="/sites/">← 一覧へ</Link></span>
      </div>
      <div className={s.tabs} role="tablist">
        {visible.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`${s.tab} ${tab === t.key ? s.tabOn : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <dl className={s.grid2}>
          <dt>現場番号</dt><dd>{r.id}</dd>
          <dt>顧客</dt><dd>{r.customer_name ?? '—'}</dd>
          <dt>工事の場所</dt><dd>{r.address ?? '—'}</dd>
          <dt>担当</dt><dd>{r.staff_name ?? '未定'}</dd>
          <dt>受注日（受付日）</dt><dd>{day(r.received_on)}</dd>
          <dt>着工予定</dt><dd>{day(r.planned_start)}</dd>
          <dt>完工予定</dt><dd>{day(r.planned_end)}</dd>
          <dt>契約金額</dt>
          <dd>{r.contract_amount === null || r.contract_amount === undefined ? <span className={s.muted}>この役割では見られません</span> : yen(r.contract_amount)}</dd>
        </dl>
      )}
      {tab === 'schedule' && <SchedulePanel siteId={id} />}
      {tab === 'quote' && <QuotePanel siteId={id} />}
      {tab === 'files' && <FilesPanel siteId={id} />}
      {tab === 'sharing' && <SharingPanel siteId={id} />}
      {tab === 'audit' && <AuditPanel siteId={id} />}
    </div></AppShell>
  );
}

function SchedulePanel({ siteId }: { siteId: string }) {
  const { rows } = useRows(
    `select y.id, y.day, y.start_time, y.work, y.memo, y.status, u.name as staff_name
       from schedules y left join app_users u on u.id = y.staff_id
      where y.site_id = $1 order by y.day, y.start_time`,
    [siteId],
  );
  if (rows === null) return <p className={s.muted}>読み込んでいます…</p>;
  if (rows.length === 0) return <p className={s.muted}>この現場の予定はありません。</p>;
  return (
    <table className={`${s.table} ${s.stack}`}>
      <thead><tr><th>日</th><th>時刻</th><th>作業</th><th>担当</th><th>メモ</th><th>状況</th></tr></thead>
      <tbody>
        {rows.map((y) => (
          <tr key={y.id}>
            <td data-label="日">{day(y.day)}</td>
            <td data-label="時刻">{y.start_time ?? '終日'}</td>
            <td data-label="作業">{y.work}</td>
            <td data-label="担当">{y.staff_name ?? '—'}</td>
            <td data-label="メモ">{y.memo ?? ''}</td>
            <td data-label="状況"><span className={s.badge}>{y.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SiteDetailPage() {
  return (
    <Suspense fallback={<AppShell><div className={s.page}><p className={s.muted}>読み込んでいます…</p></div></AppShell>}>
      <Detail />
    </Suspense>
  );
}
