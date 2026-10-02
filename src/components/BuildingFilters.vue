<script setup lang="ts">
import SelectMenu from './SelectMenu.vue'
import { search, statusFilter, statuses, statusNames } from '../api'
import Icon from './Icon.vue'
import StatusBadge from './StatusBadge.vue'
</script>
<template>
  <div class="filter-bar">
    <div class="filters">
      <label class="search"><Icon name="search" :size="18" /><input v-model="search" placeholder="搜索楼栋、楼栋群" aria-label="搜索楼栋" /><button v-if="search" @click="search = ''" class="clear-button" aria-label="清除搜索"><Icon name="close" :size="14" /></button></label>
      <SelectMenu v-model="statusFilter" label="筛选网络状态" :options="[{ value: 'all', label: '全部状态' }, ...statuses.map(s => ({ value: s, label: statusNames[s] }))]" />
    </div>
    <div class="legend"><StatusBadge v-for="s in statuses" :key="s" :status="s" /></div>
  </div>
</template>
