#!/usr/bin/env bash
# 重新生成 prebuilt/vue（需要 Node.js 20+）
set -euo pipefail

cd "$(dirname "$0")/../vue"

if ! command -v npm >/dev/null 2>&1; then
  echo "未找到 npm，请先安装 Node.js 20+ 并加入 PATH" >&2
  exit 1
fi

npm ci
npm run build

echo "已更新 prebuilt/vue"
