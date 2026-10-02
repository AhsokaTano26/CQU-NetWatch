<script setup lang="ts">
import { computed } from 'vue'
import { overview, counts, statuses, statusNames, visibleBuildings, loading, percent, format, statusFilter, search, region } from '../api'
import type { Building } from '../types'
import BuildingFilters from '../components/BuildingFilters.vue'
import StatusBadge from '../components/StatusBadge.vue'
import Icon from '../components/Icon.vue'
const sections = computed(() => (overview.value?.campuses || []).map(c => {
  const list = visibleBuildings.value.filter(b => b.campus === c.id)
  const groups = new Map<string, Building[]>()
  for (const b of list) { if (!groups.has(b.group)) groups.set(b.group, []); groups.get(b.group)!.push(b) }
  return { ...c, groups: [...groups].map(([id, buildings]) => ({ id, name: overview.value?.groups[id] || id, buildings })), count: list.length }
}).filter(c => c.count))
function clearFilters() { search.value = ''; statusFilter.value = 'all'; region.value = 'all' }
</script>
<template>
  <div class="page-heading"><div><h1>网络状态总览</h1><p>按校区、楼栋群查看校园网络状态，点击楼栋了解详情。</p></div><span class="subtle refresh-note"><i class="live-dot"></i>{{ overview?.refreshSeconds || 30 }} 秒自动刷新</span></div>
  <section class="summary-panel" aria-label="当前楼栋状态统计"><button v-for="s in statuses" :key="s" @click="statusFilter = statusFilter === s ? 'all' : s" :aria-pressed="statusFilter === s" :class="{ selected: statusFilter === s }"><StatusBadge :status="s" /><strong>{{ overview ? counts[s] : '—' }}</strong><span class="summary-unit">楼栋</span></button></section>
  <BuildingFilters />
  <div v-if="!overview && loading" class="empty-panel">正在读取网络状态…</div>
  <div v-else-if="!sections.length" class="empty-panel"><Icon name="search" :size="30" /><h3>没有匹配的楼栋</h3><p>试试其他名称、状态或校区。</p><button class="button" @click="clearFilters">清除筛选</button></div>
  <section v-for="campus in sections" :key="campus.id" class="campus-section" :class="{ 'shaping-dorms': campus.region === 'spb' }">
    <div class="section-heading"><h2><Icon name="building" :size="21" />{{ campus.name }}</h2><span class="subtle">{{ campus.count }} 栋</span></div>
    <div class="group-grid">
      <div v-for="group in campus.groups" :key="group.id" class="building-group"><div class="group-heading"><h3>{{ group.name }}</h3><span>{{ group.buildings.length }} 栋</span></div>
        <div class="building-grid"><RouterLink v-for="b in group.buildings" :key="b.id" :to="`/buildings/${b.id}`" class="building-tile" :class="b.status" :aria-label="`${b.name}，${statusNames[b.status]}，查看详情`"><div class="tile-title"><StatusBadge :status="b.status" dot-only /><span>{{ b.name }}</span><Icon name="arrow" :size="14" class="tile-arrow" /></div><div class="tile-quality"><span v-if="b.loss !== null">{{ percent(b.loss) }}<small>丢包</small></span><span v-else class="blank-reading">—</span><span v-if="b.status !== 'empty'" class="tile-status">{{ statusNames[b.status] }}</span></div><div v-if="b.status !== 'empty'" class="tile-meta">{{ b.onlineProbes }}/{{ b.totalProbes }} 探针在线<span v-if="b.latency !== null">{{ format(b.latency, ' ms') }}</span></div></RouterLink></div>
      </div>
    </div>
  </section>
  <details class="status-explanation"><summary><Icon name="info" :size="16" />如何理解楼栋状态？</summary><p>无监控数据或仅有超过 24 小时未上报的节点时，楼栋保持空白。探针距上次上报达到 30 分钟视为断网，超过 24 小时视为节点下线并退出当前故障统计。全部有效探针断网时楼栋显示红色；部分断网或数据不完整显示黄色。</p><p>任一探针、任一目标当前丢包率大于 0，或 5 分钟丢包窗口仍有丢包、抖动达到 {{ overview?.thresholds.jitterUnstable || 30 }} ms、10 分钟状态变化达到 {{ overview?.thresholds.flapUnstable || 3 }} 次时，楼栋显示橙色波动。丢包公告按当前最高丢包率触发，超过 max(5%, P99 + 2 个百分点) 判为严重；无有效 P99 时严重阈值暂用 5%。HTTP 可用性单独展示。</p></details>
</template>
