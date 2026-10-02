<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { overview, region, stale, requestError, percent, time, networkName } from '../api'
import type { NetworkEvent } from '../types'
import Icon from './Icon.vue'
const expanded = ref(false)
const data = computed(() => overview.value?.events)
const unavailable = computed(() => stale.value || Boolean(requestError.value) || !['ready', 'partial'].includes(data.value?.state || ''))
const events = computed(() => unavailable.value ? [] : (data.value?.items || []).filter(e => {
  const campus = overview.value?.campuses.find(c => c.id === e.campus)
  return region.value === 'all' || region.value === e.campus || region.value === campus?.region
}))
const visible = computed(() => expanded.value ? events.value : events.value.slice(0, 3))
const toasts = ref<{ key: number; event: NetworkEvent; recovered?: boolean }[]>([])
let sequence = 0
let previous = new Map<string, NetworkEvent>()
const notified = new Map<string, string>()
const timers = new Set<ReturnType<typeof setTimeout>>()
function dismiss(key: number) { toasts.value = toasts.value.filter(t => t.key !== key) }
function notify(event: NetworkEvent, recovered = false) {
  const key = ++sequence
  toasts.value = [...toasts.value, { key, event, recovered }].slice(-2)
  const timer = setTimeout(() => { dismiss(key); timers.delete(timer) }, 12000)
  timers.add(timer)
}
watch(data, value => {
  if (!value || !['ready', 'partial'].includes(value.state) || stale.value || requestError.value) return
  const current = new Map(value.items.map(e => [e.id, e]))
  let added = 0
  for (const event of value.items) {
    if (!notified.has(event.id) || notified.get(event.id) === 'warning' && event.severity === 'critical') {
      if (added++ < 2) notify(event)
    }
    notified.set(event.id, event.severity)
  }
  const resolved = new Set(value.resolvedIds || [])
  for (const [id, event] of previous) {
    const probes = overview.value?.buildings.find(b => b.id === event.buildingId)?.probes || []
    const affected = (event.affectedProbes || []).map(p => probes.find(n => n.id === p.id && n.network === p.network))
    // Retirement ends an observation episode, but does not prove recovery.
    const retired = affected.length > 0 && affected.some(p => p?.reportState === 'retired') && affected.every(p => p?.reportState === 'retired' || p?.reportState === 'online')
    if (!current.has(id) && retired && value.state === 'ready') { previous.delete(id); notified.delete(id); continue }
    const recovered = event.scope === 'building' ? resolved.has(id) && affected.every(p => p?.reportState === 'online' && (event.kind !== 'loss' || p.lossMax === 0)) : event.buildingIds?.every(b => resolved.has(`loss:${b}`) && resolved.has(`offline:${b}`))
    if (!current.has(id) && recovered && value.state === 'ready') {
      if (added++ < 2) notify(event, true)
      notified.delete(id)
      previous.delete(id)
    }
  }
  for (const [id, event] of current) previous.set(id, event)
}, { immediate: true })
onUnmounted(() => { for (const timer of timers) clearTimeout(timer) })
function campusName(id: string) { return overview.value?.campuses.find(c => c.id === id)?.name || id }
function openCampus(event: NetworkEvent) { region.value = event.campus }
</script>
<template>
  <section v-if="data && data.state !== 'disabled' && data.state !== 'unconfigured'" class="event-panel" :class="{ incident: events.length }" aria-labelledby="event-title">
    <div class="event-heading"><div><Icon :name="events.length ? 'info' : 'clock'" :size="22" /><h2 id="event-title">状态公告</h2><span v-if="events.length" class="event-count">{{ events.length }} 项进行中</span></div><span class="event-baseline">丢包即告警 · 30 分钟断网 · 24 小时节点下线</span></div>
    <p v-if="unavailable" class="event-empty">{{ stale || requestError ? '事件数据暂不可用，等待最新观测。' : '正在读取探针上报和丢包观测。' }}</p>
    <template v-else>
      <p v-if="data.state === 'partial'" class="event-caveat">部分事件查询失败，校区事件暂无法判定；缺少观测不代表故障恢复。</p>
      <div v-for="event in visible" :key="event.id" class="event-card" :class="event.severity">
        <span class="event-severity">{{ event.severity === 'critical' ? '严重' : '注意' }}</span>
        <div class="event-body"><h3>{{ event.title }}</h3><p>{{ event.message }}</p><div class="event-evidence"><span v-if="event.kind === 'loss' && event.scope === 'building'">最高 {{ percent(event.value) }} <span class="event-divider">/</span> 严重阈值 {{ percent(event.criticalThreshold) }}<template v-if="event.baselineAvailable"> <span class="event-divider">·</span> P99 {{ percent(event.p99) }}</template><template v-else> · 历史基线不足，严重阈值暂用 5%</template></span><span v-else-if="event.scope === 'campus'">覆盖 {{ event.affectedBuildings }} / {{ event.monitoredBuildings }} 栋近期有监控楼栋</span></div><div v-if="event.affectedProbes?.length" class="event-probes"><span v-for="probe in event.affectedProbes" :key="probe.id + probe.network">{{ probe.id }} · {{ networkName(probe.network) }}<template v-if="event.kind === 'offline'"> · 上次上报 {{ time(probe.lastSeen) }}</template><template v-else> · {{ percent(probe.value) }}<template v-if="probe.targets?.length"> · {{ probe.targets.map(t => t.target).join('、') }}</template></template></span></div></div>
        <RouterLink v-if="event.buildingId" :to="`/buildings/${event.buildingId}`" class="event-link">查看楼栋 <Icon name="arrow" :size="16" /></RouterLink><RouterLink v-else to="/" class="event-link" @click="openCampus(event)">查看校区 <Icon name="arrow" :size="16" /></RouterLink>
      </div>
      <p v-if="!events.length" class="event-empty">当前范围内未发现符合事件规则的异常。</p>
      <div class="event-footer"><span>P99 参考基线：{{ data.baselineBuildings }} / {{ data.monitoredBuildings }} 栋 · 排除最近 15 分钟 · 超过 24 小时的节点退出故障统计</span><button v-if="events.length > 3" class="text-button" @click="expanded = !expanded">{{ expanded ? '收起事件' : `查看全部 ${events.length} 项` }}</button></div>
    </template>
  </section>
  <Teleport to="body"><div class="event-toasts" aria-live="polite" aria-atomic="false"><article v-for="toast in toasts" :key="toast.key" class="event-toast" :class="toast.recovered ? 'recovered' : toast.event.severity"><Icon name="info" :size="22" /><div><strong>{{ toast.recovered ? `${toast.event.buildingName || campusName(toast.event.campus)}异常已缓解` : toast.event.title }}</strong><p>{{ toast.recovered ? '最新有效观测已满足恢复条件。' : '最新观测触发告警，查看顶部状态公告了解详情。' }}</p><RouterLink v-if="toast.event.buildingId" :to="`/buildings/${toast.event.buildingId}`" class="text-button" @click="dismiss(toast.key)">查看详情</RouterLink><RouterLink v-else to="/" class="text-button" @click="openCampus(toast.event); dismiss(toast.key)">查看校区</RouterLink></div><button class="toast-close" @click="dismiss(toast.key)" aria-label="关闭事件通知">×</button></article></div></Teleport>
</template>
