# 公開の手順（Cloudflare Pages）

Booking CRM は静的書き出し（`output: 'export'`）なので、ビルドした `out/` を置くだけで動く（サーバーなし・費用0）。データはブラウザの中（PGlite）にあるため、**Supabase などのサーバー側の準備は要らず、環境変数のキーもない**。公開先は `booking-crm.shikumikobo.com`（ドメインは Cloudflare にある）。1本目（Site Manager、`site-manager.shikumikobo.com`）と同じ型で、Cloudflare Pages のプロジェクトだけを別に作る。

**ルート（`/`）で配信する前提**で作ってある：サービスワーカーは `/sw.js`、マニフェストは `/manifest.webmanifest`、アイコンは `/icons/…`、`start_url` と `scope` は `/`。`next.config.mjs` に `basePath` はない（`trailingSlash: true`）。サブパス（`/something/`）には置けない。

## 流れ

1. **コードを公開リポジトリに写す**（AI または人。push は人が決める）
   - 写し先：`shikumikobo/samples` の `web/booking-crm/`（1本目は `web/app` などに入っている。2本目は `web/booking-crm/` に入れ、1本目とぶつけない）
   - 写すもの：`app/`・`db/`・`docs/`・`data/`・`scripts/make-seed.mjs`・`README.md`。写さないもの：`hearing.md`・`media/`（job の中だけの記録・動画の素材）・`node_modules`・`.next`・`out`・`next-env.d.ts`・`sql.generated.ts`・`*.tsbuildinfo`・`app/scripts/smoke-result.txt`
   - 写すスクリプト：`python scripts/publish-web.py --dry-run`（差分だけ）／`python scripts/publish-web.py`（`web/booking-crm/` だけを作り直して写す。`web/` のほかの場所には触らない）。写し先は `accounts/github-pages/repos/samples`（無ければ `python samples/_shared/publish_site.py --dry-run` で clone する）。コミット・push はしない。1本目の `site-manager/scripts/publish-web.py` は `web/booking-crm/` を消さない作りにしてある
2. **写し先でビルドが通ることを確かめる**（push の前に。一時のフォルダでよい）
   ```bash
   python scripts/publish-web.py --to "$TEMP/pubtest/booking-crm"   # 一時のフォルダに写す
   cd "$TEMP/pubtest/booking-crm/app" && npm ci && npm run build   # out/ ができれば OK
   ```
   - `npm run build` の前に `prebuild` が `../../db/*.sql`（`app/` から見て `booking-crm/db/`）を読んで `src/lib/db/sql.generated.ts` を作る。写し先に `db/` が要る
   - 作業フォルダの `app/` では 2026-11-08 に `npm run build` が通り、`out/` は 593 ファイル・23.6 MiB を確認。一時のフォルダに写して `npm ci` から `npm run build` も通り、`out/` は同じ 593 ファイルだった
   - ビルドのとき `next/font/google` が Google Fonts から BIZ UDPGothic・BIZ UDGothic を取り込むので、ネットワークが要る（Cloudflare のビルドは問題ない）
3. **Cloudflare Pages のプロジェクトを作る**（**人がする**。1-59）
   - Cloudflare のダッシュボード → Workers & Pages → Create → Pages → Connect to Git（shikumikobo の GitHub と連携。1本目と同じ連携でよい）
   - リポジトリ：`shikumikobo/samples`、ブランチ：`main`
   - プロジェクト名：`booking-crm`（`booking-crm` は他で使われていたため、URL は `booking-crm-7ge.pages.dev` になった。1本目のプロジェクトとは別にする）
   - Framework preset：`None`（または Next.js の「Static HTML Export」）
   - **ルートディレクトリ（Root directory）：`web/booking-crm/app`**
   - **ビルドコマンド：`npm ci && npm run build`**
   - **ビルドの出力ディレクトリ：`out`**
   - 環境変数：`NODE_VERSION` = `22`（`app/.node-version` にも書いてある）。ほかの環境変数は要らない
   - ルートを `web/booking-crm/app` にしても、`web/booking-crm/db/` がリポジトリにあれば足りる（Cloudflare はリポジトリ全体を取り込む）
   - 1本目のプロジェクト（ルート `web/app`）には触らない。同じリポジトリを2つのプロジェクトが見るが、どちらも自分のルートのビルドだけを使う（`web/` のどこかを更新すると、両方のビルドが走る）
4. **カスタムドメインを付ける**（人）
   - プロジェクト → Custom domains → Set up a domain → `booking-crm.shikumikobo.com`
   - ドメインは同じ Cloudflare のアカウントにあるので、CNAME（`booking-crm` → `booking-crm-7ge.pages.dev`）と証明書が自動で付く。1〜数分で開ける
   - 実績のページ（`shikumikobo.com`）はこれまでどおり GitHub Pages（A レコード）。サブドメインを足すだけなので、そちらと1本目には影響しない
5. **公開後の確認**（AI または人）
   - `https://booking-crm.shikumikobo.com/` が開き、サロン／教室とお客さん／お店の選択画面が出る（初回は DB の準備で数秒）
   - `pages.dev` の URL では `/sw.js` が `Cache-Control: no-cache` で返る。独自ドメインでは `max-age=14400`（1本目と同じ。ドメイン側のキャッシュの設定による）で、`cf-cache-status: REVALIDATED`。更新の反映は最大4時間遅れることがある
   - **画面の確認スクリプト（AI。`app/` で。Playwright が要る）**
     ```bash
     cd samples/web/booking-crm/app
     python -I scripts/smoke.py --base https://booking-crm.shikumikobo.com
     ```
     - 全URL（サロン・教室、お客さん・お店、スマホ幅 375px）が開いてエラー・横はみ出し・「準備中」の残りがないこと、サロンの主な流れ（体験プランを予約 → 同じ人の2回目は断られる → 「今日」「予約表」に出る → 来店済み）が通ることを確かめる
     - 結果は `scripts/smoke-result.txt`（Git には入れない）に出る。NG が0件ならよい。NG があれば、その行を元に直してから、もう一度流す
     - 公開版を操作しても、データはスクリプトのブラウザの中だけに残る。公開先にも他の人にも残らない
   - スマホで「ホーム画面に追加」（iPhone Safari：共有 → ホーム画面に追加／Android Chrome：インストール）。これは人がする（1-62）

## キャッシュとヘッダー（`app/public/_headers`）

Cloudflare Pages は、出力に `_headers` があれば読む（ビルドで `out/_headers` になる）。

| パス | 設定 | 理由 |
|---|---|---|
| `/sw.js` | `no-cache`・`Service-Worker-Allowed: /` | 更新をすぐ配るため（サービスワーカーは古いと更新が止まる） |
| `/manifest.webmanifest` | `application/manifest+json`・`no-cache` | PWA の型 |
| `/_next/static/*` | `immutable`・1年 | 名前に中身の印が付く（フォントのかけらも含む） |
| `/icons/*`・`/images/*` | 1日 | 差し替えることがあるため長くしない |
| `/*` | `nosniff`・`Referrer-Policy`・`Permissions-Policy`（カメラ・マイク・位置情報を使わない） | 基本の守り |

サービスワーカー（`sw.js`）の作り：画面（HTML）は通信を先にして、機内モードのときだけ保存したものを返す。`_next/static`・アイコンは保存を先に返す。作りを大きく変えたら `VERSION` の数字を上げる。

## 上限（Cloudflare Pages）に収まるか

| 項目 | 上限 | いまの値（2026-11-08、作業フォルダでのビルド） |
|---|---|---|
| 1ファイルの大きさ | 25 MiB | 最大 8.46 MiB（`pglite…wasm`） |
| ファイル数 | 20,000 | 593（出力 `out/`） |
| 出力の合計 | 制限は明記なし（ファイル数・大きさが上限） | 23.6 MiB（うち大半は Google Fonts の字種ごとの小さなかけら。使う字の分だけ読み込まれる） |
| ビルド時間 | 20分 | `next build` のみ約20秒（ローカル）。`npm ci` を含めて数分の見込み（Cloudflare 上では未確認） |

## 環境で変わる点

- `basePath`・`assetPrefix` は付けていない（ルート配信）。サブパスに置くなら、`next.config.mjs` と `public/sw.js`・`manifest.webmanifest` の絶対パスを直す
- 画面のデータはブラウザの中（PGlite）にあり、公開先を変えても、見る人の端末にだけ残る。サーバーに送るものはない
- デモの「今日」は 2026-11-09（月）に固定なので、いつ公開しても予約の日付はずれない
- 公開リポジトリ `samples` は GitHub Pages でも配信されるため、`shikumikobo.com/samples/web/booking-crm/…` でソースの静的ファイルも見える。ビルド済みの画面ではなく、ソースなので無害（すべて架空のデータ）
- `data/`（架空のデータの元・画像の元、148 KB）は公開リポジトリに入れる（ビルドには要らないが、すべて架空で、データの作り方を示せる）
