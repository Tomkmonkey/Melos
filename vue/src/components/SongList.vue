<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import SongRow from './SongRow.vue'
import type { Song } from '../api/types'

const props = withDefaults(
  defineProps<{
    songs: Song[]
    activeHash?: string
    /** 服务端还有下一页时，滚动到底部会触发 load-more。 */
    hasMore?: boolean
    loadingMore?: boolean
    initialCount?: number
    batchSize?: number
  }>(),
  {
    activeHash: undefined,
    hasMore: false,
    loadingMore: false,
    initialCount: 40,
    batchSize: 40,
  },
)

const emit = defineEmits<{
  play: [index: number]
  'load-more': []
}>()

const visibleCount = ref(Math.min(props.initialCount, props.songs.length))
const visibleSongs = computed(() => props.songs.slice(0, visibleCount.value))
const canRevealMore = computed(() => visibleCount.value < props.songs.length)
const showSentinel = computed(() => canRevealMore.value || props.hasMore)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
let sentinelVisible = false

function revealMore() {
  if (canRevealMore.value) {
    visibleCount.value = Math.min(visibleCount.value + props.batchSize, props.songs.length)
  } else if (props.hasMore) {
    emit('load-more')
  }
}

function trackSentinel() {
  observer?.disconnect()
  if (!sentinel.value) {
    observer = null
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      sentinelVisible = !!entries[0]?.isIntersecting
      if (sentinelVisible) revealMore()
    },
    { rootMargin: '320px 0px' },
  )
  observer.observe(sentinel.value)
}

onMounted(trackSentinel)

watch(sentinel, (element) => {
  if (element) {
    trackSentinel()
  } else {
    observer?.disconnect()
    observer = null
    sentinelVisible = false
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
})

// 切换歌单时回到第一批；追加下一页时保留当前进度。
watch(
  () => [props.songs.length, props.songs[0]?.hash ?? ''] as const,
  ([length, firstHash], previous) => {
    const previousLength = previous?.[0] ?? 0
    const previousFirstHash = previous?.[1] ?? ''
    if (!length) {
      visibleCount.value = 0
      return
    }
    const appended = length > previousLength && firstHash === previousFirstHash
    if (!appended) {
      visibleCount.value = Math.min(props.initialCount, length)
    } else if (sentinelVisible) {
      void nextTick(() => {
        if (sentinelVisible) revealMore()
      })
    }
  },
)

// 下一页加载完成后，如果哨兵仍在视口内，继续渲染新到的歌曲。
watch(
  () => props.loadingMore,
  (loading) => {
    if (loading) return
    void nextTick(() => {
      if (sentinelVisible) revealMore()
    })
  },
)
</script>

<template>
  <div class="song-list">
    <SongRow
      v-for="(song, index) in visibleSongs"
      :key="`${song.hash}-${index}`"
      :song="song"
      :index="index"
      :active="!!activeHash && song.hash === activeHash"
      @play="$emit('play', index)"
    />
    <div v-if="showSentinel" ref="sentinel" class="song-list-sentinel" aria-hidden="true"></div>
    <div v-if="loadingMore" class="song-list-loading">
      <span class="spinner"></span>
      加载更多…
    </div>
  </div>
</template>
