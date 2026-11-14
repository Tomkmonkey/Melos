#!/usr/bin/env bash
# 同时运行 KuGouMusicApi（127.0.0.1:3006）与会话网关（0.0.0.0:3005）。
set -euo pipefail

cd /app/kugou-api
node app.js &
api_pid=$!

node /app/gateway/server.js &
gateway_pid=$!

cleanup() {
  kill "$api_pid" "$gateway_pid" 2>/dev/null || true
}
trap cleanup TERM INT

set +e
wait -n
status=$?
cleanup
wait 2>/dev/null
exit "$status"
