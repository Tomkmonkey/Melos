# Melos Docker 部署

Melos 由两个容器组成：

- `melos-web`：Nginx + 预编译 Vue 3 SPA，宿主机默认端口 `34962`。
- `melos-api`：Node 会话网关 + 内嵌 KuGouMusicApi（`platform=lite`）。

## 启动

```bash
docker compose -f docker-compose.web.yml up -d --build
```

启动后打开 `http://<主机IP>:34962`，用 **酷狗音乐概念版 App** 扫码登录。

如需更换端口：

```bash
MELOS_WEB_PORT=8080 docker compose -f docker-compose.web.yml up -d --build
```

## 架构

```
浏览器 / PWA
      │  http(s)://<host>:34962
      ▼
┌───────────────────────────────────────────────┐
│ Docker 项目 melos-web                         │
│                                               │
│  melos-web (Nginx)                           │
│    ├── /            → prebuilt/vue 静态文件   │
│    └── /api/        → melos-api:3005          │
│                                               │
│  melos-api (Node 18)                          │
│    ├── 会话网关 server.js                      │
│    │     ├── /audio-proxy    音频 Range 转发   │
│    │     ├── /comment-proxy  评论转发          │
│    │     └── 登录 / 会话协议适配               │
│    └── KuGouMusicApi :3006 (platform=lite)    │
└───────────────────────────────────────────────┘
```

- 客户端只认 `X-Kg-Session-Id` / `t1` 会话头，网关映射为酷狗 Cookie。
- 二维码登录、token 刷新、退出登录均由网关适配。
- 登录态保存在 `melos-web-data` 数据卷，重启容器后仍然有效。

## 常用操作

```bash
# 查看日志
docker compose -f docker-compose.web.yml logs -f

# 停止
docker compose -f docker-compose.web.yml down

# 停止并清空登录态（不可恢复）
docker compose -f docker-compose.web.yml down -v

# 更新代码后重建
git pull
docker compose -f docker-compose.web.yml up -d --build
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `MELOS_WEB_PORT` | `34962` | 宿主机 Web 端口 |
| `TZ` | `Asia/Shanghai` | 时区 |
| `KUGOU_API_PROXY` | *(空)* | KuGouMusicApi 的 HTTP 代理 |

## 说明

- 容器内不暴露 API 端口，所有请求经 Nginx 的 `/api/` 同源转发。
- 本项目通过第三方 API 获取音乐数据，仅供学习交流。
