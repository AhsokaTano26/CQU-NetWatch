// Apply appearance before styles load; storage can be unavailable in private mode.
(() => {
  let mode = 'system';
  try { const saved = localStorage.getItem('netprobe-theme'); if (['light', 'dark', 'system'].includes(saved)) mode = saved; } catch {}
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
})();
