import { useCallback, useEffect, useState } from 'react';
import {
  Coins,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api, parseApiResponse } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDialog } from '../../context/DialogContext.jsx';

const CHAINS = [
  { value: 'ethereum', label: 'Ethereum (ERC-20)' },
  { value: 'bsc', label: 'BNB Chain (BEP-20)' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'base', label: 'Base' },
];

function notifyPairsUpdated() {
  window.dispatchEvent(new Event('trading-pairs:updated'));
}

export default function TradingPairsAdminSection() {
  const toast = useToast();
  const dialog = useDialog();
  const [pairs, setPairs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [contractAddr, setContractAddr] = useState('');
  const [contractChain, setContractChain] = useState('ethereum');
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);

  const loadPairs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/trading-pairs', { params: { include_inactive: '1' } });
      setPairs(parseApiResponse(data) || []);
    } catch (ex) {
      toast.error(ex.message || 'Failed to load pairs');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  async function runSearch(e) {
    e?.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) return;
    setSearchBusy(true);
    try {
      const { data } = await api.get('/admin/trading-pairs/coins/search', { params: { q } });
      setSearchResults(parseApiResponse(data) || []);
    } catch (ex) {
      toast.error(ex.message || 'Search failed');
    } finally {
      setSearchBusy(false);
    }
  }

  async function previewContract(e) {
    e.preventDefault();
    setPreviewBusy(true);
    setPreview(null);
    try {
      const { data } = await api.get('/admin/trading-pairs/coins/contract', {
        params: { address: contractAddr.trim(), chain: contractChain },
      });
      setPreview(parseApiResponse(data));
    } catch (ex) {
      toast.error(ex.message || 'Contract lookup failed');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function previewFromSearch(coin) {
    setPreviewBusy(true);
    setPreview(null);
    try {
      const { data } = await api.get('/admin/trading-pairs/coins/coingecko', { params: { id: coin.coingeckoId } });
      setPreview(parseApiResponse(data));
    } catch (ex) {
      toast.error(ex.message || 'Failed to resolve coin');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function addPreview() {
    if (!preview?.symbol) return;
    setAddBusy(true);
    try {
      const body = preview.coingeckoId
        ? { coingecko_id: preview.coingeckoId, price_source: preview.priceSource }
        : {
            contract_address: preview.contractAddress,
            contract_chain: preview.contractChain || contractChain,
            price_source: preview.priceSource,
          };
      await api.post('/admin/trading-pairs', body);
      toast.success(`${preview.displayPair || preview.symbol} added to exchange`);
      setPreview(null);
      setContractAddr('');
      setSearchResults([]);
      await loadPairs();
      notifyPairsUpdated();
    } catch (ex) {
      toast.error(ex.message || 'Failed to add pair');
    } finally {
      setAddBusy(false);
    }
  }

  async function togglePair(pair) {
    try {
      await api.patch(`/admin/trading-pairs/${pair.id}`, { is_active: !pair.isActive });
      await loadPairs();
      notifyPairsUpdated();
    } catch (ex) {
      toast.error(ex.message || 'Update failed');
    }
  }

  async function removePair(pair) {
    const ok = await dialog.confirm({
      title: 'Remove trading pair',
      message: `Remove ${pair.displayPair} from the exchange? Users will no longer see this pair.`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/trading-pairs/${pair.id}`);
      toast.success('Pair removed');
      await loadPairs();
      notifyPairsUpdated();
    } catch (ex) {
      toast.error(ex.message || 'Delete failed');
    }
  }

  return (
    <div className="admin-coins">
      <div className="admin-coins__hero">
        <p className="admin-coins__intro">
          Add coins to the exchange watchlist. Search CoinGecko or paste a contract address — CMC lookup first,
          then CoinGecko. Charts use Binance when listed; otherwise CoinGecko is used automatically.
        </p>
        <div className="admin-coins__stats">
          <div className="admin-coins__stat">
            <span className="admin-coins__stat-value">{pairs.length}</span>
            <span className="admin-coins__stat-label">Total pairs</span>
          </div>
          <div className="admin-coins__stat">
            <span className="admin-coins__stat-value">{pairs.filter((p) => p.isActive).length}</span>
            <span className="admin-coins__stat-label">Active</span>
          </div>
          <div className="admin-coins__stat">
            <span className="admin-coins__stat-value">{pairs.filter((p) => p.priceSource === 'coingecko').length}</span>
            <span className="admin-coins__stat-label">CoinGecko</span>
          </div>
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="admin-card admin-coins__panel">
          <div className="admin-coins__panel-head">
            <span className="admin-coins__panel-icon admin-coins__panel-icon--search">
              <Search size={18} />
            </span>
            <div>
              <h2>Search CoinGecko</h2>
              <p className="admin-coins__panel-sub">Find by coin name or symbol</p>
            </div>
          </div>
          <form className="admin-coins__search" onSubmit={runSearch}>
            <input
              className="admin-input"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="e.g. Bitcoin, PEPE, Chainlink…"
            />
            <button type="submit" className="admin-btn admin-btn--primary" disabled={searchBusy || searchQ.trim().length < 2}>
              {searchBusy ? <Loader2 size={16} className="admin-spin" /> : <Search size={16} />}
              Search
            </button>
          </form>
          <p className="admin-coins__hint">Minimum 2 characters to search</p>
          <ul className="admin-coins__results">
            {searchResults.map((c) => (
              <li key={c.coingeckoId}>
                <span className="admin-coins__coin-icon">
                  {c.thumb ? <img src={c.thumb} alt="" width={28} height={28} /> : c.symbol?.slice(0, 2)}
                </span>
                <span className="admin-coins__coin-meta">
                  <strong>{c.name}</strong>
                  <small>{c.symbol}{c.marketCapRank ? ` · #${c.marketCapRank}` : ''}</small>
                </span>
                <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => previewFromSearch(c)}>
                  Select
                </button>
              </li>
            ))}
            {!searchBusy && searchQ.length >= 2 && !searchResults.length && (
              <li className="admin-coins__empty">No coins found for &ldquo;{searchQ}&rdquo;</li>
            )}
          </ul>
        </div>

        <div className="admin-card admin-coins__panel">
          <div className="admin-coins__panel-head">
            <span className="admin-coins__panel-icon admin-coins__panel-icon--contract">
              <Link2 size={18} />
            </span>
            <div>
              <h2>Add by contract</h2>
              <p className="admin-coins__panel-sub">CMC lookup, then CoinGecko fallback</p>
            </div>
          </div>
          <form className="admin-coins__contract" onSubmit={previewContract}>
            <label className="admin-label" htmlFor="contract-addr">Contract address</label>
            <input
              id="contract-addr"
              className="admin-input admin-input--mono"
              value={contractAddr}
              onChange={(e) => setContractAddr(e.target.value)}
              placeholder="0x8dB27FB78c89975202f550697cE8Acb2E74B2469"
            />
            <label className="admin-label" htmlFor="contract-chain">Chain</label>
            <select id="contract-chain" className="admin-input" value={contractChain} onChange={(e) => setContractChain(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <button type="submit" className="admin-btn admin-btn--primary admin-coins__lookup-btn" disabled={previewBusy || !contractAddr.trim()}>
              {previewBusy ? <><Loader2 size={16} className="admin-spin" /> Looking up…</> : 'Lookup token'}
            </button>
          </form>
        </div>
      </div>

      {preview && (
        <div className="admin-card admin-coins__preview">
          <div className="admin-coins__preview-head">
            {preview.imageUrl ? (
              <img src={preview.imageUrl} alt="" className="admin-coins__preview-img" width={40} height={40} />
            ) : (
              <span className="admin-coins__panel-icon admin-coins__panel-icon--preview">
                <Coins size={20} />
              </span>
            )}
            <div>
              <h3>Confirm add to exchange</h3>
              <p className="admin-coins__panel-sub">{preview.displayPair || preview.symbol}</p>
            </div>
          </div>
          <div className="admin-coins__preview-grid">
            <div className="admin-coins__preview-item">
              <span>Name</span>
              <strong>{preview.name}</strong>
            </div>
            <div className="admin-coins__preview-item">
              <span>Price source</span>
              <span className={`admin-coins__tag admin-coins__tag--${preview.priceSource || 'coingecko'}`}>
                {preview.priceSource || 'coingecko'}
              </span>
            </div>
            <div className="admin-coins__preview-item">
              <span>Binance listed</span>
              <strong>{preview.binanceListed ? 'Yes' : 'No — CoinGecko charts'}</strong>
            </div>
            {preview.coingeckoId && (
              <div className="admin-coins__preview-item">
                <span>CoinGecko ID</span>
                <code>{preview.coingeckoId}</code>
              </div>
            )}
            {preview.contractAddress && (
              <div className="admin-coins__preview-item admin-coins__preview-item--wide">
                <span>Contract</span>
                <code>{preview.contractAddress}</code>
              </div>
            )}
          </div>
          <div className="admin-actions admin-coins__preview-actions">
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setPreview(null)}>Cancel</button>
            <button type="button" className="admin-btn admin-btn--primary" disabled={addBusy} onClick={addPreview}>
              {addBusy ? (
                <><Loader2 size={16} className="admin-spin" /> Adding…</>
              ) : (
                <><Plus size={16} /> Add to exchange</>
              )}
            </button>
          </div>
        </div>
      )}

      <div className="admin-card admin-coins__table-card">
        <div className="admin-coins__panel-head admin-coins__panel-head--table">
          <span className="admin-coins__panel-icon admin-coins__panel-icon--list">
            <TrendingUp size={18} />
          </span>
          <div>
            <h2>Exchange pairs</h2>
            <p className="admin-coins__panel-sub">{pairs.length} pair{pairs.length !== 1 ? 's' : ''} configured</p>
          </div>
        </div>
        {loading ? (
          <div className="admin-coins__loading">
            <Loader2 size={24} className="admin-spin" />
            <span>Loading pairs…</span>
          </div>
        ) : pairs.length === 0 ? (
          <p className="admin-coins__empty admin-coins__empty--block">No pairs yet — add one above.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-coins__table">
              <thead>
                <tr>
                  <th>Pair</th>
                  <th>Name</th>
                  <th>Source</th>
                  <th>CoinGecko</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((p) => (
                  <tr key={p.id || p.symbol} className={!p.isActive ? 'admin-coins__row--hidden' : ''}>
                    <td><strong className="admin-coins__pair">{p.displayPair}</strong></td>
                    <td>{p.name || p.baseAsset}</td>
                    <td>
                      <span className={`admin-coins__tag admin-coins__tag--${p.priceSource || 'binance'}`}>
                        {p.priceSource || 'binance'}
                      </span>
                    </td>
                    <td><code className="admin-coins__cg-id">{p.coingeckoId || '—'}</code></td>
                    <td>
                      <span className={`admin-badge ${p.isActive ? 'admin-badge--approved' : 'admin-badge--pending'}`}>
                        {p.isActive ? 'Active' : 'Hidden'}
                      </span>
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => togglePair(p)}>
                          {p.isActive ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                        </button>
                        {!String(p.id).startsWith('default-') && (
                          <button type="button" className="admin-btn admin-btn--danger admin-btn--sm" onClick={() => removePair(p)} title="Remove">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
