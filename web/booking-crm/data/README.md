# data（架空のデータの元と画像）

すべて架空。実在の店・人・電話・メールではない（電話は `090-0000-xxxx`、メールは `example.com`）。形は [docs/contract.md](../docs/contract.md) の §3・§7。

| ファイル | 中身 |
|---|---|
| `salon.json` | ネイルサロン（個人経営・スタッフ3人）。`settings.mode` = `salon` |
| `class.json` | 料理教室（講師3人・1回4〜8人）。`settings.mode` = `class` |
| `validate.py` | 両方の JSON を確かめる（`python data/validate.py`）。量・重なりなし・定員内・同日2件以内・必須の列・体験1人1回・画像があること・そろそろ来店が3〜8人 |
| `tools/build_data.py` | JSON を作る（決まった乱数。同じ結果になる） |
| `tools/build_images.py` | 画像とアイコンを作る（自作の SVG を playwright で PNG に） |

## JSON の形

- 最上位のキーは表の名前：`settings`（`key`/`value` の配列）・`services`・`staff`・`staff_hours`・`staff_off`・`class_sessions`（サロンは空）・`customers`・`reservations`。履歴（`history`）はトリガーが書くので持たない。`_readme` は読み飛ばす。
- 日時は `day_offset`（デモの今日 2026-11-09 からの日数。負は過去）と `time`（`HH:MM`）。終わりは `end_time`（同じ日の `HH:MM`）。
- 契約の表にない列は、日時を分けた次の2つだけ：`staff_off.day_offset`（`day` の代わり）、`customers`・`reservations` の `created_day_offset`＋`created_time`（`created_at` の代わり）。`class_sessions` と `reservations` は `day_offset`＋`time`＋`end_time`。
- `id` は文字列：担当 `st1`〜`st3`（サロン）・`t1`〜`t3`（教室）、顧客 `c01`〜`c25`、予約 `r001`〜`r060`（日時の順）、枠 `cs01`〜。
- `settings.mode` 以外の設定値は、契約どおり（`demo_today`・`slot_minutes`・`booking_window_days`・`min_lead_hours`・`max_per_day`・`cancel_deadline`）。
- 顧客 `email` は null の人がいる（電話だけ）。`caution`・`note` は空文字のことがある。

## 量

- 各セット：サービス7（体験1）・担当3・顧客25・予約60（過去40：来店済み34・キャンセル3・無断欠席3、先20：予約済み）。
- 教室：クラス枠は今日の -28〜+14 日（過去の枠は予約のあるものだけ）、定員 4・5・6・8。
- 体験：料金 2,500円、`is_trial`・`first_time_only` = true、1人1回。体験のあと通常メニューに来た人が6人、体験だけの人2人、体験を無断欠席した人1人、体験を先に予約している人2人。
- そろそろ来店：サロン5人、教室4人（最後の来店 + `return_days` が今日以前）。`return_days`：サロンは 21〜35（体験21）、教室は 14（体験10）。

## 画像と一覧の対応

`app/public/images/<サービスid>.png`（800×520・各20〜45KB）。JSON の `image` と同じ名前。絵の中に文字・金額は入れない。

| サービス id | 名前 | 絵 |
|---|---|---|
| `nail_trial` | はじめてのジェルネイル体験 | リボンと5色のネイル、きらめき（体験のお得感） |
| `nail_onecolor` | ワンカラージェル | 同じ色の5本の爪の手とマニキュア瓶 |
| `nail_art` | アートネイル | 柄の違う爪の手（フレンチ・グラデ・ドット・ストライプ） |
| `nail_foot` | フットジェル | 足と波、貝 |
| `nail_off` | オフ＋ハンドケア | コットンとリムーバーの瓶 |
| `nail_care` | ハンドケア（甘皮・保湿） | クリームの容器・ウッドスティック・花 |
| `nail_repair` | 付け替え・リペア | 補修した爪とファイル |
| `cook_trial` | はじめての料理教室（体験） | リボンと湯気の立つ鍋、きらめき（体験のお得感） |
| `cook_washoku` | 基本の和食 | ごはん・味噌汁・焼き魚 |
| `cook_western` | 定番の洋食 | ハンバーグの皿とフォーク |
| `cook_italian` | 手打ちパスタ | パスタの皿とトマト |
| `cook_bread` | 手ごねパン | パンと麦の穂 |
| `cook_sweets` | 季節のお菓子 | いちごのケーキと泡立て器 |
| `cook_ferment` | 発酵ごはん（味噌・ぬか漬け） | 味噌の容器とぬか漬け |

アイコン：`app/public/icons/icon-192.png`・`icon-512.png`（カレンダーとチェック。背景は全面塗り）。

## 作り直す

```bash
python data/tools/build_data.py
python data/tools/build_images.py
python data/validate.py
```
