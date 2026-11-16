import { apiGet } from './client'
import { imageUrl, parseSongList } from './parse'
import type {
  AlbumDetail,
  AlbumSummary,
  ArtistDetail,
  ArtistSummary,
  Song,
} from './types'

type Any = Record<string, any>

function isRecord(value: unknown): value is Any {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

function int(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(str(value))
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

function firstId(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  for (const item of value) {
    const id = isRecord(item)
      ? str(item.id ?? item.author_id ?? item.singer_id)
      : str(item)
    if (id) return id
  }
  return undefined
}

export function parseArtistSummary(raw: Any): ArtistSummary | null {
  const id = str(raw.AuthorId ?? raw.author_id ?? raw.id)
  const name = str(raw.AuthorName ?? raw.author_name ?? raw.name)
  if (!id || !name) return null
  return {
    id,
    name,
    avatar: imageUrl(raw.Avatar ?? raw.sizable_avatar ?? raw.avatar),
    songCount: int(raw.AudioCount ?? raw.song_count),
    albumCount: int(raw.AlbumCount ?? raw.album_count),
  }
}

export function parseAlbumSummary(raw: Any): AlbumSummary | null {
  const id = str(raw.albumid ?? raw.album_id ?? raw.id)
  const title = str(raw.albumname ?? raw.album_name ?? raw.title)
  if (!id || !title) return null
  const artist =
    str(raw.singer ?? raw.author_name) ??
    str(Array.isArray(raw.singers) ? raw.singers[0]?.name : undefined) ??
    str(Array.isArray(raw.authors) ? raw.authors[0]?.author_name : undefined) ??
    '未知艺人'
  return {
    id,
    title,
    artist,
    artistId:
      firstId(raw.singers) ??
      firstId(raw.singerids) ??
      firstId(raw.authors) ??
      str(raw.singerid),
    cover: imageUrl(raw.img ?? raw.sizable_cover ?? raw.cover),
    songCount: int(raw.songcount ?? raw.song_count),
    publishDate: str(raw.publish_time ?? raw.publish_date),
  }
}

export async function fetchArtistDetail(id: string): Promise<ArtistDetail> {
  const data = (await apiGet<Any>('/artist/detail', { id })) ?? {}
  const introList = Array.isArray(data.long_intro) ? data.long_intro : []
  const introEntry =
    introList.find((item: Any) => isRecord(item) && item.title === '简介') ??
    introList[0]
  return {
    id: str(data.author_id) ?? id,
    name: str(data.author_name) ?? '未知歌手',
    avatar: imageUrl(data.sizable_avatar),
    intro:
      str(isRecord(introEntry) ? introEntry.content : undefined) ??
      str(data.intro),
    songCount: int(data.song_count),
    albumCount: int(data.album_count),
    fans: int(data.fansnums),
  }
}

export async function fetchArtistSongs(id: string): Promise<Song[]> {
  const data = await apiGet<Any>('/artist/audios', {
    id,
    page: 1,
    pagesize: 100,
    sort: 'hot',
  })
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return parseSongList(list).map((song) => ({
    ...song,
    artistId: song.artistId ?? id,
  }))
}

export async function fetchArtistAlbums(id: string): Promise<AlbumSummary[]> {
  const data = await apiGet<Any>('/artist/albums', {
    id,
    page: 1,
    pagesize: 60,
    sort: 'new',
  })
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
  return list
    .filter(isRecord)
    .map(parseAlbumSummary)
    .filter((album): album is AlbumSummary => album !== null)
}

export async function fetchAlbumDetail(id: string): Promise<AlbumDetail> {
  const data = (await apiGet<Any>('/album/detail', { id })) ?? {}
  return {
    id: str(data.album_id) ?? id,
    title: str(data.album_name) ?? '未知专辑',
    artist: str(data.author_name) ?? '未知艺人',
    artistId: firstId(data.authors) ?? str(data.author_id),
    cover: imageUrl(data.sizable_cover ?? data.cover),
    intro: str(data.intro),
    type: str(data.type),
    language: str(data.language),
    publishDate: str(data.publish_date),
  }
}

export async function fetchAlbumSongs(id: string): Promise<Song[]> {
  const data = await apiGet<Any>('/album/songs', {
    id,
    page: 1,
    pagesize: 100,
  })
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.songs)
      ? data.songs
      : Array.isArray(data?.data?.songs)
        ? data.data.songs
        : []
  return parseSongList(list).map((song) => ({
    ...song,
    albumId: song.albumId ?? id,
  }))
}
