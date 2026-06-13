export function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('safex-theme') || localStorage.getItem('vc-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return 'dark';
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme === 'light') {
    root.classList.add('light');
  } else {
    root.classList.add('dark');
  }
}
