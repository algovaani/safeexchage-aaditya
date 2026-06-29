import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { api, parseApiResponse } from '../api/client.js';
import { TRADING_PAIR_SYMBOLS } from '../config/tradingPairs.js';
import { MARKET_POLL_MS } from '../config/marketPoll.js';
import DataTable from '../components/DataTable.jsx';
import { fmtINR, fmtPct, inrFromUsdt } from '../utils/format.js';
import './Markets.css';

const CATEGORIES = ['All', 'Crypto', 'Stocks', 'Forex', 'Commodities'];
const CRYPTO_SYMBOLS = TRADING_PAIR_SYMBOLS;

const STOCK_MOCK = [
  { symbol: 'NIFTY', name: 'Nifty 50', price: 24850.3, change: 0.42, volume: '12.4B', cap: '—', type: 'stock' },
  { symbol: 'SENSEX', name: 'BSE Sensex', price: 81432.15, change: -0.18, volume: '8.1B', cap: '—', type: 'stock' },
  { symbol: 'RELIANCE', name: 'Reliance', price: 2945.5, change: 1.22, volume: '2.1B', cap: '19.8T', type: 'stock' },
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

function formatPrice(row) {
  return row.type === 'crypto' ? fmtINR(inrFromUsdt(row.price)) : `₹ ${row.price.toLocaleString()}`;
}

function AssetCell({ row }) {
  return (
    <div className="markets-dt__asset">
      <span className="markets-dt__icon">{row.symbol.slice(0, 2)}</span>
      <div className="min-w-0">
        <p className="markets-dt__name">{row.name}</p>
        <p className="markets-dt__symbol">{row.symbol}</p>
      </div>
    </div>
  );
}

export default function Markets() {
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('volume');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

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

        setRows([...crypto, ...STOCK_MOCK]);
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

  const columns = useMemo(
    () => [
      {
        key: 'rank',
        label: '#',
        mobileLabel: '#',
        render: (_row, index) => index + 1,
      },
      {
        key: 'asset',
        label: 'Asset',
        sortable: true,
        sortValue: (row) => row.symbol,
        render: (row) => <AssetCell row={row} />,
      },
      {
        key: 'price',
        label: 'Price',
        sortable: true,
        sortValue: (row) => row.price,
        render: (row) => <span className="font-mono tabular-nums">{formatPrice(row)}</span>,
      },
      {
        key: 'change',
        label: '24h Change',
        sortable: true,
        sortValue: (row) => row.change,
        render: (row) => {
          const up = row.change >= 0;
          return (
            <span className={`inline-flex items-center gap-1 ${up ? 'text-profit' : 'text-loss'}`}>
              {up ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {fmtPct(row.change)}
            </span>
          );
        },
      },
      {
        key: 'volume',
        label: '24h Volume',
        sortable: true,
        sortValue: (row) => row.volume,
        render: (row) => <span className="text-text-secondary">{row.volume}</span>,
      },
      {
        key: 'cap',
        label: 'Market Cap',
        render: (row) => <span className="text-text-secondary">{row.cap}</span>,
      },
      {
        key: 'trend',
        label: '7D',
        mobileLabel: '7D Trend',
        render: (row) => <MiniSparkline up={row.change >= 0} />,
      },
      {
        key: 'action',
        label: 'Action',
        render: () => (
          <Link to="/trade" className="btn-outline-accent no-underline">
            Trade
          </Link>
        ),
      },
    ],
    []
  );

  return (
    <div className="markets-page space-y-5 md:space-y-6">
      <div>
        <h1 className="text-lg md:text-xl font-medium text-text-primary mb-1">Markets</h1>
        <p className="text-sm text-text-secondary">Browse and trade global assets</p>
      </div>

      <div className="markets-page__toolbar">
        <div className="markets-page__categories">
          <div className="tab-row !inline-flex">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`!flex-none${category === c ? ' is-active' : ''}`}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="markets-page__filters">
          <div className="markets-page__search-wrap">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              placeholder="Search assets…"
              className="ui-input !pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="ui-input markets-page__sort"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="volume">Sort by Volume</option>
            <option value="change">Sort by Change</option>
          </select>
        </div>
      </div>

      <div className="ui-card p-0 overflow-hidden">
        <DataTable
          columns={columns}
          data={filtered}
          loading={loading}
          rowKey="symbol"
          emptyMessage="No assets match your filters"
          defaultPageSize={20}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );
}
