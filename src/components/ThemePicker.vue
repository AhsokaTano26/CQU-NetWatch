<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { themeMode, setTheme, type ThemeMode } from '../theme'
import Icon from './Icon.vue'
const choices = [
  { value: 'light' as const, label: '浅色模式', icon: 'sun' },
  { value: 'dark' as const, label: '暗夜模式', icon: 'moon' },
  { value: 'system' as const, label: '跟随系统', icon: 'monitor' },
]
const selected = computed(() => choices.find(choice => choice.value === themeMode.value)!)
const open = ref(false); const root = ref<HTMLElement>(); const trigger = ref<HTMLButtonElement>()
async function show() {
  open.value = true
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>(`[data-mode="${themeMode.value}"]`)?.focus()
}
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus() }
function choose(mode: ThemeMode) { setTheme(mode); close(true) }
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) close() }
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); close(true) }
  if (event.key === 'Tab') { close(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const buttons = [...root.value!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')]
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus()
}
onMounted(() => document.addEventListener('pointerdown', outside))
onUnmounted(() => document.removeEventListener('pointerdown', outside))
</script>
<template>
  <div ref="root" class="theme-picker">
    <button ref="trigger" class="theme-trigger" aria-label="外观模式" aria-haspopup="menu" :aria-expanded="open" aria-controls="appearance-menu" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.esc.prevent="close(true)">
      <Icon :name="selected.icon" :size="17" /><span>{{ selected.label }}</span><Icon name="chevron" :size="13" />
    </button>
    <div v-if="open" id="appearance-menu" class="theme-menu" role="menu" aria-label="外观模式" @keydown="keys">
      <span class="theme-menu-label">外观</span>
      <button v-for="choice in choices" :key="choice.value" :data-mode="choice.value" role="menuitemradio" :aria-checked="themeMode === choice.value" :class="{ chosen: themeMode === choice.value }" @click="choose(choice.value)">
        <Icon :name="choice.icon" :size="17" /><span>{{ choice.label }}</span><Icon v-if="themeMode === choice.value" name="check" :size="16" />
      </button>
    </div>
  </div>
</template>
