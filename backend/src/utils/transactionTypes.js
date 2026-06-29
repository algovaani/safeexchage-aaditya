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

export const DEPOSIT_TRANSACTION_TYPES = ['deposit'];
export const WITHDRAWAL_TRANSACTION_TYPES = ['withdrawal'];
export const REFERRAL_TRANSACTION_TYPES = ['referral_reward'];

export const SPOT_TRANSACTION_TYPES = ['spot_buy', 'spot_sell'];

export const ADMIN_ADJUSTMENT_TYPES = ['admin_credit', 'admin_debit'];

export const TRANSACTION_TYPE_LABELS = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  referral_reward: 'Referral Reward',
  spot_buy: 'Spot Buy',
  spot_sell: 'Spot Sell',
  trade_margin_locked: 'Trade Hold',
  trade_profit: 'Trade Profit',
  trade_loss: 'Trade Loss',
  trade_margin_returned: 'Margin Returned',
  stake_locked: 'Stake Locked',
  stake_principal_returned: 'Stake Returned',
  stake_reward: 'Stake Reward',
  stake_early_withdrawal: 'Early Unstake',
  admin_credit: 'Fund Added',
  admin_debit: 'Fund Deducted',
};

export function transactionTypeLabel(type) {
  return TRANSACTION_TYPE_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

export function transactionTypesForFilter(type) {
  if (!type || type === 'all') return null;
  const map = {
    deposit: DEPOSIT_TRANSACTION_TYPES,
    withdrawal: WITHDRAWAL_TRANSACTION_TYPES,
    referral: REFERRAL_TRANSACTION_TYPES,
    trade: TRADE_TRANSACTION_TYPES,
    spot: SPOT_TRANSACTION_TYPES,
    stake: STAKE_TRANSACTION_TYPES,
    admin: ADMIN_ADJUSTMENT_TYPES,
    admin_adjustment: ADMIN_ADJUSTMENT_TYPES,
    buy: ['trade_margin_locked'],
    sell: ['trade_profit', 'trade_loss', 'trade_margin_returned'],
    hold: ['trade_margin_locked', 'stake_locked'],
  };
  return map[type] || null;
}

export function isDebitType(type) {
  return [
    'withdrawal',
    'trade_margin_locked',
    'trade_loss',
    'stake_locked',
    'stake_early_withdrawal',
    'spot_buy',
    'admin_debit',
  ].includes(type);
}
