#!/usr/bin/env bash
# KasmVNC 会话启动脚本：先拉起 Flutter 桌面应用，再进入 Openbox。

# GTK 在没有 GPU 的容器里使用 Mesa 软件渲染
export LIBGL_ALWAYS_SOFTWARE="${LIBGL_ALWAYS_SOFTWARE:-1}"
# 与 LinuxServer baseimage 的 PulseAudio 共享 socket
export PULSE_RUNTIME_PATH="${PULSE_RUNTIME_PATH:-/defaults}"

# svc-de 与 svc-kasmvnc 并无启动顺序依赖，等待 X 服务就绪后再启动应用
for _ in $(seq 1 120); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if [ -x /app/kgka_music_hl/kgka_music_hl ]; then
  mkdir -p /config/ka-music
  (
    cd /app/kgka_music_hl || exit 0
    ./kgka_music_hl >> /config/ka-music/app.log 2>&1
  ) &
fi

# 等窗口出现后尽量最大化（Openbox 未自动铺满时兜底）
(
  sleep 4
  for _ in 1 2 3 4 5; do
    if wmctrl -r "kgka_music_hl" -b add,maximized_vert,maximized_horz 2>/dev/null; then
      break
    fi
    sleep 1
  done
) &

exec /usr/bin/openbox-session
