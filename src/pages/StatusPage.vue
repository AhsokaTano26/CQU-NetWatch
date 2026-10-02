<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { overview, getJSON, percent, time, statusNames, region } from '../api'
import type { StatusHistory, StatusSample, Status } from '../types'
import GlobalStatus from '../components/GlobalStatus.vue'
import EventPanel from '../components/EventPanel.vue'
import SourceNotice from '../components/SourceNotice.vue'
import Icon from '../components/Icon.vue'
const history = ref<StatusHistory | null>(null)
const loading = ref(false), error = ref(''), selectedDay = ref(''), selectedSample = ref('')
let controller: AbortController | undefined, timer: ReturnType<typeof setInterval> | undefined
async function load() {
  if (loading.value) return
  loading.value = true; controller = new AbortController()
  try { history.value = await getJSON<StatusHistory>('/api/status-history', controller.signal); error.value = '' }
  catch (e) { if ((e as Error).name !== 'AbortError') error.value = '历史状态暂时无法读取，请稍后重试。' }
  finally { loading.value = false }
}
onMounted(() => { load(); timer = setInterval(() => { if (!document.hidden) load() }, 60000) })
onUnmounted(() => { clearInterval(timer); controller?.abort() })

const dayKey = (timestamp: number) => new Intl.DateTimeFormat('sv-SE', { timeZone:'Asia/Shanghai' }).format(timestamp*1000)
const days = computed(() => history.value ? [...new Set(Array.from({ length: 8 }, (_, i) => dayKey(history.value!.end-i*86400)))].reverse() : [])
const campuses = computed(() => (history.value?.campuses || []).filter(c=>{
  const campus=overview.value?.campuses.find(x=>x.id===c.id)
  return region.value==='all'||region.value===c.id||region.value===campus?.region
}).map(c=>{
  const blocks: { time:number; status:Status; count:number; online:number | null }[]=[]
  const rank:Record<Status,number>={empty:0,online:1,pending:2,unstable:3,offline:4}
  for(let i=0;i<c.samples.length;i+=4){
    const list=c.samples.slice(i,i+4), observed=list.filter(s=>s.online!==null)
    const status=list.reduce((worst,s)=>rank[s.status]>rank[worst]?s.status:worst,'empty' as Status)
    blocks.push({time:list[0].time,status:observed.length<list.length && status==='online'?'pending':status,count:observed.length,online:observed.length?observed.reduce((sum,s)=>sum+s.online!,0)/observed.length:null})
  }
  return {...c,blocks}
}))
const incidents = computed(() => (history.value?.incidents || []).filter(e=>campuses.value.some(c=>c.id===e.campus)&&(!selectedDay.value || (dayKey(e.start)<=selectedDay.value && dayKey(e.end || history.value!.end)>=selectedDay.value))))
function sampleLabel(name: string, sample: Pick<StatusSample,'time'|'status'|'online'>) { return `${name} · ${time(sample.time)} · ${statusNames[sample.status]} · 在线观测率 ${percent(sample.online)}` }
</script>
<template>
  <div class="status-page-heading"><span class="status-eyebrow">CQU NETPROBE STATUS</span><h1>校园网络状态</h1><p>当前运行情况、历史可用性与近期监测事件</p></div>
  <GlobalStatus />
  <EventPanel />
  <section class="panel status-history-panel"><div class="panel-heading"><div><h2>校区历史状态</h2><p>近 7 天 · 每条色块约 1 小时 · 15 分钟采样 · 空白表示无观测</p></div><button class="button" @click="load" :disabled="loading"><Icon name="refresh" :size="16" />{{ loading ? '读取中' : '刷新历史' }}</button></div>
    <SourceNotice v-if="error || history?.source.state !== 'ready'" :source="history?.source" :error="error" />
    <p v-if="!history" class="status-history-empty">正在读取历史状态…</p>
    <div v-for="campus in campuses" :key="campus.id" class="uptime-row"><div class="uptime-heading"><h3>{{ campus.name }}</h3><span>{{ percent(campus.availability) }} <small>在线观测率</small></span></div><div class="uptime-track" :aria-label="`${campus.name}七天历史状态`"><button v-for="sample in campus.blocks" :key="sample.time" :class="sample.status" :aria-label="sampleLabel(campus.name,sample)" :title="`${sampleLabel(campus.name,sample)} · 有效采样 ${sample.count}/4`" @click="selectedSample = sampleLabel(campus.name,sample); selectedDay = dayKey(sample.time)"></button></div><div class="uptime-labels"><span>7 天前</span><span>观测覆盖率 {{ percent(campus.coverage) }}</span><span>当前</span></div></div>
    <p v-if="selectedSample" class="selected-observation" role="status">{{ selectedSample }}</p>
    <p class="status-history-footnote">在线观测率是各采样点楼栋在线比例的平均值，不代表全校园 SLA。色块取该小时最差观测状态，部分缺失显示黄色；未采样时段保持空白。</p>
  </section>
  <section class="panel incident-history"><div class="panel-heading"><div><h2>近期监测事件</h2><p>从 Prometheus 历史观测推导的异常片段，非人工事故公告</p></div><button v-if="selectedDay" class="text-button" @click="selectedDay = ''; selectedSample = ''">显示全部日期</button></div>
    <div class="event-calendar" aria-label="事件日期筛选"><button v-for="day in days" :key="day" :aria-pressed="selectedDay === day" :class="{ selected:selectedDay === day, 'has-event':history?.incidents.some(e=>dayKey(e.start)<=day&&dayKey(e.end || history!.end)>=day) }" @click="selectedDay = selectedDay === day ? '' : day"><span>{{ day.slice(5).replace('-', ' / ') }}</span><i></i></button></div>
    <SourceNotice v-if="history?.source.state === 'partial' || history?.source.state === 'error'" :source="history.source" />
    <div v-for="incident in incidents" :key="incident.id" class="historical-incident"><div class="incident-timeline-dot"></div><div><span class="incident-outcome" :class="incident.outcome">{{ incident.outcome === 'resolved' ? '观测恢复' : incident.outcome === 'unknown' ? '后续观测缺失' : '截至最后采样仍异常' }}</span><h3>{{ incident.title }}</h3><p>{{ time(incident.start) }} — {{ incident.end ? time(incident.end) : '最后有效采样' }}</p><p>起始观测涉及 {{ incident.affectedBuildings }} / {{ incident.monitoredBuildings }} 栋。{{ incident.kind === 'loss' ? '任一探针、任一目标丢包率大于 0 的楼栋范围满足校区异常条件。' : '探针未上报达到 30 分钟的楼栋范围满足校区异常条件；超过 24 小时的节点不参与。' }}</p></div></div>
    <p v-if="history && !incidents.length" class="status-history-empty">当前筛选范围没有观测到符合规则的大面积异常片段。无数据时段不能用于排除故障。</p>
    <p class="status-history-footnote">历史规则：至少 3 栋且占近期有监控楼栋的 60% 出现下线或严重丢包。15 分钟采样可能遗漏短时异常，时间边界为采样精度；当前事件使用 P95/P99 和 2 分钟持续确认。</p>
  </section>
</template>
