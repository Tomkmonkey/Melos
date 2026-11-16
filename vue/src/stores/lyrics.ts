import { ref } from 'vue'
import { defineStore } from 'pinia'
import { fetchLyrics, type LyricLine } from '../api/lyrics'
import type { Song } from '../api/types'

const MAX_CACHE = 40

function cacheKey(song: Song): string {
  return song.hash ? `${song.hash}|${song.albumAudioId ?? ''}` : `${song.artist}|${song.title}`
}

export const useLyricsStore = defineStore('lyrics', () => {
  const lines = ref<LyricLine[]>([])
  const loading = ref(false)
  const error = ref('')

  const cache = new Map<string, LyricLine[]>()
  const pending = new Map<string, Promise<LyricLine[]>>()
  let serial = 0

  function remember(key: string, value: LyricLine[]) {
    if (cache.size >= MAX_CACHE) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, value)
  }

  async function load(song: Song | null) {
    const current = ++serial
    error.value = ''
    if (!song) {
      lines.value = []
      loading.value = false
      return
    }

    const key = cacheKey(song)
    const cached = cache.get(key)
    if (cached) {
      lines.value = cached
      loading.value = false
      return
    }

    lines.value = []
    loading.value = true
    try {
      let request = pending.get(key)
      if (!request) {
        request = fetchLyrics(song)
        pending.set(key, request)
      }
      const result = await request.finally(() => {
        if (pending.get(key) === request) pending.delete(key)
      })
      if (current !== serial) return
      remember(key, result)
      lines.value = result
    } catch {
      if (current !== serial) return
      lines.value = []
      error.value = '歌词加载失败，请稍后重试'
    } finally {
      if (current === serial) loading.value = false
    }
  }

  return {
    lines,
    loading,
    error,
    load,
  }
})
