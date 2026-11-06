# 役割と権限（Site Manager）

権限の判定は DB に集めています。画面は「役割 × 権限」の表を読んで出し分けるだけで、見えるかどうかは最後に RLS（行ごとのアクセス制御）が決めます。

- 表の元：[db/permissions.sql](../db/permissions.sql)（`permissions`・`role_permissions`）
- 判定の関数：[db/functions.sql](../db/functions.sql)（`has_permission()`・`is_assigned_site()`・`has_site_access()`）
- 行ごとの制御：[db/policies.sql](../db/policies.sql)
- テスト：[db/tests/rls.test.mjs](../db/tests/rls.test.mjs)（35件）

## 役割 × 権限

| 権限 | 意味 | 社長 owner | 社員 staff | 職人 worker | お客さん customer | 協力業者 partner |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `site.view_all` | 全現場を見る | ○ | ○ | | | |
| `site.view_assigned` | 担当の現場だけ見る | ○ | | ○ | | |
| `site.edit` | 現場・顧客を変える | ○ | ○ | | | |
| `finance.view` | 金額・見積を見る | ○ | ○ | | | |
| `quote.edit` | 見積を変える | ○ | ○ | | | |
| `schedule.view_all` | 全員の予定を見る | ○ | ○ | | | |
| `schedule.view_own` | 自分の予定だけ見る | ○ | | ○ | | |
| `schedule.edit` | 予定を変える | ○ | ○ | | | |
| `file.view_internal` | 社内用のファイルを見る | ○ | ○ | ○ | | |
| `file.manage` | ファイルと外部への共有を管理する | ○ | ○ | | | |
| `user.manage` | ユーザーを管理する | ○ | | | | |
| `audit.view` | 変更の履歴を見る | ○ | | | | |
| `portal.view` | 外部の専用ページを見る | ○ | ○ | | ○ | ○ |

社長・社員は `portal.view` も持ちますが、専用ページで見られるのは、外部ユーザーとして許可された現場だけです（`site_access`）。

## 見える範囲

| 表 | 社長・社員 | 職人 | お客さん | 協力業者 |
|---|---|---|---|---|
| 現場 `sites` | すべて | 担当（`staff_id` が自分）の現場だけ | `site_access` で許可された現場だけ | 同左 |
| 金額 `site_finance` | すべて | **見えない** | 見えない | 見えない |
| 見積 `quotes`・明細 `quote_lines` | すべて | **見えない** | 許可された現場の「提出」「承認」だけ | **見えない** |
| 予定 `schedules` | すべて | 自分の予定だけ | 許可された現場の予定（取消は除く） | 同左 |
| ファイル `files` | すべて | 担当の現場のすべて（社内用を含む） | 許可された現場の `customer`・`both` だけ | 許可された現場の `partner`・`both` だけ |
| 顧客 `customers` | すべて | 担当の現場の顧客 | 見えない | 見えない |
| ユーザー `app_users` | すべて | 自分だけ（担当者は自分） | 自分と、許可された現場の担当者 | 同左 |
| 許可 `site_access` | すべて | 見えない | 自分の行だけ | 同左 |
| 履歴 `audit_log` | 社長だけ | 見えない | 見えない | 見えない |

## 書き込み

| 操作 | できる人 |
|---|---|
| 現場・顧客・金額を変える | `site.edit`（社長・社員） |
| 見積・明細を変える | `quote.edit`（社長・社員） |
| 予定を変える | `schedule.edit`（社長・社員） |
| ファイルの登録・共有先の変更、外部への許可の付け外し | `file.manage`（社長・社員） |
| ユーザーの追加・変更 | `user.manage`（社長だけ） |
| 履歴・権限の表の書き換え | だれもできない（`app_user` に権限なし。履歴はトリガーだけが書く） |
| 削除 | 許可の取り消し（`site_access`）だけ。ほかの行は消さず、状況で表す |

## 補足

- 外部ユーザーは「共有の付け外し」が即座に効きます。許可を外す・共有先を `internal` に戻すと、次の読み込みから見えなくなります。
- 見積の消費税は、明細の金額（数量 × 単価）の合計に対して1回、10%、切り捨てです（画面の計算。例：税抜 863,725 円 → 消費税 86,372 円）。
- 利用者は、DB のセッション設定 `app.user_id`・`app.role` で渡します。Supabase にするときは `auth.uid()` と JWT の役割に置き換えます（`current_user_id()`・`current_app_role()` の2つだけ直せば足ります）。
