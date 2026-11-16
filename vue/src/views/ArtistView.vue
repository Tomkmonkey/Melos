<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Play } from 'lucide-vue-next'
import CoverImage from '../components/CoverImage.vue'
import SongList from '../components/SongList.vue'
import { fetchArtistAlbums, fetchArtistDetail, fetchArtistSongs } from '../api/catalog'
import type { AlbumSummary, ArtistDetail, Song } from '../api/types'
import { usePlayerStore } from '../stores/player'
import { formatCount } from '../utils'

const props = defineProps<{ id: string }>()
const router = useRouter()
const player = usePlayerStore()

const artist = ref<ArtistDetail>({ id: props.id, name: '歌手' })
const songs = ref<Song[]>([])
const albums = ref<AlbumSummary[]>([])
const loading = ref(true)
const error = ref('')
const introExpanded = ref(false)

const stats = computed(() =>
  [
    artist.value.songCount || songs.value.length
      ? `${artist.value.songCount || songs.value.length} 首歌曲`
      : '',
    artist.value.albumCount ? `${artist.value.albumCount} 张专辑` : '',
    artist.value.fans ? `${formatCount(artist.value.fans)} 粉丝` : '',
  ]
    .filter(Boolean)
    .join(' · '),
)

async function load() {
  loading.value = true
  error.value = ''
  introExpanded.value = false
  artist.value = { id: props.id, name: '歌手' }
  const [detailResult, songsResult, albumsResult] = await Promise.allSettled([
    fetchArtistDetail(props.id),
    fetchArtistSongs(props.id),
    fetchArtistAlbums(props.id),
  ])

  if (detailResult.status === 'fulfilled') {
    artist.value = detailResult.value
  }
  if (songsResult.status === 'fulfilled') {
    songs.value = songsResult.value
  } else {
    error.value = (songsResult.reason as Error)?.message || '歌手歌曲加载失败'
    songs.value = []
  }
  albums.value = albumsResult.status === 'fulfilled' ? albumsResult.value : []

  if (songs.value.length) {
    const cover = artist.value.avatar
    songs.value = songs.value.map((song) => ({
      ...song,
      artist: song.artist === '未知艺人' ? artist.value.name : song.artist,
      artistId: song.artistId ?? props.id,
      cover: song.cover ?? cover,
    }))
  }
  loading.value = false
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

    <div v-if="loading" class="artist-hero">
      <div class="skeleton artist-avatar-skeleton"></div>
      <div class="skeleton-lines" style="flex: 1">
        <div class="skeleton skeleton-line" style="width: 30%"></div>
        <div class="skeleton skeleton-line" style="width: 55%"></div>
        <div class="skeleton skeleton-line" style="width: 80%"></div>
      </div>
    </div>

    <template v-else>
      <section class="artist-hero">
        <CoverImage class="artist-avatar" :src="artist.avatar" :alt="artist.name" eager />
        <div style="min-width: 0; flex: 1">
          <div class="eyebrow">Artist</div>
          <h1 class="page-title">{{ artist.name }}</h1>
          <p v-if="stats" class="page-subtitle">{{ stats }}</p>
          <p
            v-if="artist.intro"
            class="artist-intro muted"
            :class="{ expanded: introExpanded }"
          >
            {{ artist.intro }}
          </p>
          <button
            v-if="artist.intro && artist.intro.length > 120"
            class="artist-intro-toggle"
            type="button"
            @click="introExpanded = !introExpanded"
          >
            {{ introExpanded ? '收起简介' : '展开简介' }}
          </button>
        </div>
      </section>

      <div v-if="error" class="error-box" style="margin-top: 22px">
        {{ error }}
        <button class="btn btn-sm" style="margin-left: 12px" @click="load">重试</button>
      </div>

      <template v-else>
        <section class="section">
          <div class="section-head">
            <div>
              <h2 class="section-title">热门歌曲</h2>
              <p class="section-desc">按播放热度排序</p>
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
          <div v-if="songs.length" class="card" style="padding: 8px">
            <SongList
              :songs="songs"
              :active-hash="player.current?.hash"
              @play="play"
            />
          </div>
          <div v-else class="empty-state">
            <h3>暂无歌曲</h3>
            <p>该歌手的歌曲暂时无法获取。</p>
          </div>
        </section>

        <section v-if="albums.length" class="section">
          <div class="section-head">
            <div>
              <h2 class="section-title">专辑</h2>
              <p class="section-desc">按发行时间排序</p>
            </div>
          </div>
          <div class="album-grid">
            <RouterLink
              v-for="album in albums"
              :key="album.id"
              class="album-card"
              :to="`/album/${album.id}`"
            >
              <CoverImage :src="album.cover" :alt="album.title" />
              <div class="album-name">{{ album.title }}</div>
              <div class="album-meta">
                {{
                  [album.publishDate, album.songCount ? `${album.songCount} 首` : '']
                    .filter(Boolean)
                    .join(' · ')
                }}
              </div>
            </RouterLink>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
