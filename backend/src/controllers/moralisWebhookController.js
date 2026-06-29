import { UserDepositAddress } from '../models/UserDepositAddress.js';
import { processIncomingChainDeposit } from '../services/chainWatcherService.js';
import {
  parseMoralisWebhookTransfers,
  verifyMoralisWebhookSignature,
} from '../services/moralisService.js';
import { error, success } from '../utils/response.js';

export async function moralisWebhook(req, res, next) {
  try {
    const signature = req.headers['x-signature'] || req.headers['x-moralis-signature'] || '';
    if (!verifyMoralisWebhookSignature(req.body, signature)) {
      return error(res, 'Invalid Moralis webhook signature', 401);
    }

    const transfers = parseMoralisWebhookTransfers(req.body);
    let processed = 0;

    for (const item of transfers) {
      const target = String(item.address || '').trim();
      const rows = await UserDepositAddress.find({ chain: item.chain }).lean();
      const row = rows.find((r) => {
        const addr = String(r.address || '').trim();
        if (item.chain === 'TRC') return addr === target;
        return addr.toLowerCase() === target.toLowerCase();
      });
      if (!row) continue;

      await processIncomingChainDeposit({
        chain: item.chain,
        userId: row.userId,
        address: row.address,
        tx: {
          hash: item.hash,
          amount: item.amount,
          currency: item.currency,
          fromAddress: item.fromAddress || '',
        },
      });
      processed += 1;
    }

    return success(res, { processed }, 'Moralis webhook processed');
  } catch (e) {
    return next(e);
  }
}
