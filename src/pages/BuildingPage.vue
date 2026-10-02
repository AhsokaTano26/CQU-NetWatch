<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import { buildings, overview, loading, percent, format, time } from '../api'
import Icon from '../components/Icon.vue'
import StatusBadge from '../components/StatusBadge.vue'
import ProbeTable from '../components/ProbeTable.vue'
const HistoryPanel = defineAsyncComponent(() => import('../components/HistoryPanel.vue'))
const route = useRoute(); const id = computed(() => String(route.params.id))
const building = computed(() => buildings.value.find(b => b.id === id.value))
const campus = computed(() => overview.value?.campuses.find(c => c.id === building.value?.campus))
</script>
<template>
  <RouterLink to="/" class="back-link"><Icon name="back" :size="16" />返回网络总览</RouterLink>
  <template v-if="building"><div class="page-heading detail-heading"><div><div class="detail-title"><h1>{{ building.name }}</h1><StatusBadge :status="building.status" /></div><p>{{ campus?.name }} <span class="separator">/</span> {{ overview?.groups[building.group] || building.group }}</p></div><span class="subtle small">最新样本：{{ time(building.timestamp) }}</span></div>
    <section class="current-metrics"><div class="panel"><span>当前平均丢包率</span><strong :class="{ 'warning-text': building.loss !== null && building.loss > 0 }">{{ percent(building.loss) }}</strong><small>仅统计当前在线探针</small></div><div class="panel"><span>当前平均延迟</span><strong>{{ format(building.latency) }}<em v-if="building.latency !== null">ms</em></strong><small>各 ICMP 目标平均 RTT</small></div><div class="panel"><span>在线探针</span><strong>{{ building.totalProbes ? building.onlineProbes : '—' }}<em v-if="building.totalProbes">/ {{ building.totalProbes }}</em></strong><small>当前在线 / 已观测探针</small></div><div class="panel"><span>HTTP 可用性</span><strong>{{ percent(building.http) }}</strong><small>在线探针各 HTTP 目标成功比例</small></div></section>
    <HistoryPanel :building-id="id" /><ProbeTable :probes="building.probes" />
  </template>
  <div v-else class="empty-panel"><Icon name="building" :size="32" /><h2>{{ loading ? '正在读取楼栋数据…' : '没有找到这个楼栋' }}</h2><p v-if="!loading">请从总览页面选择楼栋。</p><RouterLink to="/" class="button">返回总览</RouterLink></div>
</template>
