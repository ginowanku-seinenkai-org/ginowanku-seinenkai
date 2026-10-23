# AGENTS.md（ginowanku-seinenkai）

宜野湾区青年会ホームページの**公開サイト**のリポジトリ（Public）。AI エージェントと開発者はこのファイルに従う。

## 1. このリポジトリについて

| 項目 | 内容 |
| --- | --- |
| 公開サイト | Astro の静的出力。`ginowanku-seinenkai.com`（Cloudflare Pages） |
| データ | ビルドのときだけ、Supabase の**公開用ビュー**を publishable キーで読む（`scripts/fetch-data.ts`・`scripts/fetch-photos.ts`）。画面から Supabase の表は読まない |
| 更新 | 管理画面で記事などを保存すると、`deploy.yml` が workflow_dispatch で起動されて作り直す。毎朝5:45ごろにも作り直す |
| 関連リポジトリ | 管理画面・DB・Edge Functions・設計書は `ginowanku-seinenkai-admin`（Private） |

**このリポジトリは誰でも見られる。** 秘密情報・個人情報・設計書の非公開の内容を、コード・コミット・Issue・プルリクエストに書かない。

## 2. 設計書（実装の正）

設計書は管理画面のリポジトリの `docs/` にある。手元では両リポジトリを同じ親フォルダに置き、`../ginowanku-seinenkai-admin/docs/` を読む。**実装は設計書に従い、書かれていないことを独断で足さない。**

| 作業 | 読む文書（`docs/detailed-design/`） |
| --- | --- |
| 画面・ビルド・SEO・問い合わせフォーム | 03 |
| 本文の変換（`src/lib/content/`） | 00 §2 |
| 文言・プライバシーポリシー | 06 |
| ワークフロー（`deploy.yml`、`ci.yml`） | 05 §2 |
| テスト | 07 |

- 優先順位：`09_decisions.md` ＞ `00_index.md` ＞ 01〜08・10〜12 ＞ 基本設計書 ＞ 要件定義書
- 見た目はデザイン見本（`docs/mockups/public-site.html`）、項目・動き・文言は 03・06 を正とする
- 改訂履歴、「主な変更」の節、「削除」「欠番」「不要」「廃止」の行は経緯の記録として読む
- 設計書の誤りや抜けに気づいたら、違う実装で済ませずに Nao に伝える。決まったら管理画面のリポジトリで `09_decisions.md` と関係する文書を直してから実装する

## 3. 進め方

1. 実装は `00_index.md` §6 の順番で、`develop` から切った `feature/<機能名>` ブランチで行う
2. 着手前に `08_open-items.md` §2.4 の検証タスクのうち、そのブランチの前に行うものを済ませる
3. `develop` へプルリクエストを作り、`ci.yml` の全ジョブが成功してから反映する。`develop` → `main` は公開前チェック（07 §10）のあと
4. コミット・プッシュ・プルリクエストの作成・マージは、Nao の指示があったときだけ行う
5. コミットメッセージは `種類: 内容`（内容は日本語）。種類は feat／fix／docs／refactor／test／chore

## 4. コマンド（03 §2.3 が正）

| 目的 | コマンド |
| --- | --- |
| 準備 | `pnpm install` |
| 固定データでビルド（ネットワークなし） | `pnpm build:fixture` |
| 本物のデータを取得してビルド | `pnpm fetch-data` → `pnpm fetch-photos` → `pnpm build` |
| 開発 | `pnpm dev`（先に `fetch-data`・`fetch-photos` か `build:fixture` の準備を済ませる） |
| 検査 | `pnpm lint`、`pnpm typecheck`、`pnpm test` |
| ビルド出力の検査 | `pnpm test:dist`（ビルドと同じ `PUBLIC_SITE_ENV` で実行） |
| 画面操作・表示速度 | `pnpm test:e2e`、`pnpm test:lhci`（`build:fixture` の出力に対して） |

テストとプルリクエストの検査は固定データ（`tests/fixtures/`）で行い、Supabase を起動しない（07 §1）。

## 5. 守ること

- 個人の氏名をサイトに出さない。例外は「役員紹介」（`/officers`）の役員の役職と氏名だけで、本人の同意を得て載せる（D-121）。写真の代替テキストにも氏名を書かない
- Supabase に接続するのは `scripts/fetch-data.ts` と `scripts/fetch-photos.ts` だけ。読むのは公開用のビューだけで、publishable キー以外を使わない
- 秘密の値は GitHub Secrets に置き、コードやログに出さない。公開してよい値だけを `PUBLIC_` で始まる環境変数にする（00 §8）
- 管理画面のリポジトリと共有するファイルは同じ内容に保つ：`src/lib/content/` はこのリポジトリが正、`src/lib/inquiry-schema.ts` は管理画面の `supabase/functions/_shared/inquiry-schema.ts` が正（00 §2.2）。変えるときは両方を直す
- 本文は TipTap の JSON を `renderBody()` で HTML にする。許可した要素以外は出さず、文字は必ずエスケープする（00 §2.1）
- プレビュー環境（`develop`）では、問い合わせの送信とアクセス計測を無効にし、検索エンジンに載せない（D-20）
- アクセス計測は Cookie を使わない。GPC・DNT が有効なら計測しない（03）
- 画面の文言は 06 の文面を使う。アクセシビリティ（代替テキスト、コントラスト、キーボード操作）は 03・07 の観点を満たす
- TypeScript（strict）。命名は 00 §3、日付の判定は日本時間（00 §4）
- コメント：ファイルの先頭に何のファイルかを1〜2行で書く。すべての関数（外から使わないもの、const に入れた関数を含む）のすぐ上に、日本語の TSDoc（`/** … */`）で、何をするか・`@param`（引数ごと）・`@returns`（値を返すとき）・`@throws`（わざと例外にするとき）を書く。外から使う型・定数にも1行の説明を付ける。.astro は frontmatter と `<script>` の中に書く。配列などに直接渡す小さな関数と、テストのファイルは除く。このリポジトリは公開なので、設計書の非公開の内容は書かず、節の番号（`03 §8.4` など）だけを添える

## 6. 応答

- Nao への説明・質問・報告は日本語で行う
