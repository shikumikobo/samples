'use client';
// 役割 × 権限の表を DB から読み、can('finance.view') を返す。判定の本体は DB（RLS）。画面は出し分けるだけ。
import { useEffect, useState } from 'react';
import { readPublic, type AppRole } from '@/lib/db';

/** 役割の権限コードの一覧 */
export async function loadPermissions(role: AppRole): Promise<string[]> {
  const rows = await readPublic<{ permission: string }>(`select permission from role_permissions where role = $1::app_role`, [role]);
  return rows.map((r) => r.permission);
}

export function useCan(role: AppRole | undefined): { can: (code: string) => boolean; ready: boolean } {
  const [codes, setCodes] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    setCodes(null);
    if (role) loadPermissions(role).then((c) => live && setCodes(c)).catch(() => live && setCodes([]));
    return () => {
      live = false;
    };
  }, [role]);
  return { can: (code) => !!codes?.includes(code), ready: codes !== null };
}
