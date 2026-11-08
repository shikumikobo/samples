# 作る側の取り決め（並列で作るときの約束。2026-11-07）

元は [hearing.md](../hearing.md)。1本目の [contract.md](../../site-manager/docs/contract.md) と同じ考え方。**この約束を変えるときは、先にこのファイルを直し、触る人全員に知らせる。**

## 0. 試しの結果（2026-11-07）

- PGlite で `btree_gist`（排他制約）が使える。サロンの「同じ担当の重なる時間」は排他制約でも防げる。
- 教室の定員は排他制約では表せない。**関数の中で、枠の行をロックして（`for update`）人数を数えてから書く**形でも、定員・満席・変更（新しい枠を先に確保→取れたら元を空ける）が正しく動いた。
- 決めた：予約の作成と変更は、どちらも**DB の関数**で行い、関数の中で確かめる。画面は関数を呼ぶだけ。サロンの重なりは、関数の確認に加えて排他制約を**二重の守り**として付ける。
- まだ試していないもの：サロン（時間の長さが違う）と教室（決まった枠）を1つの `reserve()` で扱う実装。A が作り、テストで確かめる。

## 1. 置き場所と担当

```
booking-crm/
├─ db/        表・関数・架空のデータ・テスト          …… 担当 A
├─ app/       画面（Next.js）                          …… 担当 B（骨格）→ 段階2で D・E
├─ data/      架空のデータの元（JSON）と画像の元        …… 担当 C
└─ docs/      この契約・設計の図
```

- **同じファイルを2人が触らない。** 自分の担当のフォルダだけを書く。他の担当のものを直したいときは、このファイルの「変更の依頼」に書く。
- `app/public/` の画像は C、`app/src/` は B（段階2では画面ごとに D・E）。

## 2. 日付

- デモの「今日」は固定：**2026-11-09（月）**。データベースの関数 `demo_today()` が返す（設定の `demo_today`）。`now()` を使わない。
- 架空のデータの日付は、元のデータでは「今日からの日数（`day_offset`）」と「時刻（`HH:MM`）」で書き、`db/` の変換が日付に直す。

## 3. 表（名前と列）

| 表 | 列 |
|---|---|
| `settings` | `key` text 主キー, `value` text。`mode`（`salon`／`class`）, `demo_today`, `slot_minutes`=15, `booking_window_days`=60, `min_lead_hours`=2, `max_per_day`=2, `cancel_deadline`=`prev_day_end`（前日の終わりまで） |
| `services` | `id`, `name`, `kind`（`timed`＝時間で取る／`class`＝決まったクラス枠）, `duration_min`, `price`（円, 内税）, `is_trial` bool（体験）, `first_time_only` bool, `return_days` int（来店の目安の日数。null可）, `image` text（`app/public/images/` のファイル名）, `description`, `sort`, `active` |
| `staff` | `id`, `name`, `title`（サロン：スタイリスト等／教室：講師）, `active` |
| `staff_hours` | `staff_id`, `weekday`（0=日…6=土）, `open_time`, `close_time`（営業しない曜日は行なし） |
| `staff_off` | `staff_id`, `day`（休みの日）, `note` |
| `class_sessions` | `id`, `service_id`, `staff_id`, `starts_at`, `ends_at`, `capacity` |
| `customers` | `id`, `name`, `kana`, `phone`, `email`, `note`（お店のメモ）, `caution`（アレルギー・注意）, `created_at`, `active` |
| `reservations` | `id`, `customer_id`, `service_id`, `staff_id`, `session_id`（クラスのときだけ）, `starts_at`, `ends_at`, `price`（その時点の金額）, `is_trial`, `status`, `note`（お店のメモ。キャンセルの理由・来店のひとことなど。お客さんには見えない）, `created_at` |
| `history` | `id`, `at`, `actor`（`shop`／`customer:<id>`）, `action`, `reservation_id`, `before` jsonb, `after` jsonb。**トリガーが書き、画面から直せない** |

- `status`：`booked`（予約済み）・`visited`（来店済み／出席）・`canceled`・`noshow`（無断欠席）。**消さない。**
- 時刻は `timestamptz`、表示はブラウザ側で日本時間。

## 4. DB の関数（画面はこれを呼ぶ）

| 関数 | 返すもの |
|---|---|
| `available_slots(service_id, staff_id or null, from_day date, to_day date)` | 行（`staff_id`, `starts_at`, `ends_at`, `remaining`）。`timed` は営業時間・休み・既存の予約・所要時間から15分刻みで計算。`class` は `class_sessions` の残り人数 |
| `reserve(customer_id, service_id, staff_id, starts_at, session_id)` | 予約の id |
| `change_reservation(reservation_id, staff_id, starts_at, session_id)` | 予約の id（同じ id のまま日時を変える）。新しい枠を確かめて取れたときだけ書き換える。失敗したら元のまま |
| `cancel_reservation(reservation_id, reason default null)` | 予約の id。`reason`（200字まで）があると、予約のお店のメモ（`reservations.note`）に足す。**お客さん本人**のときは先頭に「【お客さんの理由】」を付け、すでにメモがあれば改行で続ける（お客さんはメモを読めない）。お店のときはそのまま足す |
| `mark_visited(reservation_id)`・`mark_noshow(reservation_id)` | 予約の id（お店だけ。`booked` の予約だけ） |
| `set_reservation_status(reservation_id, status, note default null)` | 予約の id（お店だけ）。**保存後の修正**：`booked`／`visited`／`noshow`／`canceled` のどれからどれへも直す。`note` を渡すと同時にメモも書く（キャンセルの理由）。`canceled` から戻すときだけ、元の枠が今も空いているか確かめる（重なり・定員・同じ人の二重）。空いていなければ `SLOT_TAKEN`。期限（前日まで）の制限はない。状態もメモも変わらなければ何もしない（履歴を増やさない） |
| `set_reservation_note(reservation_id, note)` | 予約の id（お店だけ）。予約のお店のメモだけを書く（履歴に `update` が残る） |
| `find_customer_by_phone(phone)` | お客さんの id、いなければ null（お店だけ。お客さんが呼ぶと `FORBIDDEN`）。電話番号は数字だけにして比べる（`normalize_phone`）。いまのお客さん（`active`）だけを数え、空の電話は確認しない（null）。複数いるときは、登録の古い順の先頭。はじめての方の登録の前に、画面（`registerCustomer`）が呼び、同じ電話の人がいれば登録せず `PHONE_TAKEN` にする |
| `busy_blocks(day date)` | 行（`staff_id`, `starts_at`, `ends_at`）。その日の、サロン型（枠でない）でキャンセルでない予約の「担当・開始・終了」だけ（お客さんの名前などは返さない）。お客さんは他人の予約を読めないが、日時の表で「埋まっている時間」を見せるのに要るため `security definer`。お店の空き表は、名前も要るので予約を直接読む |
| `due_for_return(as_of date)` | 行（`customer_id`, `last_visit`, `service_id`, `due_since_days`）。最後の `visited` から `return_days` を過ぎたお客さん |

**エラー**は、メッセージの先頭を次のコードにする（画面がコードで日本語の文に直す。`lib/errors.ts`、担当 B）：

`SLOT_FULL`（満席・重なり）・`OUT_OF_HOURS`（営業時間・休みの外）・`TOO_LATE`（直前）・`TOO_FAR`（先すぎる）・`DAY_LIMIT`（同じ日に2件まで）・`TRIAL_USED`（初回限定の体験を使用済み）・`DEADLINE_PASSED`（変更・キャンセルの期限を過ぎた。お客さんのみ。お店の人は過ぎても直せる）・`NOT_FOUND`・`FORBIDDEN`・`SLOT_TAKEN`（キャンセルから戻すとき、元の枠にもう別の予約がある・満席。お店の修正のみ）・`PHONE_TAKEN`（はじめての方の登録で、同じ電話番号のお客さんがすでにいる。DB の関数ではなく、画面側の登録（`registerCustomer`）が `find_customer_by_phone` の結果から返す。お客さん側の画面は他人の名前を出さずに「上の一覧から名前を選んでください」と案内し、お店側の画面は「同じ電話番号の方がいます：◯◯さん」と出して「この方で予約する」を選べる）

- チェックの順番：`NOT_FOUND`→`FORBIDDEN`→`TRIAL_USED`→`DAY_LIMIT`→`TOO_LATE`／`TOO_FAR`→`OUT_OF_HOURS`→`SLOT_FULL`。
- 体験の判定：同じ顧客（`phone` または `email` が同じ）に、`is_trial` の予約（`canceled` 以外）があれば `TRIAL_USED`。

## 5. 役割

- 2つ：**`customer`**（お客さん。自分の予約とプロフィールだけ。`note`・`caution` は見えない）と **`shop`**（お店。すべて）。
- 画面からは `withRole('customer', customerId, fn)`／`withRole('shop', null, fn)` の中でだけ SQL を実行する。DB 側の行の制限（RLS）で守り、`customer` が他人の予約や `note`・`caution` を読めないことを**テストで確かめる**。

## 6. サロン／教室の切り替え

- 表の形は同じ。**データだけが違う**：`db/seed_salon.sql`（ネイルサロン）と `db/seed_class.sql`（料理教室）。切り替えると、`settings.mode` を変えて、その seed で DB を作り直す（「最初に戻す」と同じ処理）。
- 言葉は `app/src/lib/words.ts` の辞書（担当 B）。キーは `service`（メニュー／コース）・`staff`（担当／講師）・`customer`（お客さん／生徒）・`visit`（来店／出席）・`visited`（来店済み／出席済み）・`book`（予約する）・`trial`（体験）・`return_list`（そろそろ来店／そろそろ再受講）…。画面は直接日本語を書かず、辞書を引く。**1つの画面にサロンの言葉と教室の言葉を混ぜない。**

## 7. 架空のデータの元（担当 C → A）

- `data/salon.json`・`data/class.json`。キーは表の名前、中身は上の表の列のとおり。日時は `day_offset`（今日からの日数）と `time`（`HH:MM`）で書く。
- 量：各セットで、サービス6〜8（体験プランを1つ含む）、担当（講師）3人、顧客25人、予約60件（過去40・先20）、教室のクラス枠（定員4〜8）。名前・電話・メールはすべて架空（`090-0000-xxxx`、`example.com` を使う）。
- 画像の元：`data/images/`（雰囲気だけ。**金額・通常価格を画像に入れない**）。A の `scripts/make-seed.mjs` が JSON から `db/seed_*.sql` を作る。

## 8. 画面（URL）

- お客さん：`/book/`（サービスの選択）→ `/book/time/`（担当と日時）→ `/book/confirm/` → `/book/done/`、`/my/`（自分の予約の確認・変更・キャンセル）
- お店：`/today/`・`/calendar/`（日・週）・`/customers/`・`/customers/detail/?id=`・`/return/`（そろそろ来店）・`/settings/`（サービス・営業時間・休み）
- 共通：`/`（サロン／教室とお客さん／お店を選ぶ）。画面の隅に常に「架空のお店のデモです。データはこのブラウザの中にだけあります」。

## 変更の依頼（ここに足す）

- 【C→A・§7】JSON の日時の持ち方を次のとおり作った（詳細は [data/README.md](../data/README.md)）。`class_sessions`・`reservations` は `day_offset`＋`time`＋`end_time`（終わりの `HH:MM`）。`staff_off` は `day` の代わりに `day_offset`。`customers`・`reservations` は `created_at` の代わりに `created_day_offset`＋`created_time`。`id` は文字列（`st1`・`c01`・`r001`・`cs01` など）。`class_sessions` はサロンでは空配列。`history` は持たない。`settings` は `key`/`value` の配列。make-seed はこの形で読んでほしい。

- 【A→B・§5 役割】DB の役割は **`app_customer`／`app_shop`** の2つ（`policies.sql`）。`withRole('customer', id, fn)` は、トランザクションの中で `set local role app_customer` と `select set_config('app.user_id', <id>, true)`、`withRole('shop', null, fn)` は `set local role app_shop`。1本目の `app_user`＋`app.role` とは違う（`note`・`caution` を列の権限で隠すため）。**customer は `select * from customers` が使えない**（`permission denied`）。列を書く：`id, name, kana, phone, email, created_at, active`。予約の作成・変更・キャンセル・来店は関数だけ（表への直接の書き込みは付けていない）。seed・初期化は役割なし（スーパーユーザー）で流す。流す順番：`schema.sql`→`functions.sql`→`policies.sql`→`triggers.sql`→`seed_*.sql`。PGlite は `btree_gist`（`@electric-sql/pglite/contrib/btree_gist`）を `extensions` に渡して作る。
- 【A→B・§4 関数】①`available_slots` は列を1つ足した：`staff_id, starts_at, ends_at, remaining, session_id`（class のとき枠の id。timed は null）。timed は取れる枠だけ（remaining=1）、class は満席も remaining=0 で返す。直前・先すぎる枠は出ない。②`reserve`／`change_reservation` の class は、`staff_id`・`starts_at` を渡しても無視して枠のものを使う（`null` でよい）。③`due_for_return` はお店だけ（customer は `FORBIDDEN`）。④`mark_visited`／`mark_noshow` は `booked` の予約だけ（それ以外は `NOT_FOUND`）。キャンセルも `booked` だけ。⑤`DEADLINE_PASSED` は変更・キャンセルの両方（`FORBIDDEN` の次）。判定は「予約の開始日の前日の終わりまで」。⑥チェックの順番は §4 のとおり。教室で同じ人が同じ枠を二重に取ろうとしたときは `SLOT_FULL`（専用のコードは足さない）。
- 【A→B・§3 history】`action` は `create`／`change`／`cancel`／`visit`／`noshow`／`restore`／`update`。`actor` は `shop` または `customer:<id>`。`before`／`after` は予約の行の JSON（日時は `+09:00` つきの文字列）。お客さんは自分の予約のぶんだけ読める。
- 【A→全員・§2 設定の追加】`settings` に任意の `demo_time`（`HH:MM`。なければ `09:00`）を足した。デモの「今」＝ `demo_today` の `demo_time`（日本時間）。直前（`min_lead_hours`）と期限の判定に使う。画面の「今」もこれに合わせる（`select demo_now()`）。
- 【A→C・§7】`make-seed.mjs` は、C の `data/README.md` の形（`created_day_offset`＋`created_time`、`end_time`、`staff_off.day_offset`、`settings` の配列、`_readme` は読み飛ばし）で読む。
- 【履歴とメモ】①`reservations.note` を足した（お店のメモ。キャンセルの理由など）。**customer は予約の `note` と、`history` の `before`／`after`（note を含む）を列の権限で読めない**（`policies.sql`。customer は列を書く：予約は `id, customer_id, service_id, staff_id, session_id, starts_at, ends_at, price, is_trial, status, created_at`、履歴は `id, at, actor, action, reservation_id`）。②`set_reservation_status`・`set_reservation_note` を足した（§4）。`restore`＝予約済みに戻した（`booked` への修正）。メモだけの更新は `update`（`before.note` と `after.note` が違う）。③画面：カルテの予約・来店の履歴の各行に「メモ・修正」（状態の修正とメモ）。今日の画面の来店済み・無断欠席の予約に「予約済みに戻す」。お店側のキャンセルは、理由（任意）を書く編集欄が開く。④seed：キャンセル・無断欠席・一部の来店の予約に、架空のメモが入る（`make-seed.mjs` が順番で付ける。JSON に `note` があればそれを使う）。
