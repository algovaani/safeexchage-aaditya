/** Notify header/layout components that wallet balances changed. */
export function notifyWalletUpdated(wallet) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('wallet:updated', { detail: wallet || null }));
}
