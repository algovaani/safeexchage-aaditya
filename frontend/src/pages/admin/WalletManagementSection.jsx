import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Building2,
  CheckCircle2,
  Coins,
  Copy,
  Loader2,
  Save,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { api, parseApiResponse } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { CoinLabel } from '../../components/CoinIcon.jsx';
import { resolveAssetUrl } from '../../utils/assetUrl.js';

const DEPOSIT_NETWORKS = [
  { value: '', label: '— Select network —' },
  { value: 'BEP20', label: 'BNB Smart Chain (BEP20)' },
  { value: 'BNB', label: 'BNB' },
  { value: 'ERC20', label: 'Ethereum (ERC20)' },
  { value: 'ETH', label: 'ETH' },
  { value: 'TRC20', label: 'TRON (TRC20)' },
  { value: 'TRX', label: 'TRX' },
];

function suggestNetwork(pair) {
  if (pair.depositNetwork) return pair.depositNetwork;
  const base = String(pair.baseAsset || '').toUpperCase();
  if (base === 'BNB') return 'BEP20';
  if (base === 'ETH') return 'ERC20';
  if (base === 'TRX') return 'TRC20';
  if (base === 'USDT') return 'TRC20';
  const chain = String(pair.dexChainId || pair.contractChain || '').toLowerCase();
  if (chain.includes('bsc') || chain === 'bnb') return 'BEP20';
  if (chain.includes('eth') || chain === 'ethereum' || chain === 'base' || chain === 'arbitrum') {
    return 'ERC20';
  }
  if (chain.includes('tron') || chain === 'trx') return 'TRC20';
  return '';
}

function platformAddressForCoin(baseAsset, platform, network = '') {
  const b = String(baseAsset || '').toUpperCase();
  const net = String(network || '').toUpperCase();
  if (b === 'BNB') return platform.bnbWalletAddress || '';
  if (b === 'ETH') return platform.ethWalletAddress || '';
  if (b === 'TRX') return platform.trcWalletAddress || '';
  if (b === 'USDT') {
    if (net.includes('BEP') || net === 'BNB') return platform.bnbWalletAddress || '';
    if (net.includes('ERC') || net === 'ETH') return platform.ethWalletAddress || '';
    return platform.usdtWalletAddress || platform.trcWalletAddress || '';
  }
  return '';
}

function effectiveAddress(row, platform) {
  const custom = String(row.depositWalletAddress || '').trim();
  if (custom) return { address: custom, source: 'custom' };
  const fallback = platformAddressForCoin(row.baseAsset, platform, row.depositNetwork);
  if (fallback) return { address: fallback, source: 'platform' };
  return { address: '', source: 'none' };
}

function WalletQrPreview({ label, address }) {
  const text = String(address || '').trim();
  if (!text) {
    return (
      <div className="admin-wallet-qr">
        <p className="admin-wallet-qr__label">{label}</p>
        <p className="admin-wallet-qr__empty">Not configured</p>
      </div>
    );
  }
  return (
    <div className="admin-wallet-qr">
      <p className="admin-wallet-qr__label">{label}</p>
      <QRCodeSVG value={text} size={100} level="M" includeMargin className="admin-wallet-qr__code" />
      <code className="admin-wallet-qr__addr" title={text}>
        {text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text}
      </code>
    </div>
  );
}

export default function WalletManagementSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [coinEdits, setCoinEdits] = useState({});
  const [platform, setPlatform] = useState({
    depositMode: 'manual',
    usdtInrRate: '83.5',
    cashInPersonDepositRate: '',
    cashInPersonWithdrawRate: '',
    bnbWalletAddress: '',
    ethWalletAddress: '',
    usdtWalletAddress: '',
    trcWalletAddress: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    bankBranch: '',
    bankAccountHolder: '',
  });

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: settingsRes }, { data: pairsRes }] = await Promise.all([
        api.get('/admin/settings'),
        api.get('/admin/trading-pairs', { params: { include_inactive: '0' } }),
      ]);
      const s = parseApiResponse(settingsRes) || {};
      setPlatform({
        depositMode: s.depositMode || 'manual',
        usdtInrRate: s.usdtInrRate != null ? String(s.usdtInrRate) : '83.5',
        cashInPersonDepositRate:
          s.cashInPersonDepositRate != null ? String(s.cashInPersonDepositRate) : '',
        cashInPersonWithdrawRate:
          s.cashInPersonWithdrawRate != null ? String(s.cashInPersonWithdrawRate) : '',
        bnbWalletAddress: s.bnbWalletAddress || '',
        ethWalletAddress: s.ethWalletAddress || '',
        usdtWalletAddress: s.usdtWalletAddress || '',
        trcWalletAddress: s.trcWalletAddress || '',
        bankName: s.bankName || s.bank?.name || '',
        bankAccountNumber: s.bankAccountNumber || s.bank?.account || '',
        bankIfsc: s.bankIfsc || s.bank?.ifsc || '',
        bankBranch: s.bankBranch || s.bank?.branch || '',
        bankAccountHolder: s.bankAccountHolder || s.bank?.holder || '',
      });
      const rows = parseApiResponse(pairsRes) || [];
      setPairs(rows);
      const edits = {};
      for (const p of rows) {
        if (!p.id || String(p.id).startsWith('default-')) continue;
        edits[p.id] = {
          depositWalletAddress: p.depositWalletAddress || '',
          depositNetwork: p.depositNetwork || suggestNetwork(p),
          depositEnabled: p.depositEnabled !== false,
        };
      }
      setCoinEdits(edits);
    } catch (ex) {
      toast.error(ex.message || 'Failed to load wallet settings');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
    const onUpdate = () => loadAll();
    window.addEventListener('trading-pairs:updated', onUpdate);
    return () => window.removeEventListener('trading-pairs:updated', onUpdate);
  }, [loadAll]);

  const activeCoins = useMemo(() => {
    const map = new Map();
    for (const p of pairs.filter((x) => x.isActive !== false)) {
      const base = String(p.baseAsset || '').toUpperCase();
      if (!base) continue;
      const existing = map.get(base);
      if (!existing || (p.quoteAsset === 'USDT' && existing.quoteAsset !== 'USDT')) {
        map.set(base, p);
      }
    }
    return [...map.values()].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.baseAsset.localeCompare(b.baseAsset)
    );
  }, [pairs]);

  const stats = useMemo(() => {
    let configured = 0;
    let missing = 0;
    for (const p of activeCoins) {
      const edit = coinEdits[p.id] || {};
      const row = { ...p, ...edit };
      const { address } = effectiveAddress(row, platform);
      if (address) configured += 1;
      else if (p.category !== 'commodity') missing += 1;
    }
    return { total: activeCoins.length, configured, missing };
  }, [activeCoins, coinEdits, platform]);

  function updateCoin(id, patch) {
    setCoinEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Address copied');
    } catch {
      toast.error('Could not copy');
    }
  }

  async function saveAll(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/admin/settings', {
        depositMode: 'manual',
        usdtInrRate: Number(platform.usdtInrRate || 83.5),
        cashInPersonDepositRate: Number(platform.cashInPersonDepositRate || 0),
        cashInPersonWithdrawRate: Number(platform.cashInPersonWithdrawRate || 0),
        bnbWalletAddress: platform.bnbWalletAddress.trim(),
        ethWalletAddress: platform.ethWalletAddress.trim(),
        usdtWalletAddress: platform.usdtWalletAddress.trim(),
        trcWalletAddress: platform.trcWalletAddress.trim(),
        bankName: platform.bankName.trim(),
        bankAccountNumber: platform.bankAccountNumber.trim(),
        bankIfsc: platform.bankIfsc.trim(),
        bankBranch: platform.bankBranch.trim(),
        bankAccountHolder: platform.bankAccountHolder.trim(),
      });

      const patchJobs = activeCoins
        .filter((p) => p.id && !String(p.id).startsWith('default-'))
        .map((p) => {
          const edit = coinEdits[p.id] || {};
          return api.patch(`/admin/trading-pairs/${p.id}`, {
            deposit_wallet_address: String(edit.depositWalletAddress || '').trim(),
            deposit_network: String(edit.depositNetwork || '').trim(),
            deposit_enabled: edit.depositEnabled !== false,
          });
        });

      await Promise.all(patchJobs);
      toast.success('Wallet settings saved for all coins');
      window.dispatchEvent(new CustomEvent('platform:config-updated'));
      window.dispatchEvent(new Event('trading-pairs:updated'));
      await loadAll();
    } catch (ex) {
      toast.error(ex.message || 'Failed to save wallet settings');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="admin-wallets admin-wallets--loading">
        <Loader2 size={28} className="admin-spin" />
        <span>Loading wallet configuration…</span>
      </div>
    );
  }

  return (
    <div className="admin-wallets">
      <div className="admin-wallets__hero">
        <div>
          <h2 className="admin-wallets__title">Wallet management</h2>
          <p className="admin-wallets__intro">
            Configure deposit addresses for every active coin on the exchange. Users see these when depositing;
            approve incoming transfers from the Deposits tab.
          </p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" disabled={busy} onClick={saveAll}>
          {busy ? (
            <>
              <Loader2 size={16} className="admin-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={16} /> Save all wallets
            </>
          )}
        </button>
      </div>

      <div className="admin-wallets__stats">
        <div className="admin-wallets__stat">
          <Coins size={18} />
          <span>
            <strong>{stats.total}</strong> active coins
          </span>
        </div>
        <div className="admin-wallets__stat admin-wallets__stat--ok">
          <CheckCircle2 size={18} />
          <span>
            <strong>{stats.configured}</strong> with deposit address
          </span>
        </div>
        {stats.missing > 0 && (
          <div className="admin-wallets__stat admin-wallets__stat--warn">
            <AlertCircle size={18} />
            <span>
              <strong>{stats.missing}</strong> missing address
            </span>
          </div>
        )}
      </div>

      <form className="admin-wallets__grid" onSubmit={saveAll}>
        <section className="admin-card admin-wallets__card">
          <div className="admin-wallets__card-head">
            <Wallet size={18} />
            <h3>Platform settings</h3>
          </div>
          <div className="admin-wallets__fields admin-wallets__fields--2">
            <div className="admin-field">
              <label>Deposit mode</label>
              <select value="manual" disabled>
                <option value="manual">Manual — admin credits wallet after payment</option>
              </select>
            </div>
            <div className="admin-field">
              <label>USDT price in INR</label>
              <input
                type="number"
                min="1"
                max="500"
                step="0.01"
                value={platform.usdtInrRate}
                onChange={(e) => setPlatform((f) => ({ ...f, usdtInrRate: e.target.value }))}
                placeholder="e.g. 83.5"
                required
              />
            </div>
            <div className="admin-field">
              <label>Cash deposit rate (INR per 1 USDT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={platform.cashInPersonDepositRate}
                onChange={(e) => setPlatform((f) => ({ ...f, cashInPersonDepositRate: e.target.value }))}
                placeholder="e.g. 100"
              />
            </div>
            <div className="admin-field">
              <label>Cash withdraw rate (INR per 1 USDT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={platform.cashInPersonWithdrawRate}
                onChange={(e) => setPlatform((f) => ({ ...f, cashInPersonWithdrawRate: e.target.value }))}
                placeholder="e.g. 98"
              />
            </div>
          </div>
        </section>

        <section className="admin-card admin-wallets__card">
          <div className="admin-wallets__card-head">
            <Wallet size={18} />
            <div>
              <h3>Network master wallets</h3>
              <p className="admin-wallets__card-sub">Default addresses for BNB, ETH, TRX, USDT — used when a coin has no custom address.</p>
            </div>
          </div>
          <div className="admin-wallets__fields admin-wallets__fields--2">
            <div className="admin-field">
              <label>BNB (BEP20)</label>
              <input
                className="admin-input--mono"
                value={platform.bnbWalletAddress}
                onChange={(e) => setPlatform((f) => ({ ...f, bnbWalletAddress: e.target.value }))}
                placeholder="0x…"
              />
            </div>
            <div className="admin-field">
              <label>ETH (ERC20)</label>
              <input
                className="admin-input--mono"
                value={platform.ethWalletAddress}
                onChange={(e) => setPlatform((f) => ({ ...f, ethWalletAddress: e.target.value }))}
                placeholder="0x…"
              />
            </div>
            <div className="admin-field">
              <label>USDT wallet</label>
              <input
                className="admin-input--mono"
                value={platform.usdtWalletAddress}
                onChange={(e) => setPlatform((f) => ({ ...f, usdtWalletAddress: e.target.value }))}
                placeholder="TRC20 / shared USDT"
              />
            </div>
            <div className="admin-field">
              <label>TRX / TRON</label>
              <input
                className="admin-input--mono"
                value={platform.trcWalletAddress}
                onChange={(e) => setPlatform((f) => ({ ...f, trcWalletAddress: e.target.value }))}
                placeholder="T…"
              />
            </div>
          </div>
          <div className="admin-wallet-qr-grid admin-wallets__qr-grid">
            <WalletQrPreview label="BNB" address={platform.bnbWalletAddress} />
            <WalletQrPreview label="ETH" address={platform.ethWalletAddress} />
            <WalletQrPreview label="USDT" address={platform.usdtWalletAddress || platform.trcWalletAddress} />
            <WalletQrPreview label="TRX" address={platform.trcWalletAddress} />
          </div>
        </section>

        <section className="admin-card admin-wallets__card admin-wallets__card--wide">
          <div className="admin-wallets__card-head">
            <Coins size={18} />
            <div>
              <h3>Coin deposit addresses</h3>
              <p className="admin-wallets__card-sub">
                One row per active coin — auto-synced from Exchange Coins. Set a custom address or leave empty to use the network master wallet above.
              </p>
            </div>
          </div>

          {activeCoins.length === 0 ? (
            <p className="admin-wallets__empty">No active coins. Add coins from the Exchange Coins tab first.</p>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table admin-wallets__table">
                <thead>
                  <tr>
                    <th>Coin</th>
                    <th>Network</th>
                    <th>Deposit wallet</th>
                    <th>User sees</th>
                    <th>Deposit</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCoins.map((p) => {
                    const edit = coinEdits[p.id] || {
                      depositWalletAddress: p.depositWalletAddress || '',
                      depositNetwork: suggestNetwork(p),
                      depositEnabled: p.depositEnabled !== false,
                    };
                    const row = { ...p, ...edit };
                    const { address, source } = effectiveAddress(row, platform);
                    const isCommodity = p.category === 'commodity';

                    return (
                      <tr key={p.id || p.symbol}>
                        <td>
                          <CoinLabel
                            symbol={p.baseAsset}
                            imageUrl={resolveAssetUrl(p.imageUrl)}
                            type={isCommodity ? 'commodity' : 'crypto'}
                            name={p.name}
                            label={p.displayPair || `${p.baseAsset}/${p.quoteAsset}`}
                            size={26}
                          />
                        </td>
                        <td>
                          {isCommodity ? (
                            <span className="admin-wallets__fiat-tag">INR bank</span>
                          ) : (
                            <select
                              className="admin-input admin-wallets__network-select"
                              value={edit.depositNetwork}
                              onChange={(e) => updateCoin(p.id, { depositNetwork: e.target.value })}
                              disabled={!p.id || String(p.id).startsWith('default-')}
                            >
                              {DEPOSIT_NETWORKS.map((n) => (
                                <option key={n.value || 'none'} value={n.value}>
                                  {n.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          {isCommodity ? (
                            <span className="admin-wallets__hint-inline">Uses bank details below</span>
                          ) : (
                            <input
                              className="admin-input admin-input--mono admin-wallets__addr-input"
                              value={edit.depositWalletAddress}
                              onChange={(e) => updateCoin(p.id, { depositWalletAddress: e.target.value })}
                              placeholder={`Custom ${p.baseAsset} address (optional)`}
                              disabled={!p.id || String(p.id).startsWith('default-')}
                            />
                          )}
                        </td>
                        <td>
                          {isCommodity ? (
                            <span className="admin-wallets__hint-inline">Bank transfer</span>
                          ) : address ? (
                            <div className="admin-wallets__effective">
                              <code title={address}>
                                {address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address}
                              </code>
                              <span className={`admin-wallets__source admin-wallets__source--${source}`}>
                                {source === 'custom' ? 'Custom' : 'Platform'}
                              </span>
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-btn--sm"
                                onClick={() => copyText(address)}
                                title="Copy address"
                              >
                                <Copy size={12} />
                              </button>
                            </div>
                          ) : (
                            <span className="admin-wallets__missing">Not set</span>
                          )}
                        </td>
                        <td>
                          {isCommodity ? (
                            <span className="admin-badge admin-badge--approved">Fiat</span>
                          ) : (
                            <label className="admin-wallets__toggle">
                              <input
                                type="checkbox"
                                checked={edit.depositEnabled}
                                onChange={(e) => updateCoin(p.id, { depositEnabled: e.target.checked })}
                                disabled={!p.id || String(p.id).startsWith('default-')}
                              />
                              <span>{edit.depositEnabled ? 'On' : 'Off'}</span>
                            </label>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="admin-card admin-wallets__card admin-wallets__card--wide">
          <div className="admin-wallets__card-head">
            <Building2 size={18} />
            <div>
              <h3>INR bank details</h3>
              <p className="admin-wallets__card-sub">Shown to users for INR / commodity deposits.</p>
            </div>
          </div>
          <div className="admin-wallets__fields admin-wallets__fields--2">
            <div className="admin-field">
              <label>Bank name</label>
              <input value={platform.bankName} onChange={(e) => setPlatform((f) => ({ ...f, bankName: e.target.value }))} />
            </div>
            <div className="admin-field">
              <label>Account holder</label>
              <input
                value={platform.bankAccountHolder}
                onChange={(e) => setPlatform((f) => ({ ...f, bankAccountHolder: e.target.value }))}
              />
            </div>
            <div className="admin-field">
              <label>Account number</label>
              <input
                value={platform.bankAccountNumber}
                onChange={(e) => setPlatform((f) => ({ ...f, bankAccountNumber: e.target.value }))}
              />
            </div>
            <div className="admin-field">
              <label>IFSC code</label>
              <input value={platform.bankIfsc} onChange={(e) => setPlatform((f) => ({ ...f, bankIfsc: e.target.value }))} />
            </div>
            <div className="admin-field admin-field--wide">
              <label>Branch</label>
              <input value={platform.bankBranch} onChange={(e) => setPlatform((f) => ({ ...f, bankBranch: e.target.value }))} />
            </div>
          </div>
        </section>

        <div className="admin-wallets__footer">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={16} className="admin-spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={16} /> Save all wallets
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
