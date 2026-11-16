export interface ArtistRef {
  id?: string
  name: string
}

export interface Song {
  id: string
  title: string
  artist: string
  artistId?: string
  artists?: ArtistRef[]
  hash: string
  albumId?: string
  albumAudioId?: string
  albumName?: string
  cover?: string
  durationMs?: number
  source?: string
}

export interface ArtistSummary {
  id: string
  name: string
  avatar?: string
  songCount?: number
  albumCount?: number
}

export interface AlbumSummary {
  id: string
  title: string
  artist: string
  artistId?: string
  cover?: string
  songCount?: number
  publishDate?: string
}

export interface ArtistDetail {
  id: string
  name: string
  avatar?: string
  intro?: string
  songCount?: number
  albumCount?: number
  fans?: number
}

export interface AlbumDetail {
  id: string
  title: string
  artist: string
  artistId?: string
  cover?: string
  intro?: string
  type?: string
  language?: string
  publishDate?: string
  songCount?: number
}

export interface Playlist {
  id: string
  title: string
  cover?: string
  songCount?: number
  playCount?: number
  creator?: string
  description?: string
}

export interface RecommendedCard {
  cardId: number
  title: string
  description?: string
  cover?: string
  songs: Song[]
}

export interface UserProfile {
  nickname: string
  avatar?: string
  userId?: string
}

export interface Session {
  token?: string
  t1?: string
  sessionId?: string
  userId?: string
}

export interface QrCode {
  key: string
  image: string
}

export interface QrStatus {
  status: number
  token?: string
  userId?: string
  nickname?: string
  avatar?: string
}
