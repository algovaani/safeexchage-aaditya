const base = (import.meta.env.VITE_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

/** Build absolute URL to the main SafeX app (signup, login, admin, etc.) */
export function appUrl(path = '/') {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}
