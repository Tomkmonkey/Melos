<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Play, Search, X } from 'lucide-vue-next'
import SongList from '../components/SongList.vue'
import { apiGet } from '../api/client'
import { parseSongList } from '../api/parse'
import type { Song } from '../api/types'
import { usePlayerStore } from '../stores/player'

const route = useRoute()
const router = useRouter()
const player = usePlayerStore()

const RECENT_KEY = 'melos.search.recent'
const suggestions = ['周杰伦', '林俊杰', 'Taylor Swift', '纯音乐', '粤语', '摇滚']

const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '')
const songs = ref<Song[]>([])
const total = ref(0)
const searching = ref(false)
const searched = ref(false)
const error = ref('')
const recent = ref<string[]>([])

try {
  const raw = localStorage.getItem(RECENT_KEY)
  recent.value = raw ? (JSON.parse(raw) as string[]).slice(0, 8) : []
} catch {
  recent.value = []
}

function remember(value: string) {
  const next = [value, ...recent.value.filter((item) => item !== value)].slice(0, 8)
  recent.value = next
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* 忽略 */
  }
}

async function search(value?: string) {
  const query = (value ?? keyword.value).trim()
  if (!query) return
  keyword.value = query
  searching.value = true
  searched.value = true
  error.value = ''
  remember(query)
  try {
    const data = await apiGet<any>('/search', {
      keywords: query,
      page: 1,
      pagesize: 50,
      type: 'song',
    })
    const lists = Array.isArray(data) ? data : (data?.lists ?? data?.songs ?? [])
    songs.value = parseSongList(lists)
    total.value = Number(data?.total ?? songs.value.length) || songs.value.length
    if (route.query.q !== query) {
      void router.replace({ query: { ...route.query, q: query } })
    }
  } catch (err) {
    songs.value = []
    total.value = 0
    error.value = (err as Error).message || '搜索失败，请稍后重试'
  } finally {
    searching.value = false
  }
}

function clear() {
  keyword.value = ''
  songs.value = []
  total.value = 0
  searched.value = false
  error.value = ''
  void router.replace({ query: {} })
}

function play(index: number) {
  void player.playQueue(songs.value, index)
}

function playAll() {
  void player.playQueue(songs.value, 0)
}

watch(
  () => route.query.q,
  (value) => {
    if (typeof value === 'string' && value && value !== keyword.value) {
      keyword.value = value
      void search(value)
    }
  },
)

onMounted(() => {
  if (keyword.value) void search()
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Search</div>
        <h1 class="page-title">搜索</h1>
        <p class="page-subtitle">在酷狗曲库中寻找歌曲</p>
      </div>
    </header>

    <form class="search-bar" @submit.prevent="search()">
      <Search :size="19" />
      <input
        v-model="keyword"
        type="search"
        enterkeyhint="search"
        autocomplete="off"
        placeholder="搜索歌曲、歌手"
        aria-label="搜索歌曲、歌手"
      />
      <button
        v-if="keyword"
        class="icon-btn"
        type="button"
        aria-label="清空"
        style="width: 28px; height: 28px"
        @click="clear"
      >
        <X :size="16" />
      </button>
    </form>

    <div v-if="!searched" class="section">
      <div v-if="recent.length" class="section-head">
        <h2 class="section-title">最近搜索</h2>
      </div>
      <div v-if="recent.length" class="chip-row">
        <button
          v-for="item in recent"
          :key="item"
          class="chip"
          type="button"
          @click="search(item)"
        >
          {{ item }}
        </button>
      </div>

      <div class="section-head" style="margin-top: 28px">
        <h2 class="section-title">热门搜索</h2>
      </div>
      <div class="chip-row">
        <button
          v-for="item in suggestions"
          :key="item"
          class="chip"
          type="button"
          @click="search(item)"
        >
          {{ item }}
        </button>
      </div>
    </div>

    <div v-else class="section">
      <div class="section-head">
        <div>
          <h2 class="section-title">
            {{ searching ? '搜索中…' : `找到 ${total || songs.length} 首歌曲` }}
          </h2>
          <p v-if="keyword" class="section-desc">关键词：{{ keyword }}</p>
        </div>
        <button
          v-if="songs.length"
          class="btn btn-primary btn-sm"
          type="button"
          @click="playAll"
        >
          <Play :size="14" />
          播放全部
        </button>
      </div>

      <div v-if="searching" class="song-list">
        <div v-for="i in 6" :key="i" class="skeleton-row">
          <div class="skeleton skeleton-cover"></div>
          <div class="skeleton-lines" style="flex: 1">
            <div class="skeleton skeleton-line" style="width: 52%"></div>
            <div class="skeleton skeleton-line" style="width: 30%"></div>
          </div>
        </div>
      </div>

      <div v-else-if="error" class="error-box">{{ error }}</div>

      <div v-else-if="songs.length" class="card" style="padding: 8px">
        <SongList
          :songs="songs"
          :active-hash="player.current?.hash"
          @play="play"
        />
      </div>

      <div v-else class="empty-state">
        <Search :size="34" />
        <h3>没有找到歌曲</h3>
        <p>换一个关键词试试，或检查网络后重试。</p>
      </div>
    </div>
  </div>
</template>
