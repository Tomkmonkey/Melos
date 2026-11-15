<script setup lang="ts">
import CoverImage from './CoverImage.vue'
import type { Playlist } from '../api/types'
import { formatCount } from '../utils'

defineProps<{
  playlist: Playlist
}>()
</script>

<template>
  <RouterLink class="playlist-card" :to="`/playlist/${playlist.id}`">
    <CoverImage :src="playlist.cover" :alt="playlist.title" />
    <div class="playlist-name">{{ playlist.title }}</div>
    <div class="playlist-meta">
      <template v-if="playlist.songCount">{{ playlist.songCount }} 首</template>
      <template v-if="playlist.playCount"> · {{ formatCount(playlist.playCount) }} 播放</template>
    </div>
  </RouterLink>
</template>
