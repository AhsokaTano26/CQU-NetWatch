<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Series } from '../types'
import { format, networkName } from '../api'
import { darkTheme } from '../theme'
const props = defineProps<{ title: string; unit: string; series: Series[]; start: number; end: number; step: number; binary?: boolean; ratio?: boolean }>()
const colors = computed(() => darkTheme.value
  ? ['#62cfad', '#83aaff', '#edbe6c', '#d499e7', '#f59caa', '#6ec6d9', '#c6c36a', '#ae99f0', '#dfa582', '#9bc4b4', '#9caed8', '#e28dcb']
  : ['#09866b', '#4779d4', '#d89028', '#ac67c1', '#d76a78', '#3c9caf', '#85832b', '#8064c9', '#b77751', '#668077', '#344a77', '#c959ab'])
const displaySeries = computed(() => [...props.series].sort((a, b) => Number(b.points.some(p => p[1] !== null)) - Number(a.points.some(p => p[1] !== null))).slice(0, 12))
const container = ref<HTMLDivElement>(); const hover = ref(''); const disabled = ref<number[]>([])
let plot: uPlot | undefined; let observer: ResizeObserver | undefined; let mounted = false
function label(s: Series) { return `${s.probe} · ${networkName(s.network)}${s.target ? ' · ' + s.target : ''}` }
function value(v: number | null | undefined) { return v == null ? '—' : format(props.ratio ? v * 100 : v, props.unit) }
function draw() {
  if (!mounted || !container.value) return
  plot?.destroy(); plot = undefined; disabled.value = []; hover.value = ''
  if (!props.series.some(s => s.points.some(p => p[1] !== null))) return
  const ts: number[] = []
  for (let t = props.start; t <= props.end; t += props.step) ts.push(t)
  const data: uPlot.AlignedData = [ts, ...displaySeries.value.map(s => {
    const samples = new Map(s.points)
    return ts.map(t => samples.get(t) ?? null)
  })]
  const options: uPlot.Options = {
    width: Math.max(container.value.clientWidth, 200), height: 235,
    padding: [12, 14, 0, 0], legend: { show: false },
    cursor: { drag: { x: true, y: false }, sync: { key: 'netprobe-history' } },
    scales: { x: { time: true }, y: { range: (_, min, max) => props.binary || props.ratio ? [0, 1] : [0, Math.max(max * 1.15, 1)] } },
    series: [{}, ...displaySeries.value.map((s, i) => ({ label: label(s), stroke: colors.value[i], width: 1.7, spanGaps: false,
      paths: props.binary ? uPlot.paths.stepped!({ align: 1 }) : undefined,
      points: { show: false }, value: (_: uPlot, v: number | null) => value(v),
    }))],
    axes: [
      { stroke: '#82909f', grid: { stroke: '#eef1f5', width: 1 }, ticks: { show: false }, size: 42, font: '13px system-ui', space: 85,
        values: (_, ticks) => ticks.map(t => { const d = new Date(t * 1000); return props.end - props.start > 86400 ? `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:00` : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }) },
      { stroke: '#82909f', grid: { stroke: '#eef1f5', width: 1 }, ticks: { show: false }, size: 54, font: '13px system-ui', values: (_, ticks) => ticks.map(v => String(Number((props.ratio ? v * 100 : v).toFixed(1)))) },
    ],
    hooks: { setCursor: [(u) => { const idx = u.cursor.idx; hover.value = idx == null ? '' : `${new Date(ts[idx] * 1000).toLocaleString('zh-CN', { hour12: false })}  ·  ${displaySeries.value.map((s, i) => `${s.target || s.probe}: ${value(data[i + 1][idx])}`).join('  /  ')}` }] },
  }
  for (const axis of options.axes || []) {
    axis.stroke = darkTheme.value ? '#a6b4c6' : '#82909f'
    axis.grid = { stroke: darkTheme.value ? '#2a384a' : '#eef1f5', width: 1 }
  }
  plot = new uPlot(options, data, container.value)
  plot.setScale('x', { min: props.start, max: props.end })
}
function toggle(index: number) {
  if (!plot) return
  disabled.value = disabled.value.includes(index) ? disabled.value.filter(i => i !== index) : [...disabled.value, index]
  plot.setSeries(index + 1, { show: !disabled.value.includes(index) })
}
onMounted(async () => { mounted = true; await nextTick(); draw(); observer = new ResizeObserver(() => { if (plot && container.value) plot.setSize({ width: Math.max(container.value.clientWidth, 200), height: 235 }) }); if (container.value) observer.observe(container.value) })
watch(() => [props.series, props.start, props.end, props.step], () => nextTick(draw))
watch(darkTheme, () => nextTick(draw))
onUnmounted(() => { mounted = false; observer?.disconnect(); plot?.destroy() })
</script>
<template>
  <section class="panel metric-chart"><div class="chart-heading"><h3>{{ title }} <span>{{ unit }}</span></h3><button v-if="series.some(s => s.points.some(p => p[1] !== null))" class="text-button" @click="plot?.setScale('x', { min: start, max: end })">重置缩放</button></div>
    <div ref="container" class="plot-container" role="img" :aria-label="`${title}历史曲线，单位${unit}`"></div>
    <div v-if="!series.some(s => s.points.some(p => p[1] !== null))" class="chart-empty"><span class="empty-chart-line"></span><p>该时间范围内暂无数据</p></div>
    <div class="chart-legend"><button v-for="(s, i) in displaySeries" :key="`${s.probe}-${s.network}-${s.target}`" @click="toggle(i)" :class="{ muted: disabled.includes(i) }" :title="label(s)"><i :style="{ background: colors[i] }"></i>{{ s.target || s.probe }}<small>{{ networkName(s.network) }}</small></button></div>
    <p class="chart-hover">{{ hover || (series.length ? '悬停查看读数 · 拖动选择时间区域' : '等待历史监控数据') }}</p>
    <details v-if="series.length" class="chart-values"><summary>查看最新样本数值</summary><table><thead><tr><th>探针 / 目标</th><th>样本时间</th><th>数值</th></tr></thead><tbody><tr v-for="s in series" :key="label(s)"><td>{{ label(s) }}</td><td>{{ s.points.length ? new Date(s.points[s.points.length-1][0] * 1000).toLocaleString('zh-CN', { hour12: false }) : '—' }}</td><td>{{ value(s.points[s.points.length-1]?.[1]) }}</td></tr></tbody></table></details>
  </section>
</template>
