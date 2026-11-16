<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import BottomNav from './components/BottomNav.vue'
import PlayerBar from './components/PlayerBar.vue'
import { usePlayerStore } from './stores/player'
import { useSettingsStore } from './stores/settings'

const route = useRoute()
const player = usePlayerStore()
const settings = useSettingsStore()

const immersive = computed(() => route.meta.immersive === true)
const showPlayer = computed(() => !immersive.value && !!player.current)

// 进入播放页再返回时保留发现 / 搜索 / 歌单页的 DOM 与滚动位置，避免重新加载。
const cachedViews = ['HomeView', 'SearchView', 'LibraryView', 'PlaylistView']
</script>

<template>
  <div class="app-shell" :class="{ immersive, 'reduce-motion': settings.reduceMotion }">
    <AppSidebar v-if="!immersive" />
    <main class="main" :class="{ 'no-player': !showPlayer, immersive }">
      <RouterView v-slot="{ Component }">
        <KeepAlive :include="cachedViews">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </main>
    <PlayerBar v-if="showPlayer" />
    <BottomNav v-if="!immersive" />
  </div>
</template>
