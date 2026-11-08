// 教室（決まったクラス枠）：定員・満席・同じ人の二重・変更
import { test, describe, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, errorOf, at } from './helpers.mjs';

describe('教室', () => {
  let db;
  before(async () => { db = await createDb('class'); });
  beforeEach(() => db.exec('begin'));
  afterEach(() => db.exec('rollback'));

  const code = (m) => m?.split(':')[0];
  const rv = (cust, session, svc = 'cl1', role = 'customer') =>
    as(db, role, cust, async (q) => (await q('select reserve($1,$2,null,null,$3) as id', [cust, svc, session])).rows[0].id);
  const err = (fn) => errorOf(db, fn);
  const taken = async (s) => (await db.query(`select count(*)::int n from reservations where session_id=$1 and status<>'canceled'`, [s])).rows[0].n;
  const sessionOf = async (id) => (await db.query('select session_id from reservations where id=$1', [id])).rows[0].session_id;
  const change = (cust, id, session, role = 'customer') =>
    as(db, role, cust, (q) => q('select change_reservation($1,null,null,$2) as id', [id, session]));

  test('定員まで取れ、満席になると取れない（SLOT_FULL）', async () => {
    await rv('c2', 'cs1');                                   // 定員2：c1 + c2 で満席
    assert.equal(await taken('cs1'), 2);
    assert.equal(code(await err(() => rv('c5', 'cs1'))), 'SLOT_FULL');
    assert.equal(await taken('cs1'), 2);
  });

  test('同じ人は同じ枠を二重に取れない', async () => {
    assert.equal(code(await err(() => rv('c1', 'cs1'))), 'SLOT_FULL');   // c1 はすでに cs1
    assert.equal(code(await err(() => rv('c1', 'cs1', 'cl1', 'shop'))), 'SLOT_FULL');
    assert.equal(await taken('cs1'), 1);
  });

  test('キャンセルすると席が空く', async () => {
    await rv('c2', 'cs1');
    await as(db, 'customer', 'c1', (q) => q(`select cancel_reservation('r1')`));
    await rv('c5', 'cs1');
    assert.equal(await taken('cs1'), 2);
  });

  test('枠の時間と担当は、枠から入る。starts_at や担当を渡しても枠が優先', async () => {
    const id = await as(db, 'customer', 'c2', async (q) =>
      (await q(`select reserve('c2','cl1','t2',$1::timestamptz,'cs6') as id`, [at(5, '03:00')])).rows[0].id);
    const r = (await db.query('select staff_id, session_id, starts_at from reservations where id=$1', [id])).rows[0];
    assert.equal(r.staff_id, 't1');
    assert.equal(r.session_id, 'cs6');
    assert.equal(r.starts_at.toISOString(), new Date(at(1, '14:00')).toISOString());
  });

  test('NOT_FOUND：違うメニューの枠・ない枠・枠なし', async () => {
    assert.equal(code(await err(() => rv('c2', 'cs_t'))), 'NOT_FOUND');     // cs_t は体験の枠
    assert.equal(code(await err(() => rv('c2', 'nothing'))), 'NOT_FOUND');
    assert.equal(code(await err(() => rv('c2', null))), 'NOT_FOUND');
  });

  test('OUT_OF_HOURS：講師が休みの日の枠', async () => {
    assert.equal(code(await err(() => rv('c2', 'cs_off'))), 'OUT_OF_HOURS');
  });

  test('チェックの順番：TRIAL_USED → DAY_LIMIT → 満席（SLOT_FULL）', async () => {
    await rv('c2', 'cs1');                          // cs1 は満席（c1, c2）
    await rv('c5', 'cs6'); await rv('c5', 'cs7');   // c5 は明日2件
    assert.equal(code(await err(() => rv('c5', 'cs1'))), 'DAY_LIMIT');
    assert.equal(code(await err(() => rv('c6', 'cs1'))), 'SLOT_FULL');
    assert.equal(code(await err(() => rv('c3', 'cs_t', 'cl_trial'))), 'TRIAL_USED');
  });

  test('available_slots：残り人数。満席は 0 で出る。session_id つき', async () => {
    const get = async () => (await db.query(
      `select session_id, remaining from available_slots('cl1',null,'2026-11-10','2026-11-11') order by starts_at`)).rows;
    let s = await get();
    assert.deepEqual(s.map((x) => [x.session_id, x.remaining]), [['cs1', 1], ['cs6', 5], ['cs7', 5], ['cs2', 1]]);
    await rv('c2', 'cs1');
    s = await get();
    assert.equal(s.find((x) => x.session_id === 'cs1').remaining, 0);
    // 講師で絞る・直前の枠は出ない・メニューが違う枠は出ない
    assert.deepEqual((await db.query(`select session_id from available_slots('cl1','t2','2026-11-09','2026-11-20')`)).rows, []);
    assert.deepEqual((await db.query(`select session_id from available_slots('cl1',null,'2026-11-09','2026-11-09')`)).rows.map((x) => x.session_id), ['cs_today']);
    assert.deepEqual((await db.query(`select session_id from available_slots('cl_trial',null,'2026-11-09','2026-11-20')`)).rows.map((x) => x.session_id), ['cs_t']);
  });

  test('変更：新しい枠が満席なら、元のまま（取れなかったときに元の予約を失わない）', async () => {
    await rv('c5', 'cs2');                      // cs2（定員2）は c3 + c5 で満席
    const before = (await db.query(`select * from reservations where id='r1'`)).rows[0];
    const nh = () => db.query(`select count(*)::int n from history where reservation_id='r1'`).then((r) => r.rows[0].n);
    const n0 = await nh();
    assert.equal(code(await err(() => change('c1', 'r1', 'cs2'))), 'SLOT_FULL');
    assert.deepEqual((await db.query(`select * from reservations where id='r1'`)).rows[0], before);
    assert.equal(await taken('cs1'), 1);
    assert.equal(await taken('cs2'), 2);
    assert.equal(await nh(), n0);
  });

  test('変更：取れたら元の席が空き、新しい枠が埋まる。予約番号は同じ', async () => {
    await rv('c2', 'cs1');                      // cs1 は満席
    assert.equal(code(await err(() => rv('c5', 'cs1'))), 'SLOT_FULL');
    const id = (await change('c1', 'r1', 'cs6')).rows[0].id;
    assert.equal(id, 'r1');
    assert.equal(await sessionOf('r1'), 'cs6');
    assert.equal(await taken('cs1'), 1);
    await rv('c5', 'cs1');                      // 空いた席に別の人が入れる
    assert.equal(await taken('cs1'), 2);
  });

  test('変更：同じ枠のまま（満席でも）は自分を数えない', async () => {
    await rv('c2', 'cs1');                      // 満席の cs1 のまま
    await change('c1', 'r1', 'cs1');
    assert.equal(await sessionOf('r1'), 'cs1');
  });

  test('変更：すでにその枠に自分がいるなら SLOT_FULL（二重にならない）', async () => {
    await rv('c1', 'cs6');                      // c1 は cs1 と cs6
    assert.equal(code(await err(() => change('c1', 'r1', 'cs6'))), 'SLOT_FULL');
    assert.equal(await sessionOf('r1'), 'cs1');
  });

  test('変更：直前・先すぎる・別メニュー・休みの枠は元のまま', async () => {
    assert.equal(code(await err(() => change('c1', 'r1', 'cs0'))), 'TOO_LATE');
    assert.equal(code(await err(() => change('c1', 'r1', 'cs_far'))), 'TOO_FAR');
    assert.equal(code(await err(() => change('c1', 'r1', 'cs_t'))), 'NOT_FOUND');
    assert.equal(code(await err(() => change('c1', 'r1', 'cs_off'))), 'OUT_OF_HOURS');
    assert.equal(await sessionOf('r1'), 'cs1');
  });

  test('変更の期限：お客さんは前日まで、お店の人は過ぎても直せる', async () => {
    assert.equal(code(await err(() => change('c4', 'r8', 'cs6'))), 'DEADLINE_PASSED');
    await change(null, 'r8', 'cs6', 'shop');
    assert.equal(await sessionOf('r8'), 'cs6');
  });

  test('体験の枠：定員3。定員になると、未使用の人でも取れない', async () => {
    for (const c of ['c1', 'c2', 'c5']) await rv(c, 'cs_t', 'cl_trial');
    assert.equal(code(await err(() => rv('c6', 'cs_t', 'cl_trial'))), 'SLOT_FULL');
    assert.equal((await db.query(`select count(*)::int n from reservations where session_id='cs_t' and is_trial`)).rows[0].n, 3);
  });
});
