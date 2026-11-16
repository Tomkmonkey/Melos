import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  addFavorite,
  fetchFavoriteEntries,
  fetchFavoritePlaylist,
  removeFavorite,
} from '../api/favorites'
import type { FavoriteEntry, FavoritePlaylist } from '../api/favorites'
import type { Song } from '../api/types'
import { useAuthStore } from './auth'

const CACHE_KEY = 'melos.favorites.v1'
/** 缓存超过这个时间就后台刷新，页面先用缓存里的收藏状态。 */
const CACHE_REFRESH_MS = 5 * 60 * 1000
/** 太久没有刷新过的缓存不再使用，避免显示几个月前的状态。 */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const normalizeHash = (hash?: string | null) => (hash ?? '').trim().toLowerCase()

interface CachedEntry {
  hash: string
  fileId: string
  mixSongId?: string
}

interface FavoriteCache {
  userId: string
  listId: string
  playlistId: string
  songCount?: number
  updatedAt: number
  entries: CachedEntry[]
}

function readCache(userId: string | undefined): FavoriteCache | null {
  if (!userId) return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FavoriteCache
    if (!parsed || parsed.userId !== userId) return null
    if (!Array.isArray(parsed.entries)) return null
    if (Date.now() - Number(parsed.updatedAt) > CACHE_MAX_AGE_MS) return null
    if (!parsed.listId || !parsed.playlistId) return null
    return {
      ...parsed,
      entries: parsed.entries.filter(
        (entry) =>
          !!entry &&
          typeof entry.hash === 'string' &&
          typeof entry.fileId === 'string',
      ),
    }
  } catch {
    return null
  }
}

function writeCache(cache: FavoriteCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* 存储不可用时忽略，下一次进入页面重新拉取 */
  }
}

export const useFavoritesStore = defineStore('favorites', () => {
  const auth = useAuthStore()

  const playlist = ref<FavoritePlaylist | null>(null)
  const entries = ref<FavoriteEntry[]>([])
  const hashes = ref<Set<string>>(new Set())
  const loading = ref(false)
  const ready = ref(false)
  const error = ref('')
  const actionError = ref('')
  const pendingHash = ref('')

  let loadPromise: Promise<void> | null = null
  let actionErrorTimer: number | undefined
  let updatedAt = 0
  /** 退出登录或切换账号后，丢弃仍在路上的旧请求结果。 */
  let generation = 0

  const count = computed(() => playlist.value?.songCount ?? entries.value.length)

  function clearActionError() {
    if (actionErrorTimer !== undefined) {
      window.clearTimeout(actionErrorTimer)
      actionErrorTimer = undefined
    }
    actionError.value = ''
  }

  function setActionError(message: string) {
    clearActionError()
    actionError.value = message
    actionErrorTimer = window.setTimeout(() => {
      actionError.value = ''
      actionErrorTimer = undefined
    }, 5000)
  }

  /** 用本机缓存先恢复收藏状态，网络慢时心形按钮也能立即使用。 */
  function hydrateFromCache(): boolean {
    const cache = readCache(auth.session.userId)
    if (!cache) return false
    playlist.value = {
      listId: cache.listId,
      playlistId: cache.playlistId,
      songCount: cache.songCount,
    }
    entries.value = cache.entries.map((entry) => ({
      hash: entry.hash,
      fileId: entry.fileId,
      mixSongId: entry.mixSongId,
      song: {
        id: entry.mixSongId ?? entry.hash,
        title: '',
        artist: '',
        hash: entry.hash,
      },
    }))
    hashes.value = new Set(
      cache.entries.map((entry) => normalizeHash(entry.hash)).filter(Boolean),
    )
    ready.value = true
    updatedAt = Number(cache.updatedAt) || 0
    return true
  }

  function persist() {
    const userId = auth.session.userId
    const target = playlist.value
    if (!userId || !target) return
    updatedAt = Date.now()
    writeCache({
      userId,
      listId: target.listId,
      playlistId: target.playlistId,
      songCount: target.songCount,
      updatedAt,
      entries: entries.value.map((entry) => ({
        hash: entry.hash,
        fileId: entry.fileId,
        mixSongId: entry.mixSongId,
      })),
    })
  }

  function reset() {
    generation += 1
    playlist.value = null
    entries.value = []
    hashes.value = new Set()
    loading.value = false
    ready.value = false
    error.value = ''
    pendingHash.value = ''
    loadPromise = null
    updatedAt = 0
    clearActionError()
  }

  function isFavorite(song?: Song | null): boolean {
    if (!song?.hash) return false
    return hashes.value.has(normalizeHash(song.hash))
  }

  function isPending(song?: Song | null): boolean {
    if (!song?.hash || !pendingHash.value) return false
    return pendingHash.value === normalizeHash(song.hash)
  }

  async function load(force = false): Promise<void> {
    if (!auth.loggedIn) {
      reset()
      return
    }
    if (!ready.value) hydrateFromCache()
    if (ready.value && !force && Date.now() - updatedAt < CACHE_REFRESH_MS) return
    if (loadPromise) return loadPromise

    const hadState = ready.value
    const gen = generation
    loading.value = true
    error.value = ''
    loadPromise = (async () => {
      try {
        const info = await fetchFavoritePlaylist()
        if (!info) throw new Error('未找到“我喜欢”歌单')
        const list = await fetchFavoriteEntries(info.playlistId)
        if (generation !== gen) return
        playlist.value = { ...info, songCount: info.songCount ?? list.length }
        entries.value = list
        hashes.value = new Set(
          list.map((entry) => normalizeHash(entry.hash)).filter(Boolean),
        )
        ready.value = true
        persist()
      } catch (err) {
        if (generation !== gen) return
        error.value = (err as Error).message || '收藏加载失败'
        if (!hadState) {
          playlist.value = null
          entries.value = []
          hashes.value = new Set()
          ready.value = false
        }
      } finally {
        if (generation === gen) {
          loading.value = false
          loadPromise = null
        }
      }
    })()
    return loadPromise
  }

  async function toggle(song: Song): Promise<void> {
    if (!auth.loggedIn) {
      setActionError('登录后才能收藏歌曲')
      return
    }
    if (!song.hash) {
      setActionError('这首歌缺少标识，暂时无法收藏')
      return
    }
    if (pendingHash.value) return

    const hash = normalizeHash(song.hash)
    if (!ready.value || !playlist.value) {
      await load()
      if (!playlist.value) {
        setActionError(error.value || '收藏列表不可用')
        return
      }
    }

    const target = playlist.value
    const wasFavorite = hashes.value.has(hash)
    const gen = generation
    clearActionError()
    pendingHash.value = hash

    const optimistic = new Set(hashes.value)
    if (wasFavorite) optimistic.delete(hash)
    else optimistic.add(hash)
    hashes.value = optimistic

    try {
      if (wasFavorite) {
        let entry = entries.value.find(
          (item) => normalizeHash(item.hash) === hash && item.fileId,
        )
        if (!entry) {
          // 本地缓存可能落后（例如刚在手机端收藏过），先刷新再定位条目。
          const fresh = await fetchFavoriteEntries(target.playlistId)
          if (generation !== gen) return
          entries.value = fresh
          entry = fresh.find((item) => normalizeHash(item.hash) === hash && item.fileId)
        }
        if (!entry) throw new Error('喜欢列表中找不到这首歌')
        await removeFavorite(target, entry.fileId)
        if (generation !== gen) return
        entries.value = entries.value.filter((item) => item !== entry)
      } else {
        const fileId = await addFavorite(target, song)
        if (generation !== gen) return
        entries.value = [
          {
            hash: song.hash,
            fileId,
            mixSongId: song.albumAudioId ?? song.id,
            song,
          },
          ...entries.value,
        ]
      }
      target.songCount = hashes.value.size
      persist()
    } catch (err) {
      if (generation !== gen) return
      const reverted = new Set(hashes.value)
      if (wasFavorite) reverted.add(hash)
      else reverted.delete(hash)
      hashes.value = reverted
      setActionError((err as Error).message || (wasFavorite ? '取消收藏失败' : '收藏失败'))
    } finally {
      if (generation === gen) pendingHash.value = ''
    }
  }

  hydrateFromCache()

  watch(
    () => auth.loggedIn,
    (loggedIn) => {
      if (!loggedIn) reset()
      else if (auth.initialized) {
        if (!ready.value) hydrateFromCache()
        void load()
      }
    },
  )

  return {
    playlist,
    entries,
    loading,
    ready,
    error,
    actionError,
    pendingHash,
    count,
    isFavorite,
    isPending,
    load,
    toggle,
    reset,
  }
})
