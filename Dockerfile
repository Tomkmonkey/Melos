# syntax=docker/dockerfile:1
#
# Melos 运行时镜像（默认）
# -----------------------------------------------------------------------------
# Flutter Linux 应用已在本机预编译到 prebuilt/linux-x64/，部署时：
#   - 不需要安装 Flutter SDK
#   - 不会触发耗资源的 Flutter 编译
# 修改 Dart 代码后，运行 docker/build-linux.sh 重新生成预编译 bundle，
# 或使用 Dockerfile.source 在 Docker 内从源码构建。
#
# 仅支持 Linux x86_64。

###############################################################################
# Stage 1 — 安装内嵌 KuGouMusicApi 的生产依赖
###############################################################################
FROM node:18-bookworm-slim AS api-deps

WORKDIR /api
COPY third_party/KuGouMusicApi/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

###############################################################################
# Stage 2 — KasmVNC Web 桌面 + 预编译 Flutter 应用 + KuGouMusicApi + 网关
###############################################################################
FROM ghcr.io/linuxserver/baseimage-kasmvnc:ubuntunoble

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    TZ=Asia/Shanghai \
    KA_GATEWAY_PORT=3005 \
    KA_API_TARGET=http://127.0.0.1:3006 \
    KA_SESSION_FILE=/config/ka-music/sessions.json \
    platform=lite \
    PORT=3006 \
    HOST=127.0.0.1 \
    NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fonts-noto-cjk \
        libegl1 \
        libgles2 \
        libgtk-3-0t64 \
        libmpv2 \
        wmctrl \
        x11-utils \
    && rm -rf /var/lib/apt/lists/*

# 预编译的 Flutter Linux 桌面应用（由 docker/build-linux.sh 生成）
COPY prebuilt/linux-x64 /app/kgka_music_hl

# 内嵌 KuGouMusicApi
COPY third_party/KuGouMusicApi /app/kugou-api
COPY --from=api-deps /api/node_modules /app/kugou-api/node_modules

# 会话 / 协议适配网关
COPY docker/gateway /app/gateway

# s6 服务与桌面启动脚本
COPY docker/root/ /

RUN chmod +x /app/kgka_music_hl/kgka_music_hl \
        /app/gateway/server.js \
        /app/kugou-api/app.js \
        /defaults/startwm.sh \
        /etc/s6-overlay/s6-rc.d/ka-api/run \
        /etc/s6-overlay/s6-rc.d/ka-gateway/run \
        /etc/s6-overlay/s6-rc.d/svc-kasmvnc/run \
        /etc/s6-overlay/s6-rc.d/svc-pulseaudio/run \
    && printf '\n/* Always show the Kclient toolbar so audio can be enabled */\n#lsbar { display: block !important; z-index: 1000; }\n' >> /kclient/public/css/kclient.css \
    && mkdir -p /config/ka-music \
    && chown -R abc:abc /config/ka-music

EXPOSE 3000
VOLUME ["/config"]

# 默认启动由 LinuxServer baseimage 的 s6 接管（KasmVNC + Kclient + 我们的服务）。
