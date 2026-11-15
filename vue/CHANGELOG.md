# Melos Vue 更新日志

## 0.1.0 — 2026-11-15

- 从 Flutter Web 重构为 Vue 3 + Vite + TypeScript + Pinia
- 纯白极简 UI：白色背景、细边框、黑白按钮；移除渐变与玻璃拟态
- 使用新的 M 音符图标，PWA manifest 切换为白色主题
- 响应式布局：桌面左侧栏 + 底部播放条；手机底部导航 + 全屏播放页
- 播放页：桌面歌词固定在封面右侧；手机左右滑动切换封面 / 歌词页
- HTML5 Audio、队列与进度持久化、Media Session、320K/128K 自动降级
- LRC 歌词逐行同步与翻译合并
- 评论：热门 / 最新、楼层回复、评论配图
- 扫码登录，并自动迁移 Flutter 版浏览器登录态
- Docker：`Dockerfile.web.vue` + `prebuilt/vue` + `docker/build-vue.sh`
