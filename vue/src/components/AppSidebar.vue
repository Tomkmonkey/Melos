<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Compass,
  Library,
  LogIn,
  LogOut,
  Search,
  Settings,
} from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const initial = computed(() => {
  const name = auth.profile?.nickname ?? auth.session.userId ?? 'M'
  return name.slice(0, 1).toUpperCase()
})

async function logout() {
  await auth.logout()
  await router.push('/')
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-inner">
      <div class="brand">
        <img class="brand-logo" src="/icons/Icon-192.png" alt="Melos" />
        <div>
          <div class="brand-name">Melos</div>
          <div class="brand-sub">Music</div>
        </div>
      </div>

      <nav class="nav-list" aria-label="主导航">
        <RouterLink
          to="/"
          class="nav-item"
          :class="{ 'router-link-active': route.name === 'home' }"
        >
          <Compass :size="18" />
          <span>发现音乐</span>
        </RouterLink>
        <RouterLink
          to="/search"
          class="nav-item"
          :class="{ 'router-link-active': route.name === 'search' }"
        >
          <Search :size="18" />
          <span>搜索</span>
        </RouterLink>
        <RouterLink
          to="/library"
          class="nav-item"
          :class="{ 'router-link-active': route.name === 'library' }"
        >
          <Library :size="18" />
          <span>我的音乐</span>
        </RouterLink>
        <RouterLink
          to="/settings"
          class="nav-item"
          :class="{ 'router-link-active': route.name === 'settings' }"
        >
          <Settings :size="18" />
          <span>设置</span>
        </RouterLink>
      </nav>

      <div class="sidebar-user">
        <template v-if="auth.loggedIn">
          <div class="sidebar-user-row">
            <img
              v-if="auth.profile?.avatar"
              class="avatar"
              :src="auth.profile.avatar"
              alt=""
            />
            <div v-else class="avatar-fallback">{{ initial }}</div>
            <div style="min-width: 0; flex: 1">
              <div class="sidebar-user-name">
                {{ auth.profile?.nickname ?? '已登录' }}
              </div>
              <div class="sidebar-user-sub">酷狗账号</div>
            </div>
            <button class="icon-btn" type="button" aria-label="退出登录" @click="logout">
              <LogOut :size="16" />
            </button>
          </div>
        </template>
        <RouterLink v-else class="btn btn-primary btn-sm" to="/login">
          <LogIn :size="15" />
          扫码登录
        </RouterLink>
      </div>

      <div class="sidebar-foot">Melos · Vue 版</div>
    </div>
  </aside>
</template>
