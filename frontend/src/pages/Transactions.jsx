import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Transactions() {
  const [txs, setTxs] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/wallet/transactions');
        setTxs(data);
      } catch {
        setTxs([]);
      }
    })();
  }, []);

  return (
    <div className="ex-page">
      <h1 className="ex-page__title">Transactions</h1>
      <p className="ex-muted">Deposit and withdrawal history.</p>

      <div className="ex-table-wrap" style={{ marginTop: '1rem' }}>
        <table className="ex-asset-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date &amp; time</th>
            </tr>
          </thead>
          <tbody>
            {txs.map((t) => (
              <tr key={t._id}>
                <td>{t.type}</td>
                <td>{t.amount}</td>
                <td>{t.status}</td>
                <td>{new Date(t.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {!txs.length && (
              <tr>
                <td colSpan={4} className="ex-muted">
                  No transactions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
