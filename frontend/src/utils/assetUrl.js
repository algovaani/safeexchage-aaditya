/** Resolve stored upload paths (uploads/...) to a browser-loadable URL. */
export function resolveAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  const raw = String(pathOrUrl).trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith('blob:') || raw.startsWith('data:')) {
    return raw;
  }

  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const vite = import.meta.env.VITE_API_URL;
  const cra = typeof process !== 'undefined' ? process.env?.REACT_APP_API_URL : undefined;
  const apiBase = String(vite || cra || '/api').trim().replace(/\/+$/, '');

  if (/^https?:\/\//i.test(apiBase)) {
    const origin = apiBase.replace(/\/api$/i, '');
    return `${origin}/${normalized}`;
  }

  return `/${normalized}`;
}
