import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { api, parseApiResponse } from '../api/client.js';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
import { MARKET_POLL_MS } from '../config/marketPoll.js';
import { fmtINR, fmtPct, inrFromUsdt } from '../utils/format.js';

const CATEGORIES = ['All', 'Crypto', 'Stocks', 'Forex', 'Commodities'];
const CRYPTO_SYMBOLS = TRADING_PAIR_SYMBOLS;

const STOCK_MOCK = [
  { symbol: 'NIFTY', name: 'Nifty 50', price: 24850.3, change: 0.42, volume: '12.4B', cap: '—' },
  { symbol: 'SENSEX', name: 'BSE Sensex', price: 81432.15, change: -0.18, volume: '8.1B', cap: '—' },
  { symbol: 'RELIANCE', name: 'Reliance', price: 2945.5, change: 1.22, volume: '2.1B', cap: '19.8T' },
];

function MiniSparkline({ up }) {
  const color = up ? '#22c55e' : '#ef4444';
  return (
    <svg width="64" height="24" viewBox="0 0 64 24" aria-hidden>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={up ? '0,18 12,14 24,16 36,8 48,10 64,4' : '0,6 12,10 24,8 36,16 48,14 64,20'}
      />
    </svg>
  );
}

export default function Markets() {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('volume');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const perPage = 8;

  useEffect(() => {
    let active = true;

    async function loadCryptoPrices() {
      try {
        const { data } = await api.get('/market/prices/live');
        if (!active) return;
        const payload = parseApiResponse(data);
        const pairs = payload?.pairs || [];
        const bySymbol = new Map(pairs.map((p) => [p.symbol, p]));

        const crypto = CRYPTO_SYMBOLS.map((sym) => {
          const row = bySymbol.get(sym);
          if (!row) return null;
          return {
            symbol: sym.replace('USDT', ''),
            name: sym.replace('USDT', ''),
            price: Number(row.price ?? 0),
            change: Number(row.change_24h ?? 0),
            volume: row.volume ? `${(Number(row.volume) / 1e6).toFixed(1)}M` : '—',
            cap: '—',
            type: 'crypto',
          };
        }).filter(Boolean);

        setRows([...crypto, ...STOCK_MOCK.map((s) => ({ ...s, type: 'stock' }))]);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadCryptoPrices().catch(() => {
      if (active) setLoading(false);
    });
    const id = setInterval(() => loadCryptoPrices().catch(() => {}), MARKET_POLL_MS);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (category === 'Crypto') list = list.filter((r) => r.type === 'crypto');
    else if (category === 'Stocks') list = list.filter((r) => r.type === 'stock');
    else if (category !== 'All') list = [];

    const q = search.trim().toUpperCase();
    if (q) list = list.filter((r) => r.symbol.includes(q) || r.name.toUpperCase().includes(q));

    if (sort === 'volume') {
      list = [...list].sort((a, b) => String(b.volume).localeCompare(String(a.volume)));
    } else if (sort === 'change') {
      list = [...list].sort((a, b) => b.change - a.change);
    }
    return list;
  }, [rows, category, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-text-primary mb-1">Markets</h1>
        <p className="text-sm text-text-secondary">Browse and trade global assets</p>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        <div className="tab-row !inline-flex flex-wrap">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`!flex-none px-4${category === c ? ' is-active' : ''}`}
              onClick={() => { setCategory(c); setPage(1); }}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex gap-3 ml-auto w-full lg:w-auto">
          <div className="relative flex-1 lg:w-56">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              placeholder="Search assets…"
              className="ui-input !pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          <select
            className="ui-input !w-auto"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="volume">Sort by Volume</option>
            <option value="change">Sort by Change</option>
          </select>
        </div>
      </div>

      <div className="ui-card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>24h Change</th>
                  <th>24h Volume</th>
                  <th>Market Cap</th>
                  <th>7D</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, i) => {
                  const up = r.change >= 0;
                  return (
                    <tr key={r.symbol}>
                      <td className="text-text-muted">{(page - 1) * perPage + i + 1}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-[10px] font-medium text-accent">
                            {r.symbol.slice(0, 2)}
                          </span>
                          <div>
                            <p className="font-medium text-sm">{r.name}</p>
                            <p className="text-xs text-text-muted">{r.symbol}</p>
                          </div>
                        </div>
                      </td>
                      <td className="font-mono tabular-nums">
                        {r.type === 'crypto' ? fmtINR(inrFromUsdt(r.price)) : `₹ ${r.price.toLocaleString()}`}
                      </td>
                      <td>
                        <span className={`inline-flex items-center gap-1 ${up ? 'text-profit' : 'text-loss'}`}>
                          {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                          {fmtPct(r.change)}
                        </span>
                      </td>
                      <td className="text-text-secondary">{r.volume}</td>
                      <td className="text-text-secondary">{r.cap}</td>
                      <td><MiniSparkline up={up} /></td>
                      <td>
                        <Link to="/trade" className="btn-outline-accent no-underline">Trade</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !pageRows.length && (
          <div className="empty-state py-12">No assets match your filters</div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-border text-sm text-text-secondary">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary !h-8 !text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <button type="button" className="btn-secondary !h-8 !text-xs" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
