// ../db/*.sql を読み、文字列として src/lib/db/sql.generated.ts に出す（ブラウザの中の DB に流すため）。
// 順番は schema → functions → policies → triggers → seed_<モード>。ファイルがあるものだけ入れる（無くても止まらない）。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dbDir = path.resolve(here, '../../db');
const order = ['schema', 'functions', 'policies', 'triggers', 'seed_salon', 'seed_class'];
const files = order.filter((n) => existsSync(path.join(dbDir, `${n}.sql`)));
const body = files.map((n) => `  { name: ${JSON.stringify(n)}, sql: ${JSON.stringify(readFileSync(path.join(dbDir, `${n}.sql`), 'utf-8'))} },`).join('\n');
const out = `// 自動で作られる（scripts/embed-sql.mjs）。直さない。元は ../db/*.sql\nexport const SQL_FILES: { name: string; sql: string }[] = [\n${body}\n];\n`;
writeFileSync(path.resolve(here, '../src/lib/db/sql.generated.ts'), out, 'utf-8');
console.log(`embed-sql: ${files.join(', ') || '(なし)'}`);
