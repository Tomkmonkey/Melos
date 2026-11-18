import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { apiGet } from '../api/client'
import type { Song } from '../api/types'

const STATE_KEY = 'melos.player.v1'
const audio = new Audio()
audio.preload = 'auto'

// 下一首音频预加载元素：只缓冲数据，不参与播放。
const preloadAudio = document.createElement('audio')
preloadAudio.preload = 'auto'
preloadAudio.muted = true
preloadAudio.setAttribute('playsinline', '')
preloadAudio.setAttribute('aria-hidden', 'true')
preloadAudio.dataset.melosPreload = 'next'
preloadAudio.style.display = 'none'
if (document.body) document.body.appendChild(preloadAudio)

type RepeatMode = 'off' | 'all' | 'one'
type Quality = '320' | '128' | 'flac'

interface SavedPlayer {
  queue?: Song[]
  index?: number
  position?: number
  quality?: Quality
  volume?: number
  repeat?: RepeatMode
}

function readSaved(): SavedPlayer {
  try {
    const raw = localStorage.getItem(STATE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function proxyAudio(url: string): string {
  const proxy = new URL('/api/audio-proxy', window.location.origin)
  proxy.searchParams.set('url', url)
  return proxy.toString()
}

export const usePlayerStore = defineStore('player', () => {
  const saved = readSaved()

  const queue = ref<Song[]>(Array.isArray(saved.queue) ? saved.queue : [])
  const index = ref(
    Number.isInteger(saved.index) && (saved.index as number) >= 0
      ? Math.min(saved.index as number, Math.max(0, queue.value.length - 1))
      : queue.value.length
        ? 0
        : -1,
  )
  const playing = ref(false)
  const loading = ref(false)
  const positionMs = ref(Math.max(0, saved.position ?? 0))
  const durationMs = ref(queue.value[index.value]?.durationMs ?? 0)
  const volume = ref(
    typeof saved.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : 0.8,
  )
  const quality = ref<Quality>(saved.quality ?? '320')
  const repeat = ref<RepeatMode>(saved.repeat ?? 'all')
  const error = ref('')

  const current = computed(() => queue.value[index.value] ?? null)
  const hasSource = ref(false)

  let requestSerial = 0
  let restorePosition = positionMs.value
  let lastPersisted = 0
  const PREFETCH_AHEAD = 10
  const prefetchedTracks = new Map<number, { hash: string; quality: Quality; url: string }>()
  const prefetching = new Set<number>()
  let prefetchEpoch = 0
  let preloadUrl = ''
  let endedHandled = false
  let endedResetTimer: number | undefined
  let ignoreEndedUntil = 0

  audio.volume = volume.value

  function persist(force = false) {
    const now = Date.now()
    if (!force && now - lastPersisted < 3000) return
    lastPersisted = now
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          queue: queue.value,
          index: index.value,
          position: positionMs.value,
          quality: quality.value,
          volume: volume.value,
          repeat: repeat.value,
        }),
      )
    } catch {
      /* 忽略存储异常 */
    }
  }

  function updateMediaSession(song: Song | null) {
    if (!('mediaSession' in navigator)) return
    if (!song) {
      navigator.mediaSession.metadata = null
      return
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.albumName ?? 'Melos',
      artwork: song.cover
        ? [{ src: song.cover, sizes: '480x480', type: 'image/jpeg' }]
        : [],
    })
    navigator.mediaSession.setActionHandler('play', () => void toggle())
    navigator.mediaSession.setActionHandler('pause', () => audio.pause())
    navigator.mediaSession.setActionHandler('previoustrack', () => void previous())
    navigator.mediaSession.setActionHandler('nexttrack', () => void next())
  }

  audio.addEventListener('timeupdate', () => {
    positionMs.value = Math.round(audio.currentTime * 1000)
    persist()
    const duration = audio.duration
    if (
      !endedHandled &&
      !audio.paused &&
      Number.isFinite(duration) &&
      duration > 0 &&
      audio.currentTime >= duration - 0.05
    ) {
      handleEndedOnce()
    }
  })
  audio.addEventListener('durationchange', () => {
    if (Number.isFinite(audio.duration)) {
      durationMs.value = Math.round(audio.duration * 1000)
    }
  })
  audio.addEventListener('play', () => {
    playing.value = true
    error.value = ''
    schedulePrefetch()
  })
  audio.addEventListener('pause', () => {
    playing.value = false
    persist(true)
  })
  audio.addEventListener('ended', () => {
    handleEndedOnce()
  })
  audio.addEventListener('error', () => {
    if (hasSource.value) {
      error.value = '音频加载失败，请尝试下一首'
      playing.value = false
    }
  })

  const persistOnHide = () => persist(true)
  window.addEventListener('pagehide', persistOnHide)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persist(true)
      return
    }
    // iOS PWA 在后台可能丢失 ended 事件，回到前台时补一次。
    if (hasSource.value && audio.ended) handleEndedOnce()
  })

  async function resolveSongUrl(song: Song, targetQuality: Quality): Promise<string> {
    const query: Record<string, unknown> = {
      hash: song.hash,
      quality: targetQuality,
      free_part: 'false',
    }
    if (song.albumId) query.album_id = song.albumId
    if (song.albumAudioId && /^\d+$/.test(song.albumAudioId)) {
      query.album_audio_id = song.albumAudioId
    }
    const data = await apiGet<any>('/song/url', query)
    if (typeof data?.url === 'string') return data.url
    if (Array.isArray(data?.url) && typeof data.url[0] === 'string') return data.url[0]
    return ''
  }

  async function resolvePlayableUrl(song: Song): Promise<string> {
    const order: Quality[] =
      quality.value === 'flac'
        ? ['flac', '320', '128']
        : quality.value === '320'
          ? ['320', '128']
          : ['128']
    for (const target of order) {
      try {
        const url = await resolveSongUrl(song, target)
        if (url) return url
      } catch {
        /* 尝试下一档音质 */
      }
    }
    return ''
  }

  function nextQueueIndex(): number | null {
    if (!queue.value.length) return null
    if (repeat.value === 'one') return index.value
    if (index.value + 1 < queue.value.length) return index.value + 1
    if (repeat.value === 'all') return 0
    return null
  }

  function clearPreloadAudio() {
    if (!preloadUrl && !preloadAudio.getAttribute('src')) return
    preloadUrl = ''
    try {
      preloadAudio.pause()
      preloadAudio.removeAttribute('src')
      preloadAudio.load()
    } catch {
      /* 忽略预加载释放异常 */
    }
  }

  function syncPreloadAudio() {
    const target = nextQueueIndex()
    if (target === null || target === index.value) {
      clearPreloadAudio()
      return
    }
    const item = prefetchedTracks.get(target)
    const song = queue.value[target]
    if (!item || !song || item.hash !== song.hash || item.quality !== quality.value) {
      clearPreloadAudio()
      return
    }
    // 等当前歌曲真正开始播放后再缓冲下一首，避免拖慢当前歌曲的首包。
    if (!playing.value) return
    if (preloadUrl === item.url) return
    const connection = (
      navigator as { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection
    if (
      connection?.saveData ||
      connection?.effectiveType === 'slow-2g' ||
      connection?.effectiveType === '2g'
    ) {
      clearPreloadAudio()
      return
    }
    preloadUrl = item.url
    preloadAudio.src = proxyAudio(item.url)
    try {
      preloadAudio.load()
    } catch {
      /* 预加载失败不影响正常切歌 */
    }
  }

  function clearPrefetch() {
    prefetchEpoch++
    prefetchedTracks.clear()
    prefetching.clear()
    clearPreloadAudio()
  }

  function upcomingIndices(): number[] {
    const length = queue.value.length
    if (!length || repeat.value === 'one') return []
    const targets: number[] = []
    const limit = Math.min(PREFETCH_AHEAD, length - 1)
    for (let offset = 1; offset <= limit; offset++) {
      let target = index.value + offset
      if (target >= length) {
        if (repeat.value !== 'all') break
        target -= length
      }
      if (target === index.value || targets.includes(target)) continue
      targets.push(target)
    }
    return targets
  }

  function prefetchTrack(target: number, epoch: number) {
    const song = queue.value[target]
    if (!song?.hash || prefetchedTracks.has(target) || prefetching.has(target)) return
    const expectedQuality = quality.value
    prefetching.add(target)
    void resolvePlayableUrl(song)
      .then((url) => {
        if (epoch !== prefetchEpoch || quality.value !== expectedQuality) return
        if (url) {
          prefetchedTracks.set(target, {
            hash: song.hash,
            quality: expectedQuality,
            url,
          })
          syncPreloadAudio()
        }
      })
      .catch(() => {
        /* 预取失败时仍在切歌时实时解析 */
      })
      .finally(() => {
        if (epoch === prefetchEpoch) prefetching.delete(target)
      })
  }

  /**
   * 预取接下来几首的播放地址。iOS PWA 在锁屏或切歌后可能暂停 JS 和网络，
   * 仅预取一首会在第三首时没有可用地址，因此保留一个小窗口。
   */
  function schedulePrefetch() {
    if (!queue.value.length) {
      clearPrefetch()
      return
    }
    const targets = upcomingIndices()
    if (!targets.length) {
      clearPrefetch()
      return
    }
    const wanted = new Set(targets)
    for (const key of prefetchedTracks.keys()) {
      if (!wanted.has(key)) prefetchedTracks.delete(key)
    }
    syncPreloadAudio()
    const epoch = prefetchEpoch
    for (const target of targets) prefetchTrack(target, epoch)
  }

  /** 在 ended 事件中同步启动下一首，避免异步等待导致 iOS 阻止自动播放。 */
  function playPrefetched(targetIndex: number): boolean {
    const item = prefetchedTracks.get(targetIndex)
    const song = queue.value[targetIndex]
    if (
      !item ||
      !song ||
      item.hash !== song.hash ||
      item.quality !== quality.value
    ) {
      return false
    }

    prefetchedTracks.delete(targetIndex)
    const serial = ++requestSerial
    index.value = targetIndex
    durationMs.value = song.durationMs ?? 0
    positionMs.value = 0
    restorePosition = 0
    loading.value = true
    error.value = ''
    playing.value = false
    hasSource.value = true
    audio.pause()
    audio.src = proxyAudio(item.url)
    audio.load()
    ignoreEndedUntil = Date.now() + 1500
    updateMediaSession(song)
    // 尽早为后续歌曲预取，锁屏后仍能继续连播。
    schedulePrefetch()

    try {
      const playback = audio.play()
      playback
        .then(() => {
          if (serial !== requestSerial) return
          playing.value = !audio.paused
          loading.value = false
          restorePosition = 0
          persist(true)
          schedulePrefetch()
        })
        .catch(() => {
          if (serial !== requestSerial) return
          loading.value = false
          playing.value = false
          error.value = '浏览器阻止了自动播放，请点击播放继续'
        })
    } catch {
      loading.value = false
      playing.value = false
      error.value = '浏览器阻止了自动播放，请点击播放继续'
    }
    return true
  }

  function handleEndedOnce() {
    if (endedHandled || Date.now() < ignoreEndedUntil) return
    endedHandled = true
    window.clearTimeout(endedResetTimer)
    endedResetTimer = window.setTimeout(() => {
      endedHandled = false
    }, 2000)
    void handleEnded()
  }

  function waitForReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (audio.readyState >= 1 && Number.isFinite(audio.duration)) {
        resolve()
        return
      }
      const timer = window.setTimeout(() => {
        cleanup()
        reject(new Error('音频加载超时，请重试'))
      }, 15000)
      const onReady = () => {
        cleanup()
        resolve()
      }
      const onError = () => {
        cleanup()
        reject(new Error('音频加载失败，请尝试下一首'))
      }
      const cleanup = () => {
        window.clearTimeout(timer)
        audio.removeEventListener('loadedmetadata', onReady)
        audio.removeEventListener('canplay', onReady)
        audio.removeEventListener('error', onError)
      }
      audio.addEventListener('loadedmetadata', onReady)
      audio.addEventListener('canplay', onReady)
      audio.addEventListener('error', onError)
    })
  }

  async function loadAndPlay(targetIndex: number, startMs = 0) {
    if (targetIndex < 0 || targetIndex >= queue.value.length) return
    const song = queue.value[targetIndex]
    const serial = ++requestSerial
    index.value = targetIndex
    durationMs.value = song.durationMs ?? 0
    positionMs.value = Math.max(0, startMs)
    loading.value = true
    error.value = ''
    playing.value = false
    hasSource.value = false
    audio.pause()

    try {
      const url = await resolvePlayableUrl(song)
      if (serial !== requestSerial) return
      if (!url) {
        throw new Error('暂无可用播放地址（可能为 VIP / 版权限制）')
      }

      hasSource.value = true
      audio.src = proxyAudio(url)
      audio.load()
      ignoreEndedUntil = Date.now() + 1500
      updateMediaSession(song)
      schedulePrefetch()
      await waitForReady()
      if (serial !== requestSerial) return

      if (startMs > 0) {
        const max = Number.isFinite(audio.duration) ? audio.duration : startMs / 1000
        audio.currentTime = Math.min(startMs / 1000, max)
      }
      await audio.play()
      if (serial !== requestSerial) return
      playing.value = !audio.paused
      restorePosition = 0
      persist(true)
    } catch (err) {
      if (serial !== requestSerial) return
      error.value = (err as Error).message || '播放失败'
      playing.value = false
    } finally {
      if (serial === requestSerial) loading.value = false
    }
  }

  async function handleEnded() {
    if (!queue.value.length) return
    if (repeat.value === 'one') {
      audio.currentTime = 0
      positionMs.value = 0
      try {
        await audio.play()
        playing.value = true
      } catch {
        playing.value = false
        error.value = '浏览器阻止了自动播放，请点击播放继续'
      }
      return
    }

    const target = nextQueueIndex()
    if (target === null) {
      playing.value = false
      positionMs.value = durationMs.value
      persist(true)
      return
    }
    // 单曲队列的列表循环：直接重播当前音频，避免再次请求地址。
    if (target === index.value) {
      audio.currentTime = 0
      positionMs.value = 0
      try {
        await audio.play()
        playing.value = true
      } catch {
        playing.value = false
        error.value = '浏览器阻止了自动播放，请点击播放继续'
      }
      return
    }
    if (playPrefetched(target)) return
    await loadAndPlay(target, 0)
  }

  async function playQueue(songs: Song[], startIndex = 0) {
    const playable = songs.filter((song) => song.hash)
    if (!playable.length) {
      error.value = '没有可播放的歌曲'
      return
    }
    const safeIndex = Math.min(Math.max(0, startIndex), playable.length - 1)
    clearPrefetch()
    queue.value = playable
    index.value = safeIndex
    positionMs.value = 0
    durationMs.value = playable[safeIndex]?.durationMs ?? 0
    restorePosition = 0
    updateMediaSession(playable[safeIndex] ?? null)
    persist(true)
    await loadAndPlay(safeIndex)
  }

  async function playSong(song: Song, list?: Song[]) {
    if (list && list.length) {
      const targetIndex = list.findIndex((item) => item.hash === song.hash)
      await playQueue(list, targetIndex >= 0 ? targetIndex : 0)
      return
    }
    const existing = queue.value.findIndex((item) => item.hash === song.hash)
    if (existing >= 0) {
      index.value = existing
      await loadAndPlay(existing)
      return
    }
    await playQueue([song], 0)
  }

  /** 把歌曲插到当前歌曲之后（下一首播放）；队列为空时直接播放。 */
  function playNext(song: Song): boolean {
    if (!song.hash) return false
    const currentSong = current.value
    if (!currentSong) {
      void playSong(song)
      return true
    }
    if (currentSong.hash === song.hash) return false

    const items = queue.value.filter((item) => item.hash !== song.hash)
    const currentPos = items.indexOf(currentSong)
    if (currentPos < 0) return false
    items.splice(currentPos + 1, 0, song)

    clearPrefetch()
    queue.value = items
    index.value = currentPos
    persist(true)
    schedulePrefetch()
    return true
  }

  /** 把歌曲追加到播放队列末尾；队列为空时直接播放。 */
  function enqueue(song: Song): boolean {
    if (!song.hash) return false
    if (!current.value) {
      void playSong(song)
      return true
    }
    if (queue.value.some((item) => item.hash === song.hash)) return false
    queue.value = [...queue.value, song]
    persist(true)
    schedulePrefetch()
    return true
  }

  async function toggle() {
    if (!current.value) return
    if (!hasSource.value || !audio.src) {
      await loadAndPlay(index.value, restorePosition)
      return
    }
    if (audio.paused) {
      try {
        await audio.play()
        playing.value = true
      } catch {
        error.value = '浏览器阻止了自动播放，请再次点击播放'
      }
    } else {
      audio.pause()
    }
  }

  async function next() {
    if (!queue.value.length) return
    const target =
      index.value + 1 < queue.value.length
        ? index.value + 1
        : repeat.value === 'all'
          ? 0
          : null
    if (target === null) return
    if (playPrefetched(target)) return
    await loadAndPlay(target)
  }

  async function previous() {
    if (!queue.value.length) return
    if (positionMs.value > 3000) {
      seekMs(0)
      return
    }
    if (index.value > 0) {
      await loadAndPlay(index.value - 1)
    } else if (repeat.value === 'all') {
      await loadAndPlay(queue.value.length - 1)
    }
  }

  function seekMs(ms: number) {
    if (!hasSource.value || !Number.isFinite(audio.duration)) {
      positionMs.value = Math.max(0, ms)
      restorePosition = positionMs.value
      return
    }
    audio.currentTime = Math.min(Math.max(0, ms), audio.duration * 1000) / 1000
    positionMs.value = Math.round(audio.currentTime * 1000)
  }

  function setVolume(value: number) {
    volume.value = Math.min(1, Math.max(0, value))
    audio.volume = volume.value
    persist(true)
  }

  async function setQuality(value: Quality) {
    if (value === quality.value) return
    quality.value = value
    persist(true)
    clearPrefetch()
    if (!current.value) return

    const resume = positionMs.value
    const shouldPlay = !audio.paused || loading.value
    audio.pause()
    hasSource.value = false
    audio.removeAttribute('src')
    audio.load()

    if (shouldPlay) {
      await loadAndPlay(index.value, resume)
    } else {
      positionMs.value = resume
      restorePosition = resume
    }
  }

  function cycleRepeat() {
    repeat.value = repeat.value === 'all' ? 'one' : repeat.value === 'one' ? 'off' : 'all'
    persist(true)
    schedulePrefetch()
  }

  function setRepeat(mode: RepeatMode) {
    repeat.value = mode
    persist(true)
    schedulePrefetch()
  }

  function clearQueue() {
    requestSerial++
    clearPrefetch()
    endedHandled = false
    window.clearTimeout(endedResetTimer)
    audio.pause()
    hasSource.value = false
    audio.removeAttribute('src')
    audio.load()
    queue.value = []
    index.value = -1
    positionMs.value = 0
    durationMs.value = 0
    restorePosition = 0
    playing.value = false
    loading.value = false
    error.value = ''
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null
    persist(true)
  }

  function clearError() {
    error.value = ''
  }

  if (current.value) {
    updateMediaSession(current.value)
    durationMs.value = current.value.durationMs ?? durationMs.value
  }

  return {
    queue,
    index,
    current,
    playing,
    loading,
    positionMs,
    durationMs,
    volume,
    quality,
    repeat,
    error,
    hasSource,
    playQueue,
    playSong,
    playNext,
    enqueue,
    toggle,
    next,
    previous,
    seekMs,
    setVolume,
    setQuality,
    setRepeat,
    cycleRepeat,
    clearQueue,
    clearError,
  }
})
