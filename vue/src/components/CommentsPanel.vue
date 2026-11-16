<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { Heart, MessageSquare, X } from 'lucide-vue-next'
import ImageViewer from './ImageViewer.vue'
import {
  fetchComments,
  fetchReplies,
  type CommentItem,
  type CommentKind,
} from '../api/comments'
import type { Song } from '../api/types'

const props = defineProps<{
  song: Song
}>()

const emit = defineEmits<{
  close: []
}>()

const kind = ref<CommentKind>('hot')
const items = ref<CommentItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const expandedId = ref('')
const replies = ref<Record<string, CommentItem[]>>({})
const repliesLoading = ref('')
const viewerImages = ref<string[]>([])
const viewerIndex = ref(0)

async function load(reset = true) {
  if (reset) {
    page.value = 1
    items.value = []
    total.value = 0
    loading.value = true
  } else {
    loadingMore.value = true
  }
  error.value = ''
  try {
    const data = await fetchComments(props.song, kind.value, page.value, 20)
    items.value = reset ? data.items : [...items.value, ...data.items]
    total.value = data.total
  } catch (err) {
    error.value = (err as Error).message || '评论加载失败'
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  if (loading.value || loadingMore.value) return
  if (items.value.length >= total.value) return
  page.value += 1
  void load(false)
}

function switchKind(next: CommentKind) {
  if (kind.value === next) return
  kind.value = next
  expandedId.value = ''
  replies.value = {}
  void load(true)
}

async function toggleReplies(comment: CommentItem) {
  if (expandedId.value === comment.id) {
    expandedId.value = ''
    return
  }
  expandedId.value = comment.id
  if (replies.value[comment.id]) return
  repliesLoading.value = comment.id
  try {
    replies.value[comment.id] = await fetchReplies(comment)
  } catch {
    replies.value[comment.id] = []
  } finally {
    repliesLoading.value = ''
  }
}

function avatarLetter(comment: CommentItem): string {
  return (comment.userName || 'M').slice(0, 1).toUpperCase()
}

function close() {
  emit('close')
}

function openViewer(images: string[], index: number) {
  viewerImages.value = images
  viewerIndex.value = index
}

function closeViewer() {
  viewerImages.value = []
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || viewerImages.value.length) return
  close()
}

watch(
  () => props.song.hash,
  () => {
    expandedId.value = ''
    replies.value = {}
    void load(true)
  },
)

onMounted(() => {
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  void load(true)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div class="comments-overlay" @click.self="close">
      <aside class="comments-panel" role="dialog" aria-label="评论">
        <header class="comments-head">
          <div style="min-width: 0">
            <div class="eyebrow">Comments</div>
            <h2 class="comments-title">评论</h2>
            <p class="comments-song">{{ song.title }}</p>
          </div>
          <button class="icon-btn" type="button" aria-label="关闭评论" @click="close">
            <X :size="20" />
          </button>
        </header>

        <div class="comment-tabs">
          <button
            type="button"
            :class="{ active: kind === 'hot' }"
            @click="switchKind('hot')"
          >
            热门
          </button>
          <button
            type="button"
            :class="{ active: kind === 'latest' }"
            @click="switchKind('latest')"
          >
            最新
          </button>
          <span v-if="total" class="comment-total">{{ total }} 条</span>
        </div>

        <div class="comments-body">
          <div v-if="loading" class="comment-skeletons">
            <div v-for="i in 5" :key="i" class="comment-skeleton">
              <div class="skeleton" style="width: 36px; height: 36px; border-radius: 50%"></div>
              <div class="skeleton-lines" style="flex: 1">
                <div class="skeleton skeleton-line" style="width: 35%"></div>
                <div class="skeleton skeleton-line" style="width: 90%"></div>
                <div class="skeleton skeleton-line" style="width: 70%"></div>
              </div>
            </div>
          </div>

          <div v-else-if="error" class="error-box">
            {{ error }}
            <button class="btn btn-sm" style="margin-left: 10px" @click="load(true)">
              重试
            </button>
          </div>

          <div v-else-if="!items.length" class="empty-state" style="min-height: 180px">
            <MessageSquare :size="30" />
            <h3>还没有评论</h3>
            <p>来听听这首歌，或者稍后再来看看。</p>
          </div>

          <div v-else class="comment-list">
            <article v-for="comment in items" :key="comment.id" class="comment-item">
              <img
                v-if="comment.avatar"
                class="comment-avatar"
                :src="comment.avatar"
                alt=""
                loading="lazy"
              />
              <div v-else class="comment-avatar comment-avatar-fallback">
                {{ avatarLetter(comment) }}
              </div>

              <div class="comment-main">
                <div class="comment-head">
                  <span class="comment-name">{{ comment.userName }}</span>
                  <span v-if="comment.level" class="comment-level">{{ comment.level }}</span>
                  <span class="comment-time">
                    {{ comment.time }}<template v-if="comment.location"> · {{ comment.location }}</template>
                  </span>
                </div>
                <p class="comment-content">{{ comment.content }}</p>

                <div v-if="comment.images.length" class="comment-images">
                  <button
                    v-for="(image, index) in comment.images"
                    :key="index"
                    class="comment-image-button"
                    type="button"
                    :aria-label="`查看图片 ${index + 1}`"
                    @click="openViewer(comment.images, index)"
                  >
                    <img :src="image" alt="" loading="lazy" />
                  </button>
                </div>

                <div class="comment-actions">
                  <span class="comment-like">
                    <Heart :size="13" />
                    {{ comment.likedCount ?? 0 }}
                  </span>
                  <button
                    v-if="comment.replyCount"
                    class="comment-reply-toggle"
                    type="button"
                    @click="toggleReplies(comment)"
                  >
                    {{ expandedId === comment.id ? '收起回复' : `查看全部 ${comment.replyCount} 条回复` }}
                  </button>
                </div>

                <div v-if="expandedId === comment.id" class="comment-replies">
                  <div v-if="repliesLoading === comment.id" class="loading-inline">
                    <span class="spinner"></span>
                    回复加载中…
                  </div>
                  <template v-else-if="replies[comment.id]?.length">
                    <div v-for="reply in replies[comment.id]" :key="reply.id" class="comment-reply">
                      <span class="comment-name">{{ reply.userName }}</span>
                      <span class="comment-time">{{ reply.time }}</span>
                      <p class="comment-content">{{ reply.content }}</p>
                    </div>
                  </template>
                  <div v-else class="muted" style="font-size: 12px">暂无回复</div>
                </div>
              </div>
            </article>

            <button
              v-if="items.length < total"
              class="btn btn-sm"
              type="button"
              style="margin: 14px auto 0; display: flex"
              :disabled="loadingMore"
              @click="loadMore"
            >
              {{ loadingMore ? '加载中…' : '加载更多' }}
            </button>
          </div>
        </div>
      </aside>
    </div>

    <ImageViewer
      v-if="viewerImages.length"
      :images="viewerImages"
      :start-index="viewerIndex"
      @close="closeViewer"
    />
  </Teleport>
</template>
