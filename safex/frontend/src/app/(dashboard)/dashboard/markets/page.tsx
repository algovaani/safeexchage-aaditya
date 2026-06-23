'use client';

import { usePrices } from '@/hooks/usePrices';

export default function MarketsPage() {
  const prices = usePrices();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-medium">Markets</h1>
      <div className="ui-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-text-secondary text-left border-b border-border">
              <th className="pb-3 font-normal">Pair</th>
              <th className="pb-3 font-normal">Price</th>
              <th className="pb-3 font-normal">24h %</th>
              <th className="pb-3 font-normal">High</th>
              <th className="pb-3 font-normal">Low</th>
              <th className="pb-3 font-normal">Volume</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p) => {
              const ch = parseFloat(p.change24h);
              return (
                <tr key={p.symbol} className="border-b border-border/50">
                  <td className="py-3 font-medium">{p.symbol}</td>
                  <td className="py-3">${Number(p.price).toLocaleString()}</td>
                  <td className={`py-3 ${ch >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {ch >= 0 ? '+' : ''}{ch.toFixed(2)}%
                  </td>
                  <td className="py-3 text-text-secondary">{Number(p.high).toLocaleString()}</td>
                  <td className="py-3 text-text-secondary">{Number(p.low).toLocaleString()}</td>
                  <td className="py-3 text-text-secondary">{Number(p.volume).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
