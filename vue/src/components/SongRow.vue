<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref } from 'vue'
import { Ellipsis, ListPlus, ListStart } from 'lucide-vue-next'
import CoverImage from './CoverImage.vue'
import type { Song } from '../api/types'
import { usePlayerStore } from '../stores/player'
import { useToastStore } from '../stores/toast'
import { formatDuration } from '../utils'

const props = defineProps<{
  song: Song
  index: number
  active?: boolean
  playing?: boolean
}>()

defineEmits<{
  play: []
}>()

const player = usePlayerStore()
const toast = useToastStore()

const trigger = ref<HTMLButtonElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const menuPos = ref({ top: 0, left: 0 })
const menuStyle = computed(() => ({
  top: `${menuPos.value.top}px`,
  left: `${menuPos.value.left}px`,
}))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu()
}

function openMenu() {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return
  const width = 176
  const height = 86
  const gap = 6
  const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8)
  const openUp = rect.bottom + gap + height > window.innerHeight - 8
  const top = openUp ? Math.max(8, rect.top - gap - height) : rect.bottom + gap
  menuPos.value = { top, left }
  menuOpen.value = true
  window.addEventListener('scroll', closeMenu, true)
  window.addEventListener('resize', closeMenu)
  document.addEventListener('keydown', onKeydown)
  void nextTick(() => {
    menuEl.value?.querySelector<HTMLButtonElement>('.song-menu-item')?.focus()
  })
}

function closeMenu() {
  if (!menuOpen.value) return
  menuOpen.value = false
  window.removeEventListener('scroll', closeMenu, true)
  window.removeEventListener('resize', closeMenu)
  document.removeEventListener('keydown', onKeydown)
  trigger.value?.focus({ preventScroll: true })
}

function toggleMenu() {
  if (menuOpen.value) closeMenu()
  else openMenu()
}

function onPlayNext() {
  closeMenu()
  const wasEmpty = !player.current
  const ok = player.playNext(props.song)
  toast.show(ok ? (wasEmpty ? '开始播放' : '已添加到下一首播放') : '这首歌已在播放队列中')
}

function onEnqueue() {
  closeMenu()
  const wasEmpty = !player.current
  const ok = player.enqueue(props.song)
  toast.show(ok ? (wasEmpty ? '开始播放' : '已添加到播放队列') : '这首歌已在播放队列中')
}

onDeactivated(closeMenu)
onBeforeUnmount(closeMenu)
</script>

<template>
  <div class="song-row" :class="{ active }">
    <button
      class="song-row-hit"
      type="button"
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
    </button>

    <button
      ref="trigger"
      class="song-more"
      type="button"
      :aria-label="`${song.title} 更多操作`"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      @click.stop="toggleMenu"
    >
      <Ellipsis :size="16" />
    </button>

    <Teleport to="body">
      <template v-if="menuOpen">
        <div class="song-menu-backdrop" aria-hidden="true" @click="closeMenu"></div>
        <div
          ref="menuEl"
          class="song-menu"
          role="menu"
          :style="menuStyle"
          @keydown.esc="closeMenu"
        >
          <button class="song-menu-item" type="button" role="menuitem" @click="onPlayNext">
            <ListStart :size="15" />
            下一首播放
          </button>
          <button class="song-menu-item" type="button" role="menuitem" @click="onEnqueue">
            <ListPlus :size="15" />
            添加到播放队列
          </button>
        </div>
      </template>
    </Teleport>
  </div>
</template>
