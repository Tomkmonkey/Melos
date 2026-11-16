<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Captions,
  Check,
  ChevronDown,
  ListMusic,
  MessageSquare,
  Pause,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-vue-next'
import CoverImage from '../components/CoverImage.vue'
import CommentsPanel from '../components/CommentsPanel.vue'
import SongList from '../components/SongList.vue'
import { fetchLyrics, type LyricLine } from '../api/lyrics'
import { usePlayerStore } from '../stores/player'
import { formatSeconds } from '../utils'

const player = usePlayerStore()
const router = useRouter()

const tab = ref<'lyrics' | 'queue'>('lyrics')
const mobilePage = ref<'player' | 'lyrics'>('player')
const showComments = ref(false)
const lyrics = ref<LyricLine[]>([])
const lyricsLoading = ref(false)
const lyricsError = ref('')
const lyricsBox = ref<HTMLElement | null>(null)

let touchStartX = 0
let touchStartY = 0
let touchTracking = false

const activeLyricIndex = computed(() => {
  const list = lyrics.value
  if (!list.length) return -1
  const target = player.positionMs
  let low = 0
  let high = list.length - 1
  let found = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (list[mid].timeMs <= target) {
      found = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return found
})

async function loadLyrics() {
  const song = player.current
  lyrics.value = []
  lyricsError.value = ''
  if (!song) return
  lyricsLoading.value = true
  try {
    lyrics.value = await fetchLyrics(song)
  } catch {
    lyricsError.value = '歌词加载失败，请稍后重试'
  } finally {
    lyricsLoading.value = false
  }
}

watch(
  () => player.current?.hash,
  () => {
    void loadLyrics()
  },
  { immediate: true },
)

async function scrollActiveLyric() {
  await nextTick()
  const index = activeLyricIndex.value
  const box = lyricsBox.value
  if (index < 0 || !box || box.clientHeight === 0) return
  const line = box.querySelector<HTMLElement>(`[data-line="${index}"]`)
  if (!line) return
  box.scrollTo({
    top: line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2,
    behavior: 'smooth',
  })
}

watch(activeLyricIndex, () => {
  void scrollActiveLyric()
})

watch([mobilePage, tab], () => {
  if (tab.value === 'lyrics') void scrollActiveLyric()
})

function selectTab(next: 'lyrics' | 'queue') {
  tab.value = next
  if (next === 'lyrics') void scrollActiveLyric()
}

function showPlayerPage() {
  mobilePage.value = 'player'
}

function showLyricsPage() {
  mobilePage.value = 'lyrics'
  tab.value = 'lyrics'
  void scrollActiveLyric()
}

function toggleLyricsPage() {
  if (mobilePage.value === 'player') {
    showLyricsPage()
  } else {
    showPlayerPage()
  }
}

function openQueue() {
  tab.value = 'queue'
  if (window.innerWidth < 960) mobilePage.value = 'lyrics'
}

function onTouchStart(event: TouchEvent) {
  if (window.innerWidth >= 960) return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, button, a, .player-tabs, .range-row')) {
    touchTracking = false
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  touchStartX = touch.clientX
  touchStartY = touch.clientY
  touchTracking = true
}

function onTouchEnd(event: TouchEvent) {
  if (!touchTracking || window.innerWidth >= 960) {
    touchTracking = false
    return
  }
  touchTracking = false
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - touchStartX
  const dy = touch.clientY - touchStartY
  if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.2) return

  // 向右滑进入歌词页，向左滑回到封面页。
  if (mobilePage.value === 'player' && dx > 0) {
    showLyricsPage()
  } else if (mobilePage.value === 'lyrics' && dx < 0) {
    showPlayerPage()
  }
}

const progress = computed(() => {
  if (!player.durationMs) return 0
  return Math.min(100, Math.max(0, (player.positionMs / player.durationMs) * 100))
})

const volumeProgress = computed(() => Math.round(player.volume * 100))

const qualityOpen = ref(false)
const qualityOptions = [
  { value: '128' as const, label: '128K', title: '标准音质' },
  { value: '320' as const, label: '320K', title: '高品音质' },
  { value: 'flac' as const, label: 'FLAC', title: '无损音质' },
]
const qualityLabel = computed(() =>
  player.quality === 'flac' ? 'FLAC' : `${player.quality}K`,
)

function chooseQuality(value: '128' | '320' | 'flac') {
  qualityOpen.value = false
  void player.setQuality(value)
}

const CREDIT_PATTERN =
  /^(作词|作曲|编曲|制作人|词|曲|演唱|原唱|混音|母带|吉他|贝斯|鼓|和声|录音|监制|出品|发行|OP|SP|词曲|制作|Lyricist|Composer|Arranger|Producer)\s*[：:]/i

// 标题与制作名单不显示音译，避免歌词页顶部出现无关的罗马音。
function showRomanization(line: LyricLine, index: number): boolean {
  if (line.translation || !line.romanization) return false
  const text = line.text.trim()
  if (CREDIT_PATTERN.test(text)) return false
  if (index === 0 && text.includes(' - ')) return false
  return true
}

function close() {
  if (window.history.length > 1) router.back()
  else void router.push('/')
}

function seek(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  player.seekMs(value)
}

function changeVolume(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  player.setVolume(value)
}

function playAt(index: number) {
  void player.playQueue(player.queue, index)
}
</script>

<template>
  <div class="full-player">
    <div class="full-player-top">
      <button class="icon-btn" type="button" aria-label="关闭播放页" @click="close">
        <ChevronDown :size="22" />
      </button>
      <span class="muted" style="font-size: 12px; letter-spacing: 0.12em">NOW PLAYING</span>
      <div style="display: flex; gap: 2px">
        <button
          class="icon-btn mobile-lyrics-toggle"
          type="button"
          aria-label="歌词"
          :aria-pressed="mobilePage === 'lyrics'"
          :class="{ active: mobilePage === 'lyrics' }"
          @click="toggleLyricsPage"
        >
          <Captions :size="20" />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="查看评论"
          @click="showComments = true"
        >
          <MessageSquare :size="20" />
        </button>
        <button
          class="icon-btn"
          type="button"
          aria-label="播放列表"
          @click="openQueue"
        >
          <ListMusic :size="20" />
        </button>
      </div>
    </div>

    <div v-if="!player.current" class="empty-state">
      <h3>还没有正在播放的歌曲</h3>
      <p>去发现页或搜索页选一首歌开始播放。</p>
      <RouterLink class="btn btn-primary" style="margin-top: 16px" to="/">
        去发现音乐
      </RouterLink>
    </div>

    <div
      v-else
      class="player-layout"
      :class="`mobile-page-${mobilePage}`"
      @touchstart.passive="onTouchStart"
      @touchend.passive="onTouchEnd"
    >
      <section class="player-hero">
        <CoverImage
          class="player-cover-large"
          :src="player.current.cover"
          :alt="player.current.title"
          eager
        />
        <h1 class="full-player-title">{{ player.current.title }}</h1>
        <p class="full-player-artist">
          <RouterLink
            v-if="player.current.artistId"
            class="meta-link"
            :to="`/artist/${player.current.artistId}`"
          >
            {{ player.current.artist }}
          </RouterLink>
          <span v-else>{{ player.current.artist }}</span>
          <template v-if="player.current.albumName">
            ·
            <RouterLink
              v-if="player.current.albumId"
              class="meta-link"
              :to="`/album/${player.current.albumId}`"
            >
              {{ player.current.albumName }}
            </RouterLink>
            <span v-else>{{ player.current.albumName }}</span>
          </template>
        </p>

        <div class="player-controls-block">
          <div v-if="player.error" class="error-box">{{ player.error }}</div>

          <div class="range-row">
            <span>{{ formatSeconds(player.positionMs / 1000) }}</span>
            <input
              type="range"
              min="0"
              :max="player.durationMs || 1"
              :value="player.positionMs"
              :style="{ '--progress': `${progress}%` }"
              aria-label="播放进度"
              @input="seek"
            />
            <span>{{ formatSeconds(player.durationMs / 1000) }}</span>
          </div>

          <div class="player-buttons">
            <button class="icon-btn" type="button" aria-label="上一首" @click="player.previous()">
              <SkipBack :size="22" />
            </button>
            <button
              class="icon-btn play-big"
              type="button"
              :aria-label="player.playing ? '暂停' : '播放'"
              @click="player.toggle()"
            >
              <span v-if="player.loading" class="spinner"></span>
              <Pause v-else-if="player.playing" :size="26" />
              <Play v-else :size="26" />
            </button>
            <button class="icon-btn" type="button" aria-label="下一首" @click="player.next()">
              <SkipForward :size="22" />
            </button>
          </div>

          <div class="player-extra">
            <button
              class="icon-btn"
              type="button"
              :aria-label="`循环模式：${player.repeat}`"
              :class="{ active: player.repeat !== 'off' }"
              @click="player.cycleRepeat()"
            >
              <Repeat1 v-if="player.repeat === 'one'" :size="18" />
              <Repeat v-else :size="18" />
            </button>
            <span>循环：{{ player.repeat === 'one' ? '单曲' : player.repeat === 'all' ? '列表' : '关' }}</span>
            <span class="quality-picker">
              <button
                class="quality-trigger"
                type="button"
                aria-label="选择音质"
                :aria-expanded="qualityOpen"
                @click.stop="qualityOpen = !qualityOpen"
              >
                音质
                <strong>{{ qualityLabel }}</strong>
                <ChevronDown :size="13" />
              </button>
              <span
                v-if="qualityOpen"
                class="menu-backdrop"
                aria-hidden="true"
                @click="qualityOpen = false"
              ></span>
              <div
                v-if="qualityOpen"
                class="quality-menu"
                role="menu"
                aria-label="音质"
                @keydown.esc="qualityOpen = false"
              >
                <button
                  v-for="option in qualityOptions"
                  :key="option.value"
                  class="quality-option"
                  :class="{ active: player.quality === option.value }"
                  type="button"
                  role="menuitem"
                  @click="chooseQuality(option.value)"
                >
                  <span class="quality-option-text">
                    <strong>{{ option.label }}</strong>
                    <small>{{ option.title }}</small>
                  </span>
                  <Check v-if="player.quality === option.value" :size="15" />
                </button>
              </div>
            </span>
            <span class="player-volume" style="margin-left: auto">
              <Volume2 :size="16" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                :value="player.volume"
                :style="{ '--progress': `${volumeProgress}%` }"
                aria-label="音量"
                @input="changeVolume"
              />
            </span>
          </div>

          <button class="lyrics-entry" type="button" @click="showLyricsPage">
            <Captions :size="15" />
            查看歌词
          </button>
        </div>
      </section>

      <section class="player-panel">
        <div class="lyrics-page-head">
          <div class="lyrics-page-title">{{ player.current.title }}</div>
          <div class="lyrics-page-artist">{{ player.current.artist }}</div>
        </div>

        <div class="player-tabs">
          <button
            type="button"
            :class="{ active: tab === 'lyrics' }"
            @click="selectTab('lyrics')"
          >
            歌词
          </button>
          <button
            type="button"
            :class="{ active: tab === 'queue' }"
            @click="selectTab('queue')"
          >
            播放队列 · {{ player.queue.length }}
          </button>
        </div>

        <div v-if="tab === 'lyrics'" class="lyrics-panel">
          <div v-if="lyricsLoading" class="loading-inline" style="padding: 18px">
            <span class="spinner"></span>
            歌词加载中…
          </div>
          <div v-else-if="lyricsError" class="muted" style="padding: 18px; font-size: 13px">
            {{ lyricsError }}
          </div>
          <div
            v-else-if="!lyrics.length"
            class="empty-state"
            style="min-height: 160px"
          >
            <h3>暂无歌词</h3>
            <p>这首歌暂时没有可用的 LRC 歌词。</p>
          </div>
          <div v-else ref="lyricsBox" class="lyrics-scroll">
            <div
              v-for="(line, index) in lyrics"
              :key="`${line.timeMs}-${index}`"
              :data-line="index"
              class="lyric-line"
              :class="{ active: index === activeLyricIndex }"
            >
              <div class="lyric-text">{{ line.text }}</div>
              <div v-if="line.translation" class="lyric-translation">
                {{ line.translation }}
              </div>
              <div v-else-if="showRomanization(line, index)" class="lyric-translation">
                {{ line.romanization }}
              </div>
            </div>
          </div>
        </div>

        <div v-else class="queue-panel">
          <div class="queue-head">
            <span>播放队列 · {{ player.queue.length }} 首</span>
            <span>当前 {{ player.index + 1 }}</span>
          </div>
          <div class="queue-scroll">
            <SongList
              :songs="player.queue"
              :active-hash="player.current?.hash"
              @play="playAt"
            />
          </div>
        </div>
      </section>
    </div>

    <CommentsPanel
      v-if="showComments && player.current"
      :song="player.current"
      @close="showComments = false"
    />
  </div>
</template>
