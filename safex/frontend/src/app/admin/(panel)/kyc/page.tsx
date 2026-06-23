'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';

export default function AdminKycPage() {
  const [status, setStatus] = useState('PENDING');
  const [selected, setSelected] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data } = useQuery<any>({
    queryKey: ['admin-kyc', status],
    queryFn: async () => unwrap(await api.get('/admin/kyc', { params: { status } })),
  });

  const { data: detail } = useQuery<any>({
    queryKey: ['admin-kyc-detail', selected],
    queryFn: async () => unwrap(await api.get(`/admin/kyc/${selected}`)),
    enabled: !!selected,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => unwrap(await api.post(`/admin/kyc/${id}/approve`)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-kyc'] }); setSelected(null); },
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      unwrap(await api.post(`/admin/kyc/${id}/reject`, { reason })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-kyc'] }); setSelected(null); },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">KYC Review</h1>
      <div className="flex gap-2">
        {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
          <button key={s} className={`px-3 py-1 text-xs rounded-btn ${status === s ? 'bg-tertiary' : ''}`} onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>
      <div className="ui-card overflow-x-auto text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">User</th><th>Email</th><th>Doc</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items || []).map((k: { id: string; status: string; documentType: string; user: { name: string; email: string } }) => (
              <tr key={k.id} className="border-b border-border/50 cursor-pointer hover:bg-tertiary/50" onClick={() => setSelected(k.id)}>
                <td className="py-2">{k.user.name}</td>
                <td>{k.user.email}</td>
                <td>{k.documentType}</td>
                <td>{k.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && detail && (
        <div className="fixed inset-y-0 right-0 w-full max-w-md bg-secondary border-l border-border p-6 z-50 overflow-auto">
          <button className="text-text-secondary mb-4" onClick={() => setSelected(null)}>Close</button>
          <h2 className="font-medium mb-2">{detail.user.name}</h2>
          <p className="text-xs text-text-secondary mb-4">{detail.user.email}</p>
          <div className="space-y-2 text-xs mb-6">
            {detail.documentFront && <a href={detail.documentFront} target="_blank" className="text-accent block">Document front</a>}
            {detail.selfieUrl && <a href={detail.selfieUrl} target="_blank" className="text-accent block">Selfie</a>}
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1 !bg-profit" onClick={() => approve.mutate(selected)}>Approve</button>
            <button className="btn-primary flex-1 !bg-loss" onClick={() => reject.mutate({ id: selected, reason: 'Documents unclear' })}>Reject</button>
          </div>
        </div>
      )}
    </div>
  );
}
