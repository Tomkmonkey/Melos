import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  claimAdVip,
  claimListenVip,
  fetchVipExpiry,
  type VipClaimState,
} from '../api/vip'

const STORAGE_KEY = 'melos.vip.daily.v1'

interface SavedVip {
  date: string
  listenClaimed: boolean
  state: VipClaimState | null
  expiry?: string
}

function shanghaiDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function readSaved(): SavedVip | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export const useVipStore = defineStore('vip', () => {
  const saved = readSaved()
  const date = ref(shanghaiDate())
  const sameDay = saved?.date === date.value
  const state = ref<VipClaimState | null>(sameDay ? (saved?.state ?? null) : null)
  const listenClaimed = ref(sameDay ? !!saved?.listenClaimed : false)
  const expiry = ref(sameDay ? (saved?.expiry ?? '') : '')
  const running = ref(false)
  const message = ref('')
  const error = ref('')
  const nextAt = ref(0)
  const now = ref(Date.now())

  let stopRequested = false
  let waitTimer: number | undefined
  let waitResolve: (() => void) | undefined

  const done = computed(() => state.value?.done ?? 0)
  const total = computed(() => state.value?.total ?? 8)
  const remain = computed(() => state.value?.remain ?? null)
  const remainVipHour = computed(() => state.value?.remainVipHour ?? 0)
  const awardVipHour = computed(() => state.value?.awardVipHour ?? 3)
  const progress = computed(() =>
    total.value > 0 ? Math.min(100, (done.value / total.value) * 100) : 0,
  )
  const remainingSeconds = computed(() =>
    nextAt.value ? Math.max(0, Math.ceil((nextAt.value - now.value) / 1000)) : 0,
  )

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          date: date.value,
          listenClaimed: listenClaimed.value,
          state: state.value,
          expiry: expiry.value,
        }),
      )
    } catch {
      /* 忽略存储异常 */
    }
  }

  function ensureToday() {
    const today = shanghaiDate()
    if (date.value === today) return
    date.value = today
    state.value = null
    listenClaimed.value = false
    expiry.value = ''
    persist()
  }

  function clearWait() {
    if (waitTimer !== undefined) {
      window.clearInterval(waitTimer)
      waitTimer = undefined
    }
    nextAt.value = 0
    const resolve = waitResolve
    waitResolve = undefined
    resolve?.()
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      waitResolve = resolve
      nextAt.value = Date.now() + ms
      now.value = Date.now()
      window.clearInterval(waitTimer)
      waitTimer = window.setInterval(() => {
        now.value = Date.now()
        if (stopRequested || now.value >= (nextAt.value || 0)) clearWait()
      }, 500)
    })
  }

  async function refreshExpiry() {
    ensureToday()
    try {
      expiry.value = (await fetchVipExpiry()) ?? ''
      persist()
    } catch {
      /* 续期信息加载失败不影响领取 */
    }
  }

  function stop() {
    if (!running.value) return
    stopRequested = true
    message.value = '已停止领取'
    clearWait()
  }

  async function start(mixsongid?: string) {
    ensureToday()
    if (running.value) return
    running.value = true
    stopRequested = false
    error.value = ''
    message.value = '正在领取今日 VIP…'

    try {
      if (!listenClaimed.value) {
        const listen = await claimListenVip(mixsongid)
        if (listen.status === 1 || listen.errorCode === 130012) {
          listenClaimed.value = true
          persist()
        } else if (listen.errorCode) {
          error.value = listen.message || '听歌奖励领取失败'
        }
      }

      let cooldownRetries = 0
      while (!stopRequested) {
        const result = await claimAdVip()
        if (result.state) {
          state.value = result.state
          persist()
        }

        if (result.errorCode === 30002) {
          if (!state.value) {
            state.value = {
              remainVipHour: 0,
              total: 8,
              done: 8,
              remain: 0,
              awardVipHour: 3,
            }
            persist()
          }
          message.value = '今天的 VIP 领取次数已用完'
          break
        }
        if (result.errorCode === 30000) {
          if (cooldownRetries >= 2) {
            error.value = '操作频繁，请稍后再试'
            break
          }
          cooldownRetries++
          message.value = '操作频繁，等待 30 秒后重试…'
          await sleep(31_000)
          continue
        }
        if (result.status !== 1) {
          error.value = result.message || 'VIP 领取失败'
          break
        }

        cooldownRetries = 0
        const current = result.state
        if (!current || current.remain <= 0) {
          message.value = '今日 VIP 已全部领取'
          break
        }
        message.value = `已领取 ${current.done}/${current.total} 次，等待下一次…`
        await sleep(31_000)
        if (stopRequested) break
        message.value = `正在领取第 ${current.done + 1} 次…`
      }

      await refreshExpiry()
      if (!stopRequested && !error.value) {
        const left = state.value?.remain
        if (left === 0) {
          message.value = '今日 VIP 已全部领取'
        } else if (left !== null && left !== undefined) {
          message.value = `已领取 ${state.value?.done}/${state.value?.total} 次，可稍后继续`
        }
      }
    } catch (err) {
      error.value = (err as Error).message || 'VIP 领取失败'
    } finally {
      running.value = false
      stopRequested = false
      clearWait()
    }
  }

  return {
    state,
    expiry,
    running,
    message,
    error,
    done,
    total,
    remain,
    remainVipHour,
    awardVipHour,
    progress,
    remainingSeconds,
    start,
    stop,
    refreshExpiry,
  }
})
