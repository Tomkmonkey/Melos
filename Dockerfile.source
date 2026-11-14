# syntax=docker/dockerfile:1

###############################################################################
# Stage 1 — 构建 Flutter Linux 桌面应用
###############################################################################
FROM ubuntu:24.04 AS flutter-builder

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        clang \
        cmake \
        curl \
        git \
        libblkid-dev \
        libgtk-3-dev \
        liblzma-dev \
        libstdc++-12-dev \
        ninja-build \
        pkg-config \
        unzip \
        xz-utils \
        zip \
    && rm -rf /var/lib/apt/lists/*

ARG FLUTTER_VERSION=3.50.0
RUN curl -fsSL -o /tmp/flutter.tar.xz \
        "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
    && tar -xf /tmp/flutter.tar.xz -C /opt \
    && rm -f /tmp/flutter.tar.xz \
    && git config --global --add safe.directory /opt/flutter

ENV PATH="/opt/flutter/bin:${PATH}" \
    PUB_CACHE=/opt/pub-cache

WORKDIR /src

COPY pubspec.yaml pubspec.lock ./
RUN flutter config --no-analytics >/dev/null 2>&1 || true \
    && flutter pub get --enforce-lockfile

COPY lib ./lib
COPY linux ./linux
COPY update.md ./

# 容器内的 App 通过本机网关访问 KuGouMusicApi，前端只需要一个固定地址。
RUN flutter build linux --release \
        --dart-define=KA_MUSIC_API_BASE_URL=http://127.0.0.1:3005

###############################################################################
# Stage 2 — 安装内嵌 KuGouMusicApi 的生产依赖
###############################################################################
FROM node:18-bookworm-slim AS api-deps

WORKDIR /api
COPY third_party/KuGouMusicApi/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

###############################################################################
# Stage 3 — 运行环境：KasmVNC Web 桌面 + Flutter App + KuGouMusicApi + 网关
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

# Flutter 桌面应用（含 data/ 与 lib/ 资源）
COPY --from=flutter-builder /src/build/linux/x64/release/bundle /app/kgka_music_hl

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
