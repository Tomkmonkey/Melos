<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    images: string[]
    startIndex?: number
  }>(),
  { startIndex: 0 },
)

const emit = defineEmits<{
  close: []
}>()

const index = ref(Math.min(Math.max(0, props.startIndex), Math.max(0, props.images.length - 1)))
const zoomed = ref(false)
const stage = ref<HTMLElement | null>(null)
const current = computed(() => props.images[index.value] ?? '')

let previousOverflow = ''
let touchStartX = 0

function close() {
  emit('close')
}

function prev() {
  if (props.images.length < 2) return
  index.value = (index.value - 1 + props.images.length) % props.images.length
}

function next() {
  if (props.images.length < 2) return
  index.value = (index.value + 1) % props.images.length
}

async function toggleZoom() {
  zoomed.value = !zoomed.value
  await nextTick()
  requestAnimationFrame(() => {
    const box = stage.value
    if (!box) return
    if (zoomed.value) {
      box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2
      box.scrollTop = (box.scrollHeight - box.clientHeight) / 2
    } else {
      box.scrollTo({ left: 0, top: 0 })
    }
  })
}

function onTouchStart(event: TouchEvent) {
  if (zoomed.value) return
  touchStartX = event.touches[0]?.clientX ?? 0
}

function onTouchEnd(event: TouchEvent) {
  if (zoomed.value) return
  const endX = event.changedTouches[0]?.clientX ?? touchStartX
  const dx = endX - touchStartX
  if (Math.abs(dx) < 50) return
  if (dx > 0) prev()
  else next()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
  else if (event.key === 'ArrowLeft') prev()
  else if (event.key === 'ArrowRight') next()
}

function preload(position: number) {
  const url = props.images[position]
  if (!url) return
  const image = new Image()
  image.src = url
}

watch(
  index,
  () => {
    zoomed.value = false
    const box = stage.value
    if (box) box.scrollTo({ left: 0, top: 0 })
    preload(index.value - 1)
    preload(index.value + 1)
  },
  { immediate: true },
)

onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      class="image-viewer"
      role="dialog"
      aria-modal="true"
      aria-label="图片查看器"
      @click.self="close"
    >
      <header class="image-viewer-top">
        <span class="image-viewer-count">{{ index + 1 }} / {{ images.length }}</span>
        <button class="image-viewer-icon" type="button" aria-label="关闭图片" @click="close">
          <X :size="22" />
        </button>
      </header>

      <button
        v-if="images.length > 1"
        class="image-viewer-nav prev"
        type="button"
        aria-label="上一张"
        @click.stop="prev"
      >
        <ChevronLeft :size="26" />
      </button>

      <div
        ref="stage"
        class="image-viewer-stage"
        @click.self="close"
        @touchstart.passive="onTouchStart"
        @touchend.passive="onTouchEnd"
      >
        <img
          class="image-viewer-image"
          :class="{ zoomed }"
          :src="current"
          alt=""
          @click="toggleZoom"
        />
      </div>

      <button
        v-if="images.length > 1"
        class="image-viewer-nav next"
        type="button"
        aria-label="下一张"
        @click.stop="next"
      >
        <ChevronRight :size="26" />
      </button>

      <footer class="image-viewer-bottom">
        <button class="image-viewer-tool" type="button" @click="toggleZoom">
          <ZoomOut v-if="zoomed" :size="16" />
          <ZoomIn v-else :size="16" />
          {{ zoomed ? '缩小' : '放大' }}
        </button>
        <span class="image-viewer-hint">
          {{ images.length > 1 ? '左右滑动切换 · ' : '' }}点击图片放大
        </span>
      </footer>
    </div>
  </Teleport>
</template>
