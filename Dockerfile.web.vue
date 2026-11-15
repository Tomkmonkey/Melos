# syntax=docker/dockerfile:1
#
# Melos Web PWA（Vue 重构版，dev 分支）
# -----------------------------------------------------------------------------
# 静态文件已构建到 prebuilt/vue/，部署时不需要 Node.js。
# 重新构建前端：./docker/build-vue.sh
#
# 前端与后端同源：
#   浏览器 -> Nginx :80 -> /api/ -> api:3005 (会话网关)
#                                   -> 127.0.0.1:3006 (KuGouMusicApi)

FROM nginx:alpine

COPY prebuilt/vue /usr/share/nginx/html
COPY docker/nginx-web.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
