<script setup lang="ts">
import SelectMenu from '../components/SelectMenu.vue'
import { computed, ref, defineAsyncComponent } from 'vue'
import { visibleBuildings, overview, percent, format, time } from '../api'
import type { Building } from '../types'
import BuildingFilters from '../components/BuildingFilters.vue'
import StatusBadge from '../components/StatusBadge.vue'
import Icon from '../components/Icon.vue'
import ProbeTable from '../components/ProbeTable.vue'
const HistoryPanel = defineAsyncComponent(() => import('../components/HistoryPanel.vue'))
const onlyObserved = ref(false); const selected = ref(''); const sort = ref<'name' | 'loss' | 'latency'>('name')
const rows = computed(() => {
  const data = visibleBuildings.value.filter(b => !onlyObserved.value || b.status !== 'empty')
  if (sort.value !== 'name') { const key = sort.value; return [...data].sort((a,b) => (b[key] ?? -1) - (a[key] ?? -1)) }
  return data
})
const chosen = computed(() => visibleBuildings.value.find(b => b.id === selected.value))
function campus(b: Building) { return overview.value?.campuses.find(c => c.id === b.campus)?.name || b.campus }
</script>
<template>
  <div class="page-heading"><div><h1>详细监控</h1><p>比较各楼栋网络质量，展开趋势或进入楼栋查看完整历史。</p></div><Icon class="heading-symbol" name="chart" :size="36" /></div>
  <BuildingFilters />
  <section class="panel monitoring-table"><div class="panel-heading"><h2>楼栋监控 <span class="subtle small">{{ rows.length }} 栋</span></h2><div class="filters"><label class="checkbox"><input type="checkbox" v-model="onlyObserved" />仅显示有数据楼栋</label><SelectMenu v-model="sort" label="楼栋排序" :options="[{ value: 'name', label: '按目录顺序' }, { value: 'loss', label: '丢包率从高到低' }, { value: 'latency', label: '延迟从高到低' }]" /></div></div>
    <div class="table-scroll"><table><thead><tr><th>楼栋 / 校区</th><th>网络状态</th><th>丢包率</th><th>延迟</th><th>抖动</th><th>在线探针</th><th>HTTP 可用性</th><th>趋势</th></tr></thead><tbody><tr v-for="b in rows" :key="b.id" :class="{ 'selected-row': selected === b.id }"><td><RouterLink :to="`/buildings/${b.id}`" class="building-link">{{ b.name }}<Icon name="arrow" :size="14" /></RouterLink><small class="cell-sub">{{ campus(b) }}</small></td><td><StatusBadge :status="b.status" /></td><td :class="{ 'warning-text': b.loss !== null && b.loss > 0 }">{{ percent(b.loss) }}</td><td>{{ format(b.latency, ' ms') }}</td><td>{{ format(b.jitter, ' ms') }}</td><td>{{ b.totalProbes ? b.onlineProbes + ' / ' + b.totalProbes : '—' }}</td><td>{{ percent(b.http) }}</td><td><button class="text-button" @click="selected = selected === b.id ? '' : b.id" :aria-expanded="selected === b.id">{{ selected === b.id ? '收起' : '展开趋势' }}</button></td></tr><tr v-if="!rows.length"><td colspan="8" class="table-empty">没有匹配的楼栋</td></tr></tbody></table></div>
  </section>
  <section v-if="chosen" class="inline-history"><div class="section-heading"><h2>{{ chosen.name }} · 历史趋势</h2><RouterLink class="text-button" :to="`/buildings/${chosen.id}`">完整详情<Icon name="arrow" :size="15" /></RouterLink></div><p class="subtle small">当前样本：{{ time(chosen.timestamp) }}</p><HistoryPanel :building-id="chosen.id" /><ProbeTable :probes="chosen.probes" /></section>
</template>
