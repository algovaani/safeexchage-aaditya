'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function HistoryPage() {
  const [tab, setTab] = useState('deposits');

  const { data: deposits } = useQuery<Array<{ id: string; type: string; amount: string; status: string; createdAt: string }>>({
    queryKey: ['hist-deposits'],
    queryFn: async () => unwrap(await api.get('/deposits/my')),
    enabled: tab === 'deposits',
  });

  const { data: orders } = useQuery<Array<{ id: string; status: string; margin: string; pnl: string | null; trade: { pair: { symbol: string } } }>>({
    queryKey: ['hist-orders'],
    queryFn: async () => unwrap(await api.get('/orders/my')),
    enabled: tab === 'trades',
  });

  const { data: stakes } = useQuery<Array<{ id: string; amount: string; reward: string; status: string; plan: { name: string } }>>({
    queryKey: ['hist-stakes'],
    queryFn: async () => unwrap(await api.get('/staking/my')),
    enabled: tab === 'stakes',
  });

  const { data: txs } = useQuery<{ items: Array<{ id: string; type: string; amount: string; reason: string; createdAt: string }> }>({
    queryKey: ['hist-txs'],
    queryFn: async () => unwrap(await api.get('/dashboard/transactions')),
    enabled: tab === 'transactions',
  });

  const tabs = ['deposits', 'trades', 'stakes', 'transactions'] as const;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-medium">History</h1>
        <button className="btn-secondary !h-8 !text-xs">Export CSV</button>
      </div>
      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            className={`px-3 py-1.5 rounded-btn text-xs capitalize ${tab === t ? 'bg-tertiary' : 'text-text-secondary'}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="ui-card overflow-x-auto text-xs">
        {tab === 'deposits' && (
          <table className="w-full">
            <tbody>
              {(deposits || []).map((d: { id: string; type: string; amount: string; status: string; createdAt: string }) => (
                <tr key={d.id} className="border-b border-border/50">
                  <td className="py-2">{d.type}</td><td>{d.amount}</td><td>{d.status}</td>
                  <td>{new Date(d.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'trades' && (
          <table className="w-full">
            <tbody>
              {(orders || []).map((o: { id: string; status: string; margin: string; pnl: string | null; trade: { pair: { symbol: string } } }) => (
                <tr key={o.id} className="border-b border-border/50">
                  <td className="py-2">{o.trade.pair.symbol}</td><td>{o.margin}</td><td>{o.pnl ?? '—'}</td><td>{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'stakes' && (
          <table className="w-full">
            <tbody>
              {(stakes || []).map((s: { id: string; amount: string; reward: string; status: string; plan: { name: string } }) => (
                <tr key={s.id} className="border-b border-border/50">
                  <td className="py-2">{s.plan.name}</td><td>{s.amount}</td><td>{s.reward}</td><td>{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'transactions' && (
          <table className="w-full">
            <tbody>
              {(txs?.items || []).map((t: { id: string; type: string; amount: string; reason: string; createdAt: string }) => (
                <tr key={t.id} className="border-b border-border/50">
                  <td className="py-2">{t.type}</td><td>{t.amount}</td><td>{t.reason}</td>
                  <td>{new Date(t.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
