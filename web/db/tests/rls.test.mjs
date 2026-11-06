// 役割ごとの見える範囲と書き込みの権限のテスト。実行：site-manager 直下で `node --test db/tests/`
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as, asRollback, ids } from './helpers.mjs';

let db;
before(async () => { db = await createDb(); });
after(async () => { await db.close?.(); }); // Supabase に接続するときは、接続を閉じる（閉じないと node --test が終わらない）

// 登場人物：E-01 社長、E-02 営業、E-03 事務、E-04/E-05 職人、X-01/X-02 協力業者、X-03 お客さん（田中）、X-06 お客さん（あさひ）
const count = (u, sql, params) => as(db, u, async (q) => Number((await q(`select count(*)::int n from (${sql}) t`, params)).rows[0].n));

test('seed：件数が仕様どおり', async () => {
  const n = async (t) => Number((await db.query(`select count(*)::int n from ${t}`)).rows[0].n);
  assert.equal(await n('app_users'), 16);
  assert.equal(await n('customers'), 15);
  assert.equal(await n('sites'), 20);
  assert.equal(await n('schedules'), 60);
  assert.equal(await n('quotes'), 15);
  assert.equal(await n('files'), 30);
  assert.equal(await n('site_finance'), 20);
});

test('seed：対応漏れが3種類ある（基準日 2026-11-06）', async () => {
  const r1 = await db.query(`select id from sites where status='受付' and staff_id is null and received_on <= date '2026-11-03'`);
  const r2 = await db.query(`select id from sites where status='受注' and planned_start < date '2026-11-06'`);
  const r3 = await db.query(`select id from sites where status='着工' and planned_end < date '2026-11-06'`);
  assert.deepEqual(ids(r1), ['S-2611-06']);
  assert.deepEqual(ids(r2), ['S-2610-03']);
  assert.deepEqual(ids(r3), ['S-2610-02']);
});

test('seed：消費税は合計に1回・切り捨て（S-2609-02：863,725円→86,372円）', async () => {
  const r = await db.query(`select sum(qty*unit_price)::int sub, floor(sum(qty*unit_price)*0.1)::int tax from quote_lines where quote_id='Q-2609-02-1'`);
  assert.equal(r.rows[0].sub, 863725);
  assert.equal(r.rows[0].tax, 86372);
});

test('権限の表：役割ごとの件数', async () => {
  const r = await db.query(`select role, count(*)::int n from role_permissions group by role`);
  const m = Object.fromEntries(r.rows.map((x) => [x.role, x.n]));
  assert.deepEqual(m, { owner: 13, staff: 9, worker: 3, customer: 1, partner: 1 });
});

// ---- 社長・社員 ----
test('社長は全現場・全金額・全見積・履歴が見える', async () => {
  assert.equal(await count('E-01', 'select id from sites'), 20);
  assert.equal(await count('E-01', 'select site_id from site_finance'), 20);
  assert.equal(await count('E-01', 'select id from quotes'), 15);
  assert.equal(await count('E-01', 'select id from files'), 30);
  assert.equal(await count('E-01', 'select id from schedules'), 60);
  assert.equal(await count('E-01', 'select id from audit_log'), 7);
  assert.equal(await count('E-01', 'select id from app_users'), 16);
});

test('社員は全現場・金額・見積が見えるが、履歴は見えない', async () => {
  assert.equal(await count('E-02', 'select id from sites'), 20);
  assert.equal(await count('E-02', 'select site_id from site_finance'), 20);
  assert.equal(await count('E-03', 'select id from quotes'), 15);
  assert.equal(await count('E-02', 'select id from audit_log'), 0);
});

test('社員はユーザーを作れないが、社長は作れる', async () => {
  await assert.rejects(asRollback(db, 'E-02', (q) => q(`insert into app_users (id,name,role) values ('E-99','テスト','staff')`)), /row-level security/);
  await asRollback(db, 'E-01', (q) => q(`insert into app_users (id,name,role) values ('E-99','テスト','staff')`));
});

// ---- 職人 ----
test('職人（E-04）は担当の現場だけ見える', async () => {
  const r = await as(db, 'E-04', (q) => q('select id from sites order by id'));
  assert.deepEqual(ids(r), ['S-2608-01', 'S-2609-01', 'S-2610-03']);
});

test('職人は金額・見積・見積の明細が0件', async () => {
  for (const t of ['site_finance', 'quotes', 'quote_lines']) assert.equal(await count('E-04', `select 1 from ${t}`), 0, t);
});

test('職人は自分の予定だけ見える', async () => {
  const r = await as(db, 'E-05', (q) => q('select distinct staff_id from schedules'));
  assert.deepEqual(ids(r, 'staff_id'), ['E-05']);
  assert.ok((await count('E-05', 'select id from schedules')) > 0);
});

test('職人は担当の現場のファイルだけ見える（社内用を含む）', async () => {
  const r = await as(db, 'E-04', (q) => q('select distinct site_id from files order by 1'));
  assert.ok(ids(r, 'site_id').every((s) => ['S-2608-01', 'S-2609-01', 'S-2610-03'].includes(s)));
  assert.ok((await count('E-04', `select 1 from files where visibility = 'internal'`)) >= 1);
});

test('職人は担当の現場の顧客だけ見える', async () => {
  assert.equal(await count('E-04', 'select id from customers'), 3);
});

test('職人は現場・見積・予定・ファイルを変えられない', async () => {
  const u = (sql) => asRollback(db, 'E-04', (q) => q(sql));
  assert.equal((await u(`update sites set name = 'x' where id = 'S-2608-01'`)).affectedRows, 0);
  await assert.rejects(u(`insert into sites (id, customer_id, name) values ('S-9999-01','C-0001','x')`), /row-level security/);
  await assert.rejects(u(`insert into schedules (id, site_id, day, work) values ('Y-999999','S-2608-01','2026-11-10','解体')`), /row-level security/);
  await assert.rejects(u(`insert into files (id, site_id, name, kind, path) values ('F-9999','S-2608-01','x','図面','x')`), /row-level security/);
  assert.equal((await u(`update schedules set memo = 'x' where staff_id = 'E-04'`)).affectedRows, 0);
});

test('職人は履歴・ユーザー管理にさわれない', async () => {
  assert.equal(await count('E-04', 'select id from audit_log'), 0);
  const r = await asRollback(db, 'E-04', (q) => q(`update app_users set role = 'owner' where id = 'E-04'`));
  assert.equal(r.affectedRows, 0);
});

test('職人から見えるユーザーは、自分と担当の現場の担当者（自分）だけ', async () => {
  const r = await as(db, 'E-04', (q) => q('select id from app_users order by id'));
  assert.deepEqual(ids(r), ['E-04']);
});

// ---- 外部（お客さん）----
test('お客さん（X-03）は許可された現場だけ見える', async () => {
  const r = await as(db, 'X-03', (q) => q('select id from sites'));
  assert.deepEqual(ids(r), ['S-2608-01']);
});

test('お客さん（X-06）は3現場、見積は提出・承認だけ', async () => {
  assert.equal(await count('X-06', 'select id from sites'), 3);
  assert.equal(await count('X-06', `select id from quotes`), 3);
  assert.equal(await count('X-06', `select id from quotes where status not in ('提出','承認')`), 0);
  assert.ok((await count('X-06', 'select 1 from quote_lines')) > 0);
});

test('お客さんに社内用のファイルは出ない。共有されたものだけ', async () => {
  assert.equal(await count('X-06', `select id from files where visibility in ('internal','partner')`), 0);
  assert.ok((await count('X-06', `select id from files`)) > 0);
  assert.equal(await count('X-03', `select id from files where visibility in ('internal','partner')`), 0);
});

test('お客さんは金額の表・履歴・顧客・ユーザー管理が見えない', async () => {
  assert.equal(await count('X-03', 'select 1 from site_finance'), 0);
  assert.equal(await count('X-03', 'select 1 from audit_log'), 0);
  assert.equal(await count('X-03', 'select 1 from customers'), 0);
});

test('お客さんは自分と、現場の担当者の名前だけ見える', async () => {
  const r = await as(db, 'X-03', (q) => q('select id from app_users order by id'));
  assert.deepEqual(ids(r), ['E-04', 'X-03']);
});

test('お客さんは取り消された予定が見えない。許可のない現場の予定も見えない', async () => {
  assert.equal(await count('X-03', `select 1 from schedules where status = '取消'`), 0);
  assert.equal(await count('X-03', `select 1 from schedules where site_id <> 'S-2608-01'`), 0);
});

test('お客さんは何も書き込めない', async () => {
  const u = (sql) => asRollback(db, 'X-03', (q) => q(sql));
  assert.equal((await u(`update sites set name='x'`)).affectedRows, 0);
  await assert.rejects(u(`insert into files (id, site_id, name, kind, path) values ('F-9999','S-2608-01','x','図面','x')`), /row-level security/);
  await assert.rejects(u(`insert into site_access values ('S-2610-01','X-03')`), /row-level security/);
});

// ---- 外部（協力業者）----
test('協力業者（X-01）は許可された現場だけ見える', async () => {
  const r = await as(db, 'X-01', (q) => q('select id from sites order by id'));
  assert.deepEqual(ids(r), ['S-2610-01', 'S-2610-04', 'S-2611-01']);
});

test('協力業者は見積・金額が見えない', async () => {
  for (const t of ['quotes', 'quote_lines', 'site_finance']) assert.equal(await count('X-01', `select 1 from ${t}`), 0, t);
});

test('協力業者は partner・both のファイルだけ見える', async () => {
  assert.equal(await count('X-01', `select id from files where visibility in ('internal','customer')`), 0);
  assert.ok((await count('X-01', 'select id from files')) > 0);
});

test('協力業者は許可された現場の予定が見える', async () => {
  assert.ok((await count('X-01', 'select id from schedules')) > 0);
  assert.equal(await count('X-01', `select id from schedules where site_id not in ('S-2610-01','S-2610-04','S-2611-01')`), 0);
});

// ---- 共有の付け外し ----
test('社員が許可を外すと、外部から見えなくなる（付け外し）', async () => {
  await db.exec('begin');
  try {
    await as(db, 'E-03', (q) => q(`delete from site_access where site_id = 'S-2608-01' and user_id = 'X-03'`));
    assert.equal(await count('X-03', 'select id from sites'), 0);
    assert.equal(await count('X-03', 'select id from files'), 0);
    await as(db, 'E-03', (q) => q(`insert into site_access values ('S-2608-01','X-03')`));
    assert.equal(await count('X-03', 'select id from sites'), 1);
  } finally { await db.exec('rollback'); }
});

test('ファイルの共有先を変えると、お客さんの画面に出る・消える', async () => {
  await db.exec('begin');
  try {
    const before = await count('X-03', 'select id from files');
    await as(db, 'E-03', (q) => q(`update files set visibility = 'internal' where site_id = 'S-2608-01'`));
    assert.equal(await count('X-03', 'select id from files'), 0);
    await as(db, 'E-03', (q) => q(`update files set visibility = 'both' where site_id = 'S-2608-01'`));
    assert.equal(await count('X-03', 'select id from files'), (await count('E-03', `select id from files where site_id = 'S-2608-01'`)));
    assert.ok(before >= 0);
  } finally { await db.exec('rollback'); }
});

test('職人は共有の付け外しができない', async () => {
  await assert.rejects(asRollback(db, 'E-04', (q) => q(`insert into site_access values ('S-2608-01','X-01')`)), /row-level security/);
});

// ---- 変更の履歴 ----
test('現場を更新すると audit_log に1行入り、社長だけが見える', async () => {
  await db.exec('begin');
  try {
    await as(db, 'E-02', (q) => q(`update sites set status = '完工' where id = 'S-2610-02'`));
    assert.equal(await count('E-01', `select id from audit_log where row_id = 'S-2610-02' and user_id = 'E-02' and action = 'UPDATE' and after_row->>'status' = '完工'`), 1);
    assert.equal(await count('E-02', 'select id from audit_log'), 0);
    const u = await db.query(`select updated_at > now() - interval '1 minute' as fresh from sites where id = 'S-2610-02'`);
    assert.equal(u.rows[0].fresh, true);
  } finally { await db.exec('rollback'); }
});

test('見積・ファイル・許可・予定の変更も履歴に残る', async () => {
  await db.exec('begin');
  try {
    await as(db, 'E-02', async (q) => {
      await q(`update quotes set status = '提出' where id = 'Q-2611-05-1'`);
      await q(`update files set visibility = 'both' where id = 'F-0001'`);
      await q(`update schedules set status = '取消' where id = 'Y-000020'`);
      await q(`insert into site_access values ('S-2610-02','X-03')`);
      await q(`update quote_lines set qty = 2 where quote_id = 'Q-2611-05-1' and line_no = 1`);
    });
    const r = await as(db, 'E-01', (q) => q(`select distinct table_name from audit_log where id > 7 order by 1`));  // 7 件は見本の履歴
    assert.deepEqual(ids(r, 'table_name'), ['files', 'quote_lines', 'quotes', 'schedules', 'site_access']);
  } finally { await db.exec('rollback'); }
});

test('app_user は履歴を書き換えられない', async () => {
  await assert.rejects(as(db, 'E-01', (q) => q(`delete from audit_log`)), /permission denied/);
  await assert.rejects(as(db, 'E-01', (q) => q(`insert into audit_log (table_name,row_id,action) values ('x','x','x')`)), /permission denied/);
  await assert.rejects(as(db, 'E-01', (q) => q(`update audit_log set action = 'x'`)), /permission denied/);
});

test('権限の表は app_user から書き換えられない', async () => {
  await assert.rejects(as(db, 'E-01', (q) => q(`insert into role_permissions values ('worker','finance.view')`)), /permission denied/);
  await assert.rejects(as(db, 'E-01', (q) => q(`delete from role_permissions`)), /permission denied/);
});

// ---- 判定の関数 ----
test('has_permission() は役割の表を引く', async () => {
  const hp = (u, p) => as(db, u, async (q) => (await q(`select has_permission('${p}') as v`)).rows[0].v);
  assert.equal(await hp('E-01', 'user.manage'), true);
  assert.equal(await hp('E-02', 'user.manage'), false);
  assert.equal(await hp('E-04', 'finance.view'), false);
  assert.equal(await hp('X-03', 'portal.view'), true);
  assert.equal(await hp('X-03', 'site.view_all'), false);
});

test('役割を設定しない（未ログイン）と何も見えない', async () => {
  await db.exec(`reset role; set role app_user; select set_config('app.user_id','',false); select set_config('app.role','',false);`);
  try {
    for (const t of ['sites', 'files', 'quotes', 'customers', 'schedules', 'site_finance', 'app_users']) {
      const r = await db.query(`select count(*)::int n from ${t}`);
      assert.equal(r.rows[0].n, 0, t);
    }
  } finally { await db.exec('reset role'); }
});
