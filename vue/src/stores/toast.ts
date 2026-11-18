import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useToastStore = defineStore('toast', () => {
  const message = ref('')
  let timer: number | undefined

  function show(text: string, duration = 2200) {
    message.value = text
    if (timer !== undefined) window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      message.value = ''
      timer = undefined
    }, duration)
  }

  function clear() {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
    message.value = ''
  }

  return { message, show, clear }
})
