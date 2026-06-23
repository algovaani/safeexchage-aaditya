import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { getApiErrorMessage, withdrawalAPI } from '../services/api.js';
import {
  COIN_COLORS,
  getNetworksForCoin,
  networkLabelForDisclaimer,
} from '../config/depositNetworks.js';
import { WALLET_ASSETS } from '../theme/assets.js';
import './DepositModal.css';

function FiatWithdrawForm({ coin, available, onClose, onSuccess }) {
  const [form, setForm] = useState({
    amount: '',
    bank_name: '',
    account_number: '',
    ifsc: '',
    account_holder: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  async function submitFiat(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const amount = parseFloat(form.amount);
    if (!(amount > 0)) {
      setErr('Enter a valid amount.');
      return;
    }
    if (amount > available) {
      setErr('Amount exceeds available balance.');
      return;
    }
    setBusy(true);
    try {
      await withdrawalAPI.submitFiat({
        amount,
        bank_name: form.bank_name,
        account_number: form.account_number,
        ifsc: form.ifsc,
        account_holder: form.account_holder,
      });
      setMsg('Bank withdrawal submitted. Admin will process your request.');
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
      <p className="deposit-modal__scan-hint">
        Enter your bank details. Amount is deducted from your USDT balance (INR payout).
      </p>

      <div className="deposit-modal__field">
        <label>Available balance</label>
        <input className="deposit-modal__input" readOnly value={`${available.toFixed(2)} USDT`} />
      </div>

      <div className="deposit-modal__field">
        <label>Amount ({coin} equivalent / USDT)</label>
        <input
          className="deposit-modal__input"
          type="number"
          step="any"
          min="0"
          placeholder="10000"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Your bank name</label>
        <input
          className="deposit-modal__input"
          value={form.bank_name}
          onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Account holder name</label>
        <input
          className="deposit-modal__input"
          value={form.account_holder}
          onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>Account number</label>
        <input
          className="deposit-modal__input"
          value={form.account_number}
          onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
          required
        />
      </div>
      <div className="deposit-modal__field">
        <label>IFSC code</label>
        <input
          className="deposit-modal__input"
          value={form.ifsc}
          onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
          required
        />
      </div>

      {err && <p className="deposit-modal__error">{err}</p>}
      {msg && <p className="deposit-modal__success">{msg}</p>}

      <button type="submit" className="deposit-modal__submit deposit-modal__submit--danger" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for verification'}
      </button>
    </form>
  );
}

export default function WithdrawModal({
  coin: initialCoin,
  platformInfo,
  availableBalance = 0,
  onClose,
  onSuccess,
}) {
  const [selectedCoin, setSelectedCoin] = useState(initialCoin || 'USDT');

  const networks = useMemo(
    () => getNetworksForCoin(selectedCoin, platformInfo),
    [selectedCoin, platformInfo]
  );

  const [chainId, setChainId] = useState(networks?.[0]?.id ?? '');
  const [walletAddress, setWalletAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const available = Number(availableBalance) || 0;

  const coinColor =
    WALLET_ASSETS.find((a) => a.symbol === selectedCoin)?.color ||
    COIN_COLORS[selectedCoin] ||
    '#f0b90b';

  useEffect(() => {
    setSelectedCoin(initialCoin || 'USDT');
  }, [initialCoin]);

  useEffect(() => {
    setChainId(networks?.[0]?.id ?? '');
    setWalletAddress('');
    setAmount('');
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
  const apiNetwork = chain?.apiNetwork || 'BEP20';

  async function submitCrypto(e) {
    e.preventDefault();
    setErr('');
    setMsg('');
    const parsed = parseFloat(amount);
    if (!(parsed > 0)) {
      setErr('Enter a valid amount.');
      return;
    }
    if (parsed > available) {
      setErr('Amount exceeds available balance.');
      return;
    }
    setBusy(true);
    try {
      await withdrawalAPI.submitCrypto({
        amount: parsed,
        wallet_address: walletAddress.trim(),
        network: apiNetwork,
        currency: selectedCoin,
      });
      setMsg(`${selectedCoin} withdrawal submitted. Admin will verify and process.`);
      setAmount('');
      setWalletAddress('');
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
        aria-labelledby="withdraw-modal-title"
      >
        <header className="deposit-modal__header">
          <div className="deposit-modal__title-wrap">
            <span className="deposit-modal__coin-icon" style={{ background: coinColor }}>
              {selectedCoin.slice(0, 2)}
            </span>
            <div>
              <h2 id="withdraw-modal-title">Withdraw {selectedCoin}</h2>
              <p className="deposit-modal__subtitle">
                {isFiat ? 'Bank transfer (INR)' : `Crypto · ${chain?.label || 'Select network'}`}
              </p>
            </div>
          </div>
          <button type="button" className="deposit-modal__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="deposit-modal__body">
          <div className="deposit-modal__field deposit-modal__field--coin">
            <label htmlFor="withdraw-coin">Select Coin:</label>
            <select
              id="withdraw-coin"
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
            <FiatWithdrawForm
              coin={selectedCoin}
              available={available}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          ) : (
            <>
              <div className="deposit-modal__fields">
                <div className="deposit-modal__field">
                  <label htmlFor="withdraw-chain">Select Chain:</label>
                  <select
                    id="withdraw-chain"
                    className="deposit-modal__select"
                    value={chainId}
                    onChange={(e) => setChainId(e.target.value)}
                  >
                    {networks.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </div>

                <form className="deposit-modal__form" onSubmit={submitCrypto}>
                  <div className="deposit-modal__field">
                    <label>Available balance</label>
                    <input
                      className="deposit-modal__input"
                      readOnly
                      value={`${available.toFixed(2)} USDT`}
                    />
                  </div>

                  <div className="deposit-modal__field">
                    <label htmlFor="withdraw-amount">Amount ({selectedCoin})</label>
                    <input
                      id="withdraw-amount"
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
                    <label htmlFor="withdraw-address">Your wallet address</label>
                    <input
                      id="withdraw-address"
                      className="deposit-modal__input"
                      placeholder={
                        apiNetwork === 'TRC20' || apiNetwork === 'TRX'
                          ? 'T… (TRON address)'
                          : '0x… (EVM address)'
                      }
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      required
                    />
                    <p className="deposit-modal__scan-hint">
                      Funds will be sent to this address on {chain?.label || 'selected network'}.
                    </p>
                  </div>

                  {err && <p className="deposit-modal__error">{err}</p>}
                  {msg && <p className="deposit-modal__success">{msg}</p>}

                  <button
                    type="submit"
                    className="deposit-modal__submit deposit-modal__submit--danger"
                    disabled={busy}
                  >
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

              <div className="deposit-modal__disclaimer">
                <div className="deposit-modal__disclaimer-head">
                  <AlertCircle size={18} aria-hidden />
                  <strong>Disclaimer</strong>
                </div>
                <p>
                  Use <strong>{networkLabelForDisclaimer(chain)}</strong> only. Wrong network = lost funds.
                </p>
                <p>
                  Withdraw only <strong>{selectedCoin}</strong> to a compatible wallet address.
                </p>
                <p>Amount is locked until admin approves or rejects your request.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
