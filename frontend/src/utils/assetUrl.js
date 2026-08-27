/** Resolve stored upload paths (uploads/...) to a browser-loadable URL. */
export function resolveAssetUrl(pathOrUrl) {
  if (!pathOrUrl) return '';
  let raw = String(pathOrUrl).trim();
  if (raw.startsWith('blob:') || raw.startsWith('data:')) {
    return raw;
  }

  // Detect if url has hardcoded localhost / 127.0.0.1 origin (e.g. http://127.0.0.1:5001/storage/...)
  const isLocalhostUrl = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(raw);
  if (isLocalhostUrl) {
    const isCurrentHostLocal =
      typeof window !== 'undefined' &&
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (!isCurrentHostLocal) {
      // Strip localhost origin to force relative path resolution against live origin
      raw = raw.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/i, '/');
    }
  }

  if (/^https?:\/\//i.test(raw)) {
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

