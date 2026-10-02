<script setup lang="ts">
import { computed } from 'vue'
import type { Series, History } from '../types'
import { timelineForProbe } from '../../shared/status.mjs'
import { statusNames, time, networkName } from '../api'
import StatusBadge from './StatusBadge.vue'
const props = defineProps<{ history: History; online: Series[]; probeFilter: string; networkFilter: string }>()
const rows = computed(() => props.online.filter(s => (!props.probeFilter || s.probe === props.probeFilter) && (!props.networkFilter || s.network === props.networkFilter)).map(s => {
  return { ...s, blocks: timelineForProbe(props.history, s) }
}))
</script>
<template>
  <section class="panel timeline-panel"><div class="panel-heading"><div><h2>状态变化</h2><p>按历史采样点展示探针状态，空白表示没有观测数据。</p></div><div class="legend"><StatusBadge status="online" /><StatusBadge status="offline" /><StatusBadge status="pending" /><StatusBadge status="unstable" /></div></div>
    <div v-if="!rows.length" class="timeline-empty">暂无状态历史</div>
    <div v-for="row in rows" :key="row.probe + row.network" class="timeline-row"><span class="timeline-name" :title="row.probe">{{ row.probe }}<small>{{ networkName(row.network) }}</small></span><div class="timeline-track"><div v-for="block in row.blocks" :key="block.start" :class="block.status" :style="{ width: `${(block.end-block.start)/history.duration*100}%` }" :title="`${statusNames[block.status]} · ${time(block.start)} 至 ${time(block.end)}`"></div></div></div>
    <div class="timeline-labels"><span>{{ time(history.start) }}</span><span>{{ time(history.end) }}</span></div>
  </section>
</template>
