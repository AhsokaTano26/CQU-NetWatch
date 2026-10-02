<script setup lang="ts">
import SelectMenu from './SelectMenu.vue'
import { ref, computed, watch, onUnmounted, defineAsyncComponent } from 'vue'
import { getJSON, networkName, time } from '../api'
import type { History, Range, Metric } from '../types'
import SourceNotice from './SourceNotice.vue'
import StatusTimeline from './StatusTimeline.vue'
import Icon from './Icon.vue'
const MetricChart = defineAsyncComponent(() => import('./MetricChart.vue'))
const props = defineProps<{ buildingId: string }>()
const range = ref<Range>('24h'); const history = ref<History | null>(null); const loading = ref(false); const error = ref('')
const probe = ref(''); const target = ref(''); const network = ref(''); let controller: AbortController | undefined; let sequence = 0
const charts: { metric: Metric; title: string; unit: string; binary?: boolean; ratio?: boolean }[] = [
  { metric: 'loss', title: '丢包率', unit: '%', ratio: true }, { metric: 'latency', title: '网络延迟', unit: 'ms' },
  { metric: 'jitter', title: '网络抖动', unit: 'ms' }, { metric: 'online', title: '探针在线状态', unit: '', binary: true },
  { metric: 'http', title: 'HTTP 可用性', unit: '%', binary: true, ratio: true }, { metric: 'httpLatency', title: 'HTTP 响应时间', unit: 'ms' },
]
const allSeries = computed(() => Object.values(history.value?.metrics || {}).flat())
const probes = computed(() => [...new Set(allSeries.value.map(s => s.probe))])
const targets = computed(() => [...new Set(allSeries.value.filter(s => (!probe.value || s.probe === probe.value) && (!network.value || s.network === network.value)).map(s => s.target).filter(Boolean))])
function filtered(metric: Metric) { return (history.value?.metrics[metric] || []).filter(s => (!probe.value || s.probe === probe.value) && (!network.value || s.network === network.value) && (!target.value || !s.target || s.target === target.value)) }
async function load(reset = false) {
  controller?.abort(); controller = new AbortController(); const current = ++sequence
  if (reset) { history.value = null; error.value = ''; probe.value = ''; target.value = ''; network.value = '' }
  loading.value = true
  try {
    const result = await getJSON<History>(`/api/buildings/${encodeURIComponent(props.buildingId)}/history?range=${range.value}`, controller.signal)
    if (current === sequence) { history.value = result; error.value = '' }
  } catch (e) { if (current === sequence && (e as Error).name !== 'AbortError') error.value = (e as Error).message }
  finally { if (current === sequence) loading.value = false }
}
watch(() => [props.buildingId, range.value], () => load(true), { immediate: true })
watch([probe, network], () => { target.value = '' })
const timer = setInterval(() => { if (!document.hidden && !loading.value) load() }, 30000)
onUnmounted(() => { sequence++; controller?.abort(); clearInterval(timer) })
</script>
<template>
  <div class="history-section">
    <div class="history-toolbar"><div><h2>历史监控</h2><span class="subtle">每 30 秒更新<span v-if="history"> · 采样间隔 {{ history.step }} 秒</span></span></div><div class="filters"><SelectMenu v-model="range" label="历史时间范围" :options="[{ value: '1h', label: '最近 1 小时' }, { value: '6h', label: '最近 6 小时' }, { value: '24h', label: '最近 24 小时' }, { value: '7d', label: '最近 7 天' }]" /><button class="icon-button" @click="load()" :disabled="loading" aria-label="刷新历史数据"><Icon name="refresh" :size="18" :class="{ spinning: loading }" /></button></div></div>
    <SourceNotice :source="history?.source" :error="error" />
    <div class="history-filters"><label>探针<SelectMenu v-model="probe" label="历史探针筛选" :options="[{ value: '', label: '全部探针' }, ...probes.map(p => ({ value: p, label: p }))]" /></label><label>网络<SelectMenu v-model="network" label="历史网络筛选" :options="[{ value: '', label: '全部网络' }, { value: 'wired', label: networkName('wired') }, { value: 'wireless', label: networkName('wireless') }]" /></label><label>测量目标<SelectMenu v-model="target" label="历史目标筛选" :options="[{ value: '', label: '全部目标' }, ...targets.map(t => ({ value: t, label: t }))]" /></label><span class="history-time subtle">{{ loading ? '正在读取历史数据…' : history ? time(history.start) + ' — ' + time(history.end) : '' }}</span></div>
    <div v-if="!history && loading" class="empty-panel"><Icon name="refresh" class="spinning" /><p>正在读取历史监控数据…</p></div>
    <template v-if="history"><StatusTimeline :history="history" :online="history.metrics.online || []" :probe-filter="probe" :network-filter="network" /><p v-if="charts.some(c => filtered(c.metric).length > 12)" class="notice">部分图表仅绘制前 12 条曲线，请选择探针或测量目标查看其他曲线；最新样本数值表保留全部序列。</p><div class="charts-grid"><MetricChart v-for="chart in charts" :key="chart.metric" :title="chart.title" :unit="chart.unit" :binary="chart.binary" :ratio="chart.ratio" :series="filtered(chart.metric)" :start="history.start" :end="history.end" :step="history.step" /></div></template>
  </div>
</template>
