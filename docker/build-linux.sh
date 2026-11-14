#!/usr/bin/env bash
# 重新生成 prebuilt/linux-x64（需要本机安装 Flutter 3.50+）
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v flutter >/dev/null 2>&1; then
  echo "未找到 flutter，请先安装 Flutter 3.50+ 并加入 PATH" >&2
  exit 1
fi

flutter build linux --release \
  --dart-define=KA_MUSIC_API_BASE_URL=http://127.0.0.1:3005

rm -rf prebuilt/linux-x64
mkdir -p prebuilt/linux-x64
cp -a build/linux/x64/release/bundle/. prebuilt/linux-x64/

echo "已更新 prebuilt/linux-x64"
