<script setup lang="ts">
import type { Source } from '../types'
import Icon from './Icon.vue'
defineProps<{ source?: Source; error?: string; stale?: boolean }>()
</script>
<template>
  <div v-if="error || stale || source && (source.state !== 'ready' || source.demo)" class="notice" :class="{ danger: source?.state === 'error' || error }" role="status">
    <Icon name="info" :size="18" />
    <div v-if="error">{{ error }}<span v-if="stale"> 当前数据已过期，楼栋状态暂时留空。</span></div>
    <div v-else-if="stale">当前数据已过期，等待监控服务更新。</div>
    <div v-else-if="source?.demo"><strong>模拟演示 · 非真实监控数据</strong><span>此页面使用独立的模拟数据源，用于预览网络状态和历史曲线。</span></div>
    <div v-else-if="source?.state === 'unconfigured'"><strong>等待连接监控数据</strong><span>数据源尚未配置，楼栋状态暂时留空。</span></div>
    <div v-else-if="source?.state === 'error'"><strong>暂时无法读取监控数据</strong><span>数据源连接异常，请稍后刷新。楼栋下线与查询失败会分别显示。</span></div>
    <div v-else><strong>部分监控数据暂不可用</strong><span>{{ source?.errors.length }} 项查询未成功，相关状态等待确认。</span></div>
  </div>
</template>
