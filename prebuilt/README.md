# 预编译 Flutter Linux 应用

`linux-x64/` 是 KA Music 的 Linux x86_64 Release bundle，由以下命令生成：

```bash
flutter build linux --release \
  --dart-define=KA_MUSIC_API_BASE_URL=http://127.0.0.1:3005
```

- 构建环境：Flutter **3.50.0** stable（Dart 3.14.0）
- 已包含 Flutter engine、应用 `libapp.so`、插件与资源
- 默认 `Dockerfile` 直接复制该目录，**部署时无需安装 Flutter SDK**
- 仅适用于 **Linux x86_64**

修改 Dart 代码后重新生成：

```bash
./docker/build-linux.sh
```

该脚本要求本机已安装 Flutter 3.50+，然后会把新的 bundle 覆盖到
`prebuilt/linux-x64/`。如果希望在 Docker 构建阶段从源码编译，使用
仓库根目录的 `Dockerfile.source`。
