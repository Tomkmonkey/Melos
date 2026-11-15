<script setup lang="ts">
import { ref, watch } from 'vue'
import { Music2 } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    src?: string
    alt?: string
    round?: boolean
    eager?: boolean
  }>(),
  {
    src: undefined,
    alt: '',
    round: false,
    eager: false,
  },
)

const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <div class="cover" :class="{ 'cover-round': round }">
    <img
      v-if="src && !failed"
      :src="src"
      :alt="alt"
      :loading="eager ? 'eager' : 'lazy'"
      decoding="async"
      @error="failed = true"
    />
    <div v-else class="cover-fallback">
      <Music2 :size="20" />
    </div>
  </div>
</template>
