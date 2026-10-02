<script setup lang="ts">
import SelectMenu from './SelectMenu.vue'
import { computed, ref } from 'vue'
import type { Probe } from '../types'
import { percent, format, time, networkName } from '../api'
import StatusBadge from './StatusBadge.vue'
const props = defineProps<{ probes: Probe[] }>()
const network = ref('all'); const expanded = ref<string | null>(null)
const visible = computed(() => props.probes.filter(p => network.value === 'all' || p.network === network.value))
function key(p: Probe) { return p.id + ':' + p.network }
const targetRows = (p: Probe) => [...new Set(p.targets.map(s => s.target))].map(target => ({
  target, loss: p.targets.find(s => s.target === target && s.metric === 'loss')?.value,
  latency: p.targets.find(s => s.target === target && s.metric === 'latency')?.value,
  http: p.targets.find(s => s.target === target && s.metric === 'http')?.value,
  code: p.targets.find(s => s.target === target && s.metric === 'httpCode')?.value,
  duration: p.targets.find(s => s.target === target && s.metric === 'httpLatency')?.value,
}))
</script>
<template>
  <section class="panel probe-panel">
    <div class="panel-heading"><div><h2>具体探针数据</h2><p>按探针查看当前读数，展开查看各测量目标。</p></div><SelectMenu v-model="network" label="筛选探针网络类型" :options="[{ value: 'all', label: '全部网络' }, { value: 'wired', label: '有线网络' }, { value: 'wireless', label: '无线网络' }]" /></div>
    <div class="table-scroll"><table><thead><tr><th>探针</th><th>状态</th><th>丢包率</th><th>延迟</th><th>HTTP 可用性</th><th>最近上报</th><th><span class="sr-only">详情</span></th></tr></thead><tbody>
      <template v-for="p in visible" :key="key(p)"><tr><td><span class="probe-id">{{ p.id }}</span><small class="cell-sub">{{ networkName(p.network) }}</small></td><td><StatusBadge :status="p.status" :label="p.reportState === 'retired' ? '节点下线' : p.reportState === 'interrupted' ? '断网' : undefined" /></td><td>{{ percent(p.loss) }}</td><td>{{ format(p.latency, ' ms') }}</td><td>{{ percent(p.http) }}</td><td class="subtle small">{{ time(p.lastSeen) }}</td><td><button class="text-button" :disabled="!p.targets.length" @click="expanded = expanded === key(p) ? null : key(p)" :aria-expanded="expanded === key(p)">{{ expanded === key(p) ? '收起' : '目标详情' }}</button></td></tr>
        <tr v-if="expanded === key(p)" class="expanded-row"><td colspan="7"><div class="target-detail"><h3>测量目标 <span class="subtle">{{ p.id }}</span></h3><table><thead><tr><th>目标</th><th>ICMP 丢包</th><th>ICMP 延迟</th><th>HTTP 成功</th><th>HTTP 状态码</th><th>HTTP 耗时</th></tr></thead><tbody><tr v-for="target in targetRows(p)" :key="target.target"><td>{{ target.target }}</td><td>{{ percent(target.loss) }}</td><td>{{ format(target.latency, ' ms') }}</td><td>{{ target.http == null ? '—' : target.http === 1 ? '成功' : '失败' }}</td><td>{{ format(target.code, '', 0) }}</td><td>{{ format(target.duration, ' ms') }}</td></tr></tbody></table></div></td></tr>
      </template>
      <tr v-if="!visible.length"><td colspan="7" class="table-empty">暂无探针数据</td></tr>
    </tbody></table></div>
    <p class="panel-footnote">距上次上报达到 30 分钟标为断网，超过 24 小时标为节点下线并退出当前故障统计。陈旧质量读数不会计入当前平均值。</p>
  </section>
</template>
