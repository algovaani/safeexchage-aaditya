import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, Copy, Loader2, X } from 'lucide-react';
import { depositAPI, getApiErrorMessage } from '../services/api.js';
import {
  COIN_COLORS,
  getNetworksForCoin,
  networkLabelForDisclaimer,
  txnHashPlaceholder,
} from '../config/depositNetworks.js';
import { WALLET_ASSETS } from '../theme/assets.js';
import './DepositModal.css';

function truncateAddress(addr, head = 16, tail = 8) {
  if (!addr || addr.length <= head + tail + 3) return addr || '—';
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

function FiatDepositForm({ coin, platformInfo, onClose, onSuccess }) {
  const bank = platformInfo?.bank || {};
  const [fiatForm, setFiatForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    utr_number: '',
  });
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function submitFiat(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!proof) {
      setErr('Payment proof (screenshot or PDF) is required.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('amount', fiatForm.amount);
      fd.append('bank_name', fiatForm.bank_name);
      fd.append('account_number', fiatForm.account_number);
      fd.append('utr_number', fiatForm.utr_number);
      fd.append('payment_proof', proof);
      await depositAPI.submitFiat(fd);
      setMsg('Bank transfer submitted. Admin will verify your payment.');
      onSuccess?.();
      setTimeout(onClose, 1500);
    } catch (ex) {
      setErr(getApiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="deposit-modal__form" onSubmit={submitFiat}>
      <div className="deposit-modal__bank-box">
        <p><span>Bank:</span> {bank.name || '—'}</p>
        <p><span>Account:</span> {bank.account || '—'}</p>
        <p><span>IFSC:</span> {bank.ifsc || '—'}</p>
        <p><span>Holder:</span> {bank.holder || '—'}</p>
      </div>

      <div className="deposit-modal__field">
        <label>Amount ({coin} equivalent)</label>
        <input
          className="deposit-modal__input"
          type="number"
          step="any"
          min="0"
          placeholder="10000"
          value={fiatForm.amount}
          onChange={(e) => setFiatForm((f) => ({ ...f, amount: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Your bank name</label>
        <input
          className="deposit-modal__input"
          value={fiatForm.bank_name}
          onChange={(e) => setFiatForm((f) => ({ ...f, bank_name: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Your account number</label>
        <input
          className="deposit-modal__input"
          value={fiatForm.account_number}
          onChange={(e) => setFiatForm((f) => ({ ...f, account_number: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>UTR / reference number</label>
        <input
          className="deposit-modal__input"
          value={fiatForm.utr_number}
          onChange={(e) => setFiatForm((f) => ({ ...f, utr_number: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Payment proof</label>
        <input
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          className="deposit-modal__input deposit-modal__file"
          onChange={(e) => setProof(e.target.files?.[0] || null)}
          required
        />
      </div>

      {err && <p className="deposit-modal__error">{err}</p>}
      {msg && <p className="deposit-modal__success">{msg}</p>}

      <button type="submit" className="deposit-modal__submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for approval'}
      </button>
    </form>
  );
}

export default function DepositModal({ coin: initialCoin, platformInfo, onClose, onSuccess }) {
  const [selectedCoin, setSelectedCoin] = useState(initialCoin || 'USDT');

  const networks = useMemo(
    () => getNetworksForCoin(selectedCoin, platformInfo),
    [selectedCoin, platformInfo]
  );

  const [chainId, setChainId] = useState(networks?.[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [txnHash, setTxnHash] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const coinColor =
    WALLET_ASSETS.find((a) => a.symbol === selectedCoin)?.color ||
    COIN_COLORS[selectedCoin] ||
    '#f0b90b';

  useEffect(() => {
    setSelectedCoin(initialCoin || 'USDT');
  }, [initialCoin]);

  useEffect(() => {
    setChainId(networks?.[0]?.id ?? '');
    setCopied(false);
    setAmount('');
    setTxnHash('');
    setErr('');
    setMsg('');
  }, [selectedCoin, networks]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!initialCoin) return null;

  const isFiat = !networks;
  const chain = networks?.find((n) => n.id === chainId) || networks?.[0];
  const address = chain?.address || '';
  const apiNetwork = chain?.apiNetwork || 'BEP20';

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

  async function submitCrypto(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    setBusy(true);
    try {
      await depositAPI.submitCrypto({
        amount: parseFloat(amount),
        txn_hash: txnHash.trim(),
        network: apiNetwork,
        currency: selectedCoin,
      });
      setMsg(`${selectedCoin} deposit submitted. Admin will verify your transaction.`);
      setAmount('');
      setTxnHash('');
      onSuccess?.();
    } catch (ex) {
      setErr(getApiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="deposit-modal deposit-modal--wide"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="deposit-modal-title"
      >
        <header className="deposit-modal__header">
          <div className="deposit-modal__title-wrap">
            <span className="deposit-modal__coin-icon" style={{ background: coinColor }}>
              {selectedCoin.slice(0, 2)}
            </span>
            <div>
              <h2 id="deposit-modal-title">Deposit {selectedCoin}</h2>
              <p className="deposit-modal__subtitle">
                {isFiat ? 'Bank transfer' : `Crypto · ${chain?.label || 'Select network'}`}
              </p>
            </div>
          </div>
          <button type="button" className="deposit-modal__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="deposit-modal__body">
          <div className="deposit-modal__field deposit-modal__field--coin">
            <label htmlFor="deposit-coin">Select Coin:</label>
            <select
              id="deposit-coin"
              className="deposit-modal__select"
              value={selectedCoin}
              onChange={(e) => setSelectedCoin(e.target.value)}
            >
              {WALLET_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </div>

          {isFiat ? (
            <FiatDepositForm
              coin={selectedCoin}
              platformInfo={platformInfo}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          ) : (
            <>
              <div className="deposit-modal__grid">
                <div className="deposit-modal__fields">
                  <div className="deposit-modal__field">
                    <label htmlFor="deposit-chain">Select Chain:</label>
                    <select
                      id="deposit-chain"
                      className="deposit-modal__select"
                      value={chainId}
                      onChange={(e) => {
                        setChainId(e.target.value);
                        setCopied(false);
                      }}
                    >
                      {networks.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="deposit-modal__field">
                    <label htmlFor="deposit-address">Platform wallet address:</label>
                    <div className="deposit-modal__address-row">
                      <input
                        id="deposit-address"
                        className="deposit-modal__address-input"
                        readOnly
                        value={truncateAddress(address)}
                        title={address}
                      />
                      <button
                        type="button"
                        className="deposit-modal__copy"
                        onClick={copyAddress}
                        aria-label="Copy address"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    {copied && <span className="deposit-modal__copied">Address copied</span>}
                    <p className="deposit-modal__scan-hint">Scan QR code → send only {selectedCoin}</p>
                  </div>

                  <form className="deposit-modal__form" onSubmit={submitCrypto}>
                    <div className="deposit-modal__field">
                      <label htmlFor="deposit-amount">Amount ({selectedCoin})</label>
                      <input
                        id="deposit-amount"
                        className="deposit-modal__input"
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                      />
                    </div>
                    <div className="deposit-modal__field">
                      <label htmlFor="deposit-txn">Transaction hash</label>
                      <input
                        id="deposit-txn"
                        className="deposit-modal__input"
                        placeholder={txnHashPlaceholder(apiNetwork)}
                        value={txnHash}
                        onChange={(e) => setTxnHash(e.target.value)}
                        required
                      />
                    </div>

                    {err && <p className="deposit-modal__error">{err}</p>}
                    {msg && <p className="deposit-modal__success">{msg}</p>}

                    <button type="submit" className="deposit-modal__submit" disabled={busy || !address}>
                      {busy ? (
                        <>
                          <Loader2 size={16} className="deposit-modal__spin" /> Submitting…
                        </>
                      ) : (
                        'Submit for verification'
                      )}
                    </button>
                  </form>
                </div>

                <div className="deposit-modal__qr-col">
                  <div className="deposit-modal__qr-wrap">
                    {address ? (
                      <QRCodeSVG value={address} size={180} level="M" includeMargin className="deposit-modal__qr" />
                    ) : (
                      <div className="deposit-modal__qr deposit-modal__qr--empty">No address</div>
                    )}
                  </div>
                  <p className="deposit-modal__qr-label">Scan to deposit {selectedCoin}</p>
                </div>
              </div>

              <div className="deposit-modal__disclaimer">
                <div className="deposit-modal__disclaimer-head">
                  <AlertCircle size={18} aria-hidden />
                  <strong>Disclaimer</strong>
                </div>
                <p>
                  Send only using <strong>{networkLabelForDisclaimer(chain)}</strong>. Wrong network = lost funds.
                </p>
                <p>
                  Deposit only <strong>{selectedCoin}</strong> to this address. Other assets will be lost.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
