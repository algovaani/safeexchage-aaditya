'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap, type WalletBalance } from '@/lib/api';

export default function DashboardPage() {
  const { data, isLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return unwrap(res);
    },
  });

  const stats = [
    { label: 'Total Balance', value: isLoading ? '…' : `${data?.balance ?? '0'} USDT` },
    { label: "Today's P&L", value: '—', colored: true },
    { label: 'Active Orders', value: '0' },
    { label: 'Staking Rewards', value: '0 USDT' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-medium">Dashboard</h1>
        <p className="text-text-secondary text-sm">Portfolio overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="ui-card !p-5">
            <p className="text-[11px] uppercase tracking-wider text-text-secondary mb-2">{s.label}</p>
            <p className={`text-xl font-medium ${s.colored ? 'text-profit' : ''}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="ui-card">
        <h2 className="text-sm font-medium mb-2">Getting started</h2>
        <p className="text-text-secondary text-sm">
          Complete KYC, deposit funds, and join admin-published trades from the Trade page.
          Additional modules (staking, market WebSocket, order engine) are wired on the backend roadmap.
        </p>
      </div>
    </div>
  );
}
