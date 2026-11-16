<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Play } from 'lucide-vue-next'
import CoverImage from '../components/CoverImage.vue'
import SongList from '../components/SongList.vue'
import { apiGet } from '../api/client'
import { fetchAlbumDetail, fetchAlbumSongs } from '../api/catalog'
import { parseSongList } from '../api/parse'
import type { AlbumDetail, Song } from '../api/types'
import { usePlayerStore } from '../stores/player'

const props = defineProps<{ id: string }>()
const router = useRouter()
const player = usePlayerStore()

const album = ref<AlbumDetail>({ id: props.id, title: '专辑', artist: '未知艺人' })
const songs = ref<Song[]>([])
const loading = ref(true)
const error = ref('')
const introExpanded = ref(false)

const meta = computed(() =>
  [
    album.value.publishDate,
    album.value.type,
    album.value.language,
    songs.value.length ? `${songs.value.length} 首` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)

async function load() {
  loading.value = true
  error.value = ''
  introExpanded.value = false
  album.value = { id: props.id, title: '专辑', artist: '未知艺人' }
  const [detailResult, songsResult] = await Promise.allSettled([
    fetchAlbumDetail(props.id),
    fetchAlbumSongs(props.id),
  ])

  const detailOk = detailResult.status === 'fulfilled'
  if (detailOk) {
    album.value = detailResult.value
  }
  let tracks = songsResult.status === 'fulfilled' ? songsResult.value : []
  // 部分新专辑 / 单曲专辑的曲目接口会返回 invalid param，退回关键词搜索。
  if (!tracks.length && detailOk) {
    tracks = await searchAlbumTracks()
  }
  songs.value = tracks.map((song) => ({
    ...song,
    albumId: song.albumId ?? props.id,
    albumName: song.albumName ?? album.value.title,
    cover: song.cover ?? album.value.cover,
  }))
  if (!tracks.length && !detailOk) {
    error.value = (songsResult.status === 'rejected' ? (songsResult.reason as Error)?.message : '') || '专辑加载失败'
  }
  loading.value = false
}

async function searchAlbumTracks(): Promise<Song[]> {
  try {
    const data = await apiGet<any>('/search', {
      keywords: `${album.value.artist} ${album.value.title}`.trim(),
      page: 1,
      pagesize: 50,
      type: 'song',
    })
    const list = parseSongList(data?.lists ?? data)
    const byAlbum = list.filter((song) => song.albumId === props.id)
    if (byAlbum.length) return byAlbum
    const title = album.value.title.trim().toLowerCase()
    return list.filter((song) => (song.albumName ?? '').trim().toLowerCase() === title)
  } catch {
    return []
  }
}

function play(index: number) {
  void player.playQueue(songs.value, index)
}

function playAll() {
  void player.playQueue(songs.value, 0)
}

function goBack() {
  if (window.history.length > 1) router.back()
  else void router.push('/')
}

onMounted(load)
watch(
  () => props.id,
  () => void load(),
)
</script>

<template>
  <div class="page">
    <header class="page-header" style="margin-bottom: 14px">
      <button class="btn btn-sm" type="button" @click="goBack">
        <ChevronLeft :size="16" />
        返回
      </button>
    </header>

    <div v-if="loading" class="playlist-hero">
      <div class="skeleton" style="width: 150px; height: 150px; border-radius: 18px"></div>
      <div class="skeleton-lines" style="flex: 1">
        <div class="skeleton skeleton-line" style="width: 45%"></div>
        <div class="skeleton skeleton-line" style="width: 70%"></div>
        <div class="skeleton skeleton-line" style="width: 35%"></div>
      </div>
    </div>

    <template v-else>
      <section class="album-hero">
        <CoverImage class="album-cover-large" :src="album.cover" :alt="album.title" eager />
        <div style="min-width: 0; flex: 1">
          <div class="eyebrow">Album</div>
          <h1 class="page-title" style="font-size: clamp(24px, 4vw, 36px)">
            {{ album.title }}
          </h1>
          <p class="page-subtitle">
            <RouterLink
              v-if="album.artistId"
              class="meta-link"
              :to="`/artist/${album.artistId}`"
            >
              {{ album.artist }}
            </RouterLink>
            <span v-else>{{ album.artist }}</span>
            <template v-if="meta"> · {{ meta }}</template>
          </p>
          <p
            v-if="album.intro"
            class="artist-intro muted"
            :class="{ expanded: introExpanded }"
          >
            {{ album.intro }}
          </p>
          <button
            v-if="album.intro && album.intro.length > 120"
            class="artist-intro-toggle"
            type="button"
            @click="introExpanded = !introExpanded"
          >
            {{ introExpanded ? '收起简介' : '展开简介' }}
          </button>
          <div class="hero-actions" style="margin-top: 16px">
            <button
              class="btn btn-primary"
              type="button"
              :disabled="!songs.length"
              @click="playAll"
            >
              <Play :size="16" />
              播放全部
            </button>
          </div>
        </div>
      </section>

      <div v-if="error" class="error-box" style="margin-top: 22px">
        {{ error }}
        <button class="btn btn-sm" style="margin-left: 12px" @click="load">重试</button>
      </div>

      <section v-else class="section" style="margin-top: 22px">
        <div v-if="songs.length" class="card" style="padding: 8px">
          <SongList
            :songs="songs"
            :active-hash="player.current?.hash"
            @play="play"
          />
        </div>
        <div v-else class="empty-state">
          <h3>专辑里还没有歌曲</h3>
          <p>可能尚未发行，或暂时无法获取。</p>
          <button class="btn btn-sm" type="button" style="margin-top: 12px" @click="load">
            重试
          </button>
        </div>
      </section>
    </template>
  </div>
</template>
