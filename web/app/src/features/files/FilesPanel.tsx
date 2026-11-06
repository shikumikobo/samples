'use client';
import { useState } from 'react';
import { day, usePermissions, useRows, write } from '../shared/data';
import s from '../shared/ui.module.css';

export const VISIBILITY: Record<string, string> = {
  internal: '社内のみ',
  customer: 'お客さんに共有',
  partner: '協力業者に共有',
  both: 'お客さんと協力業者に共有',
};

/** 現場のファイル。見える・見えないは DB（RLS）が決める。共有先の付け外しは file.manage のある人だけ。 */
export function FilesPanel({ siteId }: { siteId: string }) {
  const { can, ready } = usePermissions();
  const { rows, reload, user, error } = useRows(
    'select id, name, kind, path, visibility, created_at from files where site_id = $1 order by created_at desc, id',
    [siteId],
  );
  const [msg, setMsg] = useState<string | null>(null);
  if (!ready || rows === null) return <p className={s.muted}>読み込んでいます…</p>;

  const change = async (id: string, visibility: string) => {
    if (!user) return;
    const r = await write(user, 'update files set visibility = $1::file_visibility where id = $2', [visibility, id]);
    setMsg(r.ok ? null : r.message ?? '変更できませんでした');
    if (r.ok) reload();
  };

  return (
    <div>
      {error && <p className={s.error}>{error}</p>}
      {msg && <p className={s.error}>{msg}</p>}
      {rows.length === 0 ? (
        <p className={s.muted}>見られるファイルはありません。</p>
      ) : (
        <table className={`${s.table} ${s.stack}`}>
          <thead>
            <tr>
              <th>ファイル</th>
              <th>種類</th>
              <th>共有先</th>
              <th>登録日</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr key={f.id}>
                <td data-label="ファイル">
                  <a className={s.link} href={'/' + f.path.replace(/^\/?public\//, '').replace(/^\//, '')} target="_blank" rel="noreferrer">{f.name}</a>
                </td>
                <td data-label="種類">{f.kind}</td>
                <td data-label="共有先">
                  {can('file.manage') ? (
                    <select
                      className={s.input}
                      value={String(f.visibility)}
                      onChange={(e) => change(String(f.id), e.target.value)}
                      aria-label={`${f.name} の共有先`}
                    >
                      {Object.entries(VISIBILITY).map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={s.badge}>{VISIBILITY[String(f.visibility)] ?? f.visibility}</span>
                  )}
                </td>
                <td data-label="登録日">{day(f.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
