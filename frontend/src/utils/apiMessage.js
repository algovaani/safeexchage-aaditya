const FRIENDLY_MESSAGES = {
  'insufficient usdt balance': 'Not enough USDT in your wallet. Please deposit funds and try again.',
  'insufficient asset balance': "You don't hold enough of this coin to complete this sell.",
  'insufficient available balance': 'Your available balance is too low for this action.',
  'market price unavailable': 'Live market price is temporarily unavailable. Please wait a moment and try again.',
  'limit orders require price': 'Please enter a valid price for your limit order.',
  'order rejected': 'Your order could not be filled. Please check your balance and try again.',
  'network error': 'Connection problem. Check your internet and try again.',
  'cannot reach api': 'We could not reach the server. Please refresh the page and try again.',
  'request failed': 'Something went wrong. Please try again.',
  'invalid credentials': 'Incorrect email or password. Please try again.',
  'invalid otp': 'That code is incorrect or expired. Please request a new OTP.',
  'unauthorized': 'Your session expired. Please sign in again.',
  'validation failed': 'Please check the form and fix any highlighted fields.',
};

export function friendlyApiMessage(message, fallback = 'Something went wrong. Please try again.') {
  if (!message || typeof message !== 'string') return fallback;
  const trimmed = message.trim();
  if (!trimmed) return fallback;

  const lower = trimmed.toLowerCase();
  for (const [key, friendly] of Object.entries(FRIENDLY_MESSAGES)) {
    if (lower.includes(key)) return friendly;
  }

  if (/^insufficient .+ balance/i.test(trimmed)) {
    return `${trimmed}. Please check your wallet and try a smaller amount.`;
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function getSuccessMessage(response, fallback = 'Done! Your request was completed successfully.') {
  const message = response?.data?.message;
  if (message && typeof message === 'string' && message.trim()) {
    return friendlyApiMessage(message.trim(), fallback);
  }
  return fallback;
}

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const message = error?.message || error?.response?.data?.message;
  return friendlyApiMessage(message, fallback);
}
