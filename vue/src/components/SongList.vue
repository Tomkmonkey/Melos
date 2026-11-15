<script setup lang="ts">
import SongRow from './SongRow.vue'
import type { Song } from '../api/types'

defineProps<{
  songs: Song[]
  activeHash?: string
}>()

defineEmits<{
  play: [index: number]
}>()
</script>

<template>
  <div class="song-list">
    <SongRow
      v-for="(song, index) in songs"
      :key="`${song.hash}-${index}`"
      :song="song"
      :index="index"
      :active="!!activeHash && song.hash === activeHash"
      @play="$emit('play', index)"
    />
  </div>
</template>
