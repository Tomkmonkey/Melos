import { ApiError, apiGet, apiRequest } from './client'

export interface VipClaimState {
  remainVipHour: number
  total: number
  done: number
  remain: number
  awardVipHour: number
}

export interface VipClaimResult {
  status: number
  errorCode: number
  message: string
  state?: VipClaimState
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

function num(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(str(value))
  return Number.isFinite(parsed) ? parsed : undefined
}

function parseState(value: unknown): VipClaimState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const total = num(raw.total)
  const done = num(raw.done)
  const remain = num(raw.remain)
  if (total === undefined || done === undefined || remain === undefined) return undefined
  return {
    remainVipHour: num(raw.remain_vip_hour) ?? 0,
    total,
    done,
    remain,
    awardVipHour: num(raw.award_vip_hour) ?? 3,
  }
}

function parseResult(raw: any): VipClaimResult {
  const result: VipClaimResult = {
    status: num(raw?.status) ?? 0,
    errorCode: num(raw?.error_code) ?? 0,
    message: str(raw?.error_msg) ?? str(raw?.errmsg) ?? str(raw?.msg) ?? '',
  }
  const state = parseState(raw?.data)
  if (state) result.state = state
  return result
}

function cacheBust(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`
}

function knownError(err: unknown): VipClaimResult | null {
  if (err instanceof ApiError && err.code !== undefined && err.code !== null) {
    const code = Number(err.code)
    if (Number.isFinite(code) && code !== 0) {
      return {
        status: 0,
        errorCode: code,
        message: err.message,
      }
    }
  }
  return null
}

/** 听歌奖励，每天一次；返回 130012 表示今天已经领过。 */
export async function claimListenVip(mixsongid?: string): Promise<VipClaimResult> {
  try {
    const result = await apiRequest<any>('/youth/listen/song', {
      method: 'POST',
      query: { timestrap: cacheBust() },
      body: { mixsongid: mixsongid || 666075191 },
    })
    return parseResult(result.raw)
  } catch (err) {
    const known = knownError(err)
    if (known) return known
    throw err
  }
}

/** 广告奖励，每次约 3 小时；每次请求必须带不同的时间戳绕过接口缓存。 */
export async function claimAdVip(): Promise<VipClaimResult> {
  try {
    const result = await apiRequest<any>('/youth/vip', {
      method: 'POST',
      query: { timestrap: cacheBust() },
      body: {},
    })
    return parseResult(result.raw)
  } catch (err) {
    const known = knownError(err)
    if (known) return known
    throw err
  }
}

/** 当前概念版 VIP 到期时间（可能为空或已过期）。 */
export async function fetchVipExpiry(): Promise<string | undefined> {
  const data = await apiGet<any>('/user/vip/detail', { timestrap: cacheBust() })
  const list = Array.isArray(data?.busi_vip) ? data.busi_vip : []
  const concept = list.filter((item: any) => item?.busi_type === 'concept')
  const ends = concept
    .map((item: any) => str(item?.vip_end_time))
    .filter((value: string | undefined): value is string => !!value)
  if (!ends.length) return undefined
  ends.sort()
  return ends[ends.length - 1]
}
