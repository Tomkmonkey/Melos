<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Play } from 'lucide-vue-next'
import CoverImage from '../components/CoverImage.vue'
import PlaylistCard from '../components/PlaylistCard.vue'
import { apiGet } from '../api/client'
import { parseCard, parsePlaylists } from '../api/parse'
import type { Playlist, RecommendedCard } from '../api/types'
import { useAuthStore } from '../stores/auth'
import { usePlayerStore } from '../stores/player'
import { greeting } from '../utils'

const auth = useAuthStore()
const player = usePlayerStore()

const cards = ref<RecommendedCard[]>([])
const playlists = ref<Playlist[]>([])
const loading = ref(true)
const error = ref('')

const cardDefinitions: Array<[number, string]> = [
  [1, '私人专属好歌'],
  [2, '经典怀旧金曲'],
  [3, '热门好歌精选'],
  [4, '小众宝藏佳作'],
  [5, '潮流尝鲜'],
  [6, 'VIP 专属推荐'],
]

async function load() {
  loading.value = true
  error.value = ''
  const cardResults = await Promise.allSettled(
    cardDefinitions.map(async ([cardId, title]) => {
      const data = await apiGet<any>('/top/card', { card_id: cardId })
      return parseCard(data, cardId, title)
    }),
  )
  cards.value = cardResults
    .filter((result): result is PromiseFulfilledResult<RecommendedCard> => result.status === 'fulfilled')
    .map((result) => result.value)
    .filter((card) => card.songs.length > 0)

  try {
    const data = await apiGet<any>('/top/playlist', { category_id: 0, page: 1 })
    playlists.value = parsePlaylists(data?.special_list ?? data)
  } catch {
    playlists.value = []
  }

  if (!cards.value.length && !playlists.value.length) {
    error.value = '推荐内容加载失败，请检查网络或稍后重试'
  }
  loading.value = false
}

function playCard(card: RecommendedCard) {
  void player.playQueue(card.songs, 0)
}

function playCardSong(card: RecommendedCard, index: number) {
  void player.playQueue(card.songs, index)
}

onMounted(load)
</script>

<template>
  <div class="page wide">
    <header class="page-header">
      <div>
        <div class="eyebrow">{{ greeting() }}</div>
        <h1 class="page-title">发现音乐</h1>
        <p class="page-subtitle">推荐歌曲、热门歌单和正在流行的声音</p>
      </div>
      <RouterLink v-if="!auth.loggedIn" class="btn btn-primary btn-sm" to="/login">
        扫码登录
      </RouterLink>
      <div v-else class="chip">
        {{ auth.profile?.nickname ? `已登录 · ${auth.profile.nickname}` : '已登录' }}
      </div>
    </header>

    <div v-if="loading" class="recommend-grid">
      <div v-for="i in 3" :key="i" class="recommend-card">
        <div class="recommend-top">
          <div class="skeleton" style="width: 58px; height: 58px; border-radius: 14px"></div>
          <div class="skeleton-lines" style="flex: 1">
            <div class="skeleton skeleton-line" style="width: 65%"></div>
            <div class="skeleton skeleton-line" style="width: 90%"></div>
          </div>
        </div>
        <div class="skeleton-lines" style="margin-top: 16px">
          <div v-for="j in 3" :key="j" class="skeleton skeleton-line" style="width: 78%"></div>
        </div>
      </div>
    </div>

    <div v-else-if="error && !cards.length && !playlists.length" class="error-box">
      {{ error }}
      <button class="btn btn-sm" style="margin-left: 12px" @click="load">重试</button>
    </div>

    <template v-else>
      <section v-if="cards.length" class="section">
        <div class="section-head">
          <div>
            <h2 class="section-title">为你推荐</h2>
            <p class="section-desc">根据你的口味整理的每日歌单</p>
          </div>
        </div>
        <div class="recommend-grid">
          <article v-for="card in cards" :key="card.cardId" class="recommend-card">
            <div class="recommend-top">
              <CoverImage :src="card.cover" :alt="card.title" />
              <div style="min-width: 0">
                <h3 class="recommend-title">{{ card.title }}</h3>
                <p class="recommend-desc">
                  {{
                    card.description && card.description !== card.title
                      ? card.description
                      : card.songs[0]?.artist || '为你精选'
                  }}
                </p>
              </div>
            </div>
            <ul class="recommend-songs">
              <li
                v-for="(song, index) in card.songs.slice(0, 4)"
                :key="song.hash"
                class="recommend-song"
                @click="playCardSong(card, index)"
              >
                <span style="width: 14px; opacity: 0.6">{{ index + 1 }}</span>
                <span>{{ song.title }} · {{ song.artist }}</span>
              </li>
            </ul>
            <div class="recommend-foot">
              <span class="muted" style="font-size: 12px">{{ card.songs.length }} 首</span>
              <button class="btn btn-primary btn-sm" type="button" @click="playCard(card)">
                <Play :size="14" />
                播放
              </button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="playlists.length" class="section">
        <div class="section-head">
          <div>
            <h2 class="section-title">推荐歌单</h2>
            <p class="section-desc">在 Melos 里找到下一张循环播放的歌单</p>
          </div>
        </div>
        <div class="playlist-grid">
          <PlaylistCard
            v-for="playlist in playlists"
            :key="playlist.id"
            :playlist="playlist"
          />
        </div>
      </section>
    </template>
  </div>
</template>
