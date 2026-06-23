/** Per-coin deposit chains shown in the wallet deposit modal. */

const EVM_ADDRESS = '0xF0B52FC9449854527C72f9F13f4156789012345678';
const TRC_ADDRESS = 'TXdemoPlatformUsdtAddress123456789';

function chain(id, label, address, apiNetwork) {
  return { id, label, address, apiNetwork };
}

export const DEPOSIT_NETWORKS = {
  BNB: [chain('bsc', 'Binance Smart Chain Mainnet', EVM_ADDRESS, 'BEP20')],
  ETH: [
    chain('eth', 'Ethereum Mainnet', EVM_ADDRESS, 'ERC20'),
    chain('bsc', 'BNB Smart Chain (BEP20)', EVM_ADDRESS, 'BEP20'),
  ],
  POL: [chain('polygon', 'Polygon Mainnet', EVM_ADDRESS, 'POLYGON')],
  SOL: [chain('sol', 'Solana Mainnet', '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'SOL')],
  TRX: [chain('trx', 'TRON Mainnet', TRC_ADDRESS, 'TRC20')],
  USDT: [
    chain('trc20', 'TRON (TRC20)', TRC_ADDRESS, 'TRC20'),
    chain('erc20', 'Ethereum (ERC20)', EVM_ADDRESS, 'ERC20'),
    chain('bep20', 'BNB Smart Chain (BEP20)', EVM_ADDRESS, 'BEP20'),
  ],
  VENX: [chain('bsc', 'Binance Smart Chain Mainnet', EVM_ADDRESS, 'BEP20')],
  DOGE: [chain('doge', 'Dogecoin Network', 'D8fK9mN2pQr5sT7vW1xY3zA6bC4eF8hJ2k', 'DOGE')],
  SHIB: [chain('eth', 'Ethereum (ERC20)', EVM_ADDRESS, 'ERC20')],
  '1INCH': [
    chain('eth', 'Ethereum (ERC20)', EVM_ADDRESS, 'ERC20'),
    chain('bsc', 'BNB Smart Chain (BEP20)', EVM_ADDRESS, 'BEP20'),
  ],
};

export const FIAT_DEPOSIT_SYMBOLS = new Set(['INR']);

export const COIN_COLORS = {
  BNB: '#f0b90b',
  ETH: '#627eea',
  USDT: '#26a17b',
  TRX: '#ef0027',
  SOL: '#9945ff',
  DOGE: '#c2a633',
};

export function getNetworksForCoin(symbol, platformInfo) {
  const key = String(symbol || '').toUpperCase();
  if (FIAT_DEPOSIT_SYMBOLS.has(key)) return null;

  let chains = DEPOSIT_NETWORKS[key];
  if (!chains?.length) {
    chains = [chain('bsc', 'Binance Smart Chain Mainnet', EVM_ADDRESS, 'BEP20')];
  }

  const usdtAddr = platformInfo?.usdt?.address;
  if (key === 'USDT' && usdtAddr) {
    return chains.map((c) => {
      if (c.id === 'trc20' || c.label.toLowerCase().includes('trc')) {
        return { ...c, address: usdtAddr };
      }
      if ((c.id === 'erc20' || c.id === 'bep20') && usdtAddr.startsWith('0x')) {
        return { ...c, address: usdtAddr };
      }
      return c;
    });
  }

  if (key === 'TRX' && usdtAddr?.startsWith('T')) {
    return [{ ...chains[0], address: usdtAddr }];
  }

  return chains.map((c) => ({ ...c }));
}

export function networkLabelForDisclaimer(chain) {
  return chain?.label || 'the selected';
}

export function txnHashPlaceholder(apiNetwork) {
  const n = String(apiNetwork || '').toUpperCase();
  if (n === 'ERC20' || n === 'BEP20' || n === 'BSC' || n === 'ETH') return '0x… (64 hex chars)';
  if (n === 'TRC20' || n === 'TRX') return '64-character transaction hash';
  return 'Transaction hash / TX ID';
}
