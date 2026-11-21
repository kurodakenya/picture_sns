# Photo SNS

承認制の小規模写真投稿SNS。AWSサーバーレス構成のポートフォリオプロジェクト。

## 構成図

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│   Browser    │────▶│  CloudFront  │────▶│  S3 (frontend)  │
│  (Next.js)   │     └──────────────┘     └─────────────────┘
└──────┬───────┘
       │ API
       ▼
┌──────────────┐     ┌──────────────┐     ┌─────────────────┐
│ API Gateway  │────▶│   Lambda     │────▶│    DynamoDB      │
│  (HTTP API)  │     │  (Node.js)   │     │ Posts / Likes    │
└──────────────┘     └──────┬───────┘     └─────────────────┘
       │                    │
       │ JWT認証             │ 署名付きURL
       ▼                    ▼
┌──────────────┐     ┌─────────────────┐
│   Cognito    │     │  S3 (uploads)   │
│  User Pool   │     │   画像保存      │
└──────────────┘     └─────────────────┘
```

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js 16 (Static Export), TypeScript, Tailwind CSS |
| 認証 | Amazon Cognito + Amplify Auth |
| API | Amazon API Gateway (HTTP API) + JWT Authorizer |
| バックエンド | AWS Lambda (Node.js 22) |
| データベース | Amazon DynamoDB (Posts, Likes) |
| ストレージ | Amazon S3 (画像 + フロントエンド配信) |
| CDN | Amazon CloudFront (OAC) |
| IaC | AWS SAM (CloudFormation) |
| CI/CD | GitHub Actions (OIDC認証) |

## 機能

- **ユーザー登録・ログイン** — Cognito承認制。管理者がAWSコンソールでユーザーを承認
- **写真投稿** — JPEG/PNG/HEIC対応。クライアント側でHEIC→JPEG変換、EXIF除去
- **タイムライン** — 全投稿を新しい順に表示。カーソルベースページネーション(20件ずつ)
- **いいね** — トグル式。TransactWriteで整合性を保証
- **投稿削除** — 自分の投稿のみ。DynamoDBレコード+S3画像を同時削除

## ディレクトリ構成

```
.
├── backend/           # Lambda関数 (TypeScript)
│   └── src/handlers/  # presign, createPost, getFeed, getMyPosts,
│                      # deletePost, likePost, unlikePost
├── frontend/          # Next.js アプリ (Static Export)
│   └── src/
│       ├── app/       # ページ (login, register, post, my-posts, timeline)
│       ├── components/# Header, PostCard, AuthGuard, AmplifyProvider
│       ├── hooks/     # useAuth
│       └── lib/       # api, auth, image, amplify-config
├── infra/
│   ├── template.yaml  # SAMテンプレート (メインスタック)
│   └── bootstrap.yaml # GitHub Actions OIDC用スタック
├── shared/types/      # フロント・バックエンド共通の型定義
├── scripts/
│   └── deploy.sh      # 手動デプロイスクリプト
├── docs/              # 仕様書・スケジュール管理
└── .github/workflows/
    └── deploy.yml     # CI/CD (test → deploy-backend → deploy-frontend)
```

## セットアップ

### 前提条件

- Node.js 22+
- AWS CLI (プロファイル設定済み)
- AWS SAM CLI

### 1. リポジトリのクローン

```bash
git clone https://github.com/kurodakenya/picture_sns.git
cd picture_sns
```

### 2. OIDCブートストラップ (初回のみ)

GitHub ActionsからAWSへのキーレス認証を設定する。

```bash
aws cloudformation deploy \
  --template-file infra/bootstrap.yaml \
  --stack-name photo-sns-github-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-1
```

出力されたRoleArnをGitHubリポジトリのSecrets (`AWS_ROLE_ARN`) に設定する。

### 3. バックエンドデプロイ

```bash
cd backend && npm ci && npm run build && cd ..
cd infra && sam build && sam deploy && cd ..
```

### 4. フロントエンドデプロイ

スタック出力から環境変数を取得してビルド・配信する。

```bash
bash scripts/deploy.sh
```

または、`main`ブランチへのpushでGitHub Actionsが自動デプロイを実行する。

### 5. ユーザー承認

ユーザーが登録申請後、AWSコンソール > Cognito > ユーザープール > ユーザーを選択し、「確認」操作で承認する。

## API

| メソッド | パス | 概要 |
|---|---|---|
| POST | `/uploads/presign` | アップロード用署名付きURL発行 |
| POST | `/posts` | 投稿登録 |
| GET | `/feed` | タイムライン取得 |
| GET | `/me/posts` | 自分の投稿一覧 |
| DELETE | `/posts/{postId}` | 投稿削除 |
| PUT | `/posts/{postId}/like` | いいね |
| DELETE | `/posts/{postId}/like` | いいね取り消し |

すべてのエンドポイントはCognito JWT認証が必要。

## テスト

```bash
cd backend
npm ci
npm test
```

Vitestで各Lambda関数のユニットテストを実行。

## コスト

AWS無料利用枠の範囲で運用可能。常時起動のサーバーやNAT Gatewayを使わない構成のため、個人利用規模であれば月額0〜数十円。

## ライセンス

MIT
