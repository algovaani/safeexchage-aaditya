'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, unwrap } from '@/lib/api';

const PLAN_DETAILS: Record<number, { monthly: string; multiplier: string }> = {
  365: { monthly: '5%–12%', multiplier: 'Up to 5×' },
  548: { monthly: '10%–20%', multiplier: 'Up to 10×' },
  730: { monthly: '10%–25%', multiplier: 'Up to 20×' },
  1095: { monthly: '10%–30%', multiplier: 'Up to 30×' },
};

export default function StakingPage() {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const { data: plans } = useQuery<any>({
    queryKey: ['staking-plans'],
    queryFn: async () => unwrap(await api.get('/staking/plans')),
  });

  const { data: stakes } = useQuery<any>({
    queryKey: ['my-stakes'],
    queryFn: async () => unwrap(await api.get('/staking/my')),
  });

  const stake = useMutation({
    mutationFn: async () => unwrap(await api.post('/staking/stake', { planId, amount: Number(amount) })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-stakes'] }); setPlanId(null); },
  });

  const withdraw = useMutation({
    mutationFn: async ({ id, early }: { id: string; early?: boolean }) =>
      unwrap(await api.post(`/staking/withdraw/${id}`, { early })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-stakes'] }),
  });

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-medium">Staking</h1>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {(plans || []).map((p: {
          id: string; name: string; apy: string; lockDays: number;
          minAmount: string; maxAmount: string; allowEarlyExit: boolean;
        }) => {
          const details = PLAN_DETAILS[p.lockDays];
          return (
            <div key={p.id} className="ui-card">
              <div className="flex justify-between mb-3">
                <h3 className="font-medium">{p.name}</h3>
                <span className="text-amber text-sm font-medium">{details?.monthly || `${p.apy}%`}</span>
              </div>
              <p className="text-text-secondary text-xs mb-1">Monthly returns</p>
              <p className="text-text-secondary text-xs mb-1">Lock: {p.lockDays} days</p>
              <p className="text-text-secondary text-xs mb-1">
                At maturity: {details?.multiplier || 'Bonus rewards'}
              </p>
              <p className="text-text-secondary text-xs mb-4">{p.minAmount} – {p.maxAmount} USDT</p>
              <button className="btn-primary w-full !h-9" onClick={() => setPlanId(p.id)}>Stake Now</button>
            </div>
          );
        })}
      </div>

      <div className="ui-card overflow-x-auto">
        <h2 className="text-sm font-medium mb-4">My Stakes</h2>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-secondary text-left border-b border-border">
              <th className="pb-2">Plan</th><th>Amount</th><th>Reward</th><th>Status</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(stakes || []).map((s: {
              id: string; amount: string; reward: string; status: string;
              plan: { name: string; allowEarlyExit: boolean };
            }) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-2">{s.plan.name}</td>
                <td>{s.amount}</td>
                <td className="text-profit">{s.reward}</td>
                <td>{s.status}</td>
                <td>
                  {s.status === 'MATURED' && (
                    <button className="text-accent" onClick={() => withdraw.mutate({ id: s.id })}>Withdraw</button>
                  )}
                  {s.status === 'ACTIVE' && s.plan.allowEarlyExit && (
                    <button className="text-loss" onClick={() => withdraw.mutate({ id: s.id, early: true })}>Early Exit</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {planId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="ui-card max-w-sm w-full">
            <h3 className="font-medium mb-4">Stake amount</h3>
            <input className="ui-input mb-4" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setPlanId(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={() => stake.mutate()}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
