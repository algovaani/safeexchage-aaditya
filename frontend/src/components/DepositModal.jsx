import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { depositAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import { FIAT_DEPOSIT_SYMBOLS } from '../config/depositNetworks.js';
import { isCryptoDepositSupported } from '../config/cryptoDepositChains.js';
import { WALLET_ASSETS } from '../theme/assets.js';
import CryptoDepositView from './CryptoDepositView.jsx';
import './DepositModal.css';

function FiatDepositForm({ coin, platformInfo, onClose, onSuccess }) {
  const toast = useToast();
  const bank = platformInfo?.bank || {};
  const [fiatForm, setFiatForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    branch: '',
    utr_number: '',
  });
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submitFiat(e) {
    e.preventDefault();
    setErr('');
    if (!proof) {
      const message = 'Payment proof (screenshot or PDF) is required.';
      setErr(message);
      toast.warning(message);
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('amount', fiatForm.amount);
      fd.append('bank_name', fiatForm.bank_name);
      fd.append('account_number', fiatForm.account_number);
      fd.append('branch', fiatForm.branch);
      fd.append('utr_number', fiatForm.utr_number);
      fd.append('payment_proof', proof);
      await depositAPI.submitFiat(fd);
      onSuccess?.();
      setTimeout(onClose, 1500);
    } catch (ex) {
      setErr(ex.message || 'Failed to submit deposit');
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
        <p><span>Branch:</span> {bank.branch || '—'}</p>
        <p><span>Holder:</span> {bank.holder || '—'}</p>
      </div>
      <div className="deposit-modal__field">
        <label>Amount ({coin} equivalent)</label>
        <input className="deposit-modal__input" type="number" step="any" min="0" value={fiatForm.amount} onChange={(e) => setFiatForm((f) => ({ ...f, amount: e.target.value }))} required />
      </div>
      <div className="deposit-modal__field">
        <label>Your bank name</label>
        <input className="deposit-modal__input" value={fiatForm.bank_name} onChange={(e) => setFiatForm((f) => ({ ...f, bank_name: e.target.value }))} required />
      </div>
      <div className="deposit-modal__field">
        <label>Your account number</label>
        <input className="deposit-modal__input" value={fiatForm.account_number} onChange={(e) => setFiatForm((f) => ({ ...f, account_number: e.target.value }))} required />
      </div>
      <div className="deposit-modal__field">
        <label>Your branch</label>
        <input className="deposit-modal__input" value={fiatForm.branch} onChange={(e) => setFiatForm((f) => ({ ...f, branch: e.target.value }))} />
      </div>
      <div className="deposit-modal__field">
        <label>UTR / reference number</label>
        <input className="deposit-modal__input" value={fiatForm.utr_number} onChange={(e) => setFiatForm((f) => ({ ...f, utr_number: e.target.value }))} required />
      </div>
      <div className="deposit-modal__field">
        <label>Payment proof</label>
        <input type="file" accept="image/jpeg,image/png,application/pdf" className="deposit-modal__input deposit-modal__file" onChange={(e) => setProof(e.target.files?.[0] || null)} required />
      </div>
      {err && <p className="deposit-modal__error">{err}</p>}
      <button type="submit" className="deposit-modal__submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for approval'}
      </button>
    </form>
  );
}

export default function DepositModal({ coin: initialCoin, platformInfo, onClose, onSuccess }) {
  const [selectedCoin, setSelectedCoin] = useState(initialCoin || 'USDT');

  const isFiat = FIAT_DEPOSIT_SYMBOLS.has(String(selectedCoin || '').toUpperCase());
  const coinColor = WALLET_ASSETS.find((a) => a.symbol === selectedCoin)?.color || '#f0b90b';
  const cryptoSupported = isCryptoDepositSupported(selectedCoin);

  useEffect(() => {
    setSelectedCoin(initialCoin || 'USDT');
  }, [initialCoin]);

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

  return (
    <div className="deposit-modal-backdrop" onClick={onClose} role="presentation">
      <div className="deposit-modal deposit-modal--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="deposit-modal-title">
        <header className="deposit-modal__header">
          <div className="deposit-modal__title-wrap">
            <span className="deposit-modal__coin-icon" style={{ background: coinColor }}>{selectedCoin.slice(0, 2)}</span>
            <div>
              <h2 id="deposit-modal-title">Deposit {selectedCoin}</h2>
              <p className="deposit-modal__subtitle">
                {isFiat ? 'Bank transfer — submit proof for approval' : 'Send to platform wallet, then submit TX details'}
              </p>
            </div>
          </div>
          <button type="button" className="deposit-modal__close" onClick={onClose} aria-label="Close"><X size={20} /></button>
        </header>

        <div className="deposit-modal__body">
          <div className="deposit-modal__field deposit-modal__field--coin">
            <label htmlFor="deposit-coin">Asset</label>
            <select id="deposit-coin" className="deposit-modal__select" value={selectedCoin} onChange={(e) => setSelectedCoin(e.target.value)}>
              {WALLET_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
              ))}
            </select>
          </div>

          {isFiat ? (
            <FiatDepositForm coin={selectedCoin} platformInfo={platformInfo} onClose={onClose} onSuccess={onSuccess} />
          ) : cryptoSupported ? (
            <CryptoDepositView coin={selectedCoin} onSubmitted={onSuccess} />
          ) : (
            <p className="deposit-modal__error">
              On-chain deposit for {selectedCoin} is not available. Please use BNB, ETH, TRX, or USDT.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
