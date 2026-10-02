<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  moon: 'M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13',
  monitor: 'M3 4h18v13H3z M12 17v4 M8 21h8',
  check: 'M5 12l4 4L19 6',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  chart: 'M3 3v18h18 M7 14l4-6 4 4 6-9',
  building: 'M5 21V7l7-4 7 4v14 M3 21h18 M9 9h1 M14 9h1 M9 13h1 M14 13h1 M10 21v-4h4v4',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M5.1 7a8 8 0 0 1 13.5-2L20 7 M4 17l1.4 2A8 8 0 0 0 19 17',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
  back: 'M19 12H5 M10 7l-5 5 5 5',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  chevron: 'M6 9l6 6 6-6',
  network: 'M6 6h12 M6 18h12 M6 6v12 M18 6v12 M6 6l12 12 M3 3h6v6H3z M15 3h6v6h-6z M3 15h6v6H3z M15 15h6v6h-6z',
  pulse: 'M2 12h4l3-8 6 16 3-8h4',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'M6 6l12 12 M6 18L18 6',
  server: 'M3 3h18v7H3z M3 14h18v7H3z M7 6h.01 M7 17h.01',
}
</script>
<template><svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.info" /></svg></template>
