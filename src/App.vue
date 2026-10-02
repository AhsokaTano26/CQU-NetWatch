<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { overview, region, loading, requestError, stale, refresh, startRefresh, stopRefresh, time } from './api'
import Icon from './components/Icon.vue'
import GlobalStatus from './components/GlobalStatus.vue'
import EventPanel from './components/EventPanel.vue'
import SourceNotice from './components/SourceNotice.vue'
import ThemePicker from './components/ThemePicker.vue'
const route = useRoute(); const router = useRouter(); const mobileOpen = ref(false)
const regions = computed(() => {
  const defaults = [{ id: 'all', name: '全部校区' }, { id: 'spb', name: '沙坪坝校区' }, { id: 'hx', name: '科学城校区' }, { id: 'lj', name: '两江校区' }]
  for (const campus of overview.value?.campuses || []) if (!defaults.some(r => r.id === campus.region)) defaults.push({ id: campus.region, name: campus.name })
  return defaults
})
function chooseRegion(id: string) { region.value = id; mobileOpen.value = false; if (route.path.startsWith('/buildings')) router.push('/') }
onMounted(startRefresh); onUnmounted(stopRefresh)
</script>
<template>
  <a class="skip-link" href="#main">跳到主要内容</a>
  <div class="app-shell">
    <button v-if="mobileOpen" class="sidebar-backdrop" @click="mobileOpen = false" aria-label="关闭导航"></button>
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <RouterLink to="/" class="brand" @click="mobileOpen = false"><img src="/favicon.svg" width="36" height="36" alt="" /><span>CQU NetProbe<small>校园网络监控</small></span></RouterLink>
      <nav aria-label="主导航" class="primary-nav">
        <RouterLink to="/" @click="mobileOpen = false" :class="{ active: route.path === '/' }"><Icon name="grid" />网络总览</RouterLink>
        <RouterLink to="/monitoring" @click="mobileOpen = false" :class="{ active: route.path === '/monitoring' || route.path.startsWith('/buildings') }"><Icon name="chart" />详细监控</RouterLink>
        <RouterLink to="/status" @click="mobileOpen = false" :class="{ active: route.path === '/status' }"><Icon name="clock" />状态公告</RouterLink>
      </nav>
      <p class="nav-label">校区</p>
      <nav aria-label="校区筛选" class="campus-nav"><button v-for="r in regions" :key="r.id" :class="{ selected: region === r.id }" :aria-pressed="region === r.id" @click="chooseRegion(r.id)"><Icon name="building" :size="19" />{{ r.name }}</button></nav>
      <div class="sidebar-footer"><Icon name="server" :size="18" /><div>Prometheus 数据源<small>只读监控 · 无需登录</small></div></div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-label"><button class="icon-button mobile-menu" @click="mobileOpen = !mobileOpen" aria-label="打开导航" :aria-expanded="mobileOpen"><Icon name="menu" /></button><span>重庆大学 <span class="separator">/</span> 网络监控</span></div>
        <div class="refresh-tools"><ThemePicker /><span class="update-time"><Icon name="clock" :size="14" /><span :title="time(overview?.generatedAt)">更新于 {{ overview ? new Date(overview.generatedAt * 1000).toLocaleTimeString('zh-CN', { hour12: false }) : '—' }}</span></span><button class="button" @click="refresh()" :disabled="loading"><Icon name="refresh" :size="16" :class="{ spinning: loading }" />{{ loading ? '更新中' : '手动刷新' }}</button></div>
      </header>
      <main id="main" tabindex="-1"><SourceNotice :source="overview?.source" :error="requestError" :stale="stale" /><GlobalStatus v-if="route.path === '/'" /><EventPanel v-if="route.path !== '/status'" /><RouterView /></main>
      <footer class="page-footer"><span>CQU NetProbe <span class="separator">·</span> 重庆大学校园网络监控</span><span>监控结果仅反映已部署探针的观测情况</span></footer>
    </div>
  </div>
</template>
