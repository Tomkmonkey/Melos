<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-vue-next'
import CoverImage from './CoverImage.vue'
import { usePlayerStore } from '../stores/player'
import { formatSeconds } from '../utils'

const player = usePlayerStore()
const router = useRouter()

const progress = computed(() => {
  if (!player.durationMs) return 0
  return Math.min(100, Math.max(0, (player.positionMs / player.durationMs) * 100))
})

function openPlayer() {
  void router.push('/player')
}

function onSeek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  player.seekMs(value)
}

function onVolume(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  player.setVolume(value)
}
</script>

<template>
  <div v-if="player.current" class="player-bar">
    <div class="player-info" @click="openPlayer">
      <CoverImage
        class="player-cover"
        :src="player.current.cover"
        :alt="player.current.title"
      />
      <div class="player-metadata">
        <div class="player-title">{{ player.current.title }}</div>
        <div class="player-artist">{{ player.current.artist }}</div>
        <div v-if="player.error" class="player-error">{{ player.error }}</div>
      </div>
    </div>

    <div class="player-controls">
      <button class="icon-btn" type="button" aria-label="上一首" @click="player.previous()">
        <SkipBack :size="18" />
      </button>
      <button
        class="icon-btn primary"
        type="button"
        :aria-label="player.playing ? '暂停' : '播放'"
        @click="player.toggle()"
      >
        <span v-if="player.loading" class="spinner"></span>
        <Pause v-else-if="player.playing" :size="18" />
        <Play v-else :size="18" />
      </button>
      <button class="icon-btn" type="button" aria-label="下一首" @click="player.next()">
        <SkipForward :size="18" />
      </button>
    </div>

    <div class="player-progress-wrap">
      <span>{{ formatSeconds(player.positionMs / 1000) }}</span>
      <input
        type="range"
        min="0"
        :max="player.durationMs || 1"
        :value="player.positionMs"
        :style="{ '--progress': `${progress}%` }"
        aria-label="播放进度"
        @input="onSeek"
      />
      <span>{{ formatSeconds(player.durationMs / 1000) }}</span>
    </div>

    <div class="player-right player-volume">
      <Volume2 :size="16" />
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="player.volume"
        :style="{ '--progress': `${player.volume * 100}%` }"
        aria-label="音量"
        @input="onVolume"
      />
      <button class="icon-btn" type="button" aria-label="播放列表" @click="openPlayer">
        <ListMusic :size="18" />
      </button>
    </div>
  </div>
</template>
