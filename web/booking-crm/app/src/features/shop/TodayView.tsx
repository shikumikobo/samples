'use client';
import Link from 'next/link';
import { useApp } from '@/lib/app-state';
import { formatDay } from '@/lib/demo-date';
import { byTime, countDay, groupBy, range, yen, type Rsv } from './lib';
import { SHOP_WORDS, statusLabel } from './words';
import { loadReservations, loadSessions, loadToday, markNoshow, markVisited, setStatus, type SessionRow } from './queries';
import { FlashView, LoadState, ShopPage, StatusBadge, useAct, useShopLoad } from './ui';

export function TodayView() {
  const { words: w } = useApp();
  return (
    <ShopPage title={w.page_today}>
      <TodayBody />
    </ShopPage>
  );
}

function TodayBody() {
  const { words: w, mode } = useApp();
  const sw = SHOP_WORDS[mode];
  const { data, error, reload } = useShopLoad(async (tx) => {
    const today = await loadToday(tx);
    const rs = await loadReservations(tx, today, today);
    const sessions = mode === 'class' ? await loadSessions(tx, today, today) : [];
    return { today, rs, sessions };
  }, [mode]);
  const { act, flash, busy } = useAct(reload);

  if (!data) return <LoadState error={error} loading />;
  const live = byTime(data.rs.filter((r) => r.status !== 'canceled'));
  const c = countDay(data.rs);
  const byStaff = groupBy(live, (r) => r.staff_name);

  return (
    <>
      <p className="lead">{formatDay(data.today)}</p>
      <div className="sh-stats">
        <div className="sh-stat"><b>{c.total}</b><span>今日の{sw.rsv}（件）</span></div>
        <div className="sh-stat"><b>{c.booked}</b><span>{w.booked}</span></div>
        <div className="sh-stat"><b>{c.visited}</b><span>{w.visited}</span></div>
        <div className="sh-stat"><b>{c.noshow}</b><span>{w.noshow}</span></div>
        <div className="sh-stat"><b>{c.trial}</b><span>{w.trial}の{sw.rsv}（件）</span></div>
      </div>
      <FlashView flash={flash} />
      <LoadState error={error} loading={false} />
      {live.length === 0 && <p className="card">今日の{sw.noRsv}。</p>}
      <div className="sh-cols">
        {[...byStaff.entries()].map(([staff, list]) => (
          <section className="sh-col" key={staff} aria-label={`${w.staff}：${staff}`}>
            <h3>{staff}<small>{list.length}件</small></h3>
            {mode === 'class' ? (
              <ClassGroups list={list} sessions={data.sessions} act={act} busy={busy} />
            ) : (
              list.map((r) => <Row key={r.id} r={r} act={act} busy={busy} />)
            )}
          </section>
        ))}
      </div>
    </>
  );
}

type Act = ReturnType<typeof useAct>['act'];

function ClassGroups({ list, sessions, act, busy }: { list: Rsv[]; sessions: SessionRow[]; act: Act; busy: boolean }) {
  const { words: w } = useApp();
  const groups = groupBy(list, (r) => r.session_id ?? r.id);
  return (
    <>
      {[...groups.entries()].map(([sid, rs]) => {
        const s = sessions.find((x) => x.id === sid);
        return (
          <div className="sh-session" key={sid}>
            <header>
              <strong className="num">{range(rs[0].starts_at, rs[0].ends_at)}</strong>
              <span>{rs[0].service_name}</span>
              {s && <span className="badge">参加 {s.booked}/{s.capacity}（{w.remaining} {Math.max(s.capacity - s.booked, 0)}）</span>}
            </header>
            {rs.map((r) => <Row key={r.id} r={r} act={act} busy={busy} hideTime />)}
          </div>
        );
      })}
    </>
  );
}

function Row({ r, act, busy, hideTime }: { r: Rsv; act: Act; busy: boolean; hideTime?: boolean }) {
  const { words: w } = useApp();
  return (
    <div className={`sh-item ${r.status === 'visited' ? 'done' : ''}`}>
      <div className="row">
        {!hideTime && <span className="t">{range(r.starts_at, r.ends_at)}</span>}
        <Link href={`/customers/detail/?id=${r.customer_id}`}><strong>{r.customer_name}</strong></Link>
        <StatusBadge r={r} label={statusLabel(w, r.status)} />
        {r.is_trial && <span className="sh-trial">{w.trial}</span>}
        {r.caution && <span className="sh-caution">注意あり</span>}
      </div>
      <div className="sub">{r.service_name}　{yen(r.price)}</div>
      {r.note && <div className="sh-memo">メモ：{r.note}</div>}
      {r.status === 'booked' && (
        <div className="acts">
          <button className="primary" disabled={busy} onClick={() => act((tx) => markVisited(tx, r.id), `${r.customer_name}：${w.visited}にしました。`)}>{w.visited}</button>
          <button className="danger" disabled={busy} onClick={() => act((tx) => markNoshow(tx, r.id), `${r.customer_name}：${w.noshow}にしました。`)}>{w.noshow}</button>
        </div>
      )}
      {(r.status === 'visited' || r.status === 'noshow') && (
        <div className="acts">
          <button disabled={busy} onClick={() => act((tx) => setStatus(tx, r.id, 'booked'), `${r.customer_name}：${w.booked}に戻しました。`)}>{w.booked}に戻す</button>
        </div>
      )}
    </div>
  );
}
