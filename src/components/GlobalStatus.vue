<script setup lang="ts">
import { computed } from 'vue'
import { overview, buildings, stale, requestError } from '../api'
import Icon from './Icon.vue'
const state = computed(() => {
  const events = overview.value?.events
  if (stale.value || requestError.value || !overview.value || overview.value.source.state !== 'ready' || events?.state !== 'ready') return { status:'pending', title:'网络状态正在确认', detail:'等待完整的最新观测，未知状态不会显示为正常。' }
  if (events.items.some(e => e.scope === 'campus' && e.kind === 'offline')) return { status:'offline', title:'部分校区网络疑似中断', detail:'多个近期有监控的楼栋持续下线，详见下方事件。' }
  if (events.items.some(e => e.severity === 'critical')) return { status:'offline', title:'部分网络出现异常', detail:'已确认持续异常，正在展示受影响楼栋与监测证据。' }
  if (events.items.length || buildings.value.some(b=>b.status==='unstable')) return { status:'unstable', title:'部分楼栋网络质量波动', detail:'已监测到丢包或状态波动，可查看事件和楼栋历史曲线。' }
  if (!events.monitoredBuildings || buildings.value.some(b=>['offline','pending'].includes(b.status))) return { status:'pending', title:'部分区域状态待确认', detail:'部分楼栋暂无新鲜质量数据或有探针待确认，不能据此确认网络中断。' }
  return { status:'online', title:'已监测楼栋运行正常', detail:'当前有效观测未发现符合事件规则的异常。未部署探针的楼栋不在此结论内。' }
})
</script>
<template>
  <section class="global-status" :class="state.status" aria-label="全局网络状态"><Icon name="info" :size="28" /><div><h2>{{ state.title }}</h2><p>{{ state.detail }}</p></div><RouterLink to="/status" class="global-status-time">查看历史公告 →</RouterLink></section>
</template>
