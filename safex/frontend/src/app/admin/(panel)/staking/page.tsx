'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function AdminStakingPage() {
  const { data: stakes } = useQuery<any>({
    queryKey: ['admin-stakes'],
    queryFn: async () => unwrap(await api.get('/admin/staking/stakes')),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Staking</h1>
      <div className="ui-card overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">User</th><th>Plan</th><th>Amount</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(stakes || []).map((s: {
              id: string; amount: string; status: string;
              user: { email: string }; plan: { name: string };
            }) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-2">{s.user.email}</td>
                <td>{s.plan.name}</td>
                <td>{s.amount}</td>
                <td>{s.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
