'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, unwrap, type WalletBalance } from '@/lib/api';

export default function WalletPage() {
  const { data: balance } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: async () => unwrap(await api.get('/wallet/balance')),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Wallet</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <div className="ui-card">
          <p className="text-text-secondary text-xs uppercase mb-1">Available</p>
          <p className="text-2xl font-medium">{balance?.balance ?? '0'} USDT</p>
        </div>
        <div className="ui-card">
          <p className="text-text-secondary text-xs uppercase mb-1">Locked</p>
          <p className="text-2xl font-medium">{balance?.lockedBalance ?? '0'} USDT</p>
        </div>
        <div className="ui-card flex items-center justify-center">
          <Link href="/dashboard/wallet/deposit" className="btn-primary no-underline">Deposit funds</Link>
        </div>
      </div>
    </div>
  );
}
