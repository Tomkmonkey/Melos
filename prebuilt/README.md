# 预编译 Flutter 产物

本目录用于避免在部署机器上执行耗资源的 Flutter 编译。

## web/ —— Web PWA 静态文件

构建命令：

```bash
flutter build web --release \
  --dart-define=KA_MUSIC_API_BASE_URL=/api
```

- 默认 `Dockerfile.web` 直接复制该目录，部署时无需 Flutter SDK
- 由 `./docker/build-web.sh` 重新生成
- 修改 Dart 代码后必须重新生成，否则 Web 镜像不会更新

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
