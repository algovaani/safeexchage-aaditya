import { fetchTicker, normalizeSymbol } from './marketDataProvider.js';
import { roundMoney, storeMoney } from '../utils/money.js';

/** Non-USDT crypto deposits credit the native coin balance (e.g. XAUT), not USDT wallet. */
export function isNativeCryptoDeposit(deposit) {
  const currency = String(deposit?.currency || 'USDT').toUpperCase();
  return deposit?.type === 'crypto' && currency !== 'USDT';
}

/** Live USDT price for a base asset (e.g. BNB → BNBUSDT) via CoinGecko. */
export async function fetchCryptoUsdtPrice(currency) {
  const base = String(currency || 'USDT').toUpperCase();
  if (base === 'USDT') return 1;

  const sym = normalizeSymbol(base);
  const ticker = await fetchTicker(sym);
  const price = Number(ticker.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw Object.assign(new Error(`Market price not available for ${base}`), { status: 503 });
  }
  return price;
}

/** Convert a deposit's crypto amount to USDT using the current market price. */
export async function computeDepositUsdtCredit(deposit) {
  const currency = String(deposit.currency || 'USDT').toUpperCase();
  const cryptoAmount = storeMoney(deposit.amount);

  if (deposit.type === 'fiat' || currency === 'USDT') {
    const usdtAmount = roundMoney(cryptoAmount);
    return {
      cryptoAmount: null,
      cryptoCurrency: 'USDT',
      usdtAmount,
      conversionRate: 1,
    };
  }

  const conversionRate = storeMoney(await fetchCryptoUsdtPrice(currency));
  const usdtAmount = roundMoney(cryptoAmount * conversionRate);

  return {
    cryptoAmount,
    cryptoCurrency: currency,
    usdtAmount,
    conversionRate,
  };
}

export function depositCreditReference(deposit) {
  const base = deposit.txnHash || deposit.utrNumber || String(deposit._id);
  const currency = String(deposit.currency || 'USDT').toUpperCase();
  if (currency === 'USDT' || deposit.type === 'fiat') return base;
  if (deposit.conversionRate != null && deposit.usdtAmount != null) {
    return `${deposit.amount} ${currency} (≈ ${deposit.usdtAmount} USDT @ ${deposit.conversionRate}) | ${base}`;
  }
  return `${deposit.amount} ${currency} | ${base}`;
}
