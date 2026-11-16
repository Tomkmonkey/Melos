<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  ExternalLink,
  Gift,
  LogIn,
  LogOut,
  RotateCcw,
  Trash2,
  Volume2,
} from 'lucide-vue-next'
import ToggleSwitch from '../components/ToggleSwitch.vue'
import { useAuthStore } from '../stores/auth'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore, type LyricFontSize } from '../stores/settings'
import { useVipStore } from '../stores/vip'

defineOptions({ name: 'SettingsView' })

const auth = useAuthStore()
const player = usePlayerStore()
const settings = useSettingsStore()
const vip = useVipStore()
const router = useRouter()

const qualityOptions = [
  { value: '128' as const, label: '128K' },
  { value: '320' as const, label: '320K' },
  { value: 'flac' as const, label: 'FLAC' },
]
const repeatOptions = [
  { value: 'off' as const, label: '关闭' },
  { value: 'all' as const, label: '列表循环' },
  { value: 'one' as const, label: '单曲循环' },
]
const fontSizeOptions: Array<{ value: LyricFontSize; label: string }> = [
  { value: 'small', label: '小' },
  { value: 'normal', label: '标准' },
  { value: 'large', label: '大' },
]

const volume = computed(() => Math.round(player.volume * 100))
const appVersion = __APP_VERSION__
const avatarInitial = computed(() =>
  (auth.profile?.nickname ?? 'M').trim().slice(0, 1).toUpperCase(),
)

// 酷狗会员接口返回的是北京时间（无时区后缀），按 UTC+8 解析后再转本地时间。
function parseBeijingTime(value?: string): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim())
  if (!match) return null
  return new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]) - 8,
      Number(match[5]),
      Number(match[6] ?? 0),
    ),
  )
}

const vipExpiryText = computed(() => {
  const date = parseBeijingTime(vip.expiry)
  if (!date) return '每日听歌与广告奖励'
  const active = date.getTime() > Date.now()
  const beijing = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const prefix = active ? 'VIP 有效期至' : '概念 VIP 已于'
  const suffix = active ? '' : ' 到期'
  if (localZone === 'Asia/Shanghai') return `${prefix} ${beijing}${suffix}`
  const local = new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(date)
  return `${prefix} ${local}${suffix}（北京时间 ${beijing}）`
})

const vipStatusText = computed(() => {
  if (vip.remain === 0) return '今日已领完'
  if (vip.remain !== null) return `今日还可领取约 ${vip.remainVipHour} 小时`
  return `每天最多 ${vip.total} 次 · 每次约 ${vip.awardVipHour} 小时`
})

const vipButtonLabel = computed(() => {
  if (vip.running) return '领取中…'
  if (vip.remain === 0) return '今日已领完'
  return vip.state ? '继续领取' : '领取今日 VIP'
})

function startVipClaim() {
  if (!auth.loggedIn || vip.running) return
  const candidate = player.current?.albumAudioId
  const mixsongid = candidate && /^\d+$/.test(candidate) ? candidate : undefined
  void vip.start(mixsongid)
}

onMounted(() => {
  if (auth.loggedIn) void vip.refreshExpiry()
})

const historyCleared = ref(false)
const queueConfirm = ref(false)
const queueCleared = ref(false)
const settingsReset = ref(false)

let historyTimer: number | undefined
let queueTimer: number | undefined
let resetTimer: number | undefined

function onVolume(event: Event) {
  player.setVolume(Number((event.target as HTMLInputElement).value) / 100)
}

function clearSearchHistory() {
  try {
    localStorage.removeItem('melos.search.recent')
  } catch {
    /* 忽略存储异常 */
  }
  window.dispatchEvent(new Event('melos:search-history-cleared'))
  historyCleared.value = true
  window.clearTimeout(historyTimer)
  historyTimer = window.setTimeout(() => {
    historyCleared.value = false
  }, 1800)
}

function clearQueue() {
  if (!queueConfirm.value) {
    queueConfirm.value = true
    window.clearTimeout(queueTimer)
    queueTimer = window.setTimeout(() => {
      queueConfirm.value = false
    }, 3000)
    return
  }
  window.clearTimeout(queueTimer)
  queueConfirm.value = false
  player.clearQueue()
  queueCleared.value = true
  window.setTimeout(() => {
    queueCleared.value = false
  }, 1800)
}

function resetSettings() {
  settings.reset()
  settingsReset.value = true
  window.clearTimeout(resetTimer)
  resetTimer = window.setTimeout(() => {
    settingsReset.value = false
  }, 1800)
}

async function logout() {
  await auth.logout()
  await router.push('/')
}

onBeforeUnmount(() => {
  window.clearTimeout(historyTimer)
  window.clearTimeout(queueTimer)
  window.clearTimeout(resetTimer)
})
</script>

<template>
  <div class="page settings-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Settings</div>
        <h1 class="page-title">设置</h1>
        <p class="page-subtitle">账号、播放、歌词与搜索相关的常用选项</p>
      </div>
    </header>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">账号</h2>
      </div>
      <div class="settings-card">
        <div v-if="auth.loggedIn" class="setting-row">
          <div class="settings-account">
            <img
              v-if="auth.profile?.avatar"
              class="avatar"
              :src="auth.profile.avatar"
              alt=""
              referrerpolicy="no-referrer"
            />
            <div v-else class="avatar-fallback">{{ avatarInitial }}</div>
            <div>
              <div class="setting-label">{{ auth.profile?.nickname ?? '已登录' }}</div>
              <p class="setting-desc">酷狗概念版账号</p>
            </div>
          </div>
          <button class="btn btn-sm btn-danger" type="button" @click="logout">
            <LogOut :size="14" />
            退出登录
          </button>
        </div>
        <div v-else class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">尚未登录</div>
            <p class="setting-desc">扫码登录后可同步歌单与收藏。</p>
          </div>
          <RouterLink class="btn btn-primary btn-sm" to="/login">
            <LogIn :size="14" />
            扫码登录
          </RouterLink>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">每日 VIP</h2>
        <p class="settings-section-desc">领取酷狗概念版当天的听歌与广告 VIP 奖励。</p>
      </div>
      <div class="settings-card vip-card">
        <div class="vip-head">
          <span class="vip-badge">VIP</span>
          <div class="vip-copy">
            <div class="setting-label">每日领取</div>
            <p class="setting-desc">{{ vipExpiryText }}</p>
          </div>
          <span class="vip-status">{{ vipStatusText }}</span>
        </div>

        <div v-if="vip.state" class="vip-progress">
          <div class="vip-progress-track">
            <span :style="{ width: `${vip.progress}%` }"></span>
          </div>
          <div class="vip-progress-meta">
            <span>今日已领 {{ vip.done }} / {{ vip.total }} 次</span>
            <span>每次约 {{ vip.awardVipHour }} 小时</span>
          </div>
        </div>

        <div class="vip-actions">
          <RouterLink
            v-if="!auth.loggedIn"
            class="btn btn-primary btn-sm"
            to="/login"
          >
            <LogIn :size="14" />
            登录后领取
          </RouterLink>
          <button
            v-else
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="vip.running || vip.remain === 0"
            @click="startVipClaim"
          >
            <Gift :size="14" />
            {{ vipButtonLabel }}
          </button>
          <button
            v-if="vip.running"
            class="btn btn-sm"
            type="button"
            @click="vip.stop()"
          >
            停止
          </button>
          <span v-if="vip.running && vip.remainingSeconds > 0" class="vip-countdown">
            下次领取还有 {{ vip.remainingSeconds }} 秒
          </span>
        </div>

        <p v-if="vip.message" class="vip-message">{{ vip.message }}</p>
        <p v-if="vip.error" class="vip-error">{{ vip.error }}</p>
        <p class="vip-note">
          先领取听歌奖励，再每隔约 30 秒领取一次广告奖励；领取期间请保持页面打开。
        </p>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">播放</h2>
        <p class="settings-section-desc">音质与播放状态会自动保存。</p>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">默认音质</div>
            <p class="setting-desc">优先使用所选音质，不可用时自动降级。</p>
          </div>
          <div class="segmented" role="group" aria-label="默认音质">
            <button
              v-for="option in qualityOptions"
              :key="option.value"
              type="button"
              :class="{ active: player.quality === option.value }"
              @click="player.setQuality(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">音量</div>
            <p class="setting-desc">与播放页音量保持同步。</p>
          </div>
          <div class="setting-volume">
            <Volume2 :size="16" />
            <input
              type="range"
              min="0"
              max="100"
              :value="volume"
              aria-label="音量"
              @input="onVolume"
            />
            <span>{{ volume }}%</span>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">循环模式</div>
            <p class="setting-desc">队列播放结束后的行为。</p>
          </div>
          <div class="segmented" role="group" aria-label="循环模式">
            <button
              v-for="option in repeatOptions"
              :key="option.value"
              type="button"
              :class="{ active: player.repeat === option.value }"
              @click="player.setRepeat(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">歌词</h2>
        <p class="settings-section-desc">只影响播放页歌词的显示方式。</p>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">显示翻译</div>
            <p class="setting-desc">歌词源提供翻译时显示在原文下方。</p>
          </div>
          <ToggleSwitch v-model="settings.lyricsTranslation" label="显示翻译" />
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">显示音译</div>
            <p class="setting-desc">没有翻译时显示罗马音或音译。</p>
          </div>
          <ToggleSwitch v-model="settings.lyricsRomanization" label="显示音译" />
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">自动滚动</div>
            <p class="setting-desc">跟随播放进度滚动到当前歌词。</p>
          </div>
          <ToggleSwitch v-model="settings.lyricsAutoScroll" label="歌词自动滚动" />
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">歌词字号</div>
          </div>
          <div class="segmented" role="group" aria-label="歌词字号">
            <button
              v-for="option in fontSizeOptions"
              :key="option.value"
              type="button"
              :class="{ active: settings.lyricFontSize === option.value }"
              @click="settings.lyricFontSize = option.value"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">搜索</h2>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">搜索建议</div>
            <p class="setting-desc">输入关键词时显示实时建议。</p>
          </div>
          <ToggleSwitch v-model="settings.searchSuggest" label="搜索建议" />
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">最近搜索</div>
            <p class="setting-desc">清除保存在本机的搜索历史。</p>
          </div>
          <button class="btn btn-sm" type="button" @click="clearSearchHistory">
            {{ historyCleared ? '已清除' : '清除历史' }}
          </button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">外观与性能</h2>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">减少动画</div>
            <p class="setting-desc">关闭过渡与动画，适合低性能设备。</p>
          </div>
          <ToggleSwitch v-model="settings.reduceMotion" label="减少动画" />
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">数据</h2>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">播放队列</div>
            <p class="setting-desc">
              {{ queueCleared ? '播放队列已清空。' : '清空当前队列并停止播放。' }}
            </p>
          </div>
          <button class="btn btn-sm btn-danger" type="button" @click="clearQueue">
            <Trash2 :size="14" />
            {{ queueConfirm ? '再次点击确认' : '清空队列' }}
          </button>
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">恢复默认设置</div>
            <p class="setting-desc">
              {{ settingsReset ? '已恢复默认设置。' : '重置歌词、搜索与动画偏好。' }}
            </p>
          </div>
          <button class="btn btn-sm" type="button" @click="resetSettings">
            <RotateCcw :size="14" />
            恢复默认
          </button>
        </div>
      </div>
    </section>

    <section class="settings-section">
      <div class="settings-section-head">
        <h2 class="settings-section-title">关于</h2>
      </div>
      <div class="settings-card">
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">Melos</div>
            <p class="setting-desc">自托管音乐 Web PWA</p>
          </div>
          <span class="muted" style="font-size: 12px">版本 {{ appVersion }}</span>
        </div>
        <div class="setting-row">
          <div class="setting-copy">
            <div class="setting-label">项目主页</div>
            <p class="setting-desc">github.com/Tomkmonkey/Melos</p>
          </div>
          <a
            class="btn btn-sm"
            href="https://github.com/Tomkmonkey/Melos"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink :size="14" />
            打开
          </a>
        </div>
      </div>
    </section>
  </div>
</template>
