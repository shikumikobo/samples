# 手元の Supabase で確かめる

デモはブラウザの中の PGlite で動く。この手順は、同じ DB の定義（`db/*.sql`）と RLS が、本物の Supabase（Postgres）でも同じに効くかを、自分の PC（Docker）だけで確かめるもの。Supabase のアカウント・ログイン・クラウドのプロジェクトは使わない。

## 前提
- Docker が動いている（`docker version` が通る）
- Node.js（`npx` が使える）
- 他のプロジェクトの Supabase が動いていてもよい。この見本は **54520〜54529 番**のポートを使う（`supabase/config.toml`。API 54521・DB 54522）。ほかの Supabase（54321・54421 など）は止めない

## 実行（まとめて）
```bash
node scripts/verify-supabase.mjs            # 起動 → 入れ直し → テスト → 停止
node scripts/verify-supabase.mjs --keep     # 最後に止めない（Studio ではなく psql などで見たいとき）
node scripts/verify-supabase.mjs --no-reset # 入れ直しを省く
```
中でしていること：
1. `scripts/build-supabase-migration.mjs`：`db/*.sql`（schema → functions → permissions → policies → triggers）を連結して `supabase/migrations/20261106000000_site_manager.sql` を、`db/seed.sql` を `supabase/seed.sql` に作る（**生成物**。直すのは `db/` の側）
2. `npx supabase start`（動いていなければ。初回はイメージの取得に数分）→ `npx supabase db reset`（migration と seed を入れ直す）
3. `pg` を一時の場所（OS の一時フォルダの `site-manager-pg`）に入れ、環境変数 `TEST_DB_URL` を付けて `db/tests/*.test.mjs` を流す。**PGlite で流すのと同じ35件**を、Supabase の Postgres に流す
4. `npx supabase stop`（このプロジェクトのコンテナだけ止める）

PGlite だけで流すとき：`node --test "db/tests/*.test.mjs"`（`app/` で `npm install` 済みであること）。

## 確かめた結果（2026-11-06）
| 確認 | PGlite | 手元の Supabase（Postgres 17） |
|---|---|---|
| 権限・RLS のテスト（`db/tests/rls.test.mjs`） | 35件 通った | 35件 通った（migration と seed は `supabase start` / `db reset` で入った） |
| 全表の RLS | — | `public` の全表で有効。RLS のない表は0 |
| ポリシー数 | — | 30 |
| 匿名キーで API（`/rest/v1/`）から読む | — | sites・site_finance・quotes・app_users・audit_log はどれも空 |
| 匿名キーで API から書く | — | sites への挿入は `new row violates row-level security policy` で拒否 |

### 違いが出た点と、直したもの
1. **`set role app_user` が拒否された**（Supabase だけ）：Postgres 16 以降は、役割を作っただけでは、作った人（`postgres`）がその役割に `set role` できない。`db/policies.sql` に `grant app_user to current_user;` を足した（PGlite はスーパーユーザーなので影響なし。35件・画面テスト29件も通る）
2. **接続の部品の違い**（テストの下ごしらえだけ）：PGlite は更新件数が `affectedRows`、`pg` は `rowCount`。`db/tests/helpers.mjs` の接続の部品で名前をそろえた
3. テストの終わりで接続を閉じていなかった（閉じないと `node --test` が終わらない）。`rls.test.mjs` に `after` を足した

RLS の判定そのもの（誰に何が見えるか・書けるか）は、PGlite と Supabase で違いがなかった。

## 本番にする場合（見本では作らない）
デモは、利用者を「設定値（`app.user_id`・`app.role`）」で渡している。本番の Supabase では、ログインした人を `auth.uid()` で取る。

1. `app_users.id` を `auth.users.id`（uuid）に合わせる（`schema.sql` の id を uuid にし、seed を作り直す）
2. `db/functions.sql` の `current_user_id()`・`current_app_role()` を、`supabase/production-functions.sql.example` の版に置き換える（役割は JWT ではなく `app_users` の表から引く。画面や本人が書き換えられない）
3. `db/policies.sql` の `to app_user` を、Supabase の役割 `authenticated` に置き換える（`grant ... to authenticated`）。`app_user` の作成と `grant app_user to current_user` は要らない
4. ログインはメール＋パスワード（または招待）。外部の人（お客さん・協力業者）は招待制にし、`site_access` に許可を入れる
5. ファイルは Storage（社内用と外部用のバケット）。`files.visibility` と同じ決まりを、Storage のポリシーに書く
6. 画面（`app/src/lib/db`）は、PGlite の代わりに `@supabase/supabase-js` で同じ SQL（またはビュー）を呼ぶ。権限の判定は DB の側にあるので、画面の出し分けは変えなくてよい

## 後片づけ
- 止める：`npx supabase stop`（`--no-backup` を付けるとデータも消える）
- 入れ直すと、データは毎回 seed の状態に戻る
