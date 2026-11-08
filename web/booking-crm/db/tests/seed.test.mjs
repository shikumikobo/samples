// 架空のデータ（db/seed_*.sql。data/*.json から scripts/make-seed.mjs が作る）が入り、同じ決まりで動くこと。
// seed_*.sql がまだないときは、そのぶんだけ飛ばす。
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createDb, as, errorOf, dbDir } from './helpers.mjs';
import { buildSeed } from '../../scripts/make-seed.mjs';

describe('make-seed：day_offset と time を demo_today 基準の日付に直す', () => {
  const sql = buildSeed({
    settings: [{ key: 'demo_today', value: '2026-11-09' }],
    services: [{ id: 's', name: 'x', duration_min: 45, price: 100 }],
    staff: [{ id: 'a', name: 'a' }],
    staff_hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ staff_id: 'a', weekday, open_time: '09:00', close_time: '20:00' })),
    customers: [{ id: 'c', name: 'c', email: null, created_day_offset: -2, created_time: '09:30' }],
    reservations: [
      { id: 'r1', customer_id: 'c', service_id: 's', staff_id: 'a', day_offset: -1, time: '23:30', status: 'visited' },
      { id: 'r2', customer_id: 'c', service_id: 's', staff_id: 'a', day_offset: 52, time: '10:00', end_time: '11:00' },
    ],
  }, 't');
  test('日付・終了時刻（所要時間から）・日またぎ・作成日時', () => {
    assert.match(sql, /'2026-11-08 23:30:00\+09:00'::timestamptz, '2026-11-09 00:15:00\+09:00'::timestamptz/);
    assert.match(sql, /'2026-12-31 10:00:00\+09:00'::timestamptz, '2026-12-31 11:00:00\+09:00'::timestamptz/);
    assert.match(sql, /'2026-11-07 09:30:00\+09:00'::timestamptz/);
  });
  test('履歴は予約から作る（作成と来店）', () => {
    assert.equal((sql.match(/'create'/g) || []).length, 2);
    assert.equal((sql.match(/'visit'/g) || []).length, 1);
  });
  test('seed のあとに reserve を呼んでも予約番号がぶつからない', async () => {
    const db = await createDb(sql);
    await db.exec('begin');
    const id = (await db.query(`select reserve('c','s','a','2026-11-20 10:00+09',null) as id`)).rows[0].id;
    assert.match(id, /^R\d+$/);
  });
});

for (const [name, expectDue] of [['salon', null], ['class', null]]) {
  const file = path.join(dbDir, `seed_${name}.sql`);
  describe(`架空のデータ（${name}）`, { skip: !existsSync(file) && 'seed がまだありません' }, () => {
    let db;
    before(async () => { db = await createDb('real:' + name); });
    beforeEach(() => db.exec('begin'));
    afterEach(() => db.exec('rollback'));
    const one = async (sql, p) => (await db.query(sql, p)).rows[0];
    const code = (m) => m?.split(':')[0];

    test('量：サービス・担当・顧客25・予約60、履歴は予約より多い', async () => {
      assert.equal((await one('select count(*)::int n from customers')).n, 25);
      assert.equal((await one('select count(*)::int n from reservations')).n, 60);
      assert.ok((await one('select count(*)::int n from services')).n >= 6);
      assert.equal((await one('select count(*)::int n from staff')).n, 3);
      assert.ok((await one('select count(*)::int n from history')).n >= 60);
      assert.equal((await one(`select value from settings where key='mode'`)).value, name);
      assert.equal((await one('select demo_today()::text d')).d, '2026-11-09');
    });

    test('サービスごとに空き枠があり、出た枠は誰かが予約できて、同じ人は同じ枠を二度取れない', async () => {
      const svcs = (await db.query('select id from services where active order by sort')).rows;
      const custs = (await db.query('select id from customers order by id')).rows.map((r) => r.id);
      const call = (c, id, s) => errorOf(db, () => as(db, 'shop', null, (q) => q('select reserve($1,$2,$3,$4::timestamptz,$5)', [c, id, s.staff_id, s.starts_at, s.session_id])));
      let booked = 0;
      for (const { id } of svcs) {
        const s = (await db.query(`select * from available_slots($1,null,'2026-11-09','2026-12-31') where remaining > 0 limit 1`, [id])).rows[0];
        if (!s) continue;
        let who = null;
        for (const c of custs) if (!(await call(c, id, s))) { who = c; break; }
        if (!who) continue;
        booked++;
        assert.match(code(await call(who, id, s)), /^(TRIAL_USED|DAY_LIMIT|SLOT_FULL)$/);   // 体験・同じ日の件数が先に当たることがある
      }
      assert.ok(booked >= svcs.length - 1, `予約できたサービス ${booked} / ${svcs.length}`);
    });

    test('そろそろ来店の一覧が出る（3〜8人）', async () => {
      const n = (await as(db, 'shop', null, (q) => q(`select * from due_for_return('2026-11-09')`))).rows.length;
      assert.ok(n >= 3 && n <= 8, `n=${n}`);
    });

    test('お客さんが見える予約は自分のだけ。note は読めない', async () => {
      const c = (await one('select customer_id from reservations limit 1')).customer_id;
      await as(db, 'customer', c, async (q) => {
        const r = await q('select distinct customer_id from reservations');
        assert.deepEqual(r.rows.map((x) => x.customer_id), [c]);
      });
      assert.match(await errorOf(db, () => as(db, 'customer', c, (q) => q('select note from customers'))) ?? '', /permission denied/);
    });

    test('予約の重なり・定員超えがデータにない', async () => {
      const overlap = await one(`select count(*)::int n from reservations a join reservations b
        on a.staff_id=b.staff_id and a.id<b.id and a.session_id is null and b.session_id is null
        and a.status<>'canceled' and b.status<>'canceled' and tstzrange(a.starts_at,a.ends_at) && tstzrange(b.starts_at,b.ends_at)`);
      assert.equal(overlap.n, 0);
      const over = await one(`select count(*)::int n from class_sessions cs where cs.capacity <
        (select count(*) from reservations r where r.session_id=cs.id and r.status<>'canceled')`);
      assert.equal(over.n, 0);
    });
  });
}
