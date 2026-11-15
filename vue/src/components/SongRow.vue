<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import CoverImage from './CoverImage.vue'
import type { Song } from '../api/types'
import { formatDuration } from '../utils'

defineProps<{
  song: Song
  index: number
  active?: boolean
  playing?: boolean
}>()

defineEmits<{
  play: []
}>()
</script>

<template>
  <button
    type="button"
    class="song-row"
    :class="{ active }"
    :title="`${song.title} - ${song.artist}`"
    @click="$emit('play')"
  >
    <span class="song-index">
      <span v-if="active" class="playing-bars" aria-hidden="true">
        <i></i><i></i><i></i>
      </span>
      <template v-else>{{ index + 1 }}</template>
    </span>
    <CoverImage :src="song.cover" :alt="song.title" />
    <span class="song-main">
      <span class="song-title-line">
        <span class="song-title">{{ song.title }}</span>
      </span>
      <span class="song-artist">{{ song.artist }}</span>
    </span>
    <span class="song-album">{{ song.albumName }}</span>
    <span class="song-duration">{{ formatDuration(song.durationMs) }}</span>
    <span class="song-play" aria-hidden="true" @click.stop="$emit('play')">
      <Play :size="16" />
    </span>
  </button>
</template>
