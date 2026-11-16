import type { ArtistRef, Playlist, RecommendedCard, Song, UserProfile } from './types'

type Any = Record<string, any>

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

function firstArrayId(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = isRecord(item)
        ? str(item.id ?? item.author_id ?? item.singer_id)
        : str(item)
      if (id) return id
    }
    return undefined
  }
  if (isRecord(value)) {
    return str(value.id ?? value.author_id ?? value.singer_id)
  }
  return str(value)
}

function secondsToMs(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(str(value))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : undefined
}

/**
 * 酷狗图片地址处理：
 * - `{size}` 替换为实际尺寸；
 * - HTTP 的酷狗/图片域名走同源代理，避免 HTTPS 页面被混合内容拦截。
 */
export function imageUrl(raw: unknown, size = 480): string | undefined {
  let url = str(raw)?.trim()
  if (!url) return undefined
  url = url.replace(/\{size\}/gi, String(size))
  if (url.startsWith('//')) url = `https:${url}`
  if (url.startsWith('http://')) {
    try {
      const host = new URL(url).hostname.toLowerCase()
      if (host.endsWith('.kugou.com') || host.endsWith('.kgimg.com')) {
        return `/api/audio-proxy?url=${encodeURIComponent(url)}`
      }
    } catch {
      /* 保留原始地址 */
    }
  }
  return url
}

function artistNames(raw: Any): string[] {
  const names: string[] = []
  const add = (value: unknown) => {
    const name = str(value)?.trim()
    if (name && !names.includes(name)) names.push(name)
  }
  for (const key of ['singers', 'Singers', 'authors', 'author', 'singerinfo']) {
    const value = raw[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) {
          add(item.name ?? item.author_name ?? item.SingerName ?? item.singername ?? item.singer_name)
        } else {
          add(item)
        }
      }
    } else if (isRecord(value)) {
      add(value.name ?? value.author_name ?? value.SingerName ?? value.singername ?? value.singer_name)
    }
  }
  // 数组里已经有完整歌手名时，SingerName 往往是把数组重新拼起来的重复文本。
  if (!names.length) {
    add(
      raw.SingerName ??
        raw.author_name ??
        raw.singername ??
        raw.singer_name ??
        raw.singerName ??
        raw.authorName,
    )
  }
  return names
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function artistRefs(raw: Any): ArtistRef[] {
  const refs: ArtistRef[] = []
  const seen = new Set<string>()
  const add = (nameValue: unknown, idValue: unknown) => {
    const name = str(nameValue)?.trim()
    if (!name) return
    const id = str(idValue)?.trim()
    const key = `${name}|${id ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    refs.push(id ? { id, name } : { name })
  }

  for (const key of ['singers', 'Singers', 'authors']) {
    const value = raw[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item)) {
          add(
            item.name ??
              item.author_name ??
              item.SingerName ??
              item.singername ??
              item.singer_name,
            item.id ?? item.author_id ?? item.singer_id,
          )
        } else {
          add(item, undefined)
        }
      }
    } else if (isRecord(value)) {
      add(
        value.name ?? value.author_name ?? value.SingerName ?? value.singername,
        value.id ?? value.author_id ?? value.singer_id,
      )
    }
  }

  if (!refs.length) {
    const ids = Array.isArray(raw.SingerId)
      ? raw.SingerId
      : Array.isArray(raw.singerids)
        ? raw.singerids
        : []
    artistNames(raw).forEach((name, index) => add(name, ids[index]))
  }
  return refs
}

function stripArtistPrefix(title: string, artist: string): string {
  if (!artist || artist === '未知艺人') return title
  const names = artist
    .split(/\s*[/、,，&]\s*/)
    .map((name) => name.trim())
    .filter(Boolean)
  const candidates = [
    escapeRegExp(artist.trim()),
    names.map(escapeRegExp).join('\\s*[/、&_,，–—-]?\\s*'),
  ].filter(Boolean)
  for (const candidate of candidates) {
    const matched = title.match(new RegExp(`^${candidate}\\s*[-–—]\\s+`, 'i'))
    if (matched && matched[0].length < title.length) {
      return title.slice(matched[0].length).trim()
    }
  }
  return title
}

/** 兼容搜索、推荐卡片、歌单、歌手与专辑三种歌曲结构。 */
export function parseSong(raw: Any): Song {
  const baseInfo = isRecord(raw.base) ? raw.base : {}
  const audioInfo = isRecord(raw.audio_info) ? raw.audio_info : {}
  const albumInfo = isRecord(raw.albuminfo)
    ? raw.albuminfo
    : isRecord(raw.album_info)
      ? raw.album_info
      : {}

  let title =
    str(raw.OriSongName) ??
    str(raw.songname) ??
    str(raw.name) ??
    str(baseInfo.audio_name) ??
    str(raw.audio_name) ??
    str(raw.FileName) ??
    '未知歌曲'
  const suffix = str(raw.Suffix)
  if (str(raw.OriSongName) && suffix) title = `${title} ${suffix}`

  let artist = artistNames(raw).join(' / ')
  if (!artist) artist = str(baseInfo.author_name) ?? ''
  if (artist) title = stripArtistPrefix(title, artist)

  if (!artist) {
    // 歌单接口的 name 常是「歌手 - 歌名」。
    const match = title.match(/^(.{1,80}?)\s*[-–—]\s*(.+)$/)
    if (match) {
      artist = match[1].trim()
      title = match[2].trim()
    }
  }
  if (!artist) artist = '未知艺人'

  const transParam = isRecord(raw.trans_param) ? raw.trans_param : {}
  const hash =
    str(raw.FileHash) ??
    str(raw.hash) ??
    str(audioInfo.hash) ??
    str(raw.hash_320) ??
    str(audioInfo.hash_320) ??
    str(raw.hash_flac) ??
    str(audioInfo.hash_flac) ??
    ''

  const albumAudioId =
    str(raw.album_audio_id) ??
    str(baseInfo.album_audio_id) ??
    str(raw.mixsongid) ??
    str(raw.MixSongID) ??
    str(raw.songid) ??
    str(raw.audio_id)

  const artistId =
    str(raw.artist_id ?? raw.artistId ?? raw.author_id ?? raw.authorId) ??
    str(raw.singerid ?? raw.singer_id) ??
    firstArrayId(raw.Singers ?? raw.singers) ??
    firstArrayId(raw.authors) ??
    firstArrayId(raw.SingerId)

  return {
    id:
      str(raw.MixSongID) ??
      str(raw.mixsongid) ??
      str(baseInfo.audio_id) ??
      str(raw.songid) ??
      str(raw.audio_id) ??
      str(raw.fileid) ??
      hash,
    title,
    artist,
    artistId,
    artists: artistRefs(raw),
    hash,
    albumId:
      str(raw.AlbumID) ??
      str(raw.album_id) ??
      str(baseInfo.album_id) ??
      str(albumInfo.album_id),
    albumAudioId,
    albumName:
      str(raw.AlbumName) ??
      str(raw.album_name) ??
      str(albumInfo.album_name),
    cover: imageUrl(
      raw.Image ??
        raw.sizable_cover ??
        raw.img ??
        raw.flexible_cover ??
        raw.cover ??
        transParam.union_cover ??
        albumInfo.sizable_cover ??
        albumInfo.cover,
    ),
    durationMs:
      secondsToMs(raw.time_length) ??
      secondsToMs(raw.Duration) ??
      int(raw.timelength) ??
      int(audioInfo.duration) ??
      int(raw.timelen) ??
      secondsToMs(raw.duration),
    source: 'kugou',
  }
}

export function parseSongList(raw: unknown): Song[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? (raw.songs ?? raw.song_list ?? raw.lists ?? [])
      : []
  if (!Array.isArray(list)) return []
  return list
    .filter(isRecord)
    .map(parseSong)
    .filter((song) => song.hash.length > 0)
}

export function parseCard(
  data: Any,
  cardId: number,
  title: string,
  fallbackDescription?: string,
): RecommendedCard {
  const songs = parseSongList(data.song_list ?? data.songs)
  return {
    cardId,
    title,
    description: str(data.rec_desc) ?? fallbackDescription,
    cover: songs[0]?.cover,
    songs,
  }
}

export function parsePlaylist(raw: Any): Playlist | null {
  const id =
    str(raw.list_create_gid) ??
    str(raw.global_collection_id) ??
    str(raw.gid) ??
    str(raw.specialid) ??
    str(raw.listid)
  if (!id) return null
  return {
    id,
    title: str(raw.name) ?? str(raw.specialname) ?? str(raw.title) ?? '未命名歌单',
    cover: imageUrl(raw.pic ?? raw.flexible_cover ?? raw.cover ?? raw.img),
    songCount: int(raw.count ?? raw.song_count),
    playCount: int(raw.play_count ?? raw.total_play_count ?? raw.heat),
    creator: str(raw.list_create_username) ?? str(raw.nickname),
    description: str(raw.intro) ?? str(raw.desc),
  }
}

export function parsePlaylists(raw: unknown): Playlist[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(isRecord)
    .map(parsePlaylist)
    .filter((playlist): playlist is Playlist => playlist !== null)
}

export function parseUserProfile(raw: Any): UserProfile {
  return {
    nickname: str(raw.nickname) ?? str(raw.k_nickname) ?? 'Melos 用户',
    avatar: imageUrl(raw.pic ?? raw.k_pic ?? raw.avatar),
    userId: str(raw.userid) ?? str(raw.user_id),
  }
}
