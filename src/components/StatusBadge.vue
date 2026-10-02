<script setup lang="ts">
import { statusNames } from '../api'
import type { Status } from '../types'
defineProps<{ status: Status; dotOnly?: boolean; label?: string }>()
</script>
<template><span class="status" :class="status" :aria-label="label || statusNames[status]"><i class="status-dot"></i><span v-if="!dotOnly">{{ label || statusNames[status] }}</span></span></template>
