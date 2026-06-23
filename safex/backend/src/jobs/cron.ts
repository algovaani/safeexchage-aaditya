import cron from 'node-cron';
import { processActiveOrders } from '../services/order.service.js';
import { processDailyStaking } from '../services/staking.service.js';

export function startCronJobs() {
  cron.schedule('*/30 * * * * *', () => {
    processActiveOrders().catch((e) => console.error('[cron] order engine', e));
  });

  cron.schedule('0 0 * * *', () => {
    processDailyStaking().catch((e) => console.error('[cron] staking', e));
  });

  console.log('[cron] Jobs scheduled');
}
