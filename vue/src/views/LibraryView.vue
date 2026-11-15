<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { LogIn, LogOut, RefreshCw } from 'lucide-vue-next'
import PlaylistCard from '../components/PlaylistCard.vue'
import { apiGet } from '../api/client'
import { parsePlaylists } from '../api/parse'
import type { Playlist } from '../api/types'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()

const playlists = ref<Playlist[]>([])
const loading = ref(false)
const error = ref('')

async function load() {
  if (!auth.loggedIn) {
    playlists.value = []
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.refreshProfile().catch(() => undefined)
    const data = await apiGet<any>('/user/playlist', { page: 1, pagesize: 60 })
    playlists.value = parsePlaylists(data?.info ?? data)
  } catch (err) {
    error.value = (err as Error).message || '歌单加载失败'
  } finally {
    loading.value = false
  }
}

async function logout() {
  await auth.logout()
  await router.push('/')
}

onMounted(() => {
  if (auth.initialized) void load()
})

watch(
  () => [auth.initialized, auth.loggedIn] as const,
  ([initialized, loggedIn]) => {
    if (initialized && loggedIn) void load()
    if (initialized && !loggedIn) playlists.value = []
  },
  { immediate: true },
)
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Library</div>
        <h1 class="page-title">我的音乐</h1>
        <p class="page-subtitle">你的歌单、收藏和播放记录</p>
      </div>
      <button
        v-if="auth.loggedIn"
        class="icon-btn"
        type="button"
        aria-label="刷新"
        :disabled="loading"
        @click="load"
      >
        <RefreshCw :size="18" />
      </button>
    </header>

    <div v-if="!auth.loggedIn" class="card" style="padding: 22px">
      <div class="empty-state" style="min-height: 0">
        <LogIn :size="34" />
        <h3>登录后查看你的歌单</h3>
        <p>使用酷狗音乐概念版 App 扫码登录，收藏与歌单会同步到这里。</p>
        <RouterLink class="btn btn-primary" style="margin-top: 16px" to="/login">
          扫码登录
        </RouterLink>
      </div>
    </div>

    <template v-else>
      <div class="card" style="padding: 18px; display: flex; align-items: center; gap: 14px">
        <img
          v-if="auth.profile?.avatar"
          class="avatar"
          style="width: 52px; height: 52px"
          :src="auth.profile.avatar"
          alt=""
        />
        <div v-else class="avatar-fallback" style="width: 52px; height: 52px; font-size: 20px">
          {{ (auth.profile?.nickname ?? 'M').slice(0, 1).toUpperCase() }}
        </div>
        <div style="min-width: 0; flex: 1">
          <div style="font-size: 18px; font-weight: 750; letter-spacing: -0.02em">
            {{ auth.profile?.nickname ?? '已登录' }}
          </div>
          <div class="muted" style="font-size: 12px; margin-top: 4px">
            {{ playlists.length }} 个歌单
          </div>
        </div>
        <button class="btn btn-sm" type="button" @click="logout">
          <LogOut :size="14" />
          退出
        </button>
      </div>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">我的歌单</h2>
        </div>

        <div v-if="loading" class="playlist-grid">
          <div v-for="i in 6" :key="i" class="playlist-card">
            <div class="skeleton skeleton-cover"></div>
            <div class="skeleton skeleton-line" style="width: 80%; margin-top: 10px"></div>
          </div>
        </div>

        <div v-else-if="error" class="error-box">
          {{ error }}
          <button class="btn btn-sm" style="margin-left: 12px" @click="load">重试</button>
        </div>

        <div v-else-if="playlists.length" class="playlist-grid">
          <PlaylistCard
            v-for="playlist in playlists"
            :key="playlist.id"
            :playlist="playlist"
          />
        </div>

        <div v-else class="empty-state">
          <h3>还没有歌单</h3>
          <p>在酷狗 App 中创建歌单后，刷新这里即可看到。</p>
        </div>
      </section>
    </template>
  </div>
</template>
