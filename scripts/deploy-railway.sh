#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "Set RAILWAY_TOKEN first (Project Settings → Tokens on Railway)."
  echo "  export RAILWAY_TOKEN=\"your_token\""
  exit 1
fi

echo "Linking to Railway project (choose for-you-rss / production)..."
npx @railway/cli link

echo "Deploying..."
npx @railway/cli up

echo "Done. Set PUBLIC_BASE_URL and ADMIN_API_KEY in Railway Variables, then update extension Options."
