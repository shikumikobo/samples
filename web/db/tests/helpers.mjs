// 権限のテストの下ごしらえ：db/*.sql を順に流した PGlite を作り、役割を切り替えて SQL を実行する。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const dbDir = path.resolve(here, '..');
const siteDir = path.resolve(dbDir, '..');

// PGlite は app/node_modules にある。なければ環境変数 PGLITE_DIR（node_modules の親）か、試し用の $TEMP/pgtest
async function loadPglite() {
  const candidates = [
    path.join(siteDir, 'app', 'node_modules'),
    process.env.PGLITE_DIR && path.join(process.env.PGLITE_DIR, 'node_modules'),
    process.env.TEMP && path.join(process.env.TEMP, 'pgtest', 'node_modules'),
  ].filter(Boolean);
  for (const base of candidates) {
    const pkg = path.join(base, '@electric-sql', 'pglite', 'dist', 'index.js');
    if (existsSync(pkg)) return import(pathToFileURL(pkg).href);
  }
  throw new Error('@electric-sql/pglite が見つかりません（app/ で npm install してください）');
}

export const FILES = ['schema.sql', 'functions.sql', 'permissions.sql', 'policies.sql', 'triggers.sql', 'seed.sql'];

// 環境変数 TEST_DB_URL があるときは、PGlite ではなく、その Postgres（手元の Supabase）に接続して同じテストを流す。
// 定義と seed は、Supabase の migration・seed（scripts/build-supabase-migration.mjs が作る）が入れておく。
// `pg` は app/ に入れず、scripts/verify-supabase.mjs が一時の場所に入れて PG_MODULE_DIR で教える。
async function connectPg(url) {
  const base = process.env.PG_MODULE_DIR;
  if (!base) throw new Error('PG_MODULE_DIR（pg の入った node_modules の親）が必要です。scripts/verify-supabase.mjs から実行してください');
  const pg = (await import(pathToFileURL(path.join(base, 'node_modules', 'pg', 'lib', 'index.js')).href)).default;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  // PGlite と同じ形：query(sql, params) → { rows }、exec(sql)（複数の文）
  // pg の rowCount を、PGlite の affectedRows の名前にそろえる
  const query = async (sql, params) => { const r = await client.query(sql, params); return { rows: r.rows, affectedRows: r.rowCount }; };
  return { query, exec: (sql) => client.query(sql), close: () => client.end() };
}

export async function createDb() {
  if (process.env.TEST_DB_URL) return connectPg(process.env.TEST_DB_URL);
  const { PGlite } = await loadPglite();
  const db = new PGlite();
  for (const f of FILES) await db.exec(readFileSync(path.join(dbDir, f), 'utf8'));
  return db;
}

/** 利用者として SQL を実行する。終わったら必ずスーパーユーザーに戻す */
export async function as(db, userId, fn) {
  const r = await db.query('select role from app_users where id = $1', [userId]);
  if (!r.rows.length) throw new Error('そのユーザーはいません: ' + userId);
  await db.exec(`reset role; set role app_user; select set_config('app.user_id', '${userId}', false); select set_config('app.role', '${r.rows[0].role}', false);`);
  try {
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    try { await db.exec('reset role'); } catch { /* トランザクションが失敗したあとは rollback で戻る */ }
  }
}

/** 変更を試すとき用：終わったら元に戻す */
export async function asRollback(db, userId, fn) {
  await db.exec('begin');
  try {
    return await as(db, userId, fn);
  } finally {
    await db.exec('rollback');
  }
}

export const ids = (res, col = 'id') => res.rows.map((r) => r[col]);
