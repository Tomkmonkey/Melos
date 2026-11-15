export interface Song {
  id: string
  title: string
  artist: string
  hash: string
  albumId?: string
  albumAudioId?: string
  albumName?: string
  cover?: string
  durationMs?: number
  source?: string
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
