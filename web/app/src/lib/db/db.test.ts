// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDb } from './index';

// ブラウザの外（メモリ上）で DB を起こし、定義と RLS が withRole と同じやり方で効くかを確かめる
describe('ブラウザ内 DB の起動と権限', () => {
  it('定義が流れ、権限の表が入っている', async () => {
    const db = await createDb('memory://');
    const r = await db.query<{ n: number }>('select count(*)::int as n from role_permissions');
    expect(r.rows[0].n).toBeGreaterThan(0);
  }, 60000);

  it('職人（E-04）は担当の現場だけ見え、金額の表は見えない', async () => {
    const db = await createDb('memory://');
    const run = async <T,>(user: string, role: string, sql: string) =>
      db.transaction(async (tx) => {
        await tx.query(`set local role app_user`);
        await tx.query(`select set_config('app.user_id','${user}',true), set_config('app.role','${role}',true)`);
        return (await tx.query<T>(sql)).rows;
      });
    const all = (await db.query<{ n: number }>('select count(*)::int as n from sites')).rows[0].n;
    const mine = await run<{ staff_id: string }>('E-04', 'worker', 'select staff_id from sites');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(all);
    expect(mine.every((x) => x.staff_id === 'E-04')).toBe(true);
    expect(await run('E-04', 'worker', 'select 1 from site_finance')).toHaveLength(0);
    expect((await run('E-01', 'owner', 'select 1 from site_finance')).length).toBeGreaterThan(0);
  }, 60000);
});
