'use client';
import { AppShell } from '@/components/AppShell';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth';
import { withRole } from '@/lib/db';
import { useRedirectExternal } from '@/features/portal/useRedirectExternal';
import styles from './users.module.css';

type U = { id: string; name: string; role: string; title: string | null; email: string | null; active: boolean };

const ROLE_LABEL: Record<string, string> = {
  owner: '社長（管理者）', staff: '社員', worker: '職人', customer: 'お客さん', partner: '協力業者',
};
const ROLES = Object.keys(ROLE_LABEL);

function UsersBody() {
  const { user } = useSession();
  const external = useRedirectExternal(user?.role);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<U[]>([]);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await withRole(user, async (db) => {
        const ok = (await db.query<{ ok: boolean }>("select has_permission('user.manage') as ok")).rows[0]?.ok === true;
        const list = ok
          ? (await db.query<U>('select id, name, role::text as role, title, email, active from app_users order by id')).rows
          : [];
        return { ok, list };
      });
      setAllowed(r.ok);
      setRows(r.list);
    } catch (e: any) {
      setMsg(`読み込めませんでした：${e?.message ?? e}`);
    }
  }, [user]);

  useEffect(() => { if (!external) load(); }, [external, load]);

  async function update(id: string, col: 'role' | 'active', value: string | boolean) {
    if (!user) return;
    setMsg('');
    try {
      await withRole(user, async (db) => {
        // 権限の判定は DB（RLS）。許されなければ 0 行で、変わらない
        const sql = col === 'role'
          ? 'update app_users set role = $1::app_role where id = $2'
          : 'update app_users set active = $1::boolean where id = $2';
        await db.query(sql, [value, id]);
      });
      await load();
      setMsg('変更しました（変更の履歴に残ります）');
    } catch (e: any) {
      setMsg(`変更できませんでした：${e?.message ?? e}`);
    }
  }

  if (!user || external) return null;
  if (allowed === null) return <div className={styles.page}><p>読み込んでいます…</p></div>;
  if (!allowed)
    return (
      <div className={styles.page}>
        <h1>ユーザー管理</h1>
        <p role="alert" className={styles.denied}>権限がありません。ユーザー管理は社長（管理者）だけが使えます。</p>
      </div>
    );

  return (
    <div className={styles.page}>
      <h1>ユーザー管理</h1>
      <p className={styles.lead}>役割の変更と、有効／無効の切り替えができます（社長のみ）。消さずに「無効」にします。</p>
      {msg && <p role="status" className={styles.msg}>{msg}</p>}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>ID</th><th>名前</th><th>役割</th><th>肩書き・所属</th><th>状態</th></tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const self = u.id === user.id;
              return (
                <tr key={u.id} className={u.active ? '' : styles.off}>
                  <td data-label="ID">{u.id}</td>
                  <td data-label="名前">{u.name}{self && <span className={styles.me}>（自分）</span>}</td>
                  <td data-label="役割">
                    <select
                      value={u.role}
                      disabled={self}
                      aria-label={`${u.name}の役割`}
                      onChange={(e) => update(u.id, 'role', e.target.value)}
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td data-label="肩書き・所属">{u.title ?? ''}</td>
                  <td data-label="状態">
                    <button type="button" disabled={self} onClick={() => update(u.id, 'active', !u.active)}>
                      {u.active ? '有効（無効にする）' : '無効（有効にする）'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AppShell>
      <UsersBody />
    </AppShell>
  );
}
