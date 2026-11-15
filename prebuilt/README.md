# 预编译产物

本目录用于避免在部署机器上执行耗资源的前端编译。

## vue/ —— Vue Web PWA（dev 分支默认）

```bash
./docker/build-vue.sh
# 等价于
cd vue && npm ci && npm run build
```

- 默认 `Dockerfile.web.vue` 直接复制该目录，部署时无需 Node / Flutter SDK
- 修改 `vue/` 代码后必须重新生成，否则 Web 镜像不会更新
- 产物包含 PWA manifest、Service Worker 与图标

## web/ —— Flutter Web 静态文件（历史版本 / 回退用）

```bash
flutter build web --release \
  --dart-define=KA_MUSIC_API_BASE_URL=/api
```

- `Dockerfile.web` 直接复制该目录，部署时无需 Flutter SDK
- 由 `./docker/build-web.sh` 重新生成
- `docker-compose.web.yml` 已改用 Vue，Flutter Web 保留用于历史版本或回退

## linux-x64/ —— Linux 桌面版

`linux-x64/` 是 KA Music 的 Linux x86_64 Release bundle，由以下命令生成：

```bash
flutter build linux --release \
  --dart-define=KA_MUSIC_API_BASE_URL=http://127.0.0.1:3005
```

- 构建环境：Flutter **3.50.0** stable（Dart 3.14.0）
- 默认桌面版 `Dockerfile` 直接复制该目录，部署时无需 Flutter SDK
- 仅适用于 **Linux x86_64**
- 由 `./docker/build-linux.sh` 重新生成
- 如需在 Docker 内从源码编译，使用 `Dockerfile.source`
