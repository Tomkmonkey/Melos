import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type LyricFontSize = 'small' | 'normal' | 'large'

interface SavedSettings {
  lyricsTranslation?: boolean
  lyricsRomanization?: boolean
  lyricsAutoScroll?: boolean
  lyricFontSize?: LyricFontSize
  searchSuggest?: boolean
  reduceMotion?: boolean
}

const STORAGE_KEY = 'melos.settings.v1'

const DEFAULTS = {
  lyricsTranslation: true,
  lyricsRomanization: true,
  lyricsAutoScroll: true,
  lyricFontSize: 'normal' as LyricFontSize,
  searchSuggest: true,
  reduceMotion: false,
}

function readSaved(): SavedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const saved = readSaved()

  const lyricsTranslation = ref(saved.lyricsTranslation ?? DEFAULTS.lyricsTranslation)
  const lyricsRomanization = ref(saved.lyricsRomanization ?? DEFAULTS.lyricsRomanization)
  const lyricsAutoScroll = ref(saved.lyricsAutoScroll ?? DEFAULTS.lyricsAutoScroll)
  const lyricFontSize = ref<LyricFontSize>(
    saved.lyricFontSize === 'small' || saved.lyricFontSize === 'large'
      ? saved.lyricFontSize
      : DEFAULTS.lyricFontSize,
  )
  const searchSuggest = ref(saved.searchSuggest ?? DEFAULTS.searchSuggest)
  const reduceMotion = ref(saved.reduceMotion ?? DEFAULTS.reduceMotion)

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          lyricsTranslation: lyricsTranslation.value,
          lyricsRomanization: lyricsRomanization.value,
          lyricsAutoScroll: lyricsAutoScroll.value,
          lyricFontSize: lyricFontSize.value,
          searchSuggest: searchSuggest.value,
          reduceMotion: reduceMotion.value,
        }),
      )
    } catch {
      /* 忽略存储异常 */
    }
  }

  function reset() {
    lyricsTranslation.value = DEFAULTS.lyricsTranslation
    lyricsRomanization.value = DEFAULTS.lyricsRomanization
    lyricsAutoScroll.value = DEFAULTS.lyricsAutoScroll
    lyricFontSize.value = DEFAULTS.lyricFontSize
    searchSuggest.value = DEFAULTS.searchSuggest
    reduceMotion.value = DEFAULTS.reduceMotion
  }

  watch(
    [lyricsTranslation, lyricsRomanization, lyricsAutoScroll, lyricFontSize, searchSuggest, reduceMotion],
    persist,
  )

  return {
    lyricsTranslation,
    lyricsRomanization,
    lyricsAutoScroll,
    lyricFontSize,
    searchSuggest,
    reduceMotion,
    reset,
  }
})
