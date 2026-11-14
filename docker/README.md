# KA Music Docker 部署（Melos）

一条命令启动 `kgka_Music_hl`（Flutter Linux 桌面版）+ 内嵌 **KuGouMusicApi**。
应用完整运行在容器内的 KasmVNC 网页桌面中，浏览器打开即可看到图形界面，
用酷狗概念版 App 扫码登录。

## 一条命令启动

```bash
docker compose up -d --build
```

默认使用宿主机端口 **34962**，启动后直接打开：

```
http://<主机IP>:34962
```

如需改用其他固定端口：

```bash
KA_MUSIC_PORT=8080 docker compose up -d --build
```

> 默认镜像直接使用仓库内预编译的 `prebuilt/linux-x64`，构建时**不会下载 Flutter SDK**，
> 通常 1–2 分钟即可完成。修改 Dart 代码后请运行 `./docker/build-linux.sh` 重新生成
> 预编译 bundle；也可以改用 `Dockerfile.source` 在 Docker 内从源码编译。
> 之后重启/升级无需重新扫码 —— 登录态保存在 `ka-music-config` 数据卷里。

## 架构

```
浏览器 (KasmVNC/Kclient, 容器内 :3000)
        │  画面 + 声音
        ▼
┌─────────────────────────────────────────────┐
│ 容器                                         │
│  KasmVNC Web 桌面                           │
│    └─ kgka_music_hl (Flutter Linux)         │
│         │ HTTP 127.0.0.1:3005               │
│         ▼                                    │
│  KA API 网关（会话 / 协议适配）               │
│         │ HTTP 127.0.0.1:3006               │
│         ▼                                    │
│  内嵌 KuGouMusicApi (platform=lite)          │
└─────────────────────────────────────────────┘
```

- 客户端只认 `X-Kg-Session-Id` / `t1` 会话头，网关将其映射为酷狗 cookie。
- 二维码登录、手机号登录、token 刷新、退出登录均由网关适配。
- 网页桌面自带音频转发：容器内 PulseAudio 的声音会传到浏览器
  （浏览器首次播放需要一次用户点击以解锁声音）。

## 扫码登录

1. 打开 `http://<主机IP>:34962`。
2. 在应用登录页选择「扫码登录」。
3. 使用 **酷狗音乐概念版 App** 扫码并确认。
4. 登录态写入 `/config`，重启容器后仍然有效。
5. 网页顶部中间有一条 Kclient 工具栏，点击 **喇叭图标** 开启网页声音
   （浏览器要求一次用户点击才能播放音频）。

> 本项目内置的 KuGouMusicApi 以概念版（`platform=lite`）运行，
> 与客户端的登录/播放协议一致。未注册账号可在酷狗概念版 App 注册。

## 常用操作

```bash
# 查看日志（应用日志另见容器内 /config/ka-music/app.log）
docker compose logs -f

# 停止
docker compose down

# 停止并清空登录态 / 设置（不可恢复）
docker compose down -v

# 更新代码后重建
docker compose up -d --build
```

## 重新编译 Flutter 应用（可选）

默认部署不需要 Flutter。修改了 Dart 代码后再执行：

```bash
# 需要本机安装 Flutter 3.50+
./docker/build-linux.sh

# 重新构建并启动
docker compose up -d --build
```

如果希望完全在 Docker 内编译（需要 Flutter SDK 和约 8–10 GB 磁盘）：

```bash
docker build -f Dockerfile.source -t ka-music:latest .
docker compose up -d --no-build
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `KA_MUSIC_PORT` | `34962` | 宿主机 web 端口 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `PASSWORD` | *(空)* | 设置后启用 Kclient 的 HTTP Basic Auth（公网部署建议） |
| `CUSTOM_USER` | `abc` | Basic Auth 用户名 |
| `KUGOU_API_PROXY` | *(空)* | 为 KuGouMusicApi 设置 HTTP 代理 |

## 说明

- 容器内仅暴露 3000 端口（宿主机默认 34962）；3005/3006 只监听容器内 127.0.0.1。
- 应用为桌面版，通过网页桌面使用；不支持多用户同时登录同一实例。
- 本镜像用于学习交流，音乐数据来自酷狗官方接口。
