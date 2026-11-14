#!/usr/bin/env bash
# 重新生成 prebuilt/web（需要本机安装 Flutter 3.50+）
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v flutter >/dev/null 2>&1; then
  echo "未找到 flutter，请先安装 Flutter 3.50+ 并加入 PATH" >&2
  exit 1
fi

flutter build web --release \
  --dart-define=KA_MUSIC_API_BASE_URL=/api

rm -rf prebuilt/web
mkdir -p prebuilt/web
cp -a build/web/. prebuilt/web/

echo "已更新 prebuilt/web"
