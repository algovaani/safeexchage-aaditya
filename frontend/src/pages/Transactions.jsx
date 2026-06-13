import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { api, parseApiResponse } from '../api/client.js';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { fmtINR, inrFromUsdt } from '../utils/format.js';

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/wallet/transactions');
        const list = parseApiResponse(data);
        setTxs(Array.isArray(list) ? list : []);
      } catch {
        setTxs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Reports</h1>
        <p className="text-sm text-text-secondary">Transaction history and fund movements</p>
      </div>

      <div className="ui-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : txs.length ? (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>TxID</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t._id}>
                    <td><StatusBadge status={t.type} /></td>
                    <td>USDT</td>
                    <td className="tabular-nums">{fmtINR(inrFromUsdt(t.amount))}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td className="text-text-secondary text-xs tabular-nums">
                      {new Date(t.createdAt).toLocaleString()}
                    </td>
                    <td className="font-mono text-xs text-text-muted">
                      {(t._id || '').slice(-8)}…
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <Inbox size={32} className="mb-3 opacity-40" />
            <p>No transactions yet</p>
            <Link to="/wallet" className="text-accent text-sm mt-2">Go to wallet</Link>
          </div>
        )}
      </div>
    </div>
  );
}
