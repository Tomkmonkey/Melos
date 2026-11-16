import { apiGet, apiRequest } from './client'
import { parseSong } from './parse'
import type { Song } from './types'

type Any = Record<string, any>

export interface FavoritePlaylist {
  /** 收藏歌单的列表 id（「我喜欢」为 2），增删歌曲时使用。 */
  listId: string
  /** 读取歌曲列表时使用的歌单 id（通常为 collection_3_<userid>_2_0）。 */
  playlistId: string
  songCount?: number
}

export interface FavoriteEntry {
  hash: string
  /** 收藏歌单内的条目 id，取消收藏时必须使用这个值，而不是歌声本身。 */
  fileId: string
  mixSongId?: string
  song: Song
}

const LIKED_NAME = '我喜欢'
const PAGE_SIZE = 200
const MAX_PAGES = 20
const LOAD_TIMEOUT_MS = 25000
const MUTATION_TIMEOUT_MS = 15000

function isRecord(value: unknown): value is Any {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function int(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(str(value))
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 给单次请求加超时，避免上游 TLS 卡住时按钮一直转圈。 */
async function withTimeout<T>(
  task: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await task(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('请求超时，请检查网络后重试')
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** 收藏相关的上游接口偶发 TLS 中断，短暂重试后再向上抛错。 */
async function withRetry<T>(task: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (attempt + 1 < attempts) await sleep(350 * (attempt + 1))
    }
  }
  throw lastError
}

function failureMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const record = raw as Any
  for (const key of ['error_msg', 'errmsg', 'message', 'msg']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

/** 上游有时用 HTTP 200 + status=0 表示失败，这里统一转成异常。 */
function assertMutationOk(raw: unknown, fallback: string) {
  if (!raw || typeof raw !== 'object') return
  const record = raw as Any
  const data = isRecord(record.data) ? record.data : null
  const failed =
    record.success === false ||
    Number(record.status) === 0 ||
    (data ? data.success === false || Number(data.status) === 0 : false)
  if (failed) throw new Error(failureMessage(record) || failureMessage(data) || fallback)
}

/** 读取当前账号的「我喜欢」歌单信息。 */
export async function fetchFavoritePlaylist(): Promise<FavoritePlaylist | null> {
  const data = await withTimeout(
    (signal) =>
      apiGet<any>(
        '/user/playlist',
        { page: 1, pagesize: 60, _: Date.now() },
        { signal },
      ),
    LOAD_TIMEOUT_MS,
  )
  const items: unknown[] = Array.isArray(data?.info)
    ? data.info
    : Array.isArray(data)
      ? data
      : []
  const liked = items.filter(isRecord).find(
    (item) =>
      Number(item.listid ?? item.list_create_listid) === 2 ||
      Number(item.is_def ?? item.is_default) === 2 ||
      str(item.name) === LIKED_NAME,
  )
  if (!liked) return null

  const listId = str(liked.listid ?? liked.list_create_listid) ?? '2'
  const playlistId =
    str(liked.list_create_gid ?? liked.global_collection_id ?? liked.gid) ?? listId

  return {
    listId,
    playlistId,
    songCount: int(liked.count ?? liked.song_count),
  }
}

/** 分页读取「我喜欢」中的全部歌曲。 */
export async function fetchFavoriteEntries(playlistId: string): Promise<FavoriteEntry[]> {
  const entries: FavoriteEntry[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await withRetry(() =>
      withTimeout(
        (signal) =>
          apiGet<any>(
            '/playlist/track/all',
            {
              id: playlistId,
              page,
              pagesize: PAGE_SIZE,
              _: Date.now(),
            },
            { signal },
          ),
        LOAD_TIMEOUT_MS,
      ),
    )
    const songs: unknown[] = Array.isArray(data?.songs)
      ? data.songs
      : Array.isArray(data)
        ? data
        : []
    for (const raw of songs) {
      if (!isRecord(raw)) continue
      const hash = str(raw.hash ?? raw.FileHash)?.trim() ?? ''
      if (!hash) continue
      entries.push({
        hash,
        fileId: str(raw.fileid ?? raw.file_id) ?? '',
        mixSongId: str(raw.mixsongid ?? raw.MixSongID ?? raw.add_mixsongid),
        song: parseSong(raw),
      })
    }
    if (songs.length < PAGE_SIZE) break
  }
  return entries
}

/** 收藏一首歌；返回新条目的 fileid（接口未返回时为空串，稍后可由列表刷新补齐）。 */
export async function addFavorite(playlist: FavoritePlaylist, song: Song): Promise<string> {
  const result = await withTimeout(
    (signal) =>
      apiRequest<any>('/playlist/tracks/add', {
        method: 'POST',
        body: {
          listId: playlist.listId,
          songs: [
            {
              name: song.title,
              hash: song.hash,
              albumId: song.albumId ?? '',
              mixSongId: song.albumAudioId ?? song.id,
            },
          ],
        },
        signal,
      }),
    MUTATION_TIMEOUT_MS,
  )
  assertMutationOk(result.raw, '收藏失败，请稍后重试')
  const data = result.data
  if (!isRecord(data)) throw new Error('收藏失败，请稍后重试')
  const info: unknown[] = Array.isArray(data.info) ? data.info : []
  const first = info.filter(isRecord)[0]
  return str(first?.fileid ?? first?.file_id) ?? ''
}

/** 从「我喜欢」移除一条收藏；fileId 必须是歌单条目自己的 fileid。 */
export async function removeFavorite(playlist: FavoritePlaylist, fileId: string): Promise<void> {
  if (!fileId) throw new Error('缺少收藏条目编号，无法取消收藏')
  const result = await withRetry(
    () =>
      withTimeout(
        (signal) =>
          apiRequest('/playlist/tracks/del', {
            method: 'POST',
            query: {
              listid: playlist.listId,
              fileids: fileId,
              _: Date.now(),
            },
            body: {},
            signal,
          }),
        MUTATION_TIMEOUT_MS,
      ),
    3,
  )
  assertMutationOk(result.raw, '取消收藏失败，请稍后重试')
}
