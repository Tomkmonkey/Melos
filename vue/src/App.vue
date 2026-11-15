<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './components/AppSidebar.vue'
import BottomNav from './components/BottomNav.vue'
import PlayerBar from './components/PlayerBar.vue'
import { usePlayerStore } from './stores/player'

const route = useRoute()
const player = usePlayerStore()

const immersive = computed(() => route.meta.immersive === true)
const showPlayer = computed(() => !immersive.value && !!player.current)
</script>

<template>
  <div class="app-shell" :class="{ immersive }">
    <AppSidebar v-if="!immersive" />
    <main class="main" :class="{ 'no-player': !showPlayer, immersive }">
      <RouterView />
    </main>
    <PlayerBar v-if="showPlayer" />
    <BottomNav v-if="!immersive" />
  </div>
</template>
