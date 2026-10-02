<script setup lang="ts" generic="T extends string">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, useId } from 'vue'
import Icon from './Icon.vue'
const props = defineProps<{ modelValue: T; options: readonly { value: T; label: string }[]; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
const id = useId(); const open = ref(false); const trigger = ref<HTMLButtonElement>(); const popup = ref<HTMLElement>()
const active = ref(0); const position = ref<Record<string, string>>({})
const selected = computed(() => props.options.find(o => o.value === props.modelValue))
let typed = ''; let typeTimer: ReturnType<typeof setTimeout> | undefined
function place() {
  if (!trigger.value || !open.value) return
  const r = trigger.value.getBoundingClientRect(); const width = Math.min(Math.max(r.width, 200), innerWidth - 24)
  const below = innerHeight - r.bottom - 16; const above = r.top - 16; const upward = below < 180 && above > below
  position.value = { position: 'fixed', width: `${width}px`, left: `${Math.max(12, Math.min(r.left, innerWidth-width-12))}px`, maxHeight: `${Math.max(60, Math.min(300, upward ? above : below))}px`, ...(upward ? { bottom: `${innerHeight-r.top+6}px` } : { top: `${r.bottom+6}px` }) }
}
async function show() { if (!props.options.length) return; active.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue)); open.value = true; place(); await nextTick(); popup.value?.focus(); scrollActive() }
function close(restore = false) { open.value = false; if (restore) trigger.value?.focus() }
function choose(index: number) { const option = props.options[index]; if (option) emit('update:modelValue', option.value); close(true) }
function scrollActive() { nextTick(() => { const list=popup.value; const option=list?.querySelector<HTMLElement>(`#${id}-option-${active.value}`); if (!list || !option) return; if (option.offsetTop < list.scrollTop) list.scrollTop=option.offsetTop; else if (option.offsetTop+option.offsetHeight > list.scrollTop+list.clientHeight) list.scrollTop=option.offsetTop+option.offsetHeight-list.clientHeight }) }
function keys(e: KeyboardEvent) {
  if (e.key === 'Escape') { e.preventDefault(); close(true); return }
  if (e.key === 'Tab') { trigger.value?.focus(); close(); return }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active.value); return }
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
    e.preventDefault(); const length = props.options.length
    active.value = e.key === 'Home' ? 0 : e.key === 'End' ? length-1 : (active.value+(e.key === 'ArrowDown' ? 1 : -1)+length)%length; scrollActive(); return
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    typed += e.key.toLowerCase(); clearTimeout(typeTimer); typeTimer = setTimeout(() => { typed = '' }, 700)
    const index = props.options.findIndex(o => o.label.toLowerCase().startsWith(typed)); if (index >= 0) { active.value = index; scrollActive() }
  }
}
function outside(e: PointerEvent) { if (!trigger.value?.contains(e.target as Node) && !popup.value?.contains(e.target as Node)) close() }
function focusOutside(e: FocusEvent) { if (open.value && !trigger.value?.contains(e.target as Node) && !popup.value?.contains(e.target as Node)) close() }
function scroll(e: Event) { if (!popup.value?.contains(e.target as Node)) place() }
watch(() => JSON.stringify(props.options), () => { if (open.value) close() })
onMounted(() => { document.addEventListener('pointerdown', outside); document.addEventListener('focusin', focusOutside); window.addEventListener('resize', place); document.addEventListener('scroll', scroll, true) })
onUnmounted(() => { clearTimeout(typeTimer); document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin', focusOutside); window.removeEventListener('resize', place); document.removeEventListener('scroll', scroll, true) })
</script>
<template>
  <button ref="trigger" class="select-trigger" type="button" :aria-label="label" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="`${id}-list`" :title="selected?.label" @click="open ? close() : show()" @keydown.down.prevent="show()" @keydown.up.prevent="show()"><span>{{ selected?.label || '请选择' }}</span><Icon name="chevron" :size="15" /></button>
  <Teleport to="body"><div v-if="open" :id="`${id}-list`" ref="popup" class="select-popup" :style="position" role="listbox" :aria-label="label" :aria-activedescendant="`${id}-option-${active}`" tabindex="-1" @keydown="keys">
    <div v-for="(option, index) in options" :id="`${id}-option-${index}`" :key="option.value" class="select-option" :class="{ active: active === index, chosen: option.value === modelValue }" role="option" :aria-selected="option.value === modelValue" @pointermove="active = index" @click="choose(index)"><span>{{ option.label }}</span><Icon v-if="option.value === modelValue" name="check" :size="16" /></div>
  </div></Teleport>
</template>
