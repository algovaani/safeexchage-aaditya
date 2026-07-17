import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Coins,
  ImageUp,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Eye,
  EyeOff,
  X,
} from 'lucide-react';
import { api, parseApiResponse } from '../../services/api.js';
import { resolveAssetUrl } from '../../utils/assetUrl.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useDialog } from '../../context/DialogContext.jsx';
import { CoinLabel } from '../../components/CoinIcon.jsx';

const CHAINS = [
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bsc', label: 'BNB Chain' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
  { value: 'base', label: 'Base' },
  { value: 'solana', label: 'Solana' },
  { value: 'avalanche', label: 'Avalanche' },
];

const DEPOSIT_NETWORKS = [
  { value: '', label: '— Not configured —' },
  { value: 'BEP20', label: 'BNB Smart Chain (BEP20)' },
  { value: 'BNB', label: 'BNB' },
  { value: 'ERC20', label: 'Ethereum (ERC20)' },
  { value: 'ETH', label: 'ETH' },
  { value: 'TRC20', label: 'TRON (TRC20)' },
  { value: 'TRX', label: 'TRX' },
];

function notifyPairsUpdated() {
  window.dispatchEvent(new Event('trading-pairs:updated'));
}

function fmtUsd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1) return `$${v.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
  return `$${v.toPrecision(4)}`;
}

export default function TradingPairsAdminSection() {
  const toast = useToast();
  const dialog = useDialog();
  const [pairs, setPairs] = useState([]);
  const [pairsPage, setPairsPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState('search');
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [contractAddr, setContractAddr] = useState('');
  const [contractChain, setContractChain] = useState('ethereum');
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const logoInputRef = useRef(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [editForm, setEditForm] = useState({
    id: '',
    displayPair: '',
    baseAsset: '',
    name: '',
    imageUrl: '',
    depositWalletAddress: '',
    depositNetwork: '',
    depositEnabled: true,
  });

  const loadPairs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/trading-pairs', { params: { include_inactive: '1' } });
      setPairs(parseApiResponse(data) || []);
      setPairsPage(1);
    } catch (ex) {
      toast.error(ex.message || 'Failed to load pairs');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  useEffect(() => {
    if (!addOpen && !editOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !addBusy && !editBusy) {
        if (addOpen) {
          setAddOpen(false);
          setPreview(null);
          setSearchResults([]);
          setSearchQ('');
          setContractAddr('');
        }
        if (editOpen) setEditOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [addOpen, editOpen, addBusy, editBusy]);

  function openAddModal() {
    setAddOpen(true);
    setAddTab('search');
  }

  function closeAddModal() {
    if (addBusy) return;
    setAddOpen(false);
    setPreview(null);
    setSearchResults([]);
    setSearchQ('');
    setContractAddr('');
    setPreviewBusy(false);
  }

  function openEditModal(pair) {
    if (String(pair.id).startsWith('default-')) {
      toast.error('Seed pairs cannot be edited — add the coin from DexScreener first');
      return;
    }
    setLogoFile(null);
    setLogoPreview(resolveAssetUrl(pair.imageUrl || ''));
    setEditForm({
      id: pair.id,
      displayPair: pair.displayPair || pair.symbol,
      baseAsset: pair.baseAsset || '',
      name: pair.name || '',
      imageUrl: pair.imageUrl || '',
      depositWalletAddress: pair.depositWalletAddress || '',
      depositNetwork: pair.depositNetwork || '',
      depositEnabled: pair.depositEnabled !== false,
    });
    setEditOpen(true);
  }

  function closeEditModal() {
    if (editBusy) return;
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview('');
    setEditOpen(false);
  }

  function onLogoFilePick(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP, or GIF images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller');
      return;
    }
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  function clearLogoPick() {
    if (logoPreview?.startsWith('blob:')) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(resolveAssetUrl(editForm.imageUrl || ''));
    if (logoInputRef.current) logoInputRef.current.value = '';
  }

  async function saveEdit(e) {
    e?.preventDefault();
    if (!editForm.id) return;
    setEditBusy(true);
    try {
      if (logoFile) {
        const fd = new FormData();
        fd.append('logo', logoFile);
        await api.post(`/admin/trading-pairs/${editForm.id}/logo`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      await api.patch(`/admin/trading-pairs/${editForm.id}`, {
        name: editForm.name.trim(),
        deposit_wallet_address: editForm.depositWalletAddress.trim(),
        deposit_network: editForm.depositNetwork.trim(),
        deposit_enabled: editForm.depositEnabled,
      });
      toast.success(`${editForm.displayPair} updated`);
      closeEditModal();
      await loadPairs();
      notifyPairsUpdated();
    } catch (ex) {
      toast.error(ex.message || 'Failed to update coin');
    } finally {
      setEditBusy(false);
    }
  }

  async function runSearch(e) {
    e?.preventDefault();
    const q = searchQ.trim();
    if (q.length < 2) return;
    setSearchBusy(true);
    try {
      const { data } = await api.get('/admin/trading-pairs/coins/search', { params: { q } });
      setSearchResults(parseApiResponse(data) || []);
    } catch (ex) {
      toast.error(ex.message || 'DexScreener search failed');
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

  async function previewFromSearch(row) {
    setPreviewBusy(true);
    setPreview(null);
    try {
      if (row.dexPairAddress && row.dexChainId) {
        const { data } = await api.get('/admin/trading-pairs/coins/dex', {
          params: { chain: row.dexChainId, pair: row.dexPairAddress },
        });
        setPreview(parseApiResponse(data));
      } else {
        setPreview(row);
      }
    } catch (ex) {
      toast.error(ex.message || 'Failed to resolve pool');
    } finally {
      setPreviewBusy(false);
    }
  }

  async function addPreview() {
    if (!preview?.dexPairAddress && !preview?.contractAddress) {
      toast.error('Select a DexScreener pool first');
      return;
    }
    setAddBusy(true);
    try {
      const body = preview.dexPairAddress
        ? {
            dex_pair_address: preview.dexPairAddress,
            dex_chain_id: preview.dexChainId,
            price_source: preview.priceSource || 'dexscreener',
          }
        : {
            contract_address: preview.contractAddress,
            contract_chain: preview.contractChain || contractChain,
            price_source: preview.priceSource || 'dexscreener',
          };
      await api.post('/admin/trading-pairs', body);
      toast.success(`${preview.displayPair || preview.symbol} added to exchange`);
      setPreview(null);
      setContractAddr('');
      setSearchResults([]);
      setSearchQ('');
      setAddOpen(false);
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

  const PAGE_SIZE = 10;
  const pairsTotal = pairs.length;
  const pairsTotalPages = Math.max(1, Math.ceil(pairsTotal / PAGE_SIZE));
  const pairsPageSafe = Math.min(pairsPage, pairsTotalPages);
  const pagedPairs = useMemo(() => {
    const start = (pairsPageSafe - 1) * PAGE_SIZE;
    return pairs.slice(start, start + PAGE_SIZE);
  }, [pairs, pairsPageSafe]);
  const pairsFrom = pairsTotal === 0 ? 0 : (pairsPageSafe - 1) * PAGE_SIZE + 1;
  const pairsTo = Math.min(pairsPageSafe * PAGE_SIZE, pairsTotal);
  const activeCount = pairs.filter((p) => p.isActive).length;
  const dexCount = pairs.filter((p) => p.priceSource === 'dexscreener').length;

  return (
    <div className="admin-coins">
      <div className="admin-coins__toolbar">
        <div className="admin-coins__toolbar-copy">
          <h2 className="admin-coins__title">Exchange coins</h2>
          <p className="admin-coins__intro">
            Manage listing pairs. Add tokens via DexScreener — Binance-listed pairs use CEX charts automatically.
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary admin-coins__add-btn" onClick={openAddModal}>
          <Plus size={16} />
          Add coin
        </button>
      </div>

      <div className="admin-coins__stats">
        <div className="admin-coins__stat">
          <span className="admin-coins__stat-value">{pairs.length}</span>
          <span className="admin-coins__stat-label">Total pairs</span>
        </div>
        <div className="admin-coins__stat">
          <span className="admin-coins__stat-value">{activeCount}</span>
          <span className="admin-coins__stat-label">Active</span>
        </div>
        <div className="admin-coins__stat">
          <span className="admin-coins__stat-value">{dexCount}</span>
          <span className="admin-coins__stat-label">DexScreener</span>
        </div>
      </div>

      <div className="admin-card admin-coins__table-card">
        <div className="admin-coins__panel-head admin-coins__panel-head--table">
          <span className="admin-coins__panel-icon admin-coins__panel-icon--list">
            <TrendingUp size={18} />
          </span>
          <div>
            <h2>Exchange pairs</h2>
            <p className="admin-coins__panel-sub">
              {pairsTotal} pair{pairsTotal !== 1 ? 's' : ''} configured · 10 / page
            </p>
          </div>
        </div>
        {loading ? (
          <div className="admin-coins__loading">
            <Loader2 size={24} className="admin-spin" />
            <span>Loading pairs…</span>
          </div>
        ) : pairsTotal === 0 ? (
          <div className="admin-coins__empty-state">
            <p className="admin-coins__empty admin-coins__empty--block">No pairs yet.</p>
            <button type="button" className="admin-btn admin-btn--primary" onClick={openAddModal}>
              <Plus size={16} /> Add your first coin
            </button>
          </div>
        ) : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table admin-coins__table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Name</th>
                    <th>Source</th>
                    <th>Dex / Contract</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPairs.map((p) => (
                    <tr key={p.id || p.symbol} className={!p.isActive ? 'admin-coins__row--hidden' : ''}>
                      <td>
                        <CoinLabel
                          symbol={p.baseAsset || String(p.symbol).replace(/USDT$|INR$/, '')}
                          imageUrl={p.imageUrl}
                          type={p.category === 'commodity' ? 'commodity' : 'crypto'}
                          name={p.name}
                          label={p.displayPair}
                          size={24}
                        />
                      </td>
                      <td>{p.name || p.baseAsset}</td>
                      <td>
                        <span className={`admin-coins__tag admin-coins__tag--${p.priceSource || 'binance'}`}>
                          {p.priceSource || 'binance'}
                        </span>
                      </td>
                      <td>
                        <code className="admin-coins__cg-id">
                          {p.dexChainId && p.dexPairAddress
                            ? `${p.dexChainId}/${String(p.dexPairAddress).slice(0, 6)}…`
                            : p.contractAddress
                              ? `${String(p.contractAddress).slice(0, 10)}…`
                              : '—'}
                        </code>
                      </td>
                      <td>
                        <span className={`admin-badge ${p.isActive ? 'admin-badge--approved' : 'admin-badge--pending'}`}>
                          {p.isActive ? 'Active' : 'Hidden'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-actions">
                          {!String(p.id).startsWith('default-') && (
                            <button
                              type="button"
                              className="admin-btn admin-btn--ghost admin-btn--sm"
                              onClick={() => openEditModal(p)}
                              title="Edit logo & deposit"
                            >
                              <Pencil size={14} /> Edit
                            </button>
                          )}
                          <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={() => togglePair(p)}>
                            {p.isActive ? (
                              <>
                                <EyeOff size={14} /> Hide
                              </>
                            ) : (
                              <>
                                <Eye size={14} /> Show
                              </>
                            )}
                          </button>
                          {!String(p.id).startsWith('default-') && (
                            <button
                              type="button"
                              className="admin-btn admin-btn--danger admin-btn--sm"
                              onClick={() => removePair(p)}
                              title="Remove"
                            >
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
            <div className="admin-pager">
              <span className="admin-pager__range">
                Showing {pairsFrom}–{pairsTo} of {pairsTotal}
              </span>
              <div className="admin-pager__actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pairsPageSafe <= 1}
                  onClick={() => setPairsPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {pairsPageSafe} of {pairsTotalPages}
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-btn--sm"
                  disabled={pairsPageSafe >= pairsTotalPages}
                  onClick={() => setPairsPage((p) => Math.min(pairsTotalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {addOpen && (
        <div className="admin-coins-modal-backdrop" onClick={closeAddModal} role="presentation">
          <div
            className="admin-coins-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-coins-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-coins-modal__head">
              <div>
                <h2 id="admin-coins-modal-title">Add coin</h2>
                <p>Search DexScreener or paste a contract — pick a pool, then add to the exchange.</p>
              </div>
              <button
                type="button"
                className="admin-coins-modal__close"
                aria-label="Close"
                onClick={closeAddModal}
                disabled={addBusy}
              >
                <X size={18} />
              </button>
            </div>

            <div className="admin-coins-modal__tabs">
              <button
                type="button"
                className={addTab === 'search' ? 'is-active' : ''}
                onClick={() => setAddTab('search')}
              >
                <Search size={15} />
                Search
              </button>
              <button
                type="button"
                className={addTab === 'contract' ? 'is-active' : ''}
                onClick={() => setAddTab('contract')}
              >
                <Link2 size={15} />
                By contract
              </button>
            </div>

            <div className="admin-coins-modal__body">
              {addTab === 'search' ? (
                <div className="admin-coins-modal__pane">
                  <form className="admin-coins__search" onSubmit={runSearch}>
                    <input
                      className="admin-input"
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                      placeholder="e.g. PEPE, WIF, 0x…"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="admin-btn admin-btn--primary"
                      disabled={searchBusy || searchQ.trim().length < 2}
                    >
                      {searchBusy ? <Loader2 size={16} className="admin-spin" /> : <Search size={16} />}
                      Search
                    </button>
                  </form>
                  <p className="admin-coins__hint">Min. 2 characters · results ranked by liquidity</p>
                  <ul className="admin-coins__results admin-coins__results--modal">
                    {searchResults.map((c) => (
                      <li key={`${c.dexChainId}-${c.dexPairAddress}`}>
                        <span className="admin-coins__coin-icon">
                          {c.thumb || c.imageUrl ? (
                            <img src={c.thumb || c.imageUrl} alt="" width={28} height={28} />
                          ) : (
                            c.baseAsset?.slice(0, 2) || c.symbol?.slice(0, 2)
                          )}
                        </span>
                        <span className="admin-coins__coin-meta">
                          <strong>{c.name}</strong>
                          <small>
                            {c.baseAsset}/{c.quoteSymbol || 'USD'} · {c.dexChainId} · {fmtUsd(c.priceUsd)} ·{' '}
                            {c.liquidityLabel || ''}
                          </small>
                        </span>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-btn--sm"
                          disabled={previewBusy}
                          onClick={() => previewFromSearch(c)}
                        >
                          {previewBusy ? <Loader2 size={14} className="admin-spin" /> : 'Select'}
                        </button>
                      </li>
                    ))}
                    {!searchBusy && searchQ.length >= 2 && !searchResults.length && (
                      <li className="admin-coins__empty">No DEX pools found for &ldquo;{searchQ}&rdquo;</li>
                    )}
                    {!searchResults.length && searchQ.length < 2 && (
                      <li className="admin-coins__empty">Search a token name, ticker, or contract address.</li>
                    )}
                  </ul>
                </div>
              ) : (
                <div className="admin-coins-modal__pane">
                  <form className="admin-coins__contract" onSubmit={previewContract}>
                    <label className="admin-label" htmlFor="contract-addr">
                      Token contract address
                    </label>
                    <input
                      id="contract-addr"
                      className="admin-input admin-input--mono"
                      value={contractAddr}
                      onChange={(e) => setContractAddr(e.target.value)}
                      placeholder="0x… or Solana mint"
                      autoFocus
                    />
                    <label className="admin-label" htmlFor="contract-chain">
                      Chain
                    </label>
                    <select
                      id="contract-chain"
                      className="admin-input"
                      value={contractChain}
                      onChange={(e) => setContractChain(e.target.value)}
                    >
                      {CHAINS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="admin-btn admin-btn--primary admin-coins__lookup-btn"
                      disabled={previewBusy || !contractAddr.trim()}
                    >
                      {previewBusy ? (
                        <>
                          <Loader2 size={16} className="admin-spin" /> Looking up…
                        </>
                      ) : (
                        'Lookup on DexScreener'
                      )}
                    </button>
                  </form>
                </div>
              )}

              {preview && (
                <div className="admin-coins__preview admin-coins__preview--modal">
                  <div className="admin-coins__preview-head">
                    {preview.imageUrl ? (
                      <img src={preview.imageUrl} alt="" className="admin-coins__preview-img" width={40} height={40} />
                    ) : (
                      <span className="admin-coins__panel-icon admin-coins__panel-icon--preview">
                        <Coins size={20} />
                      </span>
                    )}
                    <div>
                      <h3>Ready to add</h3>
                      <p className="admin-coins__panel-sub">{preview.displayPair || preview.symbol}</p>
                    </div>
                  </div>
                  <div className="admin-coins__preview-grid">
                    <div className="admin-coins__preview-item">
                      <span>Name</span>
                      <strong>{preview.name}</strong>
                    </div>
                    <div className="admin-coins__preview-item">
                      <span>Live price</span>
                      <strong>{fmtUsd(preview.priceUsd)}</strong>
                    </div>
                    <div className="admin-coins__preview-item">
                      <span>Price source</span>
                      <span className={`admin-coins__tag admin-coins__tag--${preview.priceSource || 'dexscreener'}`}>
                        {preview.priceSource || 'dexscreener'}
                      </span>
                    </div>
                    <div className="admin-coins__preview-item">
                      <span>Binance listed</span>
                      <strong>{preview.binanceListed ? 'Yes — CEX charts' : 'No — Dex live price'}</strong>
                    </div>
                    {(preview.dexChainId || preview.liquidityUsd != null) && (
                      <div className="admin-coins__preview-item">
                        <span>Chain / liquidity</span>
                        <strong>
                          {preview.dexChainId || '—'}
                          {preview.liquidityUsd != null ? ` · $${Number(preview.liquidityUsd).toLocaleString()}` : ''}
                        </strong>
                      </div>
                    )}
                    {preview.contractAddress && (
                      <div className="admin-coins__preview-item admin-coins__preview-item--wide">
                        <span>Contract</span>
                        <code>{preview.contractAddress}</code>
                      </div>
                    )}
                    {preview.dexPairAddress && (
                      <div className="admin-coins__preview-item admin-coins__preview-item--wide">
                        <span>Dex pair</span>
                        <code>
                          {preview.dexChainId}/{preview.dexPairAddress}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="admin-coins-modal__footer">
              <button type="button" className="admin-btn admin-btn--ghost" onClick={closeAddModal} disabled={addBusy}>
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={addBusy || !preview}
                onClick={addPreview}
              >
                {addBusy ? (
                  <>
                    <Loader2 size={16} className="admin-spin" /> Adding…
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Add to exchange
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <div className="admin-coins-modal-backdrop" onClick={closeEditModal} role="presentation">
          <div
            className="admin-coins-modal admin-coins-modal--edit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-coins-edit-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-coins-modal__head">
              <div>
                <h2 id="admin-coins-edit-title">Edit {editForm.displayPair}</h2>
                <p>Update coin logo, display name, and deposit wallet for users.</p>
              </div>
              <button
                type="button"
                className="admin-coins-modal__close"
                aria-label="Close"
                onClick={closeEditModal}
                disabled={editBusy}
              >
                <X size={18} />
              </button>
            </div>

            <form className="admin-coins-modal__body admin-coins-modal__body--edit" onSubmit={saveEdit}>
              <div className="admin-coins-edit__logo-row">
                <div className="admin-coins-edit__preview">
                  {logoPreview ? (
                    <img
                      src={logoPreview}
                      alt=""
                      className="admin-coins__preview-img"
                      width={56}
                      height={56}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <span className="admin-coins__panel-icon admin-coins__panel-icon--preview">
                      <Coins size={24} />
                    </span>
                  )}
                </div>
                <div className="admin-coins-edit__logo-fields">
                  <label className="admin-label">Coin logo</label>
                  <input
                    ref={logoInputRef}
                    id="edit-logo-file"
                    type="file"
                    className="admin-coins-edit__file-input"
                    accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                    onChange={(e) => onLogoFilePick(e.target.files?.[0] || null)}
                  />
                  <div className="admin-coins-edit__file-actions">
                    <button
                      type="button"
                      className="admin-btn admin-btn--ghost admin-btn--sm"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      <ImageUp size={14} />
                      {logoFile ? 'Change image' : 'Choose from computer'}
                    </button>
                    {logoFile && (
                      <button type="button" className="admin-btn admin-btn--ghost admin-btn--sm" onClick={clearLogoPick}>
                        Remove
                      </button>
                    )}
                  </div>
                  {logoFile && (
                    <p className="admin-coins__hint admin-coins__hint--file">
                      Selected: <strong>{logoFile.name}</strong> ({(logoFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                  <p className="admin-coins__hint">JPG, PNG, WebP, or GIF · max 2MB. Uploads when you save.</p>
                </div>
              </div>

              <div className="admin-coins-edit__grid">
                <div className="admin-field">
                  <label className="admin-label" htmlFor="edit-name">
                    Display name
                  </label>
                  <input
                    id="edit-name"
                    className="admin-input"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={editForm.baseAsset || 'Coin name'}
                  />
                </div>
                <div className="admin-field">
                  <label className="admin-label" htmlFor="edit-deposit-network">
                    Deposit network
                  </label>
                  <select
                    id="edit-deposit-network"
                    className="admin-input"
                    value={editForm.depositNetwork}
                    onChange={(e) => setEditForm((f) => ({ ...f, depositNetwork: e.target.value }))}
                  >
                    {DEPOSIT_NETWORKS.map((n) => (
                      <option key={n.value || 'none'} value={n.value}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-field admin-field--wide">
                  <label className="admin-label" htmlFor="edit-deposit-address">
                    Deposit wallet address
                  </label>
                  <input
                    id="edit-deposit-address"
                    className="admin-input admin-input--mono"
                    value={editForm.depositWalletAddress}
                    onChange={(e) => setEditForm((f) => ({ ...f, depositWalletAddress: e.target.value }))}
                    placeholder={`Platform wallet users send ${editForm.baseAsset} to`}
                  />
                  <p className="admin-coins__hint">
                    Shown to users when they deposit {editForm.baseAsset}. Leave empty to use global wallet from Wallet Management.
                  </p>
                </div>
                <div className="admin-field admin-field--wide">
                  <label className="admin-coins-edit__checkbox">
                    <input
                      type="checkbox"
                      checked={editForm.depositEnabled}
                      onChange={(e) => setEditForm((f) => ({ ...f, depositEnabled: e.target.checked }))}
                    />
                    Allow users to deposit this coin
                  </label>
                </div>
              </div>
            </form>

            <div className="admin-coins-modal__footer">
              <button type="button" className="admin-btn admin-btn--ghost" onClick={closeEditModal} disabled={editBusy}>
                Cancel
              </button>
              <button type="button" className="admin-btn admin-btn--primary" disabled={editBusy} onClick={saveEdit}>
                {editBusy ? (
                  <>
                    <Loader2 size={16} className="admin-spin" /> Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
