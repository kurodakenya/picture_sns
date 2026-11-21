#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== 1/4  Backend build ==="
cd "$PROJECT_ROOT/backend"
npm run build

echo "=== 2/4  SAM deploy ==="
cd "$PROJECT_ROOT/infra"
sam build --template-file template.yaml
sam deploy

STACK_NAME="picture-sns"
REGION="ap-northeast-1"
PROFILE="picture-sns"

echo "=== 3/4  Frontend build ==="
API_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text)
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" \
  --output text)
USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" \
  --output text)
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='ContentBucketName'].OutputValue" \
  --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" \
  --output text)
CF_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --profile "$PROFILE" \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontUrl'].OutputValue" \
  --output text)

cd "$PROJECT_ROOT/frontend"
NEXT_PUBLIC_API_URL="$API_URL" \
NEXT_PUBLIC_USER_POOL_ID="$USER_POOL_ID" \
NEXT_PUBLIC_USER_POOL_CLIENT_ID="$USER_POOL_CLIENT_ID" \
npm run build

echo "=== 4/4  Frontend deploy to S3 + CloudFront invalidation ==="
aws s3 sync out/ "s3://$BUCKET_NAME/frontend/" \
  --delete \
  --region "$REGION" \
  --profile "$PROFILE"

aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --profile "$PROFILE"

echo ""
echo "=== Deploy complete ==="
echo "URL: $CF_URL"
