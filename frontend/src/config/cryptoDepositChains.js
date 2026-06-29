/** Supported on-chain deposit networks (maps to backend chain ids). */

export const USDT_DEPOSIT_NETWORKS = [
  { id: 'TRC', label: 'TRON (TRC20)', currency: 'USDT' },
  { id: 'ETH', label: 'Ethereum (ERC20)', currency: 'USDT' },
  { id: 'BNB', label: 'BNB Smart Chain (BEP20)', currency: 'USDT' },
];

export function chainsForCoin(symbol) {
  const sym = String(symbol || '').toUpperCase();
  if (sym === 'BNB') return [{ id: 'BNB', label: 'BNB Smart Chain (BEP20)', currency: 'BNB' }];
  if (sym === 'ETH') return [{ id: 'ETH', label: 'Ethereum (ERC20)', currency: 'ETH' }];
  if (sym === 'TRX') return [{ id: 'TRC', label: 'TRON (TRC20)', currency: 'TRX' }];
  if (sym === 'USDT') return USDT_DEPOSIT_NETWORKS;
  return null;
}

export function isCryptoDepositSupported(symbol) {
  return chainsForCoin(symbol) != null;
}

export function getWalletPayUrl(chain, address, currency = '') {
  if (!address) return null;
  const enc = encodeURIComponent(address);
  const cur = String(currency || '').toUpperCase();

  if (chain === 'BNB') {
    if (cur === 'USDT') {
      return `https://link.trustwallet.com/send?asset=c20000714_tBEP20&address=${enc}`;
    }
    return `https://link.trustwallet.com/send?coin=714&address=${enc}`;
  }
  if (chain === 'ETH') {
    if (cur === 'USDT') {
      return `https://link.trustwallet.com/send?asset=c60_tERC20&address=${enc}`;
    }
    return `https://link.trustwallet.com/send?coin=60&address=${enc}`;
  }
  if (chain === 'TRC') {
    if (cur === 'USDT') {
      return `https://link.trustwallet.com/send?asset=c195_tTRC20&address=${enc}`;
    }
    return `https://link.trustwallet.com/send?coin=195&address=${enc}`;
  }
  return null;
}
