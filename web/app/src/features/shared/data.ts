'use client';
// 画面A（現場・見積・ファイル・履歴・共有）が使う、DB の読み書きの入口。
// lib/db・lib/auth の形に合わせるのは、このファイルだけ（他の画面部品はここを通す）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { withRole } from '@/lib/db';
import { useSession } from '@/lib/auth';

export type Row = Record<string, any>;
export type SessionUser = { id: string; role: string; name?: string };

/** 今の役割で SQL を実行する（RLS が効く）。 */
export async function run(user: SessionUser, sql: string, params: unknown[] = []): Promise<Row[]> {
  return withRole(user as any, async (db: any) => {
    const res = await db.query(sql, params);
    return (res?.rows ?? res ?? []) as Row[];
  });
}

/** 今ログインしている（役割を選んだ）利用者。なければ null。 */
export function useUser(): SessionUser | null {
  const s: any = useSession();
  return (s?.user ?? null) as SessionUser | null;
}

/** SQL を実行して結果を持つ。条件が変わる／reload() で読み直す。 */
export function useRows(sql: string, params: unknown[], enabled = true) {
  const user = useUser();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = JSON.stringify(params) + sql + (user?.id ?? '') + (user?.role ?? '');
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!user || !enabled) return;
    const n = ++seq.current;
    try {
      const r = await run(user, sql, params);
      if (n === seq.current) {
        setRows(r);
        setError(null);
      }
    } catch (e: any) {
      if (n === seq.current) {
        setRows([]);
        setError(String(e?.message ?? e));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);
  return { rows, error, reload: load, user };
}

/** 今の役割が持つ権限の一覧（DB の has_permission() の結果。画面は結果を信じる）。 */
export function usePermissions() {
  const { rows } = useRows('select code from permissions where has_permission(code)', []);
  const set = new Set((rows ?? []).map((r) => String(r.code)));
  return { ready: rows !== null, can: (code: string) => set.has(code) };
}

/** 書き込み。0 行しか変わらなかったとき（RLS で止められたとき）は ok:false を返す。 */
export async function write(
  user: SessionUser,
  sql: string,
  params: unknown[] = [],
): Promise<{ ok: boolean; message?: string }> {
  try {
    const rows = await run(user, sql + ' returning 1 as ok', params);
    return rows.length > 0 ? { ok: true } : { ok: false, message: 'この役割では変更できません（DB が止めました）' };
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) };
  }
}

export const yen = (n: unknown) => (n === null || n === undefined ? '—' : `${Number(n).toLocaleString('ja-JP')} 円`);
export const day = (d: unknown) => {
  if (!d) return '—';
  const x = d instanceof Date ? d : new Date(String(d));
  return Number.isNaN(x.getTime()) ? String(d) : `${x.getMonth() + 1}/${x.getDate()}`;
};
