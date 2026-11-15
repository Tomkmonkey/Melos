import { apiGet } from './client'
import type { Song } from './types'

export interface LyricLine {
  timeMs: number
  text: string
  translation?: string
}

function findCandidate(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCandidate(item)
      if (found) return found
    }
    return null
  }
  const record = value as Record<string, any>
  const id = record.id ?? record.lyrics_id ?? record.lyric_id ?? record.lyricid
  const accessKey = record.accesskey ?? record.access_key ?? record.accessKey
  if (id && accessKey) return record
  for (const key of ['candidates', 'candidate', 'list', 'lyrics', 'items', 'info', 'data']) {
    const found = findCandidate(record[key])
    if (found) return found
  }
  return null
}

function parseTimestamp(minutes: string, seconds: string, fraction?: string): number {
  let ms = 0
  if (fraction) {
    ms = fraction.length === 1
      ? Number(fraction) * 100
      : fraction.length === 2
        ? Number(fraction) * 10
        : Number(fraction.slice(0, 3))
  }
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + ms
}

export function parseLrc(content: string): LyricLine[] {
  if (!content.trim()) return []
  const tag = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const lines: LyricLine[] = []
  for (const raw of content.split(/\r?\n/)) {
    const times: number[] = []
    let match: RegExpExecArray | null
    tag.lastIndex = 0
    while ((match = tag.exec(raw))) {
      times.push(parseTimestamp(match[1], match[2], match[3]))
    }
    if (!times.length) continue
    const text = raw.replace(tag, '').trim()
    if (!text) continue
    for (const timeMs of times) {
      lines.push({ timeMs, text })
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs)
  return lines
}

async function fetchContent(
  candidate: Record<string, any>,
): Promise<{ content: string; translation: string }> {
  const id = candidate.id ?? candidate.lyrics_id ?? candidate.lyric_id ?? candidate.lyricid
  const accessKey =
    candidate.accesskey ?? candidate.access_key ?? candidate.accessKey
  if (!id || !accessKey) return { content: '', translation: '' }
  const data = await apiGet<any>('/lyric', {
    id,
    accesskey: accessKey,
    fmt: 'lrc',
    decode: 'true',
  })
  return {
    content: data?.decodedContent || data?.rawContent || data?.content || '',
    translation: data?.decodedTranslation || '',
  }
}

/**
 * 歌词加载：优先按 hash 精确匹配，失败后按「歌手 + 歌名」搜索。
 * 成功返回带时间戳的 LRC 行，并合并翻译。
 */
export async function fetchLyrics(song: Song): Promise<LyricLine[]> {
  let content = ''
  let translation = ''

  if (song.hash) {
    try {
      const query: Record<string, unknown> = { hash: song.hash }
      if (song.albumAudioId && /^\d+$/.test(song.albumAudioId)) {
        query.album_audio_id = song.albumAudioId
      }
      const search = await apiGet<any>('/search/lyric', query)
      const candidate = findCandidate(search)
      if (candidate) {
        const result = await fetchContent(candidate)
        content = result.content
        translation = result.translation
      }
    } catch {
      /* 继续按关键词搜索 */
    }
  }

  if (!content && song.title && song.title !== '未知歌曲') {
    try {
      const search = await apiGet<any>('/search/lyric', {
        keywords: `${song.artist} ${song.title}`.trim(),
      })
      const candidate = findCandidate(search)
      if (candidate) {
        const result = await fetchContent(candidate)
        content = result.content
        translation = result.translation
      }
    } catch {
      /* 无歌词 */
    }
  }

  if (!content) return []
  const lines = parseLrc(content)
  if (!lines.length) return []

  if (translation) {
    const translated = parseLrc(translation)
    const byTime = new Map<number, string>()
    for (const line of translated) {
      if (!byTime.has(line.timeMs)) byTime.set(line.timeMs, line.text)
    }
    for (const line of lines) {
      line.translation = byTime.get(line.timeMs)
    }
  }

  return lines
}
