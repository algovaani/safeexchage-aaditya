export const TRADE_TRANSACTION_TYPES = [
  'trade_margin_locked',
  'trade_profit',
  'trade_loss',
  'trade_margin_returned',
];

export const STAKE_TRANSACTION_TYPES = [
  'stake_locked',
  'stake_principal_returned',
  'stake_reward',
  'stake_early_withdrawal',
];

export const DEPOSIT_TRANSACTION_TYPES = ['deposit', 'withdrawal'];

export function transactionTypesForFilter(type) {
  if (!type || type === 'all') return null;
  const map = {
    deposit: ['deposit', 'withdrawal'],
    trade: TRADE_TRANSACTION_TYPES,
    stake: STAKE_TRANSACTION_TYPES,
  };
  return map[type] || null;
}
