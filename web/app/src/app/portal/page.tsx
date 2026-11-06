'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalShell } from '@/components/PortalShell';
import { useSession } from '@/lib/auth';
import { withRole } from '@/lib/db';
import { PROGRESS_STEPS, toProgress } from '@/features/portal/progress';
import { needsConfirmation, quoteTotals, yen } from '@/features/portal/quote';
import styles from './portal.module.css';

type Site = { id: string; name: string; address: string | null; status: string; planned_start: string | null; planned_end: string | null; staff_name: string | null };
type Sched = { id: string; day: string; start_time: string | null; work: string; memo: string | null };
type FileRow = { id: string; name: string; kind: string; path: string; created_at: string };
type Quote = { id: string; title: string; status: string; issued_on: string | null; tax_rate: number };
type Line = { quote_id: string; line_no: number; item: string; qty: number; unit: string | null; unit_price: number };

const WD = ['日', '月', '火', '水', '木', '金', '土'];
function jpDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return `${m}月${d}日（${WD[new Date(y, m - 1, d).getDay()]}）`;
}
// public/sample-files/x.pdf → /sample-files/x.pdf
const fileHref = (p: string) => '/' + p.replace(/^\/?public\//, '').replace(/^\//, '');

export default function PortalPage() {
  const { user } = useSession();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [siteId, setSiteId] = useState('');
  const [sched, setSched] = useState<Sched[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [quotes, setQuotes] = useState<(Quote & { lines: Line[] })[]>([]);
  const [error, setError] = useState('');

  const isExternal = user?.role === 'customer' || user?.role === 'partner';
  const isCustomer = user?.role === 'customer';

  // 許可された現場（RLS が site_access で絞る）
  useEffect(() => {
    if (!user || !isExternal) return;
    let alive = true;
    withRole(user, async (db) => (await db.query<Site>(
      'select s.id, s.name, s.address, s.status::text as status, s.planned_start::text as planned_start, s.planned_end::text as planned_end, u.name as staff_name from sites s left join app_users u on u.id = s.staff_id order by s.id')).rows)
      .then((r) => { if (!alive) return; setSites(r); setSiteId((cur) => cur || r[0]?.id || ''); })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [user, isExternal]);

  // 選んだ現場の中身。見える範囲はすべて DB が決める（お客さん／協力業者で自動的に変わる）
  useEffect(() => {
    if (!user || !isExternal || !siteId) return;
    let alive = true;
    withRole(user, async (db) => {
      const s = await db.query<Sched>(
        `select id, day::text as day, start_time, work, memo from schedules
          where site_id = $1 and status <> '取消' order by day, start_time nulls first`, [siteId]);
      const f = await db.query<FileRow>(
        `select id, name, kind, path, created_at::text as created_at from files
          where site_id = $1 order by created_at desc, name`, [siteId]);
      const q = await db.query<Quote>(
        `select id, title, status, issued_on::text as issued_on, tax_rate::float as tax_rate
           from quotes where site_id = $1 order by version desc`, [siteId]);
      const l = q.rows.length
        ? await db.query<Line>(
            `select quote_id, line_no, item, qty::float as qty, unit, unit_price from quote_lines
              where quote_id = any($1::text[]) order by quote_id, line_no`, [q.rows.map((x) => x.id)])
        : { rows: [] as Line[] };
      return { s: s.rows, f: f.rows, q: q.rows.map((x) => ({ ...x, lines: l.rows.filter((r) => r.quote_id === x.id) })) };
    })
      .then((r) => { if (!alive) return; setSched(r.s); setFiles(r.f); setQuotes(r.q); })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [user, isExternal, siteId]);

  if (!user) return null;

  // 社内の人が開いたとき
  if (!isExternal) {
    return (
      <PortalShell>
        <section className={styles.card}>
          <h1>外部の専用ページ</h1>
          <p>ここは、お客さん・協力業者向けの専用ページです。社内の画面は別にあります。</p>
          <p>この画面を見るには、画面上の役割の切り替えで「お客さん」か「協力業者」を選んでください。</p>
          <Link className={styles.link} href="/today">社内の画面（今日）へ</Link>
        </section>
      </PortalShell>
    );
  }

  const site = sites?.find((s) => s.id === siteId);
  const progress = site ? toProgress(site.status) : null;
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sched.filter((s) => s.day >= today);
  const nextList = (upcoming.length ? upcoming : sched.slice(-3)).slice(0, 5);

  return (
    <PortalShell>
      {error && <p role="alert" className={styles.error}>読み込めませんでした：{error}</p>}
      {!sites && !error && <p>読み込んでいます…</p>}

      {sites && sites.length === 0 && (
        <section className={styles.card}>
          <h2>表示できる現場がありません</h2>
          <p>現在、このページで共有されている現場はありません。担当者が共有すると、ここに表示されます。</p>
        </section>
      )}

      {sites && sites.length > 1 && (
        <label className={styles.pick}>
          現場を選ぶ
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}

      {site && (
        <>
          <header className={styles.head}>
            <p className={styles.hello}>{user.name} 様{isCustomer ? '' : '（協力業者）'}</p>
            <h1 className={styles.title}>{site.name}</h1>
            {site.address && <p className={styles.addr}>{site.address}</p>}
          </header>

          {isCustomer && progress && (
            <section className={styles.status} aria-labelledby="p-now">
              <h2 id="p-now" className={styles.label}>いまのようす</h2>
              <p className={styles.now}><strong>{progress.label}</strong></p>
              {site.planned_start && (
                <p className={styles.term}>
                  工期は <span className={styles.num}>{jpDate(site.planned_start)}{site.planned_end ? ` 〜 ${jpDate(site.planned_end)}` : ''}</span> の予定です。
                </p>
              )}
              <ol className={styles.track} aria-label="進み具合">
                {PROGRESS_STEPS.map((label, i) => (
                  <li
                    key={label}
                    className={i < progress.step ? styles.done : i === progress.step ? styles.current : ''}
                    aria-current={i === progress.step ? 'step' : undefined}
                  >
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.stepName}>{label}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className={styles.card} aria-labelledby="p-sched">
            <h2 id="p-sched">{upcoming.length ? '次の予定' : '予定'}</h2>
            {nextList.length === 0 ? (
              <p>予定は、決まりしだいここに表示されます。</p>
            ) : (
              <ul className={styles.sched}>
                {nextList.map((s) => (
                  <li key={s.id}>
                    <span className={styles.when}><span className={styles.num}>{jpDate(s.day)}</span>{s.start_time ? <span className={styles.num}> {s.start_time}</span> : ''}</span>
                    <span className={styles.what}>{s.work}{s.memo && <span className={styles.sub}>　{s.memo}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.card} aria-labelledby="p-files">
            <h2 id="p-files">共有されたファイル</h2>
            {files.length === 0 ? (
              <p>共有されているファイルはありません。</p>
            ) : (
              <ul className={styles.list}>
                {files.map((f) => (
                  <li key={f.id} className={styles.file}>
                    <span className={styles.ext} aria-hidden="true">{f.path.split('.').pop()?.toUpperCase()}</span>
                    <a href={fileHref(f.path)} target="_blank" rel="noreferrer">{f.name}</a>
                    <span className={styles.kind}>{f.kind}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isCustomer && (
            <section className={styles.card} aria-labelledby="p-quote">
              <h2 id="p-quote">お見積り</h2>
              {quotes.length === 0 ? (
                <p>ご確認いただくお見積りはありません。</p>
              ) : (
                quotes.map((q) => {
                  const t = quoteTotals(q.lines, q.tax_rate);
                  return (
                    <article key={q.id} className={styles.quote}>
                      <h3>{q.title}</h3>
                      {needsConfirmation(q.status) && (
                        <p className={styles.confirm}>こちらのお見積りをご確認ください（承認前です）。</p>
                      )}
                      <table className={styles.table}>
                        <thead><tr><th>品目</th><th>数量</th><th>単価</th><th>金額</th></tr></thead>
                        <tbody>
                          {q.lines.map((l) => (
                            <tr key={l.line_no}>
                              <td>{l.item}</td>
                              <td>{l.qty}{l.unit ?? ''}</td>
                              <td>{yen(l.unit_price)}</td>
                              <td>{yen(Math.round(l.qty * l.unit_price))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr><th colSpan={3}>小計</th><td>{yen(t.subtotal)}</td></tr>
                          <tr><th colSpan={3}>消費税（{Math.round(q.tax_rate * 100)}%）</th><td>{yen(t.tax)}</td></tr>
                          <tr><th colSpan={3}>合計</th><td><strong>{yen(t.total)}</strong></td></tr>
                        </tfoot>
                      </table>
                    </article>
                  );
                })
              )}
            </section>
          )}
          {site.staff_name && (
            <p className={styles.contact}>担当：<strong>{site.staff_name}</strong>（サンプル工務店）　ご不明な点は担当までご連絡ください。</p>
          )}
        </>
      )}
    </PortalShell>
  );
}
