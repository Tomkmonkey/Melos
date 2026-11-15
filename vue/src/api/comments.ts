import SparkMD5 from 'spark-md5'
import { apiGet } from './client'
import { imageUrl } from './parse'
import type { Song } from './types'

export type CommentKind = 'hot' | 'latest'

export interface CommentItem {
  id: string
  content: string
  userName: string
  avatar?: string
  likedCount?: number
  replyCount?: number
  time?: string
  location?: string
  level?: string
  images: string[]
  childrenId?: string
  firstReply?: CommentItem
}

export interface CommentPage {
  items: CommentItem[]
  total: number
  page: number
}

const SIGN_KEY = 'OIlwieks28dk2k092lksi2UIkp'
const CODE = 'fc4be23b4e972707f36b8a828a93ba8a'
const MID = '16249512204336365674023395779019'

type Any = Record<string, any>

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

function listOf(value: unknown): Any[] {
  if (Array.isArray(value)) return value.filter((item): item is Any => !!item && typeof item === 'object')
  if (value && typeof value === 'object') {
    return Object.values(value).filter((item): item is Any => !!item && typeof item === 'object')
  }
  return []
}

function decodeEntities(input: string): string {
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
}

function parseImages(value: unknown): string[] {
  const parse = (raw: unknown): string[] => {
    if (Array.isArray(raw)) {
      const out: string[] = []
      for (const item of raw) {
        if (typeof item === 'string' && item) out.push(item)
        else if (item && typeof item === 'object') {
          const url = str((item as Any).url)
          if (url) out.push(url)
        }
      }
      return out
    }
    if (typeof raw === 'string' && raw.trim()) {
      const trimmed = raw.trim()
      if (trimmed.startsWith('[')) {
        try {
          return parse(JSON.parse(trimmed))
        } catch {
          return []
        }
      }
      if (trimmed.startsWith('http')) return [trimmed]
    }
    return []
  }
  return parse(value).map((url) => imageUrl(url) ?? url)
}

function levelOf(uinfo: unknown): string | undefined {
  for (const item of listOf(uinfo)) {
    const label = str(item.v)
    if (label) return label
  }
  return undefined
}

function likedCountOf(like: unknown): number | undefined {
  if (like && typeof like === 'object') {
    return int((like as Any).likenum ?? (like as Any).count ?? (like as Any).num)
  }
  return int(like)
}

function locationOf(raw: Any): string | undefined {
  const direct = str(raw.location)
  if (direct) return direct
  let ext: any = raw.extdata
  if (typeof ext === 'string' && ext.trim().startsWith('{')) {
    try {
      ext = JSON.parse(ext)
    } catch {
      ext = null
    }
  }
  if (ext && typeof ext === 'object') {
    return str((ext as Any).city)
  }
  return undefined
}

function decodeContent(raw: Any): string {
  let content = str(raw.content) ?? ''
  for (const at of listOf(raw.atlist)) {
    const id = str(at.id)
    const name = str(at.name)
    if (id && name) content = content.split(`[at=${id}]`).join(`@${name} `)
  }
  return decodeEntities(content)
}

export function parseComment(raw: Any): CommentItem {
  const replies = listOf(raw.replys)
  return {
    id: str(raw.id) ?? '',
    content: decodeContent(raw),
    userName: str(raw.user_name) ?? '匿名用户',
    avatar: imageUrl(raw.user_pic),
    likedCount: likedCountOf(raw.like),
    replyCount: int(raw.reply_num ?? raw.comments_num),
    time: str(raw.addtime),
    location: locationOf(raw),
    level: levelOf(raw.uinfo),
    images: parseImages(raw.images),
    childrenId: str(raw.special_child_id),
    firstReply: replies[0] ? parseComment(replies[0]) : undefined,
  }
}

function sign(params: string): string {
  const sorted = params.split('&').sort().join('')
  return SparkMD5.hash(`${SIGN_KEY}${sorted}${SIGN_KEY}`)
}

async function commentProxy(target: string, ua: 'web' | 'comment' = 'web'): Promise<Any> {
  return apiGet<Any>('/comment-proxy', { url: target, ua })
}

function assertOk(json: Any, fallback: string) {
  const code = int(json?.err_code)
  if (code !== undefined && code !== 0) {
    throw new Error(str(json?.msg) || str(json?.message) || `${fallback}（${code}）`)
  }
}

export async function fetchComments(
  song: Song,
  kind: CommentKind,
  page = 1,
  pageSize = 20,
): Promise<CommentPage> {
  const hash = song.hash.trim()
  if (!hash) throw new Error('缺少歌曲 hash，无法加载评论')
  const rank = kind === 'hot' ? 'topliked' : 'newest'
  const timestamp = Date.now()
  const params =
    `dfid=0&mid=${MID}&clienttime=${timestamp}&uuid=0&extdata=${hash}` +
    `&appid=1005&code=${CODE}&schash=${hash}&clientver=11409&p=${page}` +
    `&clienttoken=&pagesize=${pageSize}&ver=10&kugouid=0`
  const target =
    `http://m.comment.service.kugou.com/r/v1/rank/${rank}` +
    `?${params}&signature=${sign(params)}`
  const json = await commentProxy(target)
  assertOk(json, '获取评论失败')
  const items = listOf(json.list).map(parseComment)
  return {
    items,
    total: int(json.count) ?? items.length,
    page: int(json.current_page) ?? page,
  }
}

export async function fetchReplies(
  comment: CommentItem,
  page = 1,
  pageSize = 20,
): Promise<CommentItem[]> {
  if (!comment.id || !comment.childrenId) return []
  const target =
    'http://comment.service.kugou.com/index.php?r=commentsv2/getReplyWithLike' +
    `&code=${CODE}&p=${page}&pagesize=${pageSize}&ver=1.01&clientver=8373` +
    `&kugouid=687373022&need_show_image=1&appid=1001` +
    `&childrenid=${encodeURIComponent(comment.childrenId)}` +
    `&tid=${encodeURIComponent(comment.id)}`
  const json = await commentProxy(target, 'comment')
  assertOk(json, '获取回复失败')
  return listOf(json.list).map(parseComment)
}
