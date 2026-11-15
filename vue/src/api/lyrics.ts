import { apiGet } from './client'
import type { Song } from './types'

export interface LyricWord {
  text: string
  timeMs: number
  durationMs: number
}

export interface LyricLine {
  timeMs: number
  durationMs: number
  text: string
  translation?: string
  romanization?: string
  words: LyricWord[]
}

interface Variants {
  translationByTime: Map<number, string>
  translationByIndex: string[]
  romanizationByTime: Map<number, string>
  romanizationByIndex: string[]
}

type Any = Record<string, any>

function findCandidate(value: unknown): Any | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCandidate(item)
      if (found) return found
    }
    return null
  }
  const record = value as Any
  const id = record.id ?? record.lyrics_id ?? record.lyric_id ?? record.lyricid
  const accessKey = record.accesskey ?? record.access_key ?? record.accessKey
  if (id && accessKey) return record
  for (const key of ['candidates', 'candidate', 'list', 'lyrics', 'items', 'info', 'data']) {
    const found = findCandidate(record[key])
    if (found) return found
  }
  return null
}

function decodeBase64Utf8(input: string): string {
  let normalized = input.replace(/-/g, '+').replace(/_/g, '/')
  while (normalized.length % 4 !== 0) normalized += '='
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

function extractOffset(content: string): number {
  const match = content.match(/^\[offset:([+-]?\d+)\]/m)
  return Number(match?.[1] ?? 0) || 0
}

function emptyVariants(): Variants {
  return {
    translationByTime: new Map(),
    translationByIndex: [],
    romanizationByTime: new Map(),
    romanizationByIndex: [],
  }
}

function collectLanguageRows(value: unknown, variants: Variants): void {
  if (Array.isArray(value)) {
    for (const item of value) collectLanguageRows(item, variants)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Any
  const rows = record.lyricContent
  if (Array.isArray(rows)) {
    const type = Number(record.type ?? 0)
    const targetByTime =
      type === 0 ? variants.romanizationByTime : variants.translationByTime
    const targetByIndex =
      type === 0 ? variants.romanizationByIndex : variants.translationByIndex
    for (const row of rows) {
      if (!Array.isArray(row)) continue
      let time: number | undefined
      let text = ''
      if (row.length === 2 && typeof row[0] === 'number') {
        time = row[0]
        text = String(row[1] ?? '')
      } else {
        const parts = row.map((item) => (item == null ? '' : String(item)))
        text = type === 0 ? parts.join('') : parts.map((p) => p.trim()).filter(Boolean).join(' ')
      }
      text = text.trim()
      if (time !== undefined) {
        targetByTime.set(time, text)
      } else {
        targetByIndex.push(text)
      }
    }
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') collectLanguageRows(child, variants)
  }
}

function parseLanguageVariants(content: string): Variants {
  const variants = emptyVariants()
  const languageLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('[language:'))
  if (!languageLine || !languageLine.endsWith(']')) return variants
  const encoded = languageLine.slice('[language:'.length, -1)
  if (!encoded) return variants
  try {
    const decoded = JSON.parse(decodeBase64Utf8(encoded))
    collectLanguageRows(decoded, variants)
  } catch {
    /* 忽略损坏的 language 标签 */
  }
  return variants
}

function compactText(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
}

function sameText(a: string, b: string): boolean {
  return compactText(a) === compactText(b)
}

function indexedVariants(lines: LyricLine[], values: string[]): Array<string | undefined> {
  if (!values.length) return []
  const leadingEmpty = values.findIndex((text) => text.trim().length > 0)
  const offset =
    leadingEmpty > 0 ? 0 : Math.max(0, lines.length - values.length)
  const result: Array<string | undefined> = []
  for (let i = 0; i < values.length; i++) {
    const lineIndex = i + offset
    if (lineIndex >= lines.length) break
    const text = values[i].trim()
    if (!text || sameText(lines[lineIndex].text, text)) continue
    result[lineIndex] = text
  }
  return result
}

function nearestVariant(map: Map<number, string>, timeMs: number): string | undefined {
  let bestDistance = Number.POSITIVE_INFINITY
  let best: string | undefined
  for (const [time, text] of map) {
    const distance = Math.abs(time - timeMs)
    if (distance < bestDistance && distance <= 250) {
      bestDistance = distance
      best = text
    }
  }
  return best
}

function mergeVariants(lines: LyricLine[], variants: Variants): void {
  const byIndexTranslation = indexedVariants(lines, variants.translationByIndex)
  const byIndexRomanization = indexedVariants(lines, variants.romanizationByIndex)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const translation =
      variants.translationByTime.get(line.timeMs) ??
      nearestVariant(variants.translationByTime, line.timeMs) ??
      byIndexTranslation[i]
    const romanization =
      variants.romanizationByTime.get(line.timeMs) ??
      nearestVariant(variants.romanizationByTime, line.timeMs) ??
      byIndexRomanization[i]
    if (translation) line.translation = translation
    if (romanization) line.romanization = romanization
  }
}

function trimWords(words: LyricWord[]): LyricWord[] {
  while (words.length && !words[0].text.trim()) words.shift()
  while (words.length && !words[words.length - 1].text.trim()) words.pop()
  if (words.length) {
    const last = words[words.length - 1]
    last.text = last.text.trimEnd()
  }
  return words
}

export function parseKrc(content: string): LyricLine[] {
  if (!content.trim()) return []
  const offset = extractOffset(content)
  const lineExpression = /^\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\](.*)$/
  const wordExpression = /<\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*>/g
  const lines: LyricLine[] = []

  for (const rawLine of content.split(/\r?\n/)) {
    const match = lineExpression.exec(rawLine.trim())
    if (!match) continue
    const start = Number(match[1])
    const duration = Number(match[2])
    const body = match[3] ?? ''
    const words: LyricWord[] = []
    const wordMatches = [...body.matchAll(wordExpression)]
    for (let i = 0; i < wordMatches.length; i++) {
      const wordMatch = wordMatches[i]
      const wordStart = Number(wordMatch[1])
      const wordDuration = Number(wordMatch[2])
      const end = i + 1 < wordMatches.length ? wordMatches[i + 1].index : body.length
      const text = body.slice((wordMatch.index ?? 0) + wordMatch[0].length, end)
      if (!text) continue
      words.push({
        text,
        timeMs: Math.max(0, start + wordStart + offset),
        durationMs: Math.max(0, wordDuration),
      })
    }

    const displayWords = trimWords(words)
    const text = displayWords.length
      ? displayWords.map((word) => word.text).join('')
      : body.replace(wordExpression, '').trim()
    if (!text.trim()) continue
    lines.push({
      timeMs: Math.max(0, start + offset),
      durationMs: Math.max(0, duration),
      text,
      words: displayWords,
    })
  }

  lines.sort((a, b) => a.timeMs - b.timeMs)
  mergeVariants(lines, parseLanguageVariants(content))
  return lines
}

export function parseLrc(content: string): LyricLine[] {
  if (!content.trim()) return []
  const offset = extractOffset(content)
  const expression = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
  const lines: LyricLine[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(expression)]
    if (!matches.length) continue
    const text = rawLine.replace(expression, '').trim()
    if (!text) continue
    for (const match of matches) {
      const minutes = Number(match[1]) || 0
      const seconds = Number(match[2]) || 0
      const fraction = match[3] ?? '0'
      const milliseconds =
        fraction.length === 3
          ? Number(fraction)
          : Number(fraction.padEnd(3, '0'))
      lines.push({
        timeMs: Math.max(
          0,
          minutes * 60_000 + seconds * 1000 + milliseconds + offset,
        ),
        durationMs: 0,
        text,
        words: [],
      })
    }
  }
  lines.sort((a, b) => a.timeMs - b.timeMs)

  // LRC 翻译常见写法是「原文 + 翻译」共用同一时间戳。
  const merged: LyricLine[] = []
  for (const line of lines) {
    const previous = merged[merged.length - 1]
    if (
      previous &&
      previous.timeMs === line.timeMs &&
      !previous.translation &&
      !sameText(previous.text, line.text)
    ) {
      previous.translation = line.text
      continue
    }
    merged.push(line)
  }
  return merged
}

function applyTimedTranslation(lines: LyricLine[], translation: string): void {
  if (!translation.trim()) return
  const translated = parseLrc(translation)
  if (!translated.length) return
  const byTime = new Map<number, string>()
  for (const line of translated) byTime.set(line.timeMs, line.text)
  for (const line of lines) {
    line.translation =
      line.translation ?? byTime.get(line.timeMs) ?? nearestVariant(byTime, line.timeMs)
  }
}

async function fetchContent(
  candidate: Any,
  format: 'krc' | 'lrc',
): Promise<{ content: string; translation: string }> {
  const id = candidate.id ?? candidate.lyrics_id ?? candidate.lyric_id ?? candidate.lyricid
  const accessKey =
    candidate.accesskey ?? candidate.access_key ?? candidate.accessKey
  if (!id || !accessKey) return { content: '', translation: '' }
  const data = await apiGet<any>('/lyric', {
    id,
    accesskey: accessKey,
    fmt: format,
    decode: 'true',
  })
  return {
    content: data?.decodedContent || data?.rawContent || data?.content || '',
    translation: data?.decodedTranslation || '',
  }
}

/**
 * 歌词加载：优先 KRC（逐字 + language 标签内的翻译/音译），
 * 再退回 LRC（支持同行翻译与 decodedTranslation）。
 */
export async function fetchLyrics(song: Song): Promise<LyricLine[]> {
  let candidate: Any | null = null

  if (song.hash) {
    try {
      const query: Record<string, unknown> = { hash: song.hash }
      if (song.albumAudioId && /^\d+$/.test(song.albumAudioId)) {
        query.album_audio_id = song.albumAudioId
      }
      candidate = findCandidate(await apiGet<any>('/search/lyric', query))
    } catch {
      /* 继续按关键词搜索 */
    }
  }

  if (!candidate && song.title && song.title !== '未知歌曲') {
    try {
      candidate = findCandidate(
        await apiGet<any>('/search/lyric', {
          keywords: `${song.artist} ${song.title}`.trim(),
        }),
      )
    } catch {
      /* 无歌词 */
    }
  }

  if (!candidate) return []

  try {
    const krc = await fetchContent(candidate, 'krc')
    const krcLines = parseKrc(krc.content)
    if (krcLines.length) {
      // 部分 KRC 的 [language] 没有翻译，但接口单独返回了 decodedTranslation。
      if (!krcLines.some((line) => line.translation)) {
        applyTimedTranslation(krcLines, krc.translation)
      }
      return krcLines
    }
  } catch {
    /* 继续尝试 LRC */
  }

  try {
    const lrc = await fetchContent(candidate, 'lrc')
    const lrcLines = parseLrc(lrc.content)
    applyTimedTranslation(lrcLines, lrc.translation)
    if (lrcLines.length) return lrcLines
  } catch {
    /* 无歌词 */
  }

  return []
}
