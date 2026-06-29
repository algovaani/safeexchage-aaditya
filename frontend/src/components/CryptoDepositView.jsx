import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { api, depositAPI, getApiErrorMessage, parseApiResponse } from '../services/api.js';
import { chainsForCoin, getWalletPayUrl } from '../config/cryptoDepositChains.js';
import './DepositModal.css';

function truncateAddress(addr, head = 10, tail = 8) {
  if (!addr || addr.length <= head + tail + 3) return addr || '—';
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

function userWalletForChain(profile, chain) {
  if (!profile) return '';
  const map = {
    BNB: profile.bnbWalletAddress,
    ETH: profile.ethWalletAddress,
    TRC: profile.trcWalletAddress || profile.usdtWalletAddress,
  };
  return map[chain] || profile.usdtWalletAddress || '';
}

export default function CryptoDepositView({ coin, className = '', onSubmitted }) {
  const chainOptions = useMemo(() => chainsForCoin(coin) || [], [coin]);
  const [chain, setChain] = useState(chainOptions[0]?.id || 'BNB');
  const [depositAddress, setDepositAddress] = useState(null);
  const [platformInfo, setPlatformInfo] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingAddr, setLoadingAddr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [submitErr, setSubmitErr] = useState('');
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitOk, setSubmitOk] = useState(false);
  const [form, setForm] = useState({
    amount: '',
    txn_hash: '',
    from_address: '',
  });

  const chainMeta = chainOptions.find((c) => c.id === chain) || chainOptions[0];
  const address = depositAddress?.address || '';
  const payUrl = getWalletPayUrl(chain, address, chainMeta?.currency || coin);
  const manualMode = platformInfo?.manualDeposits !== false;

  useEffect(() => {
    const next = chainOptions[0]?.id || 'BNB';
    setChain(next);
    setCopied(false);
    setSubmitOk(false);
  }, [coin, chainOptions]);

  useEffect(() => {
    depositAPI.getPlatformInfo().then(setPlatformInfo).catch(() => setPlatformInfo(null));
    api.get('/auth/me').then(({ data }) => setUserProfile(parseApiResponse(data))).catch(() => setUserProfile(null));
  }, []);

  useEffect(() => {
    setForm((f) => ({ ...f, from_address: userWalletForChain(userProfile, chain) }));
  }, [userProfile, chain]);

  useEffect(() => {
    if (!chainOptions.length) return;
    let cancelled = false;
    setLoadingAddr(true);
    setErr('');
    depositAPI
      .getCryptoAddress(chain, chainMeta?.currency || coin)
      .then((data) => {
        if (!cancelled) setDepositAddress(data);
      })
      .catch((ex) => {
        if (!cancelled) {
          setDepositAddress(null);
          setErr(getApiErrorMessage(ex));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingAddr(false);
      });
    return () => {
      cancelled = true;
    };
  }, [chain, chainOptions.length, chainMeta?.currency]);

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function openWalletPay() {
    if (!payUrl) return;
    window.open(payUrl, '_blank', 'noopener,noreferrer');
  }

  async function submitDeposit(e) {
    e.preventDefault();
    setSubmitErr('');
    setSubmitBusy(true);
    setSubmitOk(false);
    try {
      await depositAPI.submitCrypto({
        amount: Number(form.amount),
        txn_hash: form.txn_hash.trim(),
        network: chainMeta?.label || chain,
        currency: chainMeta?.currency || coin,
        from_address: form.from_address.trim(),
      });
      setSubmitOk(true);
      setForm((f) => ({ ...f, amount: '', txn_hash: '' }));
      onSubmitted?.();
    } catch (ex) {
      setSubmitErr(getApiErrorMessage(ex));
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!chainOptions.length) {
    return (
      <p className="deposit-modal__error">
        {coin} on-chain deposits are not configured yet. Try BNB, ETH, TRX, or USDT.
      </p>
    );
  }

  return (
    <div className={`deposit-modal__crypto-view ${className}`.trim()}>
      {chainOptions.length > 1 && (
        <div className="deposit-modal__field">
          <label htmlFor={`deposit-chain-${coin}`}>Network</label>
          <select
            id={`deposit-chain-${coin}`}
            className="deposit-modal__select"
            value={chain}
            onChange={(e) => {
              setChain(e.target.value);
              setCopied(false);
              setSubmitOk(false);
            }}
          >
            {chainOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="deposit-modal__grid">
        <div className="deposit-modal__fields">
          <div className="deposit-modal__field">
            <label>Platform deposit address</label>
            {loadingAddr ? (
              <p className="deposit-modal__hint deposit-modal__hint--left">
                <Loader2 size={14} className="deposit-modal__spin" /> Loading address…
              </p>
            ) : (
              <>
                <div className="deposit-modal__address-row">
                  <input
                    className="deposit-modal__address-input deposit-modal__address-input--full"
                    readOnly
                    value={address || '—'}
                    title={address}
                  />
                  <button
                    type="button"
                    className="deposit-modal__copy"
                    onClick={copyAddress}
                    aria-label="Copy address"
                    disabled={!address}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                {address && (
                  <p className="deposit-modal__address-full" title={address}>
                    {truncateAddress(address, 18, 12)}
                  </p>
                )}
                {copied && <span className="deposit-modal__copied">Address copied</span>}
                <p className="deposit-modal__hint deposit-modal__hint--left">
                  Send <strong>{chainMeta?.currency || coin}</strong> on{' '}
                  <strong>{chainMeta?.label}</strong> to the address above, then submit your transaction details below.
                  {manualMode ? ' Admin will verify and credit your wallet.' : ''}
                </p>
                {payUrl && (
                  <button
                    type="button"
                    className="deposit-modal__pay-btn"
                    onClick={openWalletPay}
                    disabled={!address}
                  >
                    <ExternalLink size={16} aria-hidden />
                    Open wallet to pay
                  </button>
                )}
              </>
            )}
            {err && <p className="deposit-modal__error">{err}</p>}
          </div>
        </div>

        <div className="deposit-modal__qr-col">
          <div className="deposit-modal__qr-wrap">
            {loadingAddr ? (
              <div className="deposit-modal__qr deposit-modal__qr--empty">
                <Loader2 size={24} className="deposit-modal__spin" />
              </div>
            ) : address ? (
              <QRCodeSVG value={address} size={180} level="M" includeMargin className="deposit-modal__qr" />
            ) : (
              <div className="deposit-modal__qr deposit-modal__qr--empty">No address</div>
            )}
          </div>
          <p className="deposit-modal__qr-label">Scan QR to pay</p>
        </div>
      </div>

      <form className="deposit-modal__form deposit-modal__manual-form" onSubmit={submitDeposit}>
        <h3 className="deposit-modal__form-title">Submit deposit details</h3>
        <div className="deposit-modal__field">
          <label>Amount sent</label>
          <input
            className="deposit-modal__input"
            type="number"
            step="any"
            min="0"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={`e.g. 100 ${chainMeta?.currency || coin}`}
            required
          />
        </div>
        <div className="deposit-modal__field">
          <label>Transaction hash</label>
          <input
            className="deposit-modal__input"
            value={form.txn_hash}
            onChange={(e) => setForm((f) => ({ ...f, txn_hash: e.target.value }))}
            placeholder="Paste on-chain TX hash"
            required
          />
        </div>
        <div className="deposit-modal__field">
          <label>Your wallet address (sender)</label>
          <input
            className="deposit-modal__input"
            value={form.from_address}
            onChange={(e) => setForm((f) => ({ ...f, from_address: e.target.value }))}
            placeholder="Address you sent from"
          />
          <p className="deposit-modal__hint deposit-modal__hint--left">
            Save your wallets in Account → Wallet addresses for auto-fill.
          </p>
        </div>
        {submitErr && <p className="deposit-modal__error">{submitErr}</p>}
        {submitOk && (
          <p className="deposit-modal__success">Deposit submitted — pending admin approval.</p>
        )}
        <button type="submit" className="deposit-modal__submit" disabled={submitBusy || !address}>
          {submitBusy ? 'Submitting…' : 'Submit deposit for approval'}
        </button>
      </form>

      <div className="deposit-modal__disclaimer">
        <div className="deposit-modal__disclaimer-head">
          <AlertCircle size={18} aria-hidden />
          <strong>Important</strong>
        </div>
        <p>
          Use only <strong>{chainMeta?.label}</strong>. Wrong network may result in lost funds.
        </p>
        <p>Funds are added to your trading wallet only after admin approves your deposit.</p>
      </div>
    </div>
  );
}
