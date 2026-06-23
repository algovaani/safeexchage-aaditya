'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/lib/api';

export default function AdminDepositsPage() {
  const qc = useQueryClient();
  const { data: stats } = useQuery<any>({
    queryKey: ['deposit-stats'],
    queryFn: async () => unwrap(await api.get('/admin/deposits/stats')),
  });
  const { data } = useQuery<any>({
    queryKey: ['admin-deposits'],
    queryFn: async () => unwrap(await api.get('/admin/deposits')),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => unwrap(await api.post(`/admin/deposits/${id}/approve`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-deposits'] }),
  });

  const reject = useMutation({
    mutationFn: async (id: string) => unwrap(await api.post(`/admin/deposits/${id}/reject`, { adminNote: 'Invalid proof' })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-deposits'] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Deposits</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="ui-card !p-4"><p className="text-xs text-text-secondary">Pending</p><p className="text-xl">{stats?.pending ?? 0}</p></div>
        <div className="ui-card !p-4"><p className="text-xs text-text-secondary">Approved Today</p><p className="text-xl">{stats?.approvedToday ?? 0}</p></div>
        <div className="ui-card !p-4"><p className="text-xs text-text-secondary">Total Volume</p><p className="text-xl">{stats?.totalVolume ?? 0}</p></div>
      </div>
      <div className="ui-card overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">User</th><th>Type</th><th>Amount</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((d: { id: string; type: string; amount: string; status: string; user: { email: string } }) => (
              <tr key={d.id} className="border-b border-border/50">
                <td className="py-2">{d.user.email}</td>
                <td>{d.type}</td>
                <td>{d.amount}</td>
                <td>{d.status}</td>
                <td className="space-x-2">
                  {d.status === 'PENDING' && (
                    <>
                      <button className="text-profit" onClick={() => approve.mutate(d.id)}>Approve</button>
                      <button className="text-loss" onClick={() => reject.mutate(d.id)}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
