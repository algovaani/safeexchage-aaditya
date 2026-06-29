import {
  chainPlatformAddress,
  getPlatformSettings,
  isManualDepositMode,
  platformDepositAddress,
} from './platformSettingsService.js';
import { CHAIN_CURRENCY, CHAIN_NETWORK } from './chainWatcherConstants.js';
import { normalizeChainFromNetwork } from './userDepositAddressService.js';

export async function resolveDepositMode() {
  const settings = await getPlatformSettings();
  return {
    settings,
    manual: isManualDepositMode(settings),
  };
}

export function buildPlatformDepositAddressRow(settings, chain, currency = '') {
  const chainKey = String(chain || '').toUpperCase();
  const address = platformDepositAddress(settings, chainKey, currency);
  return {
    chain: chainKey,
    address,
    network: CHAIN_NETWORK[chainKey] || chainKey,
    currency: currency || CHAIN_CURRENCY[chainKey] || 'USDT',
    mode: isManualDepositMode(settings) ? 'manual' : 'auto',
    isPlatformWallet: isManualDepositMode(settings),
  };
}

export function platformAddressForNetwork(settings, network, currency = '') {
  const chain = normalizeChainFromNetwork(network) || '';
  if (!chain) return '';
  return platformDepositAddress(settings, chain, currency);
}

export function allPlatformWallets(settings) {
  return {
    bnb: chainPlatformAddress(settings, 'BNB'),
    eth: chainPlatformAddress(settings, 'ETH'),
    trc: chainPlatformAddress(settings, 'TRC'),
    usdt: settings.usdtWalletAddress || chainPlatformAddress(settings, 'TRC'),
  };
}
