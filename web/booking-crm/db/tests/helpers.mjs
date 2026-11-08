// テストの下ごしらえ：db/*.sql を順に流した PGlite（btree_gist つき）を作り、役割を切り替えて SQL を実行する。
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildSeed } from '../../scripts/make-seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const dbDir = path.resolve(here, '..');
const bookingDir = path.resolve(dbDir, '..');

// PGlite は app/node_modules にある。なければ 1本目の app/node_modules、環境変数 PGLITE_DIR（node_modules の親）
async function loadPglite() {
  const candidates = [
    path.join(bookingDir, 'app', 'node_modules'),
    path.join(bookingDir, '..', 'site-manager', 'app', 'node_modules'),
    process.env.PGLITE_DIR && path.join(process.env.PGLITE_DIR, 'node_modules'),
  ].filter(Boolean);
  for (const base of candidates) {
    const dist = path.join(base, '@electric-sql', 'pglite', 'dist');
    if (existsSync(path.join(dist, 'index.js'))) {
      const { PGlite } = await import(pathToFileURL(path.join(dist, 'index.js')).href);
      const { btree_gist } = await import(pathToFileURL(path.join(dist, 'contrib', 'btree_gist.js')).href);
      return { PGlite, btree_gist };
    }
  }
  throw new Error('@electric-sql/pglite が見つかりません（app/ で npm install してください）');
}

export const FILES = ['schema.sql', 'functions.sql', 'policies.sql', 'triggers.sql'];

/** seed：'salon'・'class'（db/tests/fixtures の小さな見本）／ 'real:salon'・'real:class'（db/seed_*.sql）／ SQL の文字列 */
export async function createDb(seed) {
  const { PGlite, btree_gist } = await loadPglite();
  const db = new PGlite({ extensions: { btree_gist } });
  for (const f of FILES) await db.exec(readFileSync(path.join(dbDir, f), 'utf8'));
  if (seed === 'salon' || seed === 'class') {
    const data = JSON.parse(readFileSync(path.join(here, 'fixtures', `${seed}.json`), 'utf8'));
    await db.exec(buildSeed(data, seed));
  } else if (seed?.startsWith('real:')) {
    await db.exec(readFileSync(path.join(dbDir, `seed_${seed.slice(5)}.sql`), 'utf8'));
  } else if (seed) await db.exec(seed);
  return db;
}

/** 役割で SQL を実行する。role は 'customer'（id が要る）か 'shop'。終わったらスーパーユーザーに戻す */
export async function as(db, role, id, fn) {
  const dbRole = role === 'customer' ? 'app_customer' : 'app_shop';
  await db.exec(`reset role; set role ${dbRole}; select set_config('app.user_id', '${id ?? ''}', false);`);
  try {
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    try { await db.exec('reset role'); } catch { /* 失敗したあとのトランザクションは、errorOf の rollback で戻る */ }
  }
}

/** 失敗するはずの呼び出し。メッセージの先頭がコードかを確かめる。失敗しても、あとの SQL が続けられる */
export async function errorOf(db, fn) {
  await db.exec('savepoint t');
  try {
    await fn();
  } catch (e) {
    await db.exec('rollback to savepoint t');
    await db.exec('release savepoint t');
    return e.message;
  }
  await db.exec('release savepoint t');
  return null;
}

/** 日本時間の日時（today からの日数・HH:MM）→ timestamptz の文字列 */
export const at = (offset, hhmm, today = '2026-11-09') => {
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return `${d.toISOString().slice(0, 10)} ${hhmm}:00+09`;
};
export const rows = (r, col) => r.rows.map((x) => x[col]);
