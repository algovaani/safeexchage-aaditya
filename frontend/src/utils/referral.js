/** Build shareable signup URL with referral code. */
export function buildReferralSignupUrl(code, origin = window.location.origin) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return `${origin}/signup`;
  return `${origin}/signup?ref=${encodeURIComponent(normalized)}`;
}

/** Shorter invite path — redirects to signup with ref pre-filled. */
export function buildInviteUrl(code, origin = window.location.origin) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return `${origin}/signup`;
  return `${origin}/invite/${encodeURIComponent(normalized)}`;
}

export function normalizeReferralCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function whatsAppShareUrl(text, url) {
  return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
}

export function telegramShareUrl(url, text) {
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}
