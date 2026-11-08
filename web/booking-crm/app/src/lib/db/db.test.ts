// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createDb, demoNow, q, resetDemo, withRole } from './index';
import { errorCode } from '../errors';

// 実際の db/*.sql と seed を、メモリ上の DB に流して確かめる（withRole はメモリ上の DB を使う）
describe('db（seed 込み）', () => {
  it('サロンの seed が入り、設定の mode と、デモの今が決まっている', async () => {
    await withRole('shop', null, async (tx) => {
      expect((await q<{ value: string }>(tx, `select value from settings where key = 'mode'`))[0].value).toBe('salon');
      expect((await q<{ n: number }>(tx, 'select count(*)::int as n from customers'))[0].n).toBeGreaterThanOrEqual(20);
      expect(await demoNow(tx)).toMatch(/^2026-11-09T\d\d:\d\d:\d\d\+09:00$/);
    });
  }, 60000);

  it('customer は自分の予約だけ見える', async () => {
    const mine = await withRole('customer', 'c01', (tx) => q<{ customer_id: string }>(tx, 'select customer_id from reservations'));
    expect(mine.length).toBeGreaterThan(0);
    expect(new Set(mine.map((r) => r.customer_id))).toEqual(new Set(['c01']));
    const all = await withRole('shop', null, (tx) => q(tx, 'select id from reservations'));
    expect(all.length).toBeGreaterThan(mine.length);
  });

  it('customer は customers の全部の列（note・caution）を読めない', async () => {
    await expect(withRole('customer', 'c01', (tx) => q(tx, 'select * from customers'))).rejects.toThrow(/permission denied/);
    const ok = await withRole('customer', 'c01', (tx) => q<{ id: string }>(tx, 'select id, name from customers'));
    expect(ok.map((r) => r.id)).toEqual(['c01']);
  });

  it('shop で reserve が呼べて、同じ枠は二重に取れない', async () => {
    const r = await withRole('shop', null, async (tx) => {
      const svc = (await q<{ id: string }>(tx, `select id from services where kind = 'timed' and not is_trial and active order by sort limit 1`))[0].id;
      const slots = await q<{ staff_id: string; starts_at: string; session_id: string | null }>(
        tx,
        `select staff_id, starts_at, session_id from available_slots($1, null, '2026-11-12', '2026-11-12') order by starts_at limit 1`,
        [svc],
      );
      expect(slots.length).toBe(1);
      const id = (await q<{ reserve: string }>(tx, 'select reserve($1,$2,$3,$4,$5) as reserve', ['c25', svc, slots[0].staff_id, slots[0].starts_at, null]))[0].reserve;
      expect(id).toBeTruthy();
      return { svc, slot: slots[0] };
    });
    let err: unknown = null;
    try {
      await withRole('shop', null, (tx) => q(tx, 'select reserve($1,$2,$3,$4,$5)', ['c24', r.svc, r.slot.staff_id, r.slot.starts_at, null]));
    } catch (e) {
      err = e;
    }
    expect(errorCode(err)).toBe('SLOT_FULL');
  });

  it('教室のモードに切り替えると、教室の seed で作り直される', async () => {
    await resetDemo('class');
    await withRole('shop', null, async (tx) => {
      expect((await q<{ value: string }>(tx, `select value from settings where key = 'mode'`))[0].value).toBe('class');
      expect((await q<{ n: number }>(tx, 'select count(*)::int as n from class_sessions'))[0].n).toBeGreaterThan(0);
    });
    await resetDemo('salon');
    await withRole('shop', null, async (tx) => {
      expect((await q<{ n: number }>(tx, 'select count(*)::int as n from class_sessions'))[0].n).toBe(0);
    });
  }, 60000);

  it('createDb は教室のモードでも作れる', async () => {
    const db = await createDb('class');
    expect((await db.query<{ mode: string }>('select mode from _demo_ready')).rows[0].mode).toBe('class');
    await db.close();
  }, 60000);
});
