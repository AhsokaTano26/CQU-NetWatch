import { ref, computed } from 'vue'

export type ThemeMode = 'light' | 'dark' | 'system'
const key = 'netprobe-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
function storedMode(): ThemeMode {
  try { const value = localStorage.getItem(key); if (value === 'light' || value === 'dark') return value } catch {}
  return 'system'
}
export const themeMode = ref<ThemeMode>(storedMode())
const systemDark = ref(media.matches)
export const darkTheme = computed(() => themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value))
function apply() {
  document.documentElement.dataset.theme = darkTheme.value ? 'dark' : 'light'
  document.documentElement.style.colorScheme = darkTheme.value ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkTheme.value ? '#111923' : '#ffffff')
}
export function setTheme(mode: ThemeMode) {
  themeMode.value = mode
  try { localStorage.setItem(key, mode) } catch {}
  apply()
}
media.addEventListener('change', event => { systemDark.value = event.matches; apply() })
window.addEventListener('storage', event => { if (event.key === key || event.key === null) { themeMode.value = storedMode(); apply() } })
apply()
