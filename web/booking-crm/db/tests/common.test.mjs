// サロン用・教室用の両方のデータで、同じ決まりが通ることを確かめる（予約の決まり・体験・期限・権限・履歴・販売促進）。
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, errorOf, at, rows } from './helpers.mjs';

const CFGS = {
  salon: {
    main: 'sv1', trial: 'sv_trial',
    free: [['st1', at(1, '10:00'), null], ['st1', at(1, '12:00'), null], ['st1', at(1, '16:00'), null]], // c6 が同じ日に取れる3つ
    late: ['st1', at(0, '10:00'), null], far: ['st1', at(61, '10:00'), null],
    trialSlot: ['st1', at(2, '10:00'), null], trialSlot2: ['st1', at(2, '14:00'), null],
    own: { id: 'r1', cust: 'c1' }, other: 'r2',          // c1 の将来の予約、c2 の将来の予約
    today: { id: 'r8', cust: 'c2' },                     // 今日の予約（期限を過ぎている）
    moveTo: ['st1', at(2, '15:00'), null],
    dueToday: [{ customer_id: 'c1', due_since_days: 2, service_id: 'sv1' }],
    dueLater: { asOf: '2026-11-21', ids: ['c1', 'c2'] },
    trialUsers: ['c4', 'c5'],                             // c3 と電話・メールが同じ
  },
  class: {
    main: 'cl1', trial: 'cl_trial',
    free: [['t1', null, 'cs1'], ['t1', null, 'cs6'], ['t1', null, 'cs7']],
    late: ['t1', null, 'cs0'], far: ['t1', null, 'cs_far'],
    trialSlot: ['t2', null, 'cs_t'], trialSlot2: ['t2', null, 'cs_t'],
    own: { id: 'r1', cust: 'c1' }, other: 'r2',
    today: { id: 'r8', cust: 'c4' },
    moveTo: ['t1', null, 'cs6'],
    dueToday: [],
    dueLater: { asOf: '2026-12-24', ids: ['c1'] },
    trialUsers: ['c4'],
  },
};

for (const [name, cfg] of Object.entries(CFGS)) {
  describe(`共通の決まり（${name}）`, () => {
    let db;
    before(async () => { db = await createDb(name); });
    beforeEach(() => db.exec('begin'));
    afterEach(() => db.exec('rollback'));

    const rv = (q, cust, svc, slot) => q('select reserve($1,$2,$3,$4::timestamptz,$5) as id', [cust, svc, slot[0], slot[1], slot[2]]);
    const book = async (cust, svc, slot, role = 'customer') =>
      as(db, role, cust, async (q) => (await rv(q, cust, svc, slot)).rows[0].id);
    const err = (fn) => errorOf(db, fn);
    const code = (m) => m?.split(':')[0];

    test('予約できる：金額・状態・終了時刻が入り、履歴に作成が残る', async () => {
      const id = await book('c6', cfg.main, cfg.free[0]);
      const r = (await db.query('select * from reservations where id=$1', [id])).rows[0];
      assert.equal(r.status, 'booked');
      assert.equal(r.customer_id, 'c6');
      assert.equal(r.is_trial, false);
      assert.ok(r.price > 0 && r.ends_at > r.starts_at);
      const h = (await db.query('select actor, action from history where reservation_id=$1', [id])).rows;
      assert.deepEqual(h, [{ actor: 'customer:c6', action: 'create' }]);
    });

    test('お店の人も予約できる（履歴の actor は shop）', async () => {
      const id = await book('c6', cfg.main, cfg.free[0], 'shop');
      const h = (await db.query('select actor from history where reservation_id=$1', [id])).rows;
      assert.deepEqual(h, [{ actor: 'shop' }]);
    });

    test('NOT_FOUND：メニュー・お客さん・担当（枠）がない', async () => {
      const f = cfg.free[0];
      assert.equal(code(await err(() => book('c6', 'nothing', f))), 'NOT_FOUND');
      assert.equal(code(await err(() => book('c6', cfg.main, f.map((x, i) => (i === (name === 'salon' ? 0 : 2) ? 'nobody' : x))))), 'NOT_FOUND');
      assert.equal(code(await err(() => book('nobody', cfg.main, f, 'shop'))), 'NOT_FOUND');
    });

    test('FORBIDDEN：お客さんは他人の名前では取れない・変えられない・消せない', async () => {
      assert.equal(code(await err(() => as(db, 'customer', 'c6', (q) => rv(q, 'c2', cfg.main, cfg.free[0])))), 'FORBIDDEN');
      for (const sql of [`select change_reservation('${cfg.own.id}', null, null, null)`, `select cancel_reservation('${cfg.own.id}')`]) {
        assert.equal(code(await err(() => as(db, 'customer', 'c6', (q) => q(sql)))), 'FORBIDDEN');
      }
      assert.equal(code(await err(() => as(db, 'customer', 'c6', (q) => q(`select cancel_reservation('zzz')`)))), 'NOT_FOUND');
    });

    test('DAY_LIMIT：同じ日に3件目は取れない（キャンセルは数えない）', async () => {
      const a = await book('c6', cfg.main, cfg.free[0]);
      await book('c6', cfg.main, cfg.free[1]);
      assert.equal(code(await err(() => book('c6', cfg.main, cfg.free[2]))), 'DAY_LIMIT');
      await as(db, 'customer', 'c6', (q) => q('select cancel_reservation($1)', [a]));
      await book('c6', cfg.main, cfg.free[2]);   // 1件キャンセルしたので取れる
    });

    test('TOO_LATE（直前）・TOO_FAR（先すぎる）', async () => {
      assert.equal(code(await err(() => book('c6', cfg.main, cfg.late))), 'TOO_LATE');
      assert.equal(code(await err(() => book('c6', cfg.main, cfg.far))), 'TOO_FAR');
    });

    test('初回限定の体験：電話またはメールが同じ人は使用済み（TRIAL_USED）', async () => {
      for (const c of cfg.trialUsers) {
        assert.equal(code(await err(() => book(c, cfg.trial, cfg.trialSlot))), 'TRIAL_USED', c);
      }
      assert.equal(code(await err(() => book('c3', cfg.trial, cfg.trialSlot))), 'TRIAL_USED');
      // c1 は未使用：取れる。取った後の2回目は取れない。キャンセルすると、また取れる
      const id = await book('c1', cfg.trial, cfg.trialSlot);
      const r = (await db.query('select is_trial from reservations where id=$1', [id])).rows[0];
      assert.equal(r.is_trial, true);
      assert.equal(code(await err(() => book('c1', cfg.trial, cfg.trialSlot2))), 'TRIAL_USED');
      await as(db, 'customer', 'c1', (q) => q('select cancel_reservation($1)', [id]));
      await book('c1', cfg.trial, cfg.trialSlot2);
    });

    test('キャンセルの期限：お客さんは前日まで。過ぎたらお店の人だけ', async () => {
      const t = cfg.today;
      assert.equal(code(await err(() => as(db, 'customer', t.cust, (q) => q('select cancel_reservation($1)', [t.id])))), 'DEADLINE_PASSED');
      assert.equal(code(await err(() => as(db, 'customer', t.cust, (q) => q('select change_reservation($1,$2,$3::timestamptz,$4)', [t.id, ...cfg.moveTo])))), 'DEADLINE_PASSED');
      await as(db, 'shop', null, (q) => q('select cancel_reservation($1)', [t.id]));
      assert.equal((await db.query('select status from reservations where id=$1', [t.id])).rows[0].status, 'canceled');
      // 前日までなら、お客さんが取り消せる（予約は明日）
      await as(db, 'customer', cfg.own.cust, (q) => q('select cancel_reservation($1)', [cfg.own.id]));
      assert.equal((await db.query('select status from reservations where id=$1', [cfg.own.id])).rows[0].status, 'canceled');
    });

    test('変更：同じ予約番号のまま新しい枠になり、履歴に change が残る', async () => {
      const { id, cust } = cfg.own;
      const got = await as(db, 'customer', cust, async (q) =>
        (await q('select change_reservation($1,$2,$3::timestamptz,$4) as id', [id, ...cfg.moveTo])).rows[0].id);
      assert.equal(got, id);
      const r = (await db.query('select * from reservations where id=$1', [id])).rows[0];
      assert.equal(r.status, 'booked');
      if (name === 'salon') assert.equal(r.starts_at.toISOString(), new Date(at(2, '15:00')).toISOString());
      else assert.equal(r.session_id, 'cs6');
      const h = (await db.query(`select action, actor from history where reservation_id=$1 order by id desc limit 1`, [id])).rows[0];
      assert.deepEqual(h, { action: 'change', actor: `customer:${cust}` });
    });

    test('来店・無断欠席はお店だけ。一度きり', async () => {
      const id = cfg.own.id;
      assert.equal(code(await err(() => as(db, 'customer', cfg.own.cust, (q) => q('select mark_visited($1)', [id])))), 'FORBIDDEN');
      await as(db, 'shop', null, (q) => q('select mark_visited($1)', [id]));
      assert.equal((await db.query('select status from reservations where id=$1', [id])).rows[0].status, 'visited');
      assert.equal(code(await err(() => as(db, 'shop', null, (q) => q('select mark_noshow($1)', [id])))), 'NOT_FOUND');
      await as(db, 'shop', null, (q) => q('select mark_noshow($1)', [cfg.other]));
      assert.equal((await db.query('select status from reservations where id=$1', [cfg.other])).rows[0].status, 'noshow');
      const acts = rows(await db.query(`select action from history where reservation_id=$1 order by id`, [id]), 'action');
      assert.deepEqual(acts.slice(-1), ['visit']);
    });

    test('権限：お客さんは自分の予約・プロフィールだけ。note・caution は読めない', async () => {
      await as(db, 'customer', 'c1', async (q) => {
        const res = await q('select distinct customer_id from reservations');
        assert.deepEqual(rows(res, 'customer_id'), ['c1']);
        assert.deepEqual(rows(await q('select id from customers'), 'id'), ['c1']);
        assert.deepEqual(rows(await q('select id from customers where id=$1', ['c2']), 'id'), []);
      });
      for (const sql of ['select note from customers', 'select caution from customers', 'select * from customers']) {
        const m = await err(() => as(db, 'customer', 'c1', (q) => q(sql)));
        assert.match(m ?? '', /permission denied/, sql);
      }
      // 自分のプロフィールは書き換えられるが、他人のは 0 行
      await as(db, 'customer', 'c1', async (q) => {
        assert.equal((await q(`update customers set phone='090-0000-9999' where id='c1'`)).affectedRows, 1);
        assert.equal((await q(`update customers set phone='090-0000-9999' where id='c2'`)).affectedRows, 0);
      });
      // 予約や履歴を直接は書けない
      assert.match(await err(() => as(db, 'customer', 'c1', (q) => q(`update reservations set status='canceled'`))) ?? '', /permission denied/);
      assert.match(await err(() => as(db, 'customer', 'c1', (q) => q(`delete from reservations`))) ?? '', /permission denied/);
      assert.match(await err(() => as(db, 'customer', 'c1', (q) => q(`insert into history (at,actor,action,reservation_id) values (now(),'x','y','z')`))) ?? '', /permission denied/);
      // 履歴は自分の予約のぶんだけ
      await as(db, 'customer', 'c1', async (q) => {
        const hs = await q('select distinct reservation_id from history');
        const mine = rows(await q('select id from reservations'), 'id');
        assert.ok(hs.rows.length > 0 && rows(hs, 'reservation_id').every((x) => mine.includes(x)));
      });
    });

    test('権限：お店の人はすべて読める。note・caution も', async () => {
      await as(db, 'shop', null, async (q) => {
        const c1 = (await q(`select note, caution from customers where id='c1'`)).rows[0];
        assert.ok(c1.note && c1.caution);
        assert.equal((await q('select count(*)::int n from customers')).rows[0].n, 6);
        assert.ok((await q('select count(*)::int n from reservations')).rows[0].n >= 5);
      });
    });

    test('権限：販売促進の一覧はお店だけ', async () => {
      assert.equal(code(await err(() => as(db, 'customer', 'c1', (q) => q(`select * from due_for_return('2026-11-09')`)))), 'FORBIDDEN');
    });

    test('history は更新・削除できない。予約も消せない', async () => {
      assert.equal(code(await err(() => db.query(`update history set actor='x'`))), 'FORBIDDEN');
      assert.equal(code(await err(() => db.query(`delete from history`))), 'FORBIDDEN');
      assert.equal(code(await err(() => db.query(`truncate history`))), 'FORBIDDEN');
      assert.equal(code(await err(() => db.query(`delete from reservations`))), 'FORBIDDEN');
      assert.match(await err(() => as(db, 'shop', null, (q) => q(`update history set actor='x'`))) ?? '', /permission denied/);
    });

    test('保存後の修正：状態をどれからどれへも直せる（お店だけ）。メモは別に書ける。どれも履歴に残る', async () => {
      const id = cfg.own.id;
      const shop = (sql, params) => as(db, 'shop', null, (q) => q(sql, params));
      const last = async () => (await db.query(`select action, actor, before, after from history where reservation_id=$1 order by id desc limit 1`, [id])).rows[0];
      const n = async () => (await db.query(`select count(*)::int n from history where reservation_id=$1`, [id])).rows[0].n;
      // お客さんは使えない
      assert.equal(code(await err(() => as(db, 'customer', cfg.own.cust, (q) => q(`select set_reservation_status($1, 'visited')`, [id])))), 'FORBIDDEN');
      assert.equal(code(await err(() => as(db, 'customer', cfg.own.cust, (q) => q(`select set_reservation_note($1, 'x')`, [id])))), 'FORBIDDEN');
      // 来店済み → 予約済みに戻す（restore）
      await shop('select mark_visited($1)', [id]);
      await shop(`select set_reservation_status($1, 'booked')`, [id]);
      assert.equal((await db.query('select status from reservations where id=$1', [id])).rows[0].status, 'booked');
      assert.equal((await last()).action, 'restore');
      // 同じ状態・メモなしは何もしない（履歴を増やさない）
      const before = await n();
      await shop(`select set_reservation_status($1, 'booked')`, [id]);
      assert.equal(await n(), before);
      // メモだけ（update）
      await shop(`select set_reservation_note($1, '次回の希望をうかがった')`, [id]);
      let h = await last();
      assert.equal(h.action, 'update');
      assert.equal(h.after.note, '次回の希望をうかがった');
      assert.equal(h.before.note, '');
      // 無断欠席 → 来店済み（visit）
      await shop(`select set_reservation_status($1, 'noshow')`, [id]);
      assert.equal((await last()).action, 'noshow');
      await shop(`select set_reservation_status($1, 'visited')`, [id]);
      assert.equal((await last()).action, 'visit');
      // キャンセルの理由を、状態と同時に書く（cancel）
      await shop(`select set_reservation_status($1, 'canceled', '体調不良のため')`, [id]);
      h = await last();
      assert.equal(h.action, 'cancel');
      assert.equal(h.after.note, '体調不良のため');
      // 枠が空いていれば、キャンセルからも戻せる。メモはそのまま残る
      await shop(`select set_reservation_status($1, 'booked')`, [id]);
      const r = (await db.query('select status, note from reservations where id=$1', [id])).rows[0];
      assert.deepEqual(r, { status: 'booked', note: '体調不良のため' });
      assert.equal((await last()).action, 'restore');
      // 正しくない状態・ない予約
      assert.equal(code(await err(() => shop(`select set_reservation_status($1, 'foo')`, [id]))), 'NOT_FOUND');
      assert.equal(code(await err(() => shop(`select set_reservation_status('nope', 'booked')`))), 'NOT_FOUND');
      assert.equal(code(await err(() => shop(`select set_reservation_note('nope', 'x')`))), 'NOT_FOUND');
    });

    test('キャンセルから戻すとき、元の枠がもう埋まっていれば SLOT_TAKEN（元のまま）', async () => {
      const id = cfg.own.id;
      const shop = (sql, params) => as(db, 'shop', null, (q) => q(sql, params));
      await shop(`select set_reservation_status($1, 'canceled', '日程が合わず')`, [id]);
      // 同じ枠に、別の人の予約を入れる（教室は、そのぶんで満席にする）
      const r = (await db.query('select * from reservations where id=$1', [id])).rows[0];
      const other = (await db.query(`select id from customers where id <> $1 order by id limit 1`, [r.customer_id])).rows[0].id;
      await db.query(
        `insert into reservations (id, customer_id, service_id, staff_id, session_id, starts_at, ends_at, price, is_trial, status, created_at)
         values ('rX', $1, $2, $3, $4, $5, $6, $7, false, 'booked', now())`,
        [other, r.service_id, r.staff_id, r.session_id, r.starts_at, r.ends_at, r.price],
      );
      if (r.session_id) await db.query(`update class_sessions set capacity = (select count(*) from reservations where session_id=$1 and status <> 'canceled') where id=$1`, [r.session_id]);
      assert.equal(code(await err(() => shop(`select set_reservation_status($1, 'booked')`, [id]))), 'SLOT_TAKEN');
      assert.equal((await db.query('select status from reservations where id=$1', [id])).rows[0].status, 'canceled');
      // キャンセルのまま、来店済み・無断欠席にはできない（戻すのと同じ確認）
      assert.equal(code(await err(() => shop(`select set_reservation_status($1, 'visited')`, [id]))), 'SLOT_TAKEN');
      // キャンセルのままメモだけ直すのはできる
      await shop(`select set_reservation_note($1, '理由を書き直した')`, [id]);
      assert.equal((await db.query('select note from reservations where id=$1', [id])).rows[0].note, '理由を書き直した');
    });

    test('お客さん本人のキャンセルの理由：メモに「【お客さんの理由】」つきで足される（既存のメモは残る）。お客さんは読めない', async () => {
      const id = cfg.own.id;
      await as(db, 'shop', null, (q) => q(`select set_reservation_note($1, 'お店のメモ')`, [id]));
      await as(db, 'customer', cfg.own.cust, (q) => q('select cancel_reservation($1, $2)', [id, '予定が合わなくなった']));
      const r = (await db.query('select status, note from reservations where id=$1', [id])).rows[0];
      assert.equal(r.status, 'canceled');
      assert.equal(r.note, 'お店のメモ\n【お客さんの理由】予定が合わなくなった');
      assert.match(await err(() => as(db, 'customer', cfg.own.cust, (q) => q('select note from reservations'))) ?? '', /permission denied/);
      // 理由なし（答えない）は、メモを変えない
      const id2 = cfg.other;
      const c2 = (await db.query('select customer_id from reservations where id=$1', [id2])).rows[0].customer_id;
      await as(db, 'customer', c2, (q) => q('select cancel_reservation($1)', [id2]));
      assert.equal((await db.query('select note from reservations where id=$1', [id2])).rows[0].note, '');
    });

    test('お店のキャンセルの理由は、そのままメモに足される', async () => {
      const id = cfg.own.id;
      await as(db, 'shop', null, (q) => q('select cancel_reservation($1, $2)', [id, '電話で取り消し']));
      assert.equal((await db.query('select note from reservations where id=$1', [id])).rows[0].note, '電話で取り消し');
    });

    test('電話番号の重複の確認：数字だけにして比べる。空は確認しない。お店だけが使える', async () => {
      const c = (await db.query(`select id, phone from customers where active and phone <> '' order by created_at, id limit 1`)).rows[0];
      const find = (p) => as(db, 'shop', null, async (q) => (await q('select find_customer_by_phone($1) as id', [p])).rows[0].id);
      assert.equal(await find(c.phone), c.id);
      const digits = c.phone.replace(/[^0-9]/g, '');
      assert.equal(await find(digits), c.id);
      assert.equal(await find(`${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`), c.id);
      assert.equal(await find('09099990000'), null);
      assert.equal(await find(''), null);
      assert.equal(await find(null), null);
      // やめたお客さん（active でない）は数えない
      await db.query('update customers set active = false where id=$1', [c.id]);
      const again = await find(c.phone);
      assert.notEqual(again, c.id);
      assert.equal(code(await err(() => as(db, 'customer', cfg.own.cust, (q) => q('select find_customer_by_phone($1)', [c.phone])))), 'FORBIDDEN');
    });

    test('権限：お客さんは、予約の note と、履歴の before/after（note を含む）を読めない', async () => {
      const id = cfg.own.id;
      await as(db, 'shop', null, (q) => q(`select set_reservation_note($1, '内緒のメモ')`, [id]));
      for (const sql of ['select note from reservations', 'select * from reservations', 'select before from history', 'select after from history', 'select * from history']) {
        const m = await err(() => as(db, 'customer', cfg.own.cust, (q) => q(sql)));
        assert.match(m ?? '', /permission denied/, sql);
      }
      // 列を指定すれば、これまでどおり読める
      await as(db, 'customer', cfg.own.cust, async (q) => {
        assert.ok((await q('select id, status, starts_at from reservations')).rows.length > 0);
        assert.ok((await q('select action, at from history')).rows.length > 0);
      });
      const shopSees = await as(db, 'shop', null, (q) => q('select note from reservations where id=$1', [id]));
      assert.equal(shopSees.rows[0].note, '内緒のメモ');
    });

    test('due_for_return：最後の来店から目安の日数を過ぎた人（過ぎた日数が多い順）', async () => {
      const r = await as(db, 'shop', null, (q) => q(`select * from due_for_return('2026-11-09')`));
      assert.deepEqual(r.rows.map(({ customer_id, due_since_days, service_id }) => ({ customer_id, due_since_days, service_id })), cfg.dueToday);
      const later = await as(db, 'shop', null, (q) => q(`select customer_id from due_for_return($1::date)`, [cfg.dueLater.asOf]));
      assert.deepEqual(rows(later, 'customer_id').sort(), cfg.dueLater.ids);
    });
  });
}
