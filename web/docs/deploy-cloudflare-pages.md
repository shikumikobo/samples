# 公開の手順（Cloudflare Pages）

Site Manager は静的書き出し（`output: 'export'`）なので、ビルドした `out/` を置くだけで動く（サーバーなし・費用0）。公開先は `site-manager.shikumikobo.com`（ドメインは Cloudflare にある）。**ルート（`/`）で配信する前提**で作ってある：サービスワーカーは `/sw.js`、マニフェストは `/manifest.webmanifest`、アイコンは `/icons/…`、`next.config.mjs` に `basePath` はない。サブパス（`/something/`）には置けない。

## 流れ

1. **コードを公開リポジトリに写す**（AI または人。push は人が決める）
   ```bash
   python scripts/publish-web.py --dry-run   # 差分だけ出す（samples/web/site-manager/ で）
   python scripts/publish-web.py             # accounts/github-pages/repos/samples/web/ に写す
   cd accounts/github-pages/repos/samples && git status && git add web && git commit -m "web/ を更新" && git push
   ```
   - 写すもの：`app/`・`db/`・`docs/`・`tests/`・`README.md`・`scripts/make-sample-files.py`。写さないもの：`hearing.md`・`repo-rename.md`・`node_modules`・`.next`・`out`・`next-env.d.ts`・`sql.generated.ts`
   - 作業用の写しが無いとき：`python samples/_shared/publish_site.py --dry-run`（clone する）。このスクリプトは `web/` を消さない
2. **写し先でビルドが通ることを確かめる**（push の前に。一時のフォルダでよい）
   ```bash
   python scripts/publish-web.py --to "$TEMP/pubtest/web"
   cd "$TEMP/pubtest/web/app" && npm ci && npm run build   # out/ ができれば OK
   ```
   - 2026-11-06 に確認：`npm ci` と `npm run build` が通り、`out/` は 591 ファイル・約25 MiB（下の「上限」）
   - ビルドのとき `next/font/google` が Google Fonts から BIZ UDPGothic・BIZ UDGothic を取り込むので、ネットワークが要る（Cloudflare のビルドは問題ない）
3. **Cloudflare Pages のプロジェクトを作る**（**人がする**。1-36）
   - Cloudflare のダッシュボード → Workers & Pages → Create → Pages → Connect to Git（shikumikobo の GitHub と連携）
   - リポジトリ：`shikumikobo/samples`、ブランチ：`main`
   - プロジェクト名：`samples`（URL は `samples.pages.dev`。名前を変えるなら、下の「カスタムドメイン」はそのまま）
   - Framework preset：`None`（または Next.js の「Static HTML Export」）
   - **ルートディレクトリ（Root directory）：`web/app`**
   - **ビルドコマンド：`npm ci && npm run build`**
   - **ビルドの出力ディレクトリ：`out`**
   - 環境変数：`NODE_VERSION` = `22`（`app/.node-version` にも書いてある。ローカルの確認は Node 24 で、22 でのビルドは Cloudflare 上で初めて確かめる）
   - 「`prebuild` が `../db/*.sql` を読む」ので、ルートを `web/app` にしても、`web/db/` がリポジトリにあれば足りる（Cloudflare はリポジトリ全体を取り込む）
4. **カスタムドメインを付ける**（人）
   - プロジェクト → Custom domains → Set up a domain → `site-manager.shikumikobo.com`
   - ドメインは同じ Cloudflare のアカウントにあるので、CNAME（`site-manager` → `<プロジェクト>.pages.dev`）と証明書が自動で付く。1〜数分で開ける
   - 実績のページ（`shikumikobo.com`）はこれまでどおり GitHub Pages（A レコード）。サブドメインを足すだけなので、そちらには影響しない
5. **公開後の確認**（AI または人）
   - `https://site-manager.shikumikobo.com/` が開き、ログイン画面が出る（初回は DB の準備で約4秒）
   - 職人で入ると現場が3件、お客さんで入ると専用ページ
   - `https://site-manager.shikumikobo.com/sw.js` が `Cache-Control: no-cache`、`/_next/static/…` が `immutable` で返る（ブラウザの開発者ツール → Network）
   - スマホで「ホーム画面に追加」（iPhone Safari：共有 → ホーム画面に追加／Android Chrome：インストール）

## キャッシュとヘッダー（`app/public/_headers`）

Cloudflare Pages は、出力に `_headers` があれば読む（ビルドで `out/_headers` になる）。

| パス | 設定 | 理由 |
|---|---|---|
| `/sw.js` | `no-cache` | 更新をすぐ配るため（サービスワーカーは古いと更新が止まる） |
| `/manifest.webmanifest` | `application/manifest+json`・`no-cache` | PWA の型 |
| `/_next/static/*` | `immutable`・1年 | 名前に中身の印が付く（フォントのかけらも含む） |
| `/icons/*`・`/sample-files/*` | 1日 | 差し替えることがあるため長くしない |
| `/*` | `nosniff`・`Referrer-Policy`・`Permissions-Policy`（カメラ・マイク・位置情報を使わない） | 基本の守り |

サービスワーカー（`sw.js`）の作り：画面（HTML）は通信を先にして、機内モードのときだけ保存したものを返す。`_next/static`・アイコンは保存を先に返す。作りを大きく変えたら `VERSION` の数字を上げる。

## 上限（Cloudflare Pages）に収まるか

| 項目 | 上限 | いまの値（2026-11-06） |
|---|---|---|
| 1ファイルの大きさ | 25 MiB | 最大 8.46 MiB（`pglite…wasm`） |
| ファイル数 | 20,000 | 591（出力 `out/`） |
| 出力の合計 | 制限は明記なし（ファイル数・大きさが上限） | 約25 MiB（うちフォント 約23 MiB は、Google Fonts の字種ごとの小さなかけら498個。使う字の分だけ読み込まれる） |
| リポジトリに置く `web/` | — | 約2.2 MiB・104ファイル（サンプルのファイル 30件 約1.9 MiB を含む） |
| ビルド時間 | 20分 | 約15秒（ローカル）。`npm ci` を含めて数分 |

## 環境で変わる点

- `basePath`・`assetPrefix` は付けていない（ルート配信）。サブパスに置くなら、`next.config.mjs` と `public/sw.js`・`manifest.webmanifest` の絶対パスを直す
- 画面のデータはブラウザの中（IndexedDB）にあり、公開先を変えても、見る人の端末にだけ残る。サーバーに送るものはない
- 公開リポジトリ `samples` は GitHub Pages でも配信されるため、`shikumikobo.com/samples/web/…` でソースの静的ファイルも見える。ビルド済みの画面ではなく、ソースなので無害（すべて架空のデータ）
