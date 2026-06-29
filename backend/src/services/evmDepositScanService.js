import {
  fetchEvmIncomingViaMoralis,
  isMoralisEnabled,
  isMoralisQuotaError,
  isMoralisTemporarilyBlocked,
  markMoralisQuotaExceeded,
} from './moralisService.js';
import {
  fetchEvmIncomingViaTatum,
  isTatumEnabled,
  isTatumQuotaError,
} from './tatumService.js';

let moralisQuotaWarned = false;

/**
 * Scan BNB/ETH deposit address — Moralis primary, Tatum fallback when Moralis quota is hit.
 */
export async function fetchEvmIncoming(chain, address, { includeNative = true } = {}) {
  const errors = [];

  if (isMoralisEnabled() && !isMoralisTemporarilyBlocked()) {
    try {
      const rows = await fetchEvmIncomingViaMoralis(chain, address, { includeNative });
      return { rows, source: 'Moralis' };
    } catch (err) {
      if (isMoralisQuotaError(err)) {
        markMoralisQuotaExceeded();
        if (!moralisQuotaWarned) {
          moralisQuotaWarned = true;
          console.warn('[chainWatcher] Moralis daily limit reached — switching to Tatum fallback');
        }
      }
      errors.push(`Moralis: ${err.message}`);
    }
  }

  if (isTatumEnabled()) {
    try {
      const rows = await fetchEvmIncomingViaTatum(chain, address, { includeNative });
      const source = errors.length ? 'Tatum (fallback)' : 'Tatum';
      return { rows, source };
    } catch (err) {
      if (isTatumQuotaError(err)) {
        errors.push(`Tatum: quota/credits exhausted (${err.message})`);
      } else {
        errors.push(`Tatum: ${err.message}`);
      }
    }
  }

  if (!isMoralisEnabled() && !isTatumEnabled()) {
    throw new Error(
      'Configure MORALIS_API_KEY or TATUM_MAINNET_API_KEY for BNB/ETH deposit detection'
    );
  }

  throw new Error(errors.join(' | ') || 'EVM deposit scan failed');
}

export function evmScannerStatus() {
  return {
    moralis: isMoralisEnabled(),
    moralisBlocked: isMoralisTemporarilyBlocked(),
    tatum: isTatumEnabled(),
  };
}
