import { computed, ref } from 'vue'
import type { Building, Overview, Status } from './types'

export const statusNames: Record<Status, string> = { online: '在线', offline: '下线', pending: '等待', unstable: '波动', empty: '暂无数据' }
export const statuses: Status[] = ['online', 'offline', 'pending', 'unstable', 'empty']
export const overview = ref<Overview | null>(null)
export const loading = ref(false)
export const requestError = ref('')
export const region = ref('all')
export const search = ref('')
export const statusFilter = ref<Status | 'all'>('all')
const clock = ref(Date.now())
let pending: Promise<void> | undefined
let controller: AbortController | undefined
let timer: ReturnType<typeof setInterval> | undefined

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) })
  if (!response.ok) {
    let message = '数据请求失败，请稍后重试'
    try { const body = await response.json(); if (body.error) message = body.error } catch {}
    throw new Error(message)
  }
  return response.json()
}
export function refresh(): Promise<void> {
  if (pending) return pending
  loading.value = true; controller = new AbortController()
  pending = getJSON<Overview>('/api/overview', controller.signal).then(result => {
    overview.value = result; requestError.value = ''; clock.value = Date.now()
  }).catch(e => { if (e.name !== 'AbortError') requestError.value = '无法连接监控服务，请检查连接后重试。' })
    .finally(() => { loading.value = false; pending = undefined })
  return pending
}
export function startRefresh() {
  refresh()
  timer = setInterval(() => {
    clock.value = Date.now()
    if (!document.hidden && (!overview.value || clock.value / 1000 - overview.value.generatedAt >= overview.value.refreshSeconds)) refresh()
  }, 1000)
  document.addEventListener('visibilitychange', onVisibility)
}
function onVisibility() { if (!document.hidden) { clock.value = Date.now(); refresh() } }
export function stopRefresh() { clearInterval(timer); controller?.abort(); document.removeEventListener('visibilitychange', onVisibility) }
export const stale = computed(() => Boolean(overview.value && clock.value / 1000 - overview.value.generatedAt > overview.value.thresholds.sampleMaxAge))
export const buildings = computed<Building[]>(() => {
  const list = overview.value?.buildings || []
  return stale.value ? list.map(b => ({ ...b, status: 'empty', loss: null, latency: null, jitter: null, http: null, lossWindow: null, onlineProbes: 0, totalProbes: 0, probes: [] })) : list
})
export const visibleBuildings = computed(() => buildings.value.filter(b => {
  const campus = overview.value?.campuses.find(c => c.id === b.campus)
  return (region.value === 'all' || region.value === campus?.region || region.value === b.campus)
    && (statusFilter.value === 'all' || statusFilter.value === b.status)
    && `${b.name} ${b.building} ${campus?.name || ''} ${overview.value?.groups[b.group] || b.group}`.toLowerCase().includes(search.value.trim().toLowerCase())
}))
export const counts = computed(() => Object.fromEntries(statuses.map(s => [s, buildings.value.filter(b => b.status === s).length])) as Record<Status, number>)
export function format(value: number | null | undefined, unit = '', digits = 1): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit}`
}
export function percent(value: number | null | undefined) { return format(value == null ? null : value * 100, '%') }
export function time(value: number | null | undefined) { return value ? new Date(value * 1000).toLocaleString('zh-CN', { hour12: false }) : '—' }
export function networkName(value: string) { return value === 'wired' ? '有线' : value === 'wireless' ? '无线' : value }
