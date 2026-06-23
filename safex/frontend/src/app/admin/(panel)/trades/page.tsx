'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';
import { usePrices } from '@/hooks/usePrices';

export default function AdminTradesPage() {
  const prices = usePrices();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    pairId: '', type: 'LONG', entryPrice: '', takeProfit: '', stopLoss: '', leverage: 10,
  });

  const { data: pairs } = useQuery<any>({
    queryKey: ['admin-pairs'],
    queryFn: async () => unwrap(await api.get('/admin/pairs')),
  });

  const { data: trades } = useQuery<any>({
    queryKey: ['admin-trades'],
    queryFn: async () => unwrap(await api.get('/admin/trades')),
  });

  const create = useMutation({
    mutationFn: async () => unwrap(await api.post('/admin/trades', {
      ...form,
      entryPrice: Number(form.entryPrice),
      takeProfit: Number(form.takeProfit),
      stopLoss: Number(form.stopLoss),
    })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-trades'] }); setOpen(false); },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <h1 className="text-xl font-medium">Trade Setup</h1>
        <button className="btn-primary !h-9" onClick={() => setOpen(true)}>Create Trade</button>
      </div>
      <div className="ui-card overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">Pair</th><th>Dir</th><th>Entry</th><th>TP</th><th>SL</th><th>Lev</th><th>Orders</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(trades || []).map((t: {
              id: string; type: string; entryPrice: string; takeProfit: string;
              stopLoss: string; leverage: number; status: string; pair: { symbol: string };
              _count: { orders: number };
            }) => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-2">{t.pair.symbol}</td>
                <td className={t.type === 'LONG' ? 'text-profit' : 'text-loss'}>{t.type}</td>
                <td>{t.entryPrice}</td>
                <td>{t.takeProfit}</td>
                <td>{t.stopLoss}</td>
                <td>{t.leverage}x</td>
                <td>{t._count.orders}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ui-card max-w-md w-full space-y-3">
            <h3 className="font-medium">Create trade</h3>
            <select className="ui-input" value={form.pairId} onChange={(e) => setForm({ ...form, pairId: e.target.value })}>
              <option value="">Select pair</option>
              {(pairs || []).map((p: { id: string; symbol: string }) => {
                const live = prices.find((x) => x.symbol === p.symbol);
                return (
                  <option key={p.id} value={p.id}>
                    {p.symbol} {live ? `@ ${live.price}` : ''}
                  </option>
                );
              })}
            </select>
            <div className="flex gap-2">
              {(['LONG', 'SHORT'] as const).map((t) => (
                <button
                  key={t}
                  className={`flex-1 py-2 rounded-btn text-xs ${form.type === t ? (t === 'LONG' ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss') : 'bg-tertiary'}`}
                  onClick={() => setForm({ ...form, type: t })}
                >
                  {t}
                </button>
              ))}
            </div>
            <input className="ui-input" placeholder="Entry price" value={form.entryPrice} onChange={(e) => setForm({ ...form, entryPrice: e.target.value })} />
            <input className="ui-input" placeholder="Take profit" value={form.takeProfit} onChange={(e) => setForm({ ...form, takeProfit: e.target.value })} />
            <input className="ui-input" placeholder="Stop loss" value={form.stopLoss} onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} />
            <input type="range" min={1} max={100} value={form.leverage} onChange={(e) => setForm({ ...form, leverage: Number(e.target.value) })} />
            <p className="text-xs">Leverage: {form.leverage}x</p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={() => create.mutate()}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
