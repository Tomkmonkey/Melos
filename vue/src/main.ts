import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'
import { useAuthStore } from './stores/auth'
import { usePlayerStore } from './stores/player'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// 初始化音频与本地播放状态（恢复队列，不自动播放）。
usePlayerStore(pinia)

// 登录态初始化放到后台执行，页面立即渲染。
void useAuthStore(pinia).init()

app.mount('#app')
