<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LogOut, RefreshCw } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const redirecting = ref(false)

function refresh() {
  void auth.startQr()
}

watch(
  () => auth.loggedIn,
  (loggedIn) => {
    if (!loggedIn || redirecting.value) return
    redirecting.value = true
    window.setTimeout(() => {
      void router.replace('/')
    }, 900)
  },
  { immediate: true },
)

onMounted(() => {
  if (!auth.loggedIn) void auth.startQr()
})
onUnmounted(() => {
  auth.stopQr()
})

async function logout() {
  await auth.logout()
  void auth.startQr()
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <img
        src="/icons/Icon-192.png"
        alt="Melos"
        style="width: 64px; height: 64px; border-radius: 18px; margin: 0 auto 14px"
      />
      <h1>登录 Melos</h1>

      <template v-if="auth.loggedIn">
        <p>已登录为 {{ auth.profile?.nickname ?? '酷狗账号' }}，正在返回首页…</p>
        <div class="login-actions">
          <button class="btn" type="button" @click="logout">
            <LogOut :size="15" />
            退出登录
          </button>
          <RouterLink class="btn btn-primary" to="/">进入首页</RouterLink>
        </div>
      </template>

      <template v-else>
        <p>使用 <strong>酷狗音乐概念版 App</strong> 扫码登录。登录态会保存在浏览器中，下次打开无需重复扫码。</p>

        <div class="qr-box">
          <img v-if="auth.qr?.image" :src="auth.qr.image" alt="登录二维码" />
          <div v-else class="qr-placeholder">
            <span v-if="auth.qrLoading">二维码生成中…</span>
            <span v-else>二维码不可用</span>
          </div>
        </div>

        <div
          class="qr-status"
          :class="{
            success: auth.qr?.status === 4,
            error: auth.qr?.status === 0 || auth.qr?.status === -1,
          }"
        >
          {{ auth.qr?.message ?? '正在准备登录…' }}
        </div>

        <div class="login-actions">
          <button class="btn" type="button" :disabled="auth.qrLoading" @click="refresh">
            <RefreshCw :size="15" />
            刷新二维码
          </button>
          <RouterLink class="btn" to="/">先逛逛</RouterLink>
        </div>

        <div class="login-foot">
          登录后可同步「我的歌单 / 我喜欢」；未登录也可以浏览推荐和播放免费歌曲。
        </div>
      </template>
    </div>
  </div>
</template>
