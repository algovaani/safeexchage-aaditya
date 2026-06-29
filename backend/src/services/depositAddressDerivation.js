import { createHash } from 'crypto';
import { HDNodeWallet, Mnemonic, Wallet } from 'ethers';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function userDerivationIndex(userId) {
  const hex = createHash('sha256').update(String(userId)).digest('hex');
  return parseInt(hex.slice(0, 8), 16) % 2_000_000;
}

export function getDerivationSecret(settings) {
  return (
    settings?.evmMnemonic?.trim() ||
    process.env.EVM_MNEMONIC?.trim() ||
    process.env.EVM_DERIVATION_SECRET?.trim() ||
    ''
  );
}

function isValidBip39Mnemonic(phrase) {
  if (!phrase?.trim()) return false;
  try {
    Mnemonic.fromPhrase(phrase.trim());
    return true;
  } catch {
    return false;
  }
}

export function canUseUniqueAddressDerivation(settings) {
  const secret = getDerivationSecret(settings);
  if (!secret) return false;
  if (isValidBip39Mnemonic(secret)) return true;
  return secret.length >= 4;
}

function derivePrivateKeyFromSecret(secret, scope) {
  const hash = createHash('sha256').update(`safex-deposit:v1:${secret}:${scope}`).digest('hex');
  return `0x${hash}`;
}

function deriveEvmPrivateKeyFromMnemonic(mnemonic, scope) {
  const index = userDerivationIndex(scope);
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/${index}`);
  return wallet.privateKey;
}

function deriveEvmAddressFromMnemonic(mnemonic, userId) {
  const index = userDerivationIndex(userId);
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(mnemonic), `m/44'/60'/0'/0/${index}`);
  return wallet.address;
}

function deriveEvmAddressFromSecret(secret, scope) {
  return new Wallet(derivePrivateKeyFromSecret(secret, scope)).address;
}

function base58Encode(buffer) {
  if (!buffer.length) return '';
  let num = BigInt(`0x${buffer.toString('hex')}`);
  let encoded = '';
  while (num > 0n) {
    const rem = Number(num % 58n);
    num /= 58n;
    encoded = BASE58_ALPHABET[rem] + encoded;
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i += 1) {
    encoded = `1${encoded}`;
  }
  return encoded;
}

function base58CheckEncode(hexPayload) {
  const payload = Buffer.from(hexPayload, 'hex');
  const hash1 = createHash('sha256').update(payload).digest();
  const hash2 = createHash('sha256').update(hash1).digest();
  return base58Encode(Buffer.concat([payload, hash2.subarray(0, 4)]));
}

function privateKeyToTronAddress(privateKey) {
  const ethAddr = new Wallet(privateKey).address.slice(2).toLowerCase();
  return base58CheckEncode(`41${ethAddr}`);
}

function deriveTronAddressFromSecret(secret, userId) {
  return privateKeyToTronAddress(derivePrivateKeyFromSecret(secret, `TRC:${userId}`));
}

export function deriveDepositAddressForChain(settings, userId, chain) {
  const secret = getDerivationSecret(settings);
  if (!canUseUniqueAddressDerivation(settings)) return null;

  const scope = `${userId}:${chain}`;

  if (isValidBip39Mnemonic(secret) && (chain === 'BNB' || chain === 'ETH')) {
    try {
      return deriveEvmAddressFromMnemonic(secret, scope);
    } catch {
      /* fall through */
    }
  }

  if (chain === 'TRC') {
    return deriveTronAddressFromSecret(secret, userId);
  }
  if (chain === 'BNB' || chain === 'ETH') {
    return deriveEvmAddressFromSecret(secret, scope);
  }

  return null;
}

/** Derive the deposit wallet private key for admin treasury/sweep (admin-only). */
export function deriveDepositPrivateKeyForChain(settings, userId, chain) {
  const secret = getDerivationSecret(settings);
  if (!canUseUniqueAddressDerivation(settings)) return null;

  const upper = String(chain || '').toUpperCase();
  const scope = `${userId}:${upper}`;

  if (isValidBip39Mnemonic(secret) && (upper === 'BNB' || upper === 'ETH')) {
    try {
      return deriveEvmPrivateKeyFromMnemonic(secret, scope);
    } catch {
      /* fall through */
    }
  }

  if (upper === 'TRC') {
    return derivePrivateKeyFromSecret(secret, `TRC:${userId}`);
  }
  if (upper === 'BNB' || upper === 'ETH') {
    return derivePrivateKeyFromSecret(secret, scope);
  }

  return null;
}
