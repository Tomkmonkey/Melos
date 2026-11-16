import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('./views/HomeView.vue'),
      meta: { title: '发现音乐' },
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('./views/SearchView.vue'),
      meta: { title: '搜索' },
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('./views/LibraryView.vue'),
      meta: { title: '我的音乐' },
    },
    {
      path: '/playlist/:id',
      name: 'playlist',
      component: () => import('./views/PlaylistView.vue'),
      props: true,
      meta: { title: '歌单' },
    },
    {
      path: '/artist/:id',
      name: 'artist',
      component: () => import('./views/ArtistView.vue'),
      props: true,
      meta: { title: '歌手' },
    },
    {
      path: '/album/:id',
      name: 'album',
      component: () => import('./views/AlbumView.vue'),
      props: true,
      meta: { title: '专辑' },
    },
    {
      path: '/player',
      name: 'player',
      component: () => import('./views/PlayerView.vue'),
      meta: { title: '正在播放', immersive: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/LoginView.vue'),
      meta: { title: '登录', immersive: true },
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

router.afterEach((to) => {
  const title = (to.meta.title as string | undefined) ?? 'Melos'
  document.title = `${title} · Melos`
})

export default router
