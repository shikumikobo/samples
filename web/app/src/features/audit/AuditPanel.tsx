'use client';
import { usePermissions, useRows } from '../shared/data';
import s from '../shared/ui.module.css';

const TABLE_LABEL: Record<string, string> = {
  sites: '現場', site_finance: '金額', quotes: '見積', quote_lines: '見積の明細',
  files: 'ファイル', schedules: '予定', site_access: '外部への許可',
};

/** 変更の前後（jsonb）から、変わった項目だけを取り出す。 */
export function diffRows(before: Record<string, any> | null, after: Record<string, any> | null) {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: { key: string; from: unknown; to: unknown }[] = [];
  keys.forEach((k) => {
    const a = before?.[k];
    const b = after?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b) && k !== 'updated_at') out.push({ key: k, from: a, to: b });
  });
  return out;
}

const show = (v: unknown) => (v === null || v === undefined ? '（なし）' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const when = (t: unknown) => {
  const d = new Date(String(t));
  return Number.isNaN(d.getTime()) ? String(t) : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** 変更の履歴（だれが・いつ・何を、前の値→後の値）。audit.view のある人だけ。 */
export function AuditPanel({ siteId }: { siteId: string }) {
  const { can, ready } = usePermissions();
  const { rows, error } = useRows(
    `select a.id, a.at, a.user_id, u.name as user_name, a.table_name, a.row_id, a.action, a.before_row, a.after_row
       from audit_log a left join app_users u on u.id = a.user_id
      where (a.table_name = 'sites' and a.row_id = $1)
         or a.after_row->>'site_id' = $1 or a.before_row->>'site_id' = $1
      order by a.at desc, a.id desc limit 100`,
    [siteId],
    true,
  );
  if (!ready || rows === null) return <p className={s.muted}>読み込んでいます…</p>;
  if (!can('audit.view')) return <p className={s.note}>変更の履歴は、社長だけが見られます。</p>;
  return (
    <div>
      {error && <p className={s.error}>{error}</p>}
      {rows.length === 0 ? (
        <p className={s.muted}>この現場の変更の履歴はまだありません。</p>
      ) : (
        <table className={`${s.table} ${s.stack}`}>
          <thead>
            <tr><th>日時</th><th>だれが</th><th>対象</th><th>変更</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td data-label="日時">{when(r.at)}</td>
                <td data-label="だれが">{r.user_name ?? r.user_id ?? '—'}</td>
                <td data-label="対象">{TABLE_LABEL[String(r.table_name)] ?? r.table_name}（{r.row_id}）{r.action === 'INSERT' ? '追加' : r.action === 'DELETE' ? '削除' : '変更'}</td>
                <td data-label="変更" className={s.diff}>
                  {diffRows(r.before_row, r.after_row).map((d) => (
                    <div key={d.key}>
                      {d.key}：<del>{show(d.from)}</del> → <ins>{show(d.to)}</ins>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
