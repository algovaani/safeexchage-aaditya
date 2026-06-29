export const USDT_CONTRACTS = {
  BNB: '0x55d398326f99059ff775485246999027b3197955',
  ETH: '0xdac17f958d2ee523a2206206994597c13d831ec7',
};

/** Additional BEP-20 USDT contracts seen on BSC (Moralis may report these). */
export const BSC_USDT_CONTRACTS = new Set([
  USDT_CONTRACTS.BNB.toLowerCase(),
  '0x8074d5356f18f7c6244768e53b95f52c79137777',
]);

export const TRC20_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

export const CHAIN_CURRENCY = { BNB: 'BNB', ETH: 'ETH', TRC: 'USDT' };
export const CHAIN_NETWORK = { BNB: 'BEP20', ETH: 'ERC20', TRC: 'TRC20' };

export const MIN_AUTO_CREDIT = {
  BNB: 0.0001,
  ETH: 0.0001,
  TRX: 1,
  USDT: 1,
};

export function dedupeIncoming(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row?.hash || !(row.amount > 0)) continue;
    const key = `${row.hash}:${row.currency}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
