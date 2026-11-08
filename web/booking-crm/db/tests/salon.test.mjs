// サロン（時間で取る）：重なり・隣り合う枠・所要時間・営業時間・休み・変更
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, errorOf, at } from './helpers.mjs';

describe('サロン', () => {
  let db;
  before(async () => { db = await createDb('salon'); });
  beforeEach(() => db.exec('begin'));
  afterEach(() => db.exec('rollback'));

  const code = (m) => m?.split(':')[0];
  const rv = (cust, svc, staff, start, role = 'customer') =>
    as(db, role, cust, async (q) => (await q('select reserve($1,$2,$3,$4::timestamptz,null) as id', [cust, svc, staff, start])).rows[0].id);
  const err = (fn) => errorOf(db, fn);
  const slots = async (svc, staff, day) =>
    (await db.query(`select to_char(starts_at at time zone 'Asia/Tokyo','HH24:MI') t from available_slots($1,$2,$3::date,$3::date) order by 1`, [svc, staff, day])).rows.map((r) => r.t);
  const startOf = async (id) => new Date((await db.query('select starts_at from reservations where id=$1', [id])).rows[0].starts_at).toISOString();
  const iso = (t) => new Date(t).toISOString();

  test('重なる時間は取れない（SLOT_FULL）。途中から重なる・包み込むも同じ', async () => {
    // r1: 11:00-12:00（ジェル60分）
    for (const t of ['10:15', '10:30', '11:00', '11:15', '11:45']) {
      assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, t)))), 'SLOT_FULL', t);
    }
    assert.equal(code(await err(() => rv('c6', 'sv_trial', 'st1', at(1, '10:00')))), 'SLOT_FULL'); // 体験90分は 10:00-11:30 で重なる
  });

  test('隣り合う枠は取れる（終わりと始まりが同じ）', async () => {
    await rv('c6', 'sv1', 'st1', at(1, '10:00'));   // 10:00-11:00 と 11:00-12:00
    await rv('c6', 'sv1', 'st1', at(1, '12:00'));   // 12:00-13:00
  });

  test('別の担当なら同じ時間に取れる', async () => {
    await rv('c6', 'sv1', 'st2', at(1, '11:00'));
  });

  test('キャンセルした枠は、また取れる', async () => {
    await as(db, 'shop', null, (q) => q(`select cancel_reservation('r1')`));
    await rv('c6', 'sv1', 'st1', at(1, '11:00'));
  });

  test('所要時間で枠が決まる：ケア30分は 10:30 に入るが、ジェル60分は入らない', async () => {
    await rv('c6', 'sv2', 'st1', at(1, '10:30'));   // 10:30-11:00
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, '10:15')))), 'SLOT_FULL');
  });

  test('available_slots：15分刻み。重なる枠は出ない。営業時間の終わりに収まる枠まで', async () => {
    const s = await slots('sv1', 'st1', '2026-11-10');   // 明日（火）。営業 10:00-19:00、ジェル60分
    assert.equal(s[0], '10:00');
    assert.ok(!s.includes('10:15') && !s.includes('11:00') && !s.includes('11:45') && s.includes('12:00'));
    assert.ok(s.includes('13:00') && !s.includes('13:15') && !s.includes('14:00') && s.includes('14:30'));  // r2: 14:00-14:30
    assert.equal(s.at(-1), '18:00');
    assert.ok(!s.includes('18:15'));
    const short = await slots('sv2', 'st1', '2026-11-10');  // ケア30分
    assert.ok(short.includes('10:30') && short.includes('18:30') && !short.includes('11:00') && !short.includes('18:45'));
  });

  test('available_slots：担当を null にすると全員。休みの日・定休日は出ない', async () => {
    const all = (await db.query(`select distinct staff_id from available_slots('sv1',null,'2026-11-10','2026-11-10')`)).rows.map((r) => r.staff_id);
    assert.deepEqual(all.sort(), ['st1', 'st2']);
    assert.deepEqual(await slots('sv1', 'st2', '2026-11-12'), []);   // st2 は木曜が休み（day 3）
    assert.deepEqual(await slots('sv1', null, '2026-11-15'), []);    // 日曜は営業なし
  });

  test('available_slots：直前（2時間以内）と先すぎる日は出ない', async () => {
    const today = await slots('sv2', 'st1', '2026-11-09');           // 今日 09:00 → 11:00 以降
    assert.equal(today[0], '11:00');
    assert.deepEqual(await slots('sv1', 'st1', '2027-01-09'), []);   // 61日先
    assert.ok((await slots('sv1', 'st1', '2027-01-08')).length > 0); // 60日先
  });

  test('available_slots に出た枠は、そのまま予約できて、予約すると消える', async () => {
    assert.ok((await slots('sv1', 'st1', '2026-11-10')).includes('13:00'));
    assert.ok(await rv('c6', 'sv1', 'st1', at(1, '13:00')));
    assert.ok(!(await slots('sv1', 'st1', '2026-11-10')).includes('13:00'));
  });

  test('OUT_OF_HOURS：営業時間の前・終わりをまたぐ・定休日・担当の休み・15分刻みでない', async () => {
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, '09:00')))), 'OUT_OF_HOURS');
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, '18:15')))), 'OUT_OF_HOURS');   // 19:15 で終わる
    await rv('c6', 'sv1', 'st1', at(1, '18:00'));                                                    // 19:00 ちょうどは可
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(6, '10:00')))), 'OUT_OF_HOURS');   // 日曜
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st2', at(3, '10:00')))), 'OUT_OF_HOURS');   // st2 の休み
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(2, '10:07')))), 'OUT_OF_HOURS');
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st2', at(2, '17:30')))), 'OUT_OF_HOURS');   // st2 は 18:00 まで
  });

  test('チェックの順番：TRIAL_USED → DAY_LIMIT → TOO_LATE／TOO_FAR → OUT_OF_HOURS → SLOT_FULL', async () => {
    await rv('c6', 'sv2', 'st1', at(1, '10:00'));
    await rv('c6', 'sv2', 'st1', at(1, '10:30'));
    // 同じ日に2件あれば、営業時間の外でも満席でも、先に DAY_LIMIT
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, '07:00')))), 'DAY_LIMIT');
    assert.equal(code(await err(() => rv('c6', 'sv1', 'st1', at(1, '11:00')))), 'DAY_LIMIT');
    // 営業時間の外でも、先すぎれば TOO_FAR、直前なら TOO_LATE
    assert.equal(code(await err(() => rv('c5', 'sv1', 'st1', at(70, '07:00')))), 'TOO_FAR');
    assert.equal(code(await err(() => rv('c5', 'sv1', 'st1', at(0, '07:00')))), 'TOO_LATE');
    // 営業時間の外なら、重なっていても OUT_OF_HOURS（満席より先）
    assert.equal(code(await err(() => rv('c5', 'sv1', 'st1', at(1, '09:30')))), 'OUT_OF_HOURS');
    // 体験済みなら、営業時間の外でも先に TRIAL_USED
    assert.equal(code(await err(() => rv('c4', 'sv_trial', 'st1', at(6, '10:00')))), 'TRIAL_USED');
  });

  test('排他制約：関数を通さずに直接入れても、重なる予約は入らない（二重の守り）', async () => {
    const ins = (id, a, b) => db.query(
      `insert into reservations (id,customer_id,service_id,staff_id,starts_at,ends_at,price,status)
       values ($1,'c6','sv1','st1',$2::timestamptz,$3::timestamptz,6000,'booked')`, [id, a, b]);
    const m = await err(() => ins('x1', at(1, '11:30'), at(1, '12:30')));
    assert.match(m ?? '', /reservations_no_overlap|exclusion/);
    await ins('x2', at(1, '12:00'), at(1, '13:00'));          // 隣り合うのは入る
    await db.query(`update reservations set status='canceled' where id='r1'`);
    await ins('x3', at(1, '11:00'), at(1, '12:00'));          // キャンセル済みとは重なってよい
  });

  test('変更：取れないとき（SLOT_FULL ほか）は元のまま。履歴にも増えない', async () => {
    const before = (await db.query(`select * from reservations where id='r1'`)).rows[0];
    const nh = () => db.query(`select count(*)::int n from history where reservation_id='r1'`).then((r) => r.rows[0].n);
    const n0 = await nh();
    const chg = (st, t) => as(db, 'customer', 'c1', (q) => q(`select change_reservation('r1',$1,$2::timestamptz,null)`, [st, t]));
    // r2（ケア 14:00-14:30）と重なる 13:30
    assert.equal(code(await err(() => chg('st1', at(1, '13:30')))), 'SLOT_FULL');
    assert.deepEqual((await db.query(`select * from reservations where id='r1'`)).rows[0], before);
    assert.equal(await nh(), n0);
    for (const [st, t, c] of [['st1', at(1, '07:00'), 'OUT_OF_HOURS'], ['st1', at(0, '10:00'), 'TOO_LATE'], ['st1', at(70, '10:00'), 'TOO_FAR'], ['st2', at(3, '10:00'), 'OUT_OF_HOURS']]) {
      assert.equal(code(await err(() => chg(st, t))), c);
    }
    assert.deepEqual((await db.query(`select * from reservations where id='r1'`)).rows[0], before);
  });

  test('変更：取れたら元の枠が空く。自分自身の時間と重なる移動（30分ずらす）もできる', async () => {
    const chg = (st, t) => as(db, 'customer', 'c1', (q) => q(`select change_reservation('r1',$1,$2::timestamptz,null)`, [st, t]));
    await chg('st2', at(1, '11:00'));
    assert.equal((await db.query(`select staff_id from reservations where id='r1'`)).rows[0].staff_id, 'st2');
    await rv('c6', 'sv1', 'st1', at(1, '11:00'));    // 元の枠（st1 11:00）が空いた
    await chg('st2', at(1, '11:30'));                // 11:00-12:00 → 11:30-12:30（自分と重なる）
    assert.equal(await startOf('r1'), iso(at(1, '11:30')));
  });

  test('変更：同じ日の件数は自分を数えない（2件ある日の中でも、別の日へも動かせる）', async () => {
    await rv('c1', 'sv2', 'st1', at(1, '16:00'));      // c1 は明日 r1 + これで2件
    const chg = (t) => as(db, 'customer', 'c1', (q) => q(`select change_reservation('r1','st1',$1::timestamptz,null)`, [t]));
    await chg(at(1, '12:00'));
    await chg(at(2, '12:00'));
  });

  test('変更：変えた先の同じ日が2件なら DAY_LIMIT。元のまま', async () => {
    await rv('c1', 'sv2', 'st1', at(2, '10:00'));
    await rv('c1', 'sv2', 'st1', at(2, '10:30'));
    assert.equal(code(await err(() => as(db, 'customer', 'c1', (q) => q(`select change_reservation('r1','st1',$1::timestamptz,null)`, [at(2, '15:00')])))), 'DAY_LIMIT');
    assert.equal(await startOf('r1'), iso(at(1, '11:00')));
  });

  test('変更：来店済みの予約は変えられない（NOT_FOUND）', async () => {
    assert.equal(code(await err(() => as(db, 'shop', null, (q) => q(`select change_reservation('r3','st1',$1::timestamptz,null)`, [at(2, '10:00')])))), 'NOT_FOUND');
  });

  test('変更：お店の人は期限を過ぎた予約も直せる', async () => {
    await as(db, 'shop', null, (q) => q(`select change_reservation('r8','st2',$1::timestamptz,null)`, [at(2, '15:00')]));
    assert.equal(await startOf('r8'), iso(at(2, '15:00')));
  });
});
