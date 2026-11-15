<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Compass, Search, User } from 'lucide-vue-next'

const route = useRoute()
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <RouterLink
      to="/"
      class="bottom-nav-item"
      :class="{ active: route.name === 'home' }"
    >
      <Compass :size="21" />
      <span>发现</span>
    </RouterLink>
    <RouterLink
      to="/search"
      class="bottom-nav-item"
      :class="{ active: route.name === 'search' }"
    >
      <Search :size="21" />
      <span>搜索</span>
    </RouterLink>
    <RouterLink
      to="/library"
      class="bottom-nav-item"
      :class="{ active: route.name === 'library' }"
    >
      <User :size="21" />
      <span>我的</span>
    </RouterLink>
  </nav>
</template>
