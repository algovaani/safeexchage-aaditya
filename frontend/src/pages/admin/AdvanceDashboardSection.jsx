import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, parseApiResponse } from '../../api/client.js';
import AdminDataTable from '../../components/AdminDataTable.jsx';

function formatMoney(val) {
  const n = Number(val || 0);
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PnLBadge({ amount }) {
  const n = Number(amount || 0);
  const isPos = n > 0;
  const isNeg = n < 0;
  const cls = isPos ? 'admin-pnl--pos' : isNeg ? 'admin-pnl--neg' : 'admin-pnl--zero';
  const prefix = isPos ? '+' : '';
  return <span className={`admin-pnl-pill ${cls}`}>{prefix}${formatMoney(n)}</span>;
}

export default function AdvanceDashboardSection() {
  const [period, setPeriod] = useState('all'); // 'all' | 'today' | 'weekly' | 'monthly' | 'custom'
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('trades'); // 'trades' | 'funds' | 'leaderboard'

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/admin/dashboard/advance?period=${period}`;
      if (period === 'custom') {
        if (startDate) url += `&startDate=${startDate}`;
        if (endDate) url += `&endDate=${endDate}`;
      }

      const res = await api.get(url);
      const payload = res?.data;

      if (payload && (payload.success || payload.data)) {
        setData(payload.data || payload);
      } else {
        setError(payload?.message || payload?.error || 'Failed to fetch advance dashboard stats');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Server error loading analytics');
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const overview = data?.overview || {};
  const counts = data?.counts || {};
  const tradesBySymbol = data?.tradesBySymbol || [];
  const tradesList = data?.tradesList || [];
  const fundMovements = data?.fundMovements || [];
  const leaderboards = data?.leaderboards || {};

  // Search filtered items
  const filteredTrades = useMemo(() => {
    if (!searchQuery.trim()) return tradesList;
    const q = searchQuery.toLowerCase();
    return tradesList.filter((t) => {
      const email = t.user?.email || '';
      const mobile = t.user?.mobile || '';
      const name = t.user?.name || '';
      const sym = t.symbol || '';
      const cat = t.category || '';
      return (
        email.toLowerCase().includes(q) ||
        mobile.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        sym.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q)
      );
    });
  }, [tradesList, searchQuery]);

  const filteredFunds = useMemo(() => {
    if (!searchQuery.trim()) return fundMovements;
    const q = searchQuery.toLowerCase();
    return fundMovements.filter((f) => {
      const email = f.user?.email || '';
      const mobile = f.user?.mobile || '';
      const name = f.user?.name || '';
      const type = f.type || '';
      const method = f.method || '';
      const txn = f.txnHash || '';
      return (
        email.toLowerCase().includes(q) ||
        mobile.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        type.toLowerCase().includes(q) ||
        method.toLowerCase().includes(q) ||
        txn.toLowerCase().includes(q)
      );
    });
  }, [fundMovements, searchQuery]);

  // Trade Table Columns
  const tradeColumns = [
    {
      header: 'User',
      accessor: (row) => (
        <div>
          {row.user?.id ? (
            <Link to={`/admin/users/${row.user.id}`} className="admin-link font-medium">
              {row.user.email || row.user.mobile || row.user.name || 'User'}
            </Link>
          ) : (
            <span className="text-gray-400">—</span>
          )}
          {row.user?.name && <div className="text-xs text-gray-400">{row.user.name}</div>}
        </div>
      ),
    },
    {
      header: 'Category / Symbol',
      accessor: (row) => (
        <div>
          <span className="font-semibold">{row.symbol}</span>
          <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-200">
            {row.category}
          </span>
        </div>
      ),
    },
    {
      header: 'Side / Lev',
      accessor: (row) => (
        <div>
          <span
            className={`font-semibold text-xs px-2 py-0.5 rounded ${
              row.side === 'BUY' || row.side === 'LONG'
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {row.side}
          </span>
          <span className="ml-2 text-xs text-gray-400">{row.leverage}x</span>
        </div>
      ),
    },
    {
      header: 'Margin / Vol',
      accessor: (row) => (
        <div>
          <div className="font-medium">${formatMoney(row.margin)}</div>
          <div className="text-xs text-gray-400">Vol: ${formatMoney(row.volume)}</div>
        </div>
      ),
    },
    {
      header: 'Entry / Close Price',
      accessor: (row) => (
        <div className="text-xs font-mono">
          <div>In: ${formatMoney(row.entryPrice)}</div>
          {row.closePrice ? <div>Out: ${formatMoney(row.closePrice)}</div> : <div>Out: —</div>}
        </div>
      ),
    },
    {
      header: 'Profit / Loss',
      accessor: (row) => <PnLBadge amount={row.pnl} />,
    },
    {
      header: 'Status',
      accessor: (row) => (
        <span
          className={`capitalize text-xs px-2 py-0.5 rounded ${
            row.status === 'open'
              ? 'bg-blue-500/20 text-blue-400'
              : row.status === 'closed' || row.status === 'filled'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-gray-500/20 text-gray-400'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      header: 'Time',
      accessor: (row) => <span className="text-xs text-gray-400">{formatDate(row.createdAt)}</span>,
    },
  ];

  // Fund Movement Table Columns
  const fundColumns = [
    {
      header: 'User',
      accessor: (row) => (
        <div>
          {row.user?.id ? (
            <Link to={`/admin/users/${row.user.id}`} className="admin-link font-medium">
              {row.user.email || row.user.mobile || row.user.name || 'User'}
            </Link>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      ),
    },
    {
      header: 'Type',
      accessor: (row) => (
        <span
          className={`font-semibold text-xs px-2.5 py-1 rounded uppercase tracking-wider ${
            row.type === 'deposit'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}
        >
          {row.type === 'deposit' ? '⬇ Deposit' : '⬆ Withdraw'}
        </span>
      ),
    },
    {
      header: 'Amount',
      accessor: (row) => (
        <div className="font-bold text-base">
          ${formatMoney(row.amount)} <span className="text-xs font-normal text-gray-400">{row.currency}</span>
        </div>
      ),
    },
    {
      header: 'Method / Details',
      accessor: (row) => (
        <div>
          <span className="text-xs uppercase px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">
            {row.method}
          </span>
          <div className="text-xs font-mono text-gray-400 truncate max-w-[150px]" title={row.txnHash}>
            {row.txnHash}
          </div>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <span
          className={`text-xs px-2.5 py-0.5 rounded-full capitalize font-medium ${
            row.status === 'approved'
              ? 'bg-green-500/20 text-green-400'
              : row.status === 'pending'
              ? 'bg-yellow-500/20 text-yellow-400 animate-pulse'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {row.status}
        </span>
      ),
    },
    {
      header: 'Time',
      accessor: (row) => <span className="text-xs text-gray-400">{formatDate(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="advance-dashboard">
      {/* Top Filter & Control Header */}
      <div className="advance-header card">
        <div className="advance-header__left">
          <div className="advance-header__title-wrap">
            <span className="advance-header__icon">🚀</span>
            <div>
              <h2 className="advance-header__title">Advance System Analytics</h2>
              <p className="advance-header__subtitle">
                Track full system profit & loss, trades, deposits & withdrawals by custom date range
              </p>
            </div>
          </div>
        </div>

        <div className="advance-header__controls">
          {/* Time Filter Tabs */}
          <div className="advance-filter-pills" role="tablist">
            <button
              type="button"
              className={`filter-btn ${period === 'all' ? 'active' : ''}`}
              onClick={() => setPeriod('all')}
            >
              All Time
            </button>
            <button
              type="button"
              className={`filter-btn ${period === 'today' ? 'active' : ''}`}
              onClick={() => setPeriod('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`filter-btn ${period === 'weekly' ? 'active' : ''}`}
              onClick={() => setPeriod('weekly')}
            >
              Weekly
            </button>
            <button
              type="button"
              className={`filter-btn ${period === 'monthly' ? 'active' : ''}`}
              onClick={() => setPeriod('monthly')}
            >
              Monthly
            </button>
            <button
              type="button"
              className={`filter-btn ${period === 'custom' ? 'active' : ''}`}
              onClick={() => setPeriod('custom')}
            >
              Custom Date
            </button>
          </div>

          <button
            type="button"
            className="admin-btn admin-btn--ghost flex items-center gap-1.5"
            onClick={fetchStats}
            title="Refresh statistics"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Custom Date Pickers */}
      {period === 'custom' && (
        <div className="advance-custom-date card fade-in">
          <div className="custom-date-grid">
            <div className="date-field">
              <label htmlFor="startDate">From Date:</label>
              <input
                id="startDate"
                type="date"
                className="admin-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="date-field">
              <label htmlFor="endDate">To Date:</label>
              <input
                id="endDate"
                type="date"
                className="admin-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="date-action">
              <button type="button" className="admin-btn admin-btn--primary" onClick={fetchStats}>
                Apply Custom Filter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error / Loading Indicators */}
      {error && (
        <div className="admin-alert admin-alert--error mb-4">
          <span>⚠️ {error}</span>
          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={fetchStats}>
            Retry
          </button>
        </div>
      )}

      {loading && !data && (
        <div className="advance-loading card">
          <div className="spinner mb-2" />
          <p>Calculating system loss/profit, trades & fund movements...</p>
        </div>
      )}

      {/* Main Analytical Dashboard Content */}
      {data && (
        <>
          {/* Key Metric Cards */}
          <div className="advance-kpi-grid">
            {/* System Net PnL Card */}
            <div className={`advance-kpi-card ${overview.netSystemPnL >= 0 ? 'kpi-pos' : 'kpi-neg'}`}>
              <div className="kpi-top">
                <span className="kpi-label">System Net P&L (Revenue)</span>
                <span className="kpi-badge">{period.toUpperCase()}</span>
              </div>
              <div className="kpi-val">${formatMoney(overview.netSystemPnL)}</div>
              <div className="kpi-sub">
                <span>User Profit: <strong className="text-green-400">${formatMoney(overview.totalUserProfit)}</strong></span>
                <span className="mx-1">·</span>
                <span>User Loss: <strong className="text-red-400">${formatMoney(overview.totalUserLoss)}</strong></span>
              </div>
            </div>

            {/* Trades Executed & Volume */}
            <div className="advance-kpi-card">
              <div className="kpi-top">
                <span className="kpi-label">Trades Executed</span>
                <span className="kpi-icon">⚡</span>
              </div>
              <div className="kpi-val">{overview.totalTradesCount}</div>
              <div className="kpi-sub">
                <span>Total Volume: <strong>${formatMoney(overview.totalTradeVolume)}</strong></span>
                {overview.totalTradingFees > 0 && (
                  <>
                    <span className="mx-1">·</span>
                    <span>Fees: <strong className="text-amber-400">${formatMoney(overview.totalTradingFees)}</strong></span>
                  </>
                )}
              </div>
            </div>

            {/* Total Deposits (Fund In) */}
            <div className="advance-kpi-card kpi-deposit">
              <div className="kpi-top">
                <span className="kpi-label">Funds Added (Deposits)</span>
                <span className="kpi-icon">⬇</span>
              </div>
              <div className="kpi-val text-emerald-400">${formatMoney(overview.totalDepositsApproved)}</div>
              <div className="kpi-sub">
                <span>Approved: <strong>{counts.approvedDepositCount}</strong></span>
                <span className="mx-1">·</span>
                <span>Pending: <strong className="text-yellow-400">${formatMoney(overview.totalDepositsPending)} ({counts.pendingDepositCount})</strong></span>
              </div>
            </div>

            {/* Total Withdrawals (Fund Out) */}
            <div className="advance-kpi-card kpi-withdraw">
              <div className="kpi-top">
                <span className="kpi-label">Funds Withdrawn</span>
                <span className="kpi-icon">⬆</span>
              </div>
              <div className="kpi-val text-amber-400">${formatMoney(overview.totalWithdrawalsApproved)}</div>
              <div className="kpi-sub">
                <span>Approved: <strong>{counts.approvedWithdrawalCount}</strong></span>
                <span className="mx-1">·</span>
                <span>Net Inflow: <strong className={overview.netFundInflow >= 0 ? 'text-green-400' : 'text-red-400'}>${formatMoney(overview.netFundInflow)}</strong></span>
              </div>
            </div>
          </div>

          {/* Visual Graphs & Symbol Volume Breakdown */}
          <div className="advance-charts-grid">
            {/* Asset Trading Breakdown Card */}
            <div className="advance-chart-card card">
              <h3 className="chart-title">Trading Breakdown by Asset (Kis par trade laga)</h3>
              {tradesBySymbol.length === 0 ? (
                <div className="chart-empty">No trades recorded in this timeframe</div>
              ) : (
                <div className="symbol-list">
                  {tradesBySymbol.map((s) => {
                    const maxVol = Math.max(...tradesBySymbol.map((t) => t.volume), 1);
                    const pct = Math.min(100, Math.round((s.volume / maxVol) * 100));
                    return (
                      <div key={s.symbol} className="symbol-item">
                        <div className="symbol-item__info">
                          <span className="symbol-name">{s.symbol}</span>
                          <span className="symbol-stats">
                            {s.count} trades · Volume: <strong>${formatMoney(s.volume)}</strong>
                          </span>
                        </div>
                        <div className="symbol-bar-wrap">
                          <div className="symbol-bar" style={{ width: `${Math.max(pct, 4)}%` }} />
                        </div>
                        <div className="symbol-pnl-strip">
                          <span className="text-green-400 text-xs">Profit: +${formatMoney(s.userProfit)}</span>
                          <span className="text-red-400 text-xs">Loss: -${formatMoney(s.userLoss)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fund Inflow vs Outflow Visual Gauge */}
            <div className="advance-chart-card card">
              <h3 className="chart-title">Fund Movement Flow (Deposits vs Withdrawals)</h3>
              <div className="fund-flow-widget">
                <div className="flow-metric">
                  <div className="flow-box bg-emerald-500/10 border border-emerald-500/30">
                    <span className="flow-box__title">Total Deposits In</span>
                    <span className="flow-box__val text-emerald-400">${formatMoney(overview.totalDepositsApproved)}</span>
                    <span className="flow-box__sub">{counts.approvedDepositCount} Approved txns</span>
                  </div>
                  <div className="flow-box bg-amber-500/10 border border-amber-500/30">
                    <span className="flow-box__title">Total Withdrawals Out</span>
                    <span className="flow-box__val text-amber-400">${formatMoney(overview.totalWithdrawalsApproved)}</span>
                    <span className="flow-box__sub">{counts.approvedWithdrawalCount} Approved txns</span>
                  </div>
                </div>

                <div className="flow-bar-container">
                  {overview.totalDepositsApproved + overview.totalWithdrawalsApproved > 0 ? (
                    (() => {
                      const total = overview.totalDepositsApproved + overview.totalWithdrawalsApproved;
                      const depPct = Math.round((overview.totalDepositsApproved / total) * 100);
                      const withPct = 100 - depPct;
                      return (
                        <>
                          <div className="flow-bar">
                            <div className="flow-bar__deposit" style={{ width: `${depPct}%` }} title={`Deposits: ${depPct}%`} />
                            <div className="flow-bar__withdraw" style={{ width: `${withPct}%` }} title={`Withdrawals: ${withPct}%`} />
                          </div>
                          <div className="flex justify-between text-xs font-semibold mt-1">
                            <span className="text-emerald-400">Deposits ({depPct}%)</span>
                            <span className="text-amber-400">Withdrawals ({withPct}%)</span>
                          </div>
                        </>
                      );
                    })()
                  ) : (
                    <div className="text-center text-xs text-gray-400 py-3">No deposits/withdrawals in selected range</div>
                  )}
                </div>

                <div className="net-inflow-banner">
                  <span>Net Platform Fund Inflow:</span>
                  <strong className={`text-lg ml-2 ${overview.netFundInflow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${formatMoney(overview.netFundInflow)}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs for Detailed Logs & Leaderboard */}
          <div className="advance-tabs-card card">
            <div className="advance-tabs-header">
              <div className="advance-tab-buttons" role="tablist">
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'trades' ? 'active' : ''}`}
                  onClick={() => setActiveTab('trades')}
                >
                  ⚡ Trade Logs ({filteredTrades.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'funds' ? 'active' : ''}`}
                  onClick={() => setActiveTab('funds')}
                >
                  💳 Deposit & Withdrawal History ({filteredFunds.length})
                </button>
                <button
                  type="button"
                  className={`tab-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
                  onClick={() => setActiveTab('leaderboard')}
                >
                  🏆 Top Users Leaderboard
                </button>
              </div>

              <div className="advance-search-box">
                <input
                  type="text"
                  placeholder="Search user, symbol, txn..."
                  className="admin-input admin-input--sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Tab 1: Trade Logs Table */}
            {activeTab === 'trades' && (
              <div className="advance-tab-body">
                <AdminDataTable
                  columns={tradeColumns}
                  data={filteredTrades}
                  emptyMessage="No trades found matching the current timeframe and filter"
                />
              </div>
            )}

            {/* Tab 2: Fund Movement Table */}
            {activeTab === 'funds' && (
              <div className="advance-tab-body">
                <AdminDataTable
                  columns={fundColumns}
                  data={filteredFunds}
                  emptyMessage="No deposit or withdrawal requests found in this timeframe"
                />
              </div>
            )}

            {/* Tab 3: Leaderboard */}
            {activeTab === 'leaderboard' && (
              <div className="advance-leaderboard-grid">
                {/* Top Volume Traders */}
                <div className="leaderboard-card">
                  <h4 className="leaderboard-title">🔥 Top Traders by Volume</h4>
                  {leaderboards.topTradersByVolume?.length > 0 ? (
                    <div className="leaderboard-list">
                      {leaderboards.topTradersByVolume.map((u, i) => (
                        <div key={u.user?.id || i} className="leaderboard-row">
                          <span className="rank">{i + 1}</span>
                          <div className="user-info">
                            <Link to={`/admin/users/${u.user?.id}`} className="admin-link font-medium">
                              {u.user?.email || u.user?.mobile || u.user?.name || 'User'}
                            </Link>
                            <div className="text-xs text-gray-400">{u.tradeCount} trades</div>
                          </div>
                          <div className="vol-info">
                            <div className="font-bold">${formatMoney(u.volume)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 p-4">No trader data available</div>
                  )}
                </div>

                {/* Top PnL Earners */}
                <div className="leaderboard-card">
                  <h4 className="leaderboard-title">💎 Top Profit Earners</h4>
                  {leaderboards.topTradersByPnL?.length > 0 ? (
                    <div className="leaderboard-list">
                      {leaderboards.topTradersByPnL.map((u, i) => (
                        <div key={u.user?.id || i} className="leaderboard-row">
                          <span className="rank">{i + 1}</span>
                          <div className="user-info">
                            <Link to={`/admin/users/${u.user?.id}`} className="admin-link font-medium">
                              {u.user?.email || u.user?.mobile || u.user?.name || 'User'}
                            </Link>
                            <div className="text-xs text-gray-400">Vol: ${formatMoney(u.volume)}</div>
                          </div>
                          <div className="vol-info">
                            <PnLBadge amount={u.pnl} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 p-4">No P&L data available</div>
                  )}
                </div>

                {/* Top Fund Depositors */}
                <div className="leaderboard-card">
                  <h4 className="leaderboard-title">🏦 Top Fund Depositors</h4>
                  {leaderboards.topFunders?.length > 0 ? (
                    <div className="leaderboard-list">
                      {leaderboards.topFunders.map((u, i) => (
                        <div key={u.user?.id || i} className="leaderboard-row">
                          <span className="rank">{i + 1}</span>
                          <div className="user-info">
                            <Link to={`/admin/users/${u.user?.id}`} className="admin-link font-medium">
                              {u.user?.email || u.user?.mobile || u.user?.name || 'User'}
                            </Link>
                          </div>
                          <div className="vol-info">
                            <div className="font-bold text-emerald-400">${formatMoney(u.depositTotal)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 p-4">No deposit data available</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
