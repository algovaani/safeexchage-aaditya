import path from 'path';

export function getApiBaseUrl(req) {
  if (process.env.API_BASE_URL) {
    return process.env.API_BASE_URL.replace(/\/$/, '');
  }
  const host = req.get('host');
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
}

/** Turn stored path (uploads/kyc/...) into a public URL */
export function toPublicFileUrl(req, storedPath) {
  if (!storedPath) return null;
  const normalized = storedPath.replace(/\\/g, '/');
  const relative = normalized.startsWith('uploads/')
    ? normalized
    : `uploads/${normalized.replace(/^\/+/, '')}`;
  return `${getApiBaseUrl(req)}/${relative}`;
}
