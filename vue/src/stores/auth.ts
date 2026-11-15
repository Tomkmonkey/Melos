import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  ApiError,
  apiGet,
  apiPost,
  apiRequest,
  getSession,
  patchSession,
  setSession,
} from '../api/client'
import { imageUrl, parseUserProfile } from '../api/parse'
import type { Session, UserProfile } from '../api/types'

interface QrState {
  key: string
  image: string
  status: number
  message: string
}

const MIGRATION_KEY = 'melos.flutter-migrated'

function markMigrated() {
  try {
    localStorage.setItem(MIGRATION_KEY, '1')
  } catch {
    /* 忽略 */
  }
}

function alreadyMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATION_KEY) === '1'
  } catch {
    return false
  }
}

function readFlutterString(key: string): string | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const value = JSON.parse(raw)
    return typeof value === 'string' && value ? value : undefined
  } catch {
    return undefined
  }
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<Session>(getSession())
  const profile = ref<UserProfile | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const qr = ref<QrState | null>(null)
  const qrLoading = ref(false)

  let pollTimer: number | undefined
  let qrSessionId: string | undefined

  const loggedIn = computed(() => !!(session.value.token || session.value.sessionId))

  function sync() {
    session.value = getSession()
  }

  /** 从 Flutter 版遗留的 localStorage 迁移登录态，升级后无需重新扫码。 */
  function migrateFlutterSession(): boolean {
    if (loggedIn.value) return false
    if (alreadyMigrated()) return false
    const token = readFlutterString('flutter.ka_music_token')
    const t1 = readFlutterString('flutter.ka_music_t1')
    const sessionId = readFlutterString('flutter.ka_music_session_id')
    const userId = readFlutterString('flutter.ka_music_user_id')
    if (!token && !sessionId) return false
    setSession({ token, t1, sessionId, userId })
    sync()
    markMigrated()
    return true
  }

  function clearLocalSession() {
    setSession(null)
    sync()
    profile.value = null
  }

  async function refreshToken() {
    const query: Record<string, string> = {}
    if (session.value.token) query.token = session.value.token
    if (session.value.userId) query.userid = session.value.userId
    const data = await apiPost<any>('/login/token', query)
    if (!data?.token) throw new Error('刷新登录凭证失败')
    patchSession({
      token: data.token,
      t1: data.t1 || session.value.t1,
      userId: data.userid || session.value.userId,
    })
    sync()
  }

  async function refreshProfile() {
    const data = await apiGet<any>('/user/detail')
    if (!data || !data.nickname) throw new Error('登录状态已失效')
    profile.value = parseUserProfile(data)
    if (!session.value.userId && profile.value.userId) {
      patchSession({ userId: profile.value.userId })
      sync()
    }
  }

  async function init() {
    if (initialized.value) return
    loading.value = true
    try {
      migrateFlutterSession()
      if (loggedIn.value) {
        try {
          await refreshProfile()
        } catch (error) {
          try {
            await refreshToken()
            await refreshProfile()
          } catch (refreshError) {
            const apiError = refreshError as ApiError
            if (apiError instanceof ApiError && (apiError.status === 401 || apiError.status === 403)) {
              clearLocalSession()
            }
          }
          void error
        }
      }
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  function stopPolling() {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  function stopQr() {
    stopPolling()
    qr.value = null
    qrSessionId = undefined
  }

  async function startQr() {
    stopPolling()
    qrLoading.value = true
    qr.value = null
    try {
      const result = await apiRequest<any>('/login/qr/key', { updateSession: false })
      qrSessionId = result.sessionId
      const data = result.data
      qr.value = {
        key: data?.qrcode ?? '',
        image: data?.qrcode_img ?? '',
        status: 1,
        message: '请使用酷狗音乐概念版 App 扫码',
      }
      if (qr.value.key) {
        pollTimer = window.setInterval(() => {
          void checkQr()
        }, 2000)
      }
    } catch (error) {
      qr.value = {
        key: '',
        image: '',
        status: -1,
        message: (error as Error).message || '二维码获取失败',
      }
    } finally {
      qrLoading.value = false
    }
  }

  async function checkQr() {
    if (!qr.value?.key) return
    try {
      const result = await apiRequest<any>('/login/qr/check', {
        query: { key: qr.value.key },
        sessionId: qrSessionId,
        updateSession: false,
      })
      const data = result.data
      const status = Number(data?.status ?? 0)
      if (!qr.value) return
      if (status === 0) {
        stopPolling()
        qr.value = { ...qr.value, status: 0, message: '二维码已过期，请刷新' }
        return
      }
      if (status === 1) {
        qr.value = { ...qr.value, status: 1, message: '等待扫码' }
        return
      }
      if (status === 2) {
        qr.value = { ...qr.value, status: 2, message: '已扫码，请在手机上确认' }
        return
      }
      if (status === 4 && data?.token) {
        stopPolling()
        markMigrated()
        setSession({
          token: data.token,
          userId: data.userid,
          sessionId: result.sessionId ?? qrSessionId,
        })
        sync()
        if (data.nickname) {
          profile.value = { nickname: data.nickname, avatar: imageUrl(data.pic) }
        }
        try {
          const tokenData = await apiPost<any>('/login/token', {
            token: data.token,
            userid: data.userid,
          })
          if (tokenData?.t1) {
            patchSession({
              token: tokenData.token || data.token,
              t1: tokenData.t1,
              userId: tokenData.userid || data.userid,
            })
            sync()
          }
        } catch {
          /* token 刷新失败时仍保留扫码返回的 token */
        }
        try {
          await refreshProfile()
        } catch {
          /* 用扫码返回的昵称兜底 */
        }
        qr.value = { ...qr.value, status: 4, message: '登录成功' }
      }
    } catch (error) {
      if (qr.value && qr.value.status !== 4) {
        qr.value = { ...qr.value, message: (error as Error).message || '检查扫码状态失败' }
      }
    }
  }

  async function logout() {
    try {
      await apiPost('/login/logout')
    } catch {
      /* 即使服务端失败也清理本地状态 */
    }
    // 标记已迁移，避免下次启动又从 Flutter 版 localStorage 恢复旧登录态。
    markMigrated()
    clearLocalSession()
    stopQr()
  }

  return {
    session,
    profile,
    initialized,
    loading,
    loggedIn,
    qr,
    qrLoading,
    init,
    startQr,
    checkQr,
    stopQr,
    refreshProfile,
    logout,
  }
})
