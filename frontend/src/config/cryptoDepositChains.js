/** Supported on-chain deposit networks (maps to backend chain ids). */

export const USDT_DEPOSIT_NETWORKS = [
  { id: 'TRC', label: 'TRON (TRC20)', currency: 'USDT' },
  { id: 'ETH', label: 'Ethereum (ERC20)', currency: 'USDT' },
  { id: 'BNB', label: 'BNB Smart Chain (BEP20)', currency: 'USDT' },
];

const NETWORK_LABELS = {
  BEP20: 'BNB Smart Chain (BEP20)',
  BNB: 'BNB Smart Chain (BEP20)',
  ERC20: 'Ethereum (ERC20)',
  ETH: 'Ethereum (ERC20)',
  TRC20: 'TRON (TRC20)',
  TRX: 'TRON (TRC20)',
};

function chainIdFromNetwork(network) {
  const n = String(network || '').toUpperCase();
  if (n.includes('BEP') || n === 'BSC' || n === 'BNB') return 'BNB';
  if (n.includes('ERC') || n === 'ETH') return 'ETH';
  if (n.includes('TRC') || n === 'TRX' || n === 'TRON') return 'TRC';
  return '';
}

function chainFromDexMeta(pairMeta) {
  const chain = String(pairMeta?.dexChainId || pairMeta?.contractChain || '').toLowerCase();
  if (chain.includes('bsc') || chain === 'bnb') return 'BNB';
  if (chain.includes('eth') || chain === 'ethereum' || chain === 'base' || chain === 'arbitrum') {
    return 'ETH';
  }
  if (chain.includes('tron') || chain === 'trx') return 'TRC';
  return '';
}

function chainOptionForPair(symbol, pairMeta) {
  const sym = String(symbol || '').toUpperCase();
  let chainId = chainIdFromNetwork(pairMeta?.depositNetwork) || chainFromDexMeta(pairMeta);
  if (!chainId && (pairMeta?.depositWalletAddress || pairMeta?.depositEnabled !== false)) {
    chainId = 'BNB';
  }
  if (!chainId) return null;
  const netKey = String(pairMeta?.depositNetwork || '').toUpperCase();
  const label = NETWORK_LABELS[netKey] || NETWORK_LABELS[chainId] || chainId;
  return { id: chainId, label, currency: sym };
}

export function chainsForCoin(symbol, pairMeta = null) {
  const sym = String(symbol || '').toUpperCase();
  if (sym === 'BNB') return [{ id: 'BNB', label: 'BNB Smart Chain (BEP20)', currency: 'BNB' }];
  if (sym === 'ETH') return [{ id: 'ETH', label: 'Ethereum (ERC20)', currency: 'ETH' }];
  if (sym === 'TRX') return [{ id: 'TRC', label: 'TRON (TRC20)', currency: 'TRX' }];
  if (sym === 'USDT') return USDT_DEPOSIT_NETWORKS;

  if (pairMeta?.depositEnabled === false) return null;

  const hasCustom =
    String(pairMeta?.depositWalletAddress || '').trim() ||
    String(pairMeta?.depositNetwork || '').trim();

  if (hasCustom || pairMeta?.category === 'crypto') {
    const opt = chainOptionForPair(sym, pairMeta);
    if (opt) return [opt];
  }

  return null;
}

export function isCryptoDepositSupported(symbol, pairMeta = null) {
  return chainsForCoin(symbol, pairMeta) != null;
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
