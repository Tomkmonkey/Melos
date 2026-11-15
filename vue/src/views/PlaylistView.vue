<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, Play } from 'lucide-vue-next'
import CoverImage from '../components/CoverImage.vue'
import SongList from '../components/SongList.vue'
import { apiGet } from '../api/client'
import { imageUrl, parseSongList } from '../api/parse'
import type { Song } from '../api/types'
import { usePlayerStore } from '../stores/player'

const props = defineProps<{ id: string }>()
const router = useRouter()
const player = usePlayerStore()

const songs = ref<Song[]>([])
const title = ref('歌单')
const cover = ref<string | undefined>()
const description = ref('')
const creator = ref('')
const songCount = ref(0)
const loading = ref(true)
const error = ref('')

const countLabel = computed(() =>
  songCount.value ? `${songCount.value} 首歌曲` : `${songs.value.length} 首歌曲`,
)

function normalizeId(value: string): string {
  return /^\d+_\d+_\d+_\d+$/.test(value) ? `collection_${value}` : value
}

async function load() {
  loading.value = true
  error.value = ''
  const id = normalizeId(props.id)
  try {
    const [detailResult, tracksResult] = await Promise.allSettled([
      apiGet<any>('/playlist/detail', { ids: id }),
      apiGet<any>('/playlist/track/all', { id, page: 1, pagesize: 200 }),
    ])

    if (detailResult.status === 'fulfilled') {
      const detail = detailResult.value ?? {}
      title.value = detail.name ?? detail.title ?? '歌单'
      cover.value = imageUrl(detail.pic ?? detail.cover ?? detail.img)
      description.value = detail.intro ?? detail.desc ?? ''
      creator.value = detail.list_create_username ?? detail.nickname ?? ''
      songCount.value = Number(detail.count ?? 0) || 0
    }

    if (tracksResult.status === 'fulfilled') {
      const data = tracksResult.value ?? {}
      songs.value = parseSongList(data.songs ?? data.lists ?? data)
      if (!songCount.value) songCount.value = songs.value.length
    } else {
      throw tracksResult.reason
    }
  } catch (err) {
    error.value = (err as Error).message || '歌单加载失败'
    songs.value = []
  } finally {
    loading.value = false
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
  else void router.push('/library')
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
        <div class="skeleton skeleton-line" style="width: 55%"></div>
        <div class="skeleton skeleton-line" style="width: 80%"></div>
        <div class="skeleton skeleton-line" style="width: 35%"></div>
      </div>
    </div>

    <template v-else>
      <section class="playlist-hero">
        <CoverImage
          class="playlist-cover"
          :src="cover ?? songs[0]?.cover"
          :alt="title"
        />
        <div style="min-width: 0; flex: 1">
          <div class="eyebrow">Playlist</div>
          <h1 class="page-title" style="font-size: clamp(24px, 4vw, 36px)">{{ title }}</h1>
          <p class="page-subtitle">
            {{ creator ? `${creator} · ` : '' }}{{ countLabel }}
          </p>
          <p v-if="description" class="muted playlist-intro">{{ description }}</p>
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
          <h3>歌单里还没有歌曲</h3>
          <p>换一个歌单，或稍后刷新重试。</p>
        </div>
      </section>
    </template>
  </div>
</template>
