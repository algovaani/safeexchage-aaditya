'use client';

import { useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function AdminUsersPage() {
  const { data } = useQuery<any>({
    queryKey: ['admin-users'],
    queryFn: async () => unwrap(await api.get('/admin/users')),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Users</h1>
      <div className="ui-card overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">Name</th><th>Email</th><th>KYC</th><th>Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((u: {
              id: string; name: string; email: string; status: string;
              kyc: { status: string } | null; wallet: { balance: string } | null;
            }) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="py-2">{u.name || '—'}</td>
                <td>{u.email}</td>
                <td>{u.kyc?.status || '—'}</td>
                <td>{u.wallet?.balance ?? 0}</td>
                <td>{u.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
