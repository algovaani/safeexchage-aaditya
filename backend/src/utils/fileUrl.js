import path from 'path';

export function getApiBaseUrl(req) {
  if (process.env.API_BASE_URL) {
    const customUrl = process.env.API_BASE_URL.replace(/\/$/, '');
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(customUrl)) {
      return customUrl;
    }
  }
  if (req) {
    const proxyHost = req.get('x-forwarded-host') || req.get('host');
    if (proxyHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(proxyHost)) {
      const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
      return `${protocol}://${proxyHost}`;
    }
  }
  return '';
}

/** Turn stored path (uploads/kyc/...) into a public URL */
export function toPublicFileUrl(req, storedPath) {
  if (!storedPath) return null;
  let normalized = String(storedPath).trim().replace(/\\/g, '/');

  // If storedPath contains a localhost/127.0.0.1 origin prefix, strip it down to the relative path
  normalized = normalized.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?/i, '');

  // If it's already a non-localhost absolute URL (e.g. S3 / external CDN), return as-is
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const cleanPath = normalized.replace(/^\/+/, '');
  const relative =
    cleanPath.startsWith('uploads/') || cleanPath.startsWith('storage/')
      ? cleanPath
      : `uploads/${cleanPath}`;

  const apiBase = getApiBaseUrl(req);
  if (apiBase) {
    return `${apiBase}/${relative}`;
  }
  return `/${relative}`;
}

