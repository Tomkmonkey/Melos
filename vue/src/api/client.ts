import type { Session } from './types'

const SESSION_KEY = 'melos.session.v1'

function readStoredSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

let session: Session = readStoredSession()

function persist() {
  try {
    if (Object.values(session).some(Boolean)) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_KEY)
    }
  } catch {
    /* 忽略存储异常 */
  }
}

export function getSession(): Session {
  return { ...session }
}

export function setSession(next: Session | null) {
  session = next ? { ...next } : {}
  persist()
}

export function patchSession(patch: Partial<Session>) {
  session = { ...session, ...patch }
  persist()
}

export class ApiError extends Error {
  status?: number
  code?: number | string

  constructor(message: string, status?: number, code?: number | string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export interface ApiResult<T> {
  data: T
  raw: any
  sessionId?: string
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  query?: Record<string, unknown>
  body?: unknown
  /** 覆盖本次请求的会话 id（扫码登录期间使用，避免污染已登录会话）。 */
  sessionId?: string
  /** 是否把响应头里的 X-Kg-Session-Id 写回当前会话，默认 true。 */
  updateSession?: boolean
}

function unwrap(json: any): any {
  if (
    json &&
    typeof json === 'object' &&
    !Array.isArray(json) &&
    'data' in json &&
    json.data !== null &&
    json.data !== undefined
  ) {
    return json.data
  }
  return json
}

function errorMessage(raw: any, text: string): string {
  if (raw && typeof raw === 'object') {
    return (
      raw.error_msg ||
      raw.errmsg ||
      raw.message ||
      raw.msg ||
      (raw.error_code ? `请求失败（${raw.error_code}）` : '') ||
      ''
    )
  }
  return text.slice(0, 200)
}

/**
 * 统一的 API 客户端。
 *
 * - 同源 `/api` 前缀，经 Nginx 转发到会话网关；
 * - 自动携带 X-Kg-Session-Id / t1；
 * - 响应对象含 `data` 字段时自动解包。
 */
export async function apiRequest<T = any>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const url = new URL(`/api${path}`, window.location.origin)
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  const sessionId = options.sessionId ?? session.sessionId
  if (sessionId) headers['X-Kg-Session-Id'] = sessionId
  if (session.t1) headers['t1'] = session.t1

  let body: string | undefined
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? 'GET',
      headers,
      body,
    })
  } catch (error) {
    throw new ApiError(`网络请求失败：${(error as Error).message}`)
  }

  const responseSessionId = response.headers.get('x-kg-session-id') ?? undefined
  if (options.updateSession !== false && responseSessionId) {
    patchSession({ sessionId: responseSessionId })
  }

  const text = await response.text()
  let raw: any = null
  if (text.trim()) {
    try {
      raw = JSON.parse(text)
    } catch {
      raw = text
    }
  }

  if (!response.ok) {
    throw new ApiError(
      errorMessage(raw, text) || `请求失败（HTTP ${response.status}）`,
      response.status,
    )
  }

  if (raw && typeof raw === 'object' && raw.status === 0) {
    const code = raw.error_code
    // status=0 的情况交给调用方决定是否视为空结果；带错误码时直接抛出。
    if (code !== undefined && Number(code) !== 0) {
      throw new ApiError(errorMessage(raw, text) || `请求失败（${code}）`, response.status, code)
    }
  }

  return {
    data: unwrap(raw) as T,
    raw,
    sessionId: responseSessionId,
  }
}

export async function apiGet<T = any>(
  path: string,
  query?: Record<string, unknown>,
  options: Omit<RequestOptions, 'method' | 'query'> = {},
): Promise<T> {
  const result = await apiRequest<T>(path, { ...options, method: 'GET', query })
  return result.data
}

export async function apiPost<T = any>(
  path: string,
  query?: Record<string, unknown>,
  body?: unknown,
  options: Omit<RequestOptions, 'method' | 'query' | 'body'> = {},
): Promise<T> {
  const result = await apiRequest<T>(path, { ...options, method: 'POST', query, body })
  return result.data
}
