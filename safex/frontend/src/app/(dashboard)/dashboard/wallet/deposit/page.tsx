'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { api, unwrap } from '@/lib/api';

export default function DepositPage() {
  const [tab, setTab] = useState<'crypto' | 'fiat'>('crypto');
  const qc = useQueryClient();

  const { data: platform } = useQuery<any>({
    queryKey: ['platform-info'],
    queryFn: async () => unwrap(await api.get('/deposits/platform-info')),
  });

  const { data: deposits } = useQuery<any>({
    queryKey: ['my-deposits'],
    queryFn: async () => unwrap(await api.get('/deposits/my')),
  });

  const [cryptoForm, setCryptoForm] = useState({ txHash: '', amount: '' });
  const [fiatForm, setFiatForm] = useState({ amount: '', bankName: '', accountNumber: '', utrNumber: '' });
  const [proof, setProof] = useState<File | null>(null);

  const cryptoDeposit = useMutation({
    mutationFn: async () =>
      unwrap(await api.post('/deposits/crypto', {
        ...cryptoForm,
        amount: Number(cryptoForm.amount),
        walletAddress: platform?.usdtAddress,
      })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-deposits'] }),
  });

  const fiatDeposit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('amount', fiatForm.amount);
      fd.append('bankName', fiatForm.bankName);
      fd.append('accountNumber', fiatForm.accountNumber);
      fd.append('utrNumber', fiatForm.utrNumber);
      if (proof) fd.append('paymentProof', proof);
      const res = await api.post('/deposits/fiat', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      return unwrap(res);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-deposits'] }),
  });

  const addr = platform?.usdtAddress || '—';

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Deposit</h1>
      <div className="flex gap-2">
        {(['crypto', 'fiat'] as const).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 rounded-btn text-sm capitalize ${tab === t ? 'bg-tertiary border border-accent/40' : 'btn-secondary !h-9'}`}
            onClick={() => setTab(t)}
          >
            {t} Deposit
          </button>
        ))}
      </div>

      {tab === 'crypto' && (
        <div className="ui-card max-w-lg space-y-4">
          <p className="text-xs text-amber">Only send USDT (TRC20) to this address</p>
          <div className="flex items-center gap-2 p-3 bg-tertiary rounded-btn text-xs">
            <span className="flex-1 truncate">USDT (TRC20): {addr}</span>
            <button onClick={() => navigator.clipboard.writeText(addr)}><Copy size={14} /></button>
          </div>
          <input className="ui-input" placeholder="Transaction Hash" value={cryptoForm.txHash} onChange={(e) => setCryptoForm({ ...cryptoForm, txHash: e.target.value })} />
          <input className="ui-input" placeholder="Amount" value={cryptoForm.amount} onChange={(e) => setCryptoForm({ ...cryptoForm, amount: e.target.value })} />
          <button className="btn-primary" onClick={() => cryptoDeposit.mutate()}>Submit</button>
        </div>
      )}

      {tab === 'fiat' && (
        <div className="ui-card max-w-lg space-y-4">
          <div className="p-3 bg-tertiary rounded-btn text-xs space-y-1">
            <p>Bank: {platform?.bankName}</p>
            <p>Account: {platform?.bankAccount}</p>
            <p>IFSC: {platform?.bankIfsc}</p>
          </div>
          <input className="ui-input" placeholder="Amount" value={fiatForm.amount} onChange={(e) => setFiatForm({ ...fiatForm, amount: e.target.value })} />
          <input className="ui-input" placeholder="Your Bank Name" value={fiatForm.bankName} onChange={(e) => setFiatForm({ ...fiatForm, bankName: e.target.value })} />
          <input className="ui-input" placeholder="Account Number" value={fiatForm.accountNumber} onChange={(e) => setFiatForm({ ...fiatForm, accountNumber: e.target.value })} />
          <input className="ui-input" placeholder="UTR / Reference" value={fiatForm.utrNumber} onChange={(e) => setFiatForm({ ...fiatForm, utrNumber: e.target.value })} />
          <input type="file" accept="image/*,.pdf" onChange={(e) => setProof(e.target.files?.[0] || null)} />
          <p className="text-xs text-text-secondary">Deposits approved within 2–4 business hours</p>
          <button className="btn-primary" onClick={() => fiatDeposit.mutate()}>Submit</button>
        </div>
      )}

      <div className="ui-card overflow-x-auto">
        <h2 className="text-sm font-medium mb-4">Deposit History</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-secondary border-b border-border">
              <th className="text-left pb-2">Type</th><th>Amount</th><th>Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>
            {(deposits || []).map((d: { id: string; type: string; amount: string; status: string; createdAt: string }) => (
              <tr key={d.id} className="border-b border-border/50">
                <td className="py-2">{d.type}</td>
                <td>{d.amount} USDT</td>
                <td>{d.status}</td>
                <td className="text-text-secondary">{new Date(d.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
