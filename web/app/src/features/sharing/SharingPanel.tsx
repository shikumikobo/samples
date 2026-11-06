'use client';
import { useState } from 'react';
import { usePermissions, useRows, write } from '../shared/data';
import s from '../shared/ui.module.css';

const ROLE_LABEL: Record<string, string> = { customer: 'お客さん', partner: '協力業者' };

/** 現場ごとの、外部（お客さん・協力業者）への許可。付け外しは site.edit か file.manage のある人だけ。外した瞬間に外部の画面から消える。 */
export function SharingPanel({ siteId }: { siteId: string }) {
  const { can, ready } = usePermissions();
  const given = useRows(
    'select a.user_id, u.name, u.role, u.title from site_access a join app_users u on u.id = a.user_id where a.site_id = $1 order by u.role, u.id',
    [siteId],
  );
  const externals = useRows("select id, name, role, title from app_users where role in ('customer', 'partner') and active order by role, id", []);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  if (!ready || given.rows === null || externals.rows === null) return <p className={s.muted}>読み込んでいます…</p>;

  const editable = can('site.edit') || can('file.manage');
  const givenIds = new Set(given.rows.map((r) => String(r.user_id)));
  const candidates = externals.rows.filter((u) => !givenIds.has(String(u.id)));

  const act = async (sql: string, params: unknown[]) => {
    if (!given.user) return;
    const r = await write(given.user, sql, params);
    setMsg(r.ok ? null : r.message ?? '変更できませんでした');
    if (r.ok) given.reload();
  };

  return (
    <div>
      <p className={s.muted}>ここに入れた外部の人は、この現場の「共有されたもの」だけを専用ページで見られます。外すとすぐ見えなくなります。</p>
      {msg && <p className={s.error}>{msg}</p>}
      {given.rows.length === 0 ? (
        <p className={s.muted}>この現場は、まだ外部に共有していません。</p>
      ) : (
        <table className={`${s.table} ${s.stack}`}>
          <thead>
            <tr><th>名前</th><th>区分</th><th /></tr>
          </thead>
          <tbody>
            {given.rows.map((u) => (
              <tr key={u.user_id}>
                <td data-label="名前">{u.name}{u.title ? `（${u.title}）` : ''}</td>
                <td data-label="区分"><span className={s.badge}>{ROLE_LABEL[String(u.role)] ?? u.role}</span></td>
                <td>
                  {editable && (
                    <button type="button" className={`${s.btn} ${s.btnGhost}`} onClick={() => act('delete from site_access where site_id = $1 and user_id = $2', [siteId, u.user_id])}>
                      共有をやめる
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editable && (
        <div className={s.row}>
          <select className={s.input} style={{ maxWidth: 320 }} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="共有する外部の人">
            <option value="">共有する人を選ぶ</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name}（{ROLE_LABEL[String(u.role)] ?? u.role}）</option>
            ))}
          </select>
          <button
            type="button"
            className={s.btn}
            disabled={!pick}
            onClick={async () => {
              await act('insert into site_access (site_id, user_id) values ($1, $2)', [siteId, pick]);
              setPick('');
            }}
          >
            共有する
          </button>
        </div>
      )}
    </div>
  );
}
