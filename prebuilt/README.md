# 预编译产物

本目录用于避免在部署机器上执行耗资源的前端编译。

## vue/ —— Melos Web PWA

```bash
./docker/build-vue.sh
# 等价于
cd vue && npm ci && npm run build
```

- `Dockerfile.web.vue` 直接复制该目录，部署时无需 Node SDK
- 修改 `vue/` 代码后必须重新生成，否则 Web 镜像不会更新
- 产物包含 PWA manifest、Service Worker 与图标
