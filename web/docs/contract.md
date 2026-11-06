# 作る側の取り決め（並列で作るときの約束。2026-11-06）

## 権限の名前（permissions.code）
`site.view_all`（全現場を見る）・`site.view_assigned`（担当の現場だけ）・`site.edit`（現場を変える）・`finance.view`（金額・見積）・`quote.edit`・`schedule.view_all`・`schedule.view_own`・`schedule.edit`・`file.view_internal`・`file.manage`（共有の付け外し）・`user.manage`・`audit.view`・`portal.view`（外部の専用ページ）

## 役割 × 権限
- owner：すべて
- staff：user.manage と audit.view 以外
- worker：site.view_assigned・schedule.view_own・file.view_internal（担当の現場の internal を含む、ただし金額・見積はなし）
- customer：portal.view（許可された現場の、customer・both のファイル、予定、見積、進み具合）
- partner：portal.view（許可された現場の、partner・both のファイル、予定。見積・金額なし）

## 画面からデータを取る約束（app/src/lib/db）
`getDb()`（PGlite を起動し、db/*.sql を順に流し、seed を入れる）、`withRole(user, fn)`（`set role` と `app.user_id`・`app.role` を設定して fn を実行）、`resetDemo()`（最初に戻す）。画面は必ず `withRole` の中で SQL を実行する（RLS が効く）。
