'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function AdminDashboardPage() {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['admin-dashboard'],
    queryFn: async () => unwrap(await api.get('/admin/dashboard')),
  });

  const cards = [
    { label: 'Total Users', value: data?.totalUsers },
    { label: 'KYC Pending', value: data?.kycPending },
    { label: 'Total Deposits', value: data?.totalDeposits ? `${data.totalDeposits} USDT` : '0' },
    { label: 'Active Trades', value: data?.activeTrades },
    { label: 'Active Stakes', value: data?.activeStakes },
    { label: 'Platform Revenue', value: data?.platformRevenue },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Admin Dashboard</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="ui-card !p-4">
            <p className="text-[11px] uppercase text-text-secondary mb-1">{c.label}</p>
            <p className="text-xl font-medium">{isLoading ? '…' : c.value ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
