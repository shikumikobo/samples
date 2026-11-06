'use client';
import { useState } from 'react';
import { day, usePermissions, useRows, write, yen } from '../shared/data';
import s from '../shared/ui.module.css';
import { nextStatus, totals } from './calc';

/** 現場の見積（版ごと）。金額は DB が返したものだけを出す。職人には何も返らないので「見られません」にする。 */
export function QuotePanel({ siteId }: { siteId: string }) {
  const { can, ready } = usePermissions();
  const quotes = useRows('select id, version, title, issued_on, status, tax_rate from quotes where site_id = $1 order by version', [siteId]);
  const lines = useRows(
    'select quote_id, line_no, item, qty, unit, unit_price from quote_lines where quote_id in (select id from quotes where site_id = $1) order by quote_id, line_no',
    [siteId],
  );
  const [msg, setMsg] = useState<string | null>(null);

  if (!ready || quotes.rows === null || lines.rows === null) return <p className={s.muted}>読み込んでいます…</p>;
  if (!can('finance.view')) {
    return <p className={s.note}>この役割では、金額と見積は見られません。</p>;
  }
  if (quotes.rows.length === 0) return <p className={s.muted}>この現場の見積はまだありません。</p>;

  const change = async (id: string, status: string) => {
    if (!quotes.user) return;
    const r = await write(quotes.user, 'update quotes set status = $1 where id = $2', [status, id]);
    setMsg(r.ok ? null : r.message ?? '変更できませんでした');
    if (r.ok) quotes.reload();
  };

  return (
    <div>
      {msg && <p className={s.error}>{msg}</p>}
      {quotes.rows.map((q) => {
        const ls = (lines.rows ?? []).filter((l) => l.quote_id === q.id).map((l) => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price) })) as { qty: number; unit_price: number; line_no: number; item: string; unit?: string }[];
        const t = totals(ls, Number(q.tax_rate ?? 0.1));
        const next = nextStatus(String(q.status));
        return (
          <section key={q.id} style={{ marginBottom: 24 }}>
            <div className={s.row}>
              <strong>{q.id}</strong>
              <span>{q.title}</span>
              <span className={s.badge}>{q.status}</span>
              <span className={s.muted}>発行 {day(q.issued_on)}</span>
              {next && can('quote.edit') && (
                <button type="button" className={s.btn} onClick={() => change(String(q.id), next)}>
                  「{next}」にする
                </button>
              )}
            </div>
            <table className={`${s.table} ${s.stack}`}>
              <thead>
                <tr>
                  <th>品目</th>
                  <th className={s.num}>数量</th>
                  <th>単位</th>
                  <th className={s.num}>単価</th>
                  <th className={s.num}>金額</th>
                </tr>
              </thead>
              <tbody>
                {ls.map((l) => (
                  <tr key={l.line_no}>
                    <td data-label="品目">{l.item}</td>
                    <td data-label="数量" className={s.num}>{l.qty.toLocaleString('ja-JP')}</td>
                    <td data-label="単位">{l.unit ?? ''}</td>
                    <td data-label="単価" className={s.num}>{yen(l.unit_price)}</td>
                    <td data-label="金額" className={s.num}>{yen(Math.round(l.qty * l.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className={s.num}>小計（税抜）</td>
                  <td className={s.num}>{yen(t.subtotal)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className={s.num}>消費税（{Math.round(Number(q.tax_rate ?? 0.1) * 100)}%・合計に1回・切り捨て）</td>
                  <td className={s.num}>{yen(t.tax)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className={s.num}><strong>合計（税込）</strong></td>
                  <td className={s.num}><strong>{yen(t.total)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
    </div>
  );
}
