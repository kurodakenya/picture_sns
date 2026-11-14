# 写真SNS（仮称）設計書

最終更新：2026-11-13

## 1. システムアーキテクチャ

### 1.1 全体構成

```
[ブラウザ (Next.js SPA)]
    │
    ├─ クライアント側前処理（HEIC→JPEG変換、EXIF除去）
    │
    ├─ 静的ファイル取得 ──→ [CloudFront] ──→ [S3 (静的ファイル＋画像)]
    │
    ├─ API呼び出し ──→ [API Gateway (HTTP API)]
    │                     │
    │                     ├─ JWT検証 ──→ [Cognito ユーザープール]
    │                     │
    │                     └─ ルーティング ──→ [Lambda (Node.js/TypeScript)]
    │                                           │
    │                                           ├─ メタデータ読み書き ──→ [DynamoDB]
    │                                           │
    │                                           └─ 署名付きURL発行 ──→ [S3]
    │
    └─ 画像アップロード（署名付きURL） ──→ [S3 (非公開)]
```

### 1.2 技術スタック

| 領域 | 採用技術 | 備考 |
|---|---|---|
| フロントエンド | Next.js 16 / React 19 / TypeScript | 静的書き出し（`output: 'export'`） |
| スタイリング | Tailwind CSS | シカくん・ジャーナルと統一 |
| 認証クライアント | Amplify Auth ライブラリ | Cognito接続用のみ。ホスティングはAmplify不使用 |
| 画像前処理 | heic2any / piexifjs（クライアント側） | HEIC→JPEG変換・EXIF除去をブラウザで実行 |
| API | API Gateway（HTTP API） | REST APIより安価。Cognito JWTオーソライザー |
| バックエンド | Lambda（Node.js / TypeScript） | フロントと型を共有 |
| DB | DynamoDB（オンデマンドモード） | メタデータのみ格納 |
| IaC | AWS SAM | サーバーレス特化。sam local でローカルテスト可 |
| CI/CD | GitHub Actions | フロントビルド＆S3同期、Lambdaデプロイ自動化 |
| テスト | Vitest | Lambda単体テスト、フロントのコンポーネントテスト |

---

## 2. インフラ設計

### 2.1 AWSリソース一覧

| サービス | 用途 | 設定ポイント |
|---|---|---|
| S3 | 静的ファイル＋画像の保存（1バケット） | CloudFront OAC経由＋署名付きURL。完全非公開 |
| CloudFront | フロントエンド配信 | `https://◯◯.cloudfront.net`。HTTPS・証明書無料。SPA用に403/404→index.htmlフォールバック設定 |
| API Gateway | REST API エンドポイント | HTTP API。デフォルトURL（execute-api）使用 |
| Lambda | ビジネスロジック | Node.js / TypeScript |
| DynamoDB | 投稿・いいねメタデータ | オンデマンドモード |
| Cognito | ユーザー認証・承認制 | ユーザープール |

### 2.2 S3バケット設計

#### 統合バケット（1バケット構成）

```
picture-sns/
├── frontend/                      ← Next.js静的ファイル
│   ├── index.html
│   ├── _next/
│   │   ├── static/
│   │   └── ...
│   └── ...
├── uploads/                       ← 画像ファイル
│   └── {userId}/
│       └── {uuid}.{ext}          ← EXIF除去済み画像（クライアント側で除去）
```

- パブリックアクセスブロック：すべて有効
- `frontend/` → CloudFront OAC（Origin Access Control）経由でアクセス
- `uploads/` → 署名付きURL（有効期限つき）でアクセス
- CORSの設定：フロントエンドからの直接アップロードを許可

### 2.3 リージョン

- **ap-northeast-1（東京）** を使用

### 2.4 コスト設計

| 項目 | 単価 | 個人利用での見込み |
|---|---|---|
| S3 保存 | $0.025/GB/月 | 月100枚（3MB/枚）で年約4GB → 月15円程度（フロント＋画像同居） |
| Lambda | 月100万リクエストまで無料枠 | 実質0円 |
| API Gateway | $1.00/100万リクエスト | 月数千リクエストで1円未満 |
| DynamoDB | ストレージ25GBまで無料枠 | 実質0円 |
| CloudFront | 月1TB転送＋1,000万リクエストまで無料枠 | 実質0円 |
| Cognito | 小規模では課金なし | 0円 |

**合計：月0〜数十円**

#### コストの罠（回避事項）

- NAT Gatewayは絶対に置かない（月約$45の固定費が発生）
- CloudWatch Logsの保持期間を短めに設定（1〜7日程度）
- VPCにLambdaを入れない（NAT Gateway不要の構成を維持）

---

## 3. データ設計

### 3.1 DynamoDBテーブル設計

#### Posts テーブル

| 属性名 | 型 | 説明 |
|---|---|---|
| postId | String (UUID) | パーティションキー |
| userId | String | 投稿者のCognito sub |
| caption | String | キャプション（最大200文字） |
| userName | String | 投稿時の表示名（Cognitoから非正規化） |
| s3Key | String | 画像のS3キー |
| createdAt | String (ISO 8601) | 投稿日時 |
| likeCount | Number | いいね数（アトミックカウンター） |

**GSI: PostsByCreatedAt**

| 属性名 | 役割 |
|---|---|
| GSI PK | 固定値（例: `"ALL"`）※ホットパーティション対策は小規模のため不要 |
| GSI SK | createdAt（降順ソート用） |

用途：タイムラインの新しい順表示

**GSI: PostsByUser**

| 属性名 | 役割 |
|---|---|
| GSI PK | userId |
| GSI SK | createdAt（降順ソート用） |

用途：マイ投稿一覧

#### Likes テーブル

| 属性名 | 型 | 説明 |
|---|---|---|
| postId | String | パーティションキー |
| userId | String | ソートキー |
| createdAt | String (ISO 8601) | いいね日時 |

- 複合キー（postId × userId）で重複いいね防止
- いいね時：DynamoDB TransactWriteで以下を1トランザクションで実行
  - Likesテーブルにput（ConditionExpression で重複防止）
  - PostsテーブルのlikeCountをインクリメント
- 取り消し時：DynamoDB TransactWriteで以下を1トランザクションで実行
  - Likesテーブルからdelete
  - PostsテーブルのlikeCountをデクリメント
- TransactWriteにより、Likesレコードとカウンターの整合性を保証

### 3.2 ユーザー情報

- Cognitoユーザープールが正（マスタデータ）
- DynamoDBには userId と userName を保持（Postsテーブルのフィールドとして）
- userName は投稿時に Cognito の `preferred_username` から取得し、Postsテーブルに非正規化して保存
- 表示名は登録後の変更不可（非正規化の整合性を維持するため）
- フィード取得時は Cognito への問い合わせ不要（Postsテーブルから直接返す）

---

## 4. 認証設計

### 4.1 Cognito ユーザープール

- サインアップ：メールアドレス＋パスワード＋表示名
- 表示名は `preferred_username` 属性に保存（1〜20文字、空白のみ不可）
- メール検証：自動メール検証を有効化
- 承認制：Cognitoの「管理者による確認」機能を使用
  - サインアップ後、管理者がコンソールで確認操作するまでログイン不可
- パスワードポリシー：Cognitoデフォルト（8文字以上、大小英数字＋記号）

### 4.2 認証フロー

```
[ブラウザ] ──→ Amplify Auth ──→ [Cognito]
                                    │
                                    ├─ サインアップ → 「未確認」状態
                                    │
                                    ├─ 管理者確認 → 「確認済み」状態
                                    │
                                    └─ ログイン → JWT発行
                                                    │
                                                    └─ APIリクエストのAuthorizationヘッダーに付与
                                                        │
                                                        └─ API Gateway JWTオーソライザーで検証
```

### 4.3 JWT

- API GatewayのHTTP API組み込みJWTオーソライザーを使用
- トークンはAuthorizationヘッダーにBearerトークンとして送信
- Lambda内ではevent.requestContext.authorizerからユーザー情報を取得

---

## 5. 画像処理設計

### 5.1 アップロードフロー

```
1. [ブラウザ] ユーザーが写真を選択
2. [ブラウザ] HEICならJPEGに変換（heic2any）
3. [ブラウザ] EXIF（GPS等）を除去（piexifjs等）
4. [ブラウザ] POST /uploads/presign → [Lambda] → 署名付きURL発行
5. [ブラウザ] PUT（署名付きURL） → [S3 uploads/] に画像保存
6. [ブラウザ] POST /posts → [Lambda] → DynamoDBにメタデータ登録
7. [ブラウザ] タイムラインに遷移
```

### 5.2 クライアント側画像処理

| 項目 | 仕様 |
|---|---|
| HEIC変換 | heic2anyでJPEGに変換。JPEG/PNGはそのまま |
| EXIF除去 | piexifjs等でGPS・カメラ情報を除去 |
| サムネイル | MVPでは生成しない。原寸画像をCSSでサイズ制御して表示 |
| 処理タイミング | ファイル選択後、アップロード前にブラウザ上で実行 |
| UX | 変換中はローディング表示（HEICの場合2〜3秒） |

### 5.3 署名付きURL

| 用途 | 有効期限（仮） |
|---|---|
| アップロード用 | 5分 |
| 表示用 | 1時間 |

- 表示用URLはフィード取得時（GET /feed, GET /me/posts）にまとめて発行
- CloudFrontの署名付きURLではなく、S3の署名付きURLを使用（MVP段階）

---

## 6. IaC（AWS SAM）

### 6.1 選定理由

- サーバーレスに特化しており、Lambda + API Gateway + DynamoDB の定義が最小限の記述で済む
- `sam local invoke` / `sam local start-api` でローカルテストが可能
- Phase B（シカくんAWS移行）はTerraformを使用予定 → ツールを使い分けることで各ツールの得意領域で経験を積む

### 6.2 SAMテンプレート構成（案）

```
infra/
├── template.yaml              ← SAMテンプレート（メイン）
├── samconfig.toml             ← デプロイ設定
└── ...
```

template.yaml で定義するリソース:
- `AWS::Serverless::Function`（API用Lambda × 7ハンドラー）
- `AWS::Serverless::HttpApi`（API Gateway HTTP API + Cognito JWTオーソライザー）
- `AWS::DynamoDB::Table`（Posts, Likes）
- `AWS::S3::Bucket`（統合バケット）
- `AWS::CloudFront::Distribution`
- `AWS::Cognito::UserPool` + `UserPoolClient`

---

## 7. CI/CD設計

### 7.1 GitHub Actions ワークフロー

#### フロントエンドデプロイ

```
trigger: push to main (frontend/**変更時)

steps:
  1. npm ci
  2. npm run build (next build → next export)
  3. aws s3 sync out/ s3://picture-sns/frontend/ --delete
  4. aws cloudfront create-invalidation (キャッシュクリア)
```

#### Lambdaデプロイ

```
trigger: push to main (backend/**変更時)

steps:
  1. npm ci
  2. npm run test (Vitest)
  3. npm run build (TypeScriptビルド)
  4. sam build
  5. sam deploy
```

---

## 8. ディレクトリ構成（案）

```
picture-sns/
├── docs/                          # ドキュメント
│   ├── SPEC.md                    # 仕様書（本ファイル）
│   └── DESIGN.md                  # 設計書（本ファイル）
├── frontend/                      # Next.jsフロントエンド
│   ├── src/
│   │   ├── app/                   # App Router ページ
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # ログイン画面
│   │   │   ├── feed/
│   │   │   │   └── page.tsx       # タイムライン
│   │   │   ├── post/
│   │   │   │   └── page.tsx       # 投稿画面
│   │   │   └── my-posts/
│   │   │       └── page.tsx       # マイ投稿一覧
│   │   ├── components/            # 共通コンポーネント
│   │   ├── hooks/                 # カスタムフック
│   │   ├── lib/                   # ユーティリティ・API呼び出し
│   │   │   ├── api.ts             # APIクライアント
│   │   │   └── auth.ts            # Amplify Auth設定
│   │   └── types/                 # 型定義（バックエンドと共有）
│   ├── public/
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── backend/                       # Lambda関数
│   ├── src/
│   │   ├── handlers/              # Lambda ハンドラー
│   │   │   ├── presign.ts         # POST /uploads/presign
│   │   │   ├── createPost.ts      # POST /posts
│   │   │   ├── getFeed.ts         # GET /feed
│   │   │   ├── getMyPosts.ts      # GET /me/posts
│   │   │   ├── deletePost.ts      # DELETE /posts/{postId}
│   │   │   ├── likePost.ts        # PUT /posts/{postId}/like
│   │   │   └── unlikePost.ts      # DELETE /posts/{postId}/like
│   │   ├── lib/                   # 共通ロジック
│   │   │   ├── dynamodb.ts        # DynamoDB操作
│   │   │   ├── s3.ts              # S3操作
│   │   │   └── response.ts        # レスポンスヘルパー
│   │   └── types/                 # 型定義（フロントと共有）
│   ├── tests/                     # Vitestテスト
│   │   └── handlers/
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── package.json
├── infra/                         # AWS SAM
│   ├── template.yaml             # SAMテンプレート
│   └── samconfig.toml            # デプロイ設定
├── shared/                        # フロント・バックエンド共有の型定義
│   └── types/                     # tsconfig paths で @shared/* として参照
│       ├── post.ts                # Post, Like エンティティ型
│       └── api.ts                 # APIリクエスト/レスポンス型
├── .github/
│   └── workflows/
│       ├── deploy-frontend.yml
│       └── deploy-backend.yml
├── README.md
└── .gitignore
```

---

## 9. セキュリティ設計

### 9.1 対策一覧

| 脅威 | 対策 |
|---|---|
| 不正アクセス | Cognito認証＋承認制 |
| API不正利用 | JWT検証（API Gateway組み込み） |
| 画像直接アクセス | S3完全非公開＋署名付きURL |
| 位置情報漏洩 | クライアント側でアップロード前にEXIF除去 |
| 不正ファイルアップロード | Content-Type制限＋サイズ上限 |
| XSS | Next.jsのデフォルトエスケープ |
| CSRF | API Gateway＋JWTで対策（Cookie不使用） |

### 9.2 S3セキュリティ

- パブリックアクセスブロック：すべて有効
- バケットポリシー：CloudFront OAC（frontend/）/ Lambda実行ロール（uploads/）のみ許可
- 暗号化：S3マネージド暗号化（SSE-S3）

---

## 10. 開発ステップ

| # | フェーズ | 内容 | 理解チェック |
|---|---|---|---|
| 1 | 環境構築 | AWSアカウント確認、IaC選定・初期設定 | IaCの基本概念を説明できるか |
| 2 | 認証 | Cognito設定、承認フロー動作確認、フロントのログイン画面 | Cognitoの認証フロー・JWTの仕組みを説明できるか |
| 3 | 投稿機能 | 署名付きURLアップロード、クライアント側HEIC変換＋EXIF除去、メタデータ登録、タイムライン表示 | 署名付きURLの仕組み・S3直接アップロードを説明できるか |
| 4 | いいね・削除 | いいねトグル、投稿削除（DB＋S3） | DynamoDBのアトミック操作・トランザクションを説明できるか |
| 5 | 公開 | CloudFront配信設定、README整備、GitHub公開 | CloudFrontの配信設定・キャッシュの仕組みを説明できるか |

### 転職の弱点対策として意識するポイント

- Lambda には**単体テストを書く**（「自動テストあり」の実績にする）
- インフラは**コード化**してREADMEに**構成図**を置く

---

## 11. 開発スタイル

- **AI駆動開発**：Claudeと相談しながら進める
- **理解チェック**：部品が1つ完成するごとに、自分の言葉で仕組みを説明できるか確認
  - 説明できないところはその場で潰す
  - コードを全部自力で書くことは目標にしない
  - 弱点補強は「読めないコードを残さない」形で実施
