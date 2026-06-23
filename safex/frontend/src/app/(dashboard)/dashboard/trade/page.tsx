'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';
import { usePrices } from '@/hooks/usePrices';

export default function TradePage() {
  const prices = usePrices();
  const qc = useQueryClient();
  const [tradeId, setTradeId] = useState<string | null>(null);
  const [margin, setMargin] = useState('');

  const { data: trades } = useQuery<any>({
    queryKey: ['open-trades'],
    queryFn: async () => unwrap(await api.get('/dashboard/trades/open')),
  });

  const { data: orders } = useQuery<any>({
    queryKey: ['my-orders-open'],
    queryFn: async () => unwrap(await api.get('/orders/open')),
  });

  const place = useMutation({
    mutationFn: async () => unwrap(await api.post('/orders/place', { tradeId, margin: Number(margin) })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-orders-open'] });
      setTradeId(null);
      setMargin('');
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Trade</h1>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="ui-card">
          <h2 className="text-sm font-medium mb-3">Live prices</h2>
          <div className="space-y-2 max-h-64 overflow-auto text-xs">
            {prices.slice(0, 5).map((p) => (
              <div key={p.symbol} className="flex justify-between">
                <span>{p.symbol}</span>
                <span>${Number(p.price).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="ui-card lg:col-span-1 space-y-3">
          <h2 className="text-sm font-medium">Open trades</h2>
          {(trades || []).map((t: {
            id: string; type: string; entryPrice: string; takeProfit: string;
            stopLoss: string; leverage: number; pair: { symbol: string };
          }) => (
            <div key={t.id} className="p-3 rounded-btn bg-tertiary border border-border text-xs">
              <div className="flex justify-between mb-2">
                <span className="font-medium">{t.pair.symbol}</span>
                <span className={t.type === 'LONG' ? 'text-profit' : 'text-loss'}>{t.type}</span>
              </div>
              <p>Entry: {t.entryPrice} · TP: {t.takeProfit} · SL: {t.stopLoss} · {t.leverage}x</p>
              <button className="btn-primary !h-8 !text-xs mt-2 w-full" onClick={() => setTradeId(t.id)}>
                Join Trade
              </button>
            </div>
          ))}
        </div>

        <div className="ui-card">
          <h2 className="text-sm font-medium mb-3">My open orders</h2>
          <div className="space-y-2 text-xs">
            {(orders || []).map((o: {
              id: string; margin: string; entryPrice: string; status: string;
              trade: { pair: { symbol: string }; type: string };
            }) => (
              <div key={o.id} className="flex justify-between py-2 border-b border-border/50">
                <span>{o.trade.pair.symbol} {o.trade.type}</span>
                <span>{o.margin} USDT</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {tradeId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ui-card max-w-sm w-full">
            <h3 className="font-medium mb-4">Join trade</h3>
            <label className="ui-label">Margin (USDT)</label>
            <input className="ui-input mb-4" value={margin} onChange={(e) => setMargin(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setTradeId(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={() => place.mutate()} disabled={place.isPending}>
                Confirm
              </button>
            </div>
            {place.isError && <p className="text-loss text-xs mt-2">{(place.error as Error).message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
