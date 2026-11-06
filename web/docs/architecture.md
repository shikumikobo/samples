# 設計の図（Site Manager）

全体のしくみ、権限の判定の流れ、表の関係、外部ユーザーの見える範囲を、図で示します。図は [Mermaid](https://mermaid.js.org/) で書いてあり、GitHub 上ではそのまま図として表示されます。

元のコードは次のとおりです。

- 表：[db/schema.sql](../db/schema.sql)
- 判定の関数：[db/functions.sql](../db/functions.sql)
- 行ごとの制御（RLS）：[db/policies.sql](../db/policies.sql)
- 履歴のトリガー：[db/triggers.sql](../db/triggers.sql)
- ブラウザの中のデータベース：[app/src/lib/db/index.ts](../app/src/lib/db/index.ts)

## 1. 全体

```mermaid
flowchart LR
  subgraph Browser["利用者のブラウザ"]
    direction TB
    UI["画面（Next.js・React）<br/>静的なファイルとして配られる"]
    SW["サービスワーカー<br/>（機内モードでも開く）"]
    Role["役割の切り替え<br/>（localStorage に保存）"]
    DB[("PGlite<br/>ブラウザの中の PostgreSQL<br/>IndexedDB に保存")]
    UI --> Role
    UI -->|"withRole(user, SQL)"| DB
    SW -.保存.-> UI
  end
  Host["静的なファイルの置き場所<br/>（Cloudflare Pages など。サーバーなし）"] -->|"画面と架空のファイルだけ"| UI
  SQL["db/*.sql<br/>表・関数・RLS・トリガー・架空のデータ"] -->|"ビルド時に画面へ埋め込む"| UI
  UI -.初回だけ流す.-> DB
```

画面は、静的なファイルとして配られます。データは配らず、ブラウザの中の PGlite に入ります。初めて開いたときに、ビルドで埋め込んだ SQL（表・権限の判定・RLS・架空のデータ）を流します。流し終わると `_demo_ready` の印を付け、途中で止まったときは次に開いたとき作り直します。「最初に戻す」は、同じ SQL を流し直します。

## 2. 権限の判定の流れ

```mermaid
sequenceDiagram
  participant S as 画面
  participant W as withRole（app/src/lib/db）
  participant P as PGlite（PostgreSQL）
  participant R as RLS（db/policies.sql）
  participant H as has_permission()（db/functions.sql）
  participant T as role_permissions（表）

  S->>W: withRole(利用者, 取引の中の処理)
  W->>P: begin
  W->>P: set local role app_user
  W->>P: set_config('app.user_id', 利用者のID)<br/>set_config('app.role', 役割)
  S->>P: select … from sites
  P->>R: 行ごとに policy を評価
  R->>H: has_permission('site.view_all') など
  H->>T: 今の役割の権限を引く
  T-->>H: あり／なし
  H-->>R: true / false
  R-->>P: 見てよい行だけ
  P-->>S: 結果（見えない行は返らない）
  W->>P: commit（set local は取引で消える）
```

画面は、必ず `withRole` の中で SQL を実行します。`app_user` という権限の弱い役割に切り替えるので、行ごとの制御（RLS）が必ず効きます。見える範囲は DB が決めるので、画面側で出し分けを間違えても、見えてはいけない行は返りません。

利用者と役割は、取引の中のセッション設定（`app.user_id`・`app.role`）で渡します。本番で Supabase にするときは、この取り出し（`current_user_id()`・`current_app_role()`）だけを認証に置き換えます。

## 3. 表の関係

```mermaid
erDiagram
  customers ||--o{ sites : "依頼する"
  app_users ||--o{ sites : "担当する（staff_id）"
  sites ||--o| site_finance : "契約金額を持つ"
  sites ||--o{ schedules : "予定する"
  app_users ||--o{ schedules : "作業する（staff_id）"
  sites ||--o{ quotes : "見積もる"
  quotes ||--|{ quote_lines : "含む"
  app_users ||--o{ quotes : "作る（created_by）"
  sites ||--o{ files : "ファイルを持つ"
  app_users ||--o{ files : "登録する（uploaded_by）"
  sites ||--o{ site_access : "許可する"
  app_users ||--o{ site_access : "見てよい（外部）"
  permissions ||--o{ role_permissions : "割り当てる"

  app_users {
    text id PK "E-01・外部は X-01"
    text name
    app_role role "owner staff worker customer partner"
    text title
    bool active
  }
  customers {
    text id PK "C-0001"
    text name
    text address
  }
  sites {
    text id PK "S-2611-01"
    text customer_id FK
    text name
    site_status status
    text staff_id FK
    date planned_start
    date planned_end
  }
  site_finance {
    text site_id PK "金額は別の表"
    int contract_amount
  }
  schedules {
    text id PK
    text site_id FK
    date day
    text work
    text staff_id FK
    text status "予定・取消"
  }
  quotes {
    text id PK "Q-2611-01-1"
    text site_id FK
    text status "下書き・提出・承認"
    numeric tax_rate
  }
  quote_lines {
    text quote_id PK, FK
    int line_no PK
    text item
    numeric qty
    int unit_price
  }
  files {
    text id PK
    text site_id FK
    text kind "図面・写真・書類"
    text path
    file_visibility visibility
  }
  site_access {
    text site_id PK, FK
    text user_id PK, FK
  }
  permissions {
    text code PK
    text label
  }
  role_permissions {
    app_role role PK
    text permission PK, FK
  }
  audit_log {
    bigint id PK
    text user_id
    text table_name
    text row_id
    text action
    jsonb before_row
    jsonb after_row
  }
```

見積の金額は、明細の「数量 × 単価」の合計に対して、消費税を1回（10%・切り捨て）かけて出します。契約金額は、職人に見せないために `site_finance` という別の表に分けています（列ごとの RLS は書けないためです）。

`audit_log`（変更の履歴）は、ほかの表と線で結んでいません。現場・見積・明細・ファイル・許可・予定の変更を、トリガーが書きます。画面から書き換えることはできません。

## 4. 外部ユーザー（お客さん・協力業者）の見える範囲

```mermaid
flowchart TD
  U["外部ユーザー<br/>（お客さん customer／協力業者 partner）"]
  A{{"site_access<br/>（現場 × ユーザー）<br/>社内の人が付け外しする"}}
  U --> A
  A -->|"許可された現場だけ"| Site["現場 sites"]
  Site --> Sch["予定 schedules<br/>（取消は除く）"]
  Site --> F{"ファイルの共有先<br/>files.visibility"}
  Site --> Q["見積 quotes・明細<br/>状況が「提出」「承認」だけ"]
  F -->|"customer・both"| FC["お客さんに見える"]
  F -->|"partner・both"| FP["協力業者に見える"]
  F -->|"internal"| FN["外部には見えない"]
  Q -->|"お客さんだけ"| QC["お客さんに見える"]
  Q -->|"協力業者"| QP["見えない（金額なし）"]
  Site -.-> Fin["site_finance（契約金額）<br/>外部には出さない"]
```

外部ユーザーが見られるのは、`site_access` で許可された現場だけです。そのうえで、ファイルは共有先（`internal`・`customer`・`partner`・`both`）で絞られ、見積はお客さんだけ、提出・承認の状況のものだけが見えます。協力業者には、金額も見積も出ません。

社内の人が許可を外す、またはファイルの共有先を `internal` に戻すと、次の読み込みから外部の画面に出なくなります。外部ユーザーが社内の画面（`/sites/` など）を開いたときは、専用ページ（`/portal/`）に戻されます。
