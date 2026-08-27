import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { api, parseApiResponse } from '../api/client.js';
import { useTradingPairs } from '../context/TradingPairsContext.jsx';
import { LIST_MARKET_POLL_MS } from '../config/marketPoll.js';
import DataTable from '../components/DataTable.jsx';
import CoinIcon from '../components/CoinIcon.jsx';
import { fmtINR, fmtPct } from '../utils/format.js';
import { usePlatformConfig } from '../context/PlatformConfigContext.jsx';
import { acquireMarketSocket, releaseMarketSocket } from '../services/appSocket.js';
import { readSwrSync, writeSwrSync, SwrKeys } from '../utils/swrCache.js';
import './Markets.css';

const CATEGORIES = ['All', 'Crypto'];

const COMMODITY_DEFAULTS = [];

function isCommodityPair(meta, liveRow) {
  return (
    meta?.category === 'commodity' ||
    meta?.quoteAsset === 'INR' ||
    meta?.priceSource === 'commodity_inr' ||
    liveRow?.category === 'commodity' ||
    liveRow?.provider === 'commodity_inr' ||
    String(meta?.symbol || liveRow?.symbol || '').endsWith('INR')
  );
}

function formatCompactUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function mapLiveRow(liveRow, tradingPairs) {
  const sym = liveRow.symbol;
  const meta = tradingPairs.find((p) => p.symbol === sym);
  const commodity = isCommodityPair(meta, liveRow);
  const quoteVol = Number(liveRow.quoteVolume ?? liveRow.volume ?? 0) || 0;
  const marketCap = Number(liveRow.marketCap ?? liveRow.market_cap ?? 0) || 0;
  const sortOrder = Number(meta?.sortOrder ?? liveRow.sortOrder ?? 9999);

  if (commodity) {
    return {
      symbol: meta?.baseAsset || sym.replace(/INR$/, ''),
      tradeSymbol: sym,
      name: meta?.name || liveRow.name || sym.replace(/INR$/, ''),
      price: Number(liveRow.price_inr ?? liveRow.price ?? 0),
      change: Number(liveRow.change_24h ?? 0),
      volume: '—',
      volumeRaw: 0,
      cap: '—',
      capRaw: 0,
      sortOrder,
      type: 'commodity',
      unit: meta?.unit || liveRow.unit || 'g',
      imageUrl: meta?.imageUrl || '',
      coingeckoId: meta?.coingeckoId || '',
    };
  }

  return {
    symbol: meta?.baseAsset || sym.replace(/USDT$/, ''),
    tradeSymbol: sym,
    name: meta?.name || meta?.baseAsset || sym.replace(/USDT$/, ''),
    price: Number(liveRow.price ?? 0),
    change: Number(liveRow.change_24h ?? 0),
    volume: formatCompactUsd(quoteVol),
    volumeRaw: quoteVol,
    cap: formatCompactUsd(marketCap),
    capRaw: marketCap,
    sortOrder,
    type: 'crypto',
    imageUrl: meta?.imageUrl || '',
    coingeckoId: meta?.coingeckoId || '',
  };
}

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

function formatPrice(row, toInr) {
  if (!row.price) return '—';
  if (row.type === 'commodity') return fmtINR(row.price);
  if (row.type === 'crypto') return fmtINR(toInr(row.price));
  return '—';
}

function AssetIcon({ row }) {
  return (
    <CoinIcon
      symbol={row.symbol}
      imageUrl={row.imageUrl}
      coingeckoId={row.coingeckoId}
      type={row.type}
      name={row.name}
      size={32}
      className="markets-dt__icon"
    />
  );
}

function AssetCell({ row }) {
  return (
    <div className="markets-dt__asset">
      <AssetIcon row={row} />
      <div className="min-w-0">
        <p className="markets-dt__name">{row.name}</p>
        <p className="markets-dt__symbol">
          {row.type === 'commodity' ? `${row.symbol}/INR · per ${row.unit || 'g'}` : row.symbol}
        </p>
      </div>
    </div>
  );
}

export default function Markets() {
  const { toInr } = usePlatformConfig();
  const { pairs: tradingPairs } = useTradingPairs();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('order');
  const cachedLive = readSwrSync(SwrKeys.livePrices);
  const initialRows = (() => {
    const pairs = cachedLive?.data?.pairs;
    if (!Array.isArray(pairs) || !pairs.length) return [];
    return pairs.map((row) => mapLiveRow(row, tradingPairs || []));
  })();
  const [rows, setRows] = useState(initialRows);
  const [loading, setLoading] = useState(!initialRows.length);

  useEffect(() => {
    let active = true;

    async function fetchCommodityPrice(symbol) {
      try {
        const { data } = await api.get(`/market/prices/${symbol}`);
        return parseApiResponse(data);
      } catch {
        return null;
      }
    }

    async function loadPrices() {
      try {
        const { data } = await api.get('/market/prices/live');
        if (!active) return;

        const payload = parseApiResponse(data);
        const livePairs = payload?.pairs || [];
        writeSwrSync(SwrKeys.livePrices, { pairs: livePairs, updatedAt: payload?.updatedAt });
        const bySymbol = new Map(livePairs.map((p) => [p.symbol, p]));

        const nextRows = livePairs.map((row) => mapLiveRow(row, tradingPairs));

        const missing = COMMODITY_DEFAULTS.filter(
          (c) => !nextRows.some((r) => r.tradeSymbol === c.tradeSymbol)
        );

        if (missing.length) {
          const tickers = await Promise.all(
            missing.map(async (commodity) => {
              const live = bySymbol.get(commodity.tradeSymbol);
              if (live) return mapLiveRow(live, tradingPairs);
              const ticker = await fetchCommodityPrice(commodity.tradeSymbol);
              return {
                ...commodity,
                price: Number(ticker?.price_inr ?? ticker?.price ?? 0),
                change: Number(ticker?.change_24h ?? 0),
              };
            })
          );
          if (!active) return;
          nextRows.push(...tickers.filter(Boolean));
        }

        if (active) setRows(nextRows);
      } catch {
        // Keep last good rows so the table does not go blank on transient errors
        if (!active) return;
        setRows((prev) => (prev.length ? prev : COMMODITY_DEFAULTS.map((c) => ({ ...c }))));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPrices().catch(() => {
      if (active) {
        setRows((prev) => (prev.length ? prev : COMMODITY_DEFAULTS.map((c) => ({ ...c }))));
        setLoading(false);
      }
    });

    const id = setInterval(() => loadPrices().catch(() => {}), LIST_MARKET_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [tradingPairs]);

  // Live pulse spikes on Markets list (same global socket as Trading)
  useEffect(() => {
    const socket = acquireMarketSocket();
    const onPulse = (payload) => {
      const sym = String(payload?.symbol || '').toUpperCase();
      const price = Number(payload?.price);
      if (!sym || !(price > 0)) return;
      setRows((prev) =>
        prev.map((r) =>
          String(r.tradeSymbol || '').toUpperCase() === sym ? { ...r, price } : r
        )
      );
    };
    const onPulseEnd = (payload) => {
      const sym = String(payload?.symbol || '').toUpperCase();
      const price = Number(payload?.price);
      if (!sym || !(price > 0)) return;
      setRows((prev) =>
        prev.map((r) =>
          String(r.tradeSymbol || '').toUpperCase() === sym ? { ...r, price } : r
        )
      );
    };
    socket.on('market:price:pulse', onPulse);
    socket.on('market:price:pulse:end', onPulseEnd);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('market:price:pulse', onPulse);
      socket.off('market:price:pulse:end', onPulseEnd);
      releaseMarketSocket();
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (category === 'Crypto') list = list.filter((r) => r.type === 'crypto');
    else if (category === 'Commodities') list = list.filter((r) => r.type === 'commodity');

    const q = search.trim().toUpperCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.symbol.toUpperCase().includes(q) ||
          r.name.toUpperCase().includes(q) ||
          String(r.tradeSymbol || '').toUpperCase().includes(q)
      );
    }

    if (sort === 'order') {
      list = [...list].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.symbol.localeCompare(b.symbol));
    } else if (sort === 'volume') {
      list = [...list].sort((a, b) => (b.volumeRaw || 0) - (a.volumeRaw || 0));
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
        render: (row) => <span className="font-mono tabular-nums">{formatPrice(row, toInr)}</span>,
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
        sortValue: (row) => row.volumeRaw,
        render: (row) => <span className="text-text-secondary">{row.volume}</span>,
      },
      {
        key: 'cap',
        label: 'Market Cap',
        sortable: true,
        sortValue: (row) => row.capRaw,
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
        render: (row) => (
          <Link
            to={row.tradeSymbol ? `/trade?symbol=${row.tradeSymbol}` : '/trade'}
            className="btn-outline-accent no-underline"
          >
            Trade
          </Link>
        ),
      },
    ],
    [toInr]
  );

  return (
    <div className="markets-page space-y-5 md:space-y-6">
      <div>
        <h1 className="text-lg md:text-xl font-medium text-text-primary mb-1">Markets</h1>
        <p className="text-sm text-text-secondary">Browse and trade crypto &amp; commodities  </p>
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
            <option value="order">Exchange order</option>
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
          rowKey="tradeSymbol"
          emptyMessage="No assets match your filters"
          defaultPageSize={20}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      </div>
    </div>
  );
}
