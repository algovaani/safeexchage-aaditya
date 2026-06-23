'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function AdminSettingsPage() {
  const { data } = useQuery<any>({
    queryKey: ['admin-settings'],
    queryFn: async () => unwrap(await api.get('/admin/settings')),
  });

  return (
    <div className="ui-card max-w-lg space-y-4">
      <h1 className="text-xl font-medium">Platform Settings</h1>
      <div className="text-sm space-y-2">
        <p><span className="text-text-secondary">USDT Address:</span> {data?.usdtAddress}</p>
        <p><span className="text-text-secondary">Bank:</span> {data?.bankName} — {data?.bankAccount}</p>
        <p><span className="text-text-secondary">Maintenance:</span> {String(data?.maintenanceMode)}</p>
      </div>
    </div>
  );
}
