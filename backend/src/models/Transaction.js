import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
      type: String,
      enum: [
        'deposit',
        'withdrawal',
        'trade_margin_locked',
        'trade_profit',
        'trade_loss',
        'trade_margin_returned',
        'stake_locked',
        'stake_principal_returned',
        'stake_reward',
        'stake_early_withdrawal',
      ],
      required: true,
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, default: null },
    currency: { type: String, default: 'USDT' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
    method: { type: String, enum: ['manual', 'gateway', 'crypto', 'fiat'], default: 'manual' },
    depositId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deposit', default: null },
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserOrder', default: null },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminTrade', default: null },
    reference: { type: String, default: '' },
    adminNote: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
