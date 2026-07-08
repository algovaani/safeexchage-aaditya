import { useEffect, useState } from 'react';
import { Banknote, Loader2, X } from 'lucide-react';
import { cashInPersonAPI } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';
import './DepositModal.css';

const INFO_MESSAGE =
  'Kindly share your mobile number and city so our team can connect with you at the earliest.';

export default function CashInPersonModal({ userMobile, onClose, onSuccess }) {
  const toast = useToast();
  const [form, setForm] = useState({
    mobile: userMobile || '',
    city: '',
    amount: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (userMobile) {
      setForm((f) => ({ ...f, mobile: userMobile }));
    }
  }, [userMobile]);

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

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const mobile = form.mobile.trim();
    const city = form.city.trim();
    if (!mobile || !city) {
      const message = 'Mobile number and city are required.';
      setErr(message);
      toast.warning(message);
      return;
    }
    setBusy(true);
    try {
      const body = { mobile, city };
      const amount = parseFloat(form.amount);
      if (Number.isFinite(amount) && amount > 0) body.amount = amount;
      await cashInPersonAPI.submit(body);
      setDone(true);
      toast.success('Request sent — our team will contact you shortly.');
      onSuccess?.();
      setTimeout(onClose, 1800);
    } catch (ex) {
      setErr(ex.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deposit-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="deposit-modal cash-in-person-modal"
        role="dialog"
        aria-labelledby="cash-in-person-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="deposit-modal__header">
          <div className="deposit-modal__title-wrap">
            <span className="deposit-modal__coin-icon cash-in-person-modal__icon">
              <Banknote size={18} color="#0b162c" strokeWidth={2.25} />
            </span>
            <div>
              <h2 id="cash-in-person-title">Cash in Person</h2>
              <p className="deposit-modal__subtitle">Request a team callback</p>
            </div>
          </div>
          <button type="button" className="deposit-modal__close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </header>

        <div className="deposit-modal__body">
          {done ? (
            <div className="cash-in-person-modal__success-box">
              <p className="deposit-modal__success">Request submitted successfully.</p>
              <p className="cash-in-person-modal__success-sub">Our team will reach out to you at the earliest.</p>
            </div>
          ) : (
            <form className="deposit-modal__form" onSubmit={submit}>
              <p className="deposit-modal__info">{INFO_MESSAGE}</p>
              <div className="deposit-modal__field">
                <label htmlFor="cip-mobile">Mobile number</label>
                <input
                  id="cip-mobile"
                  className="deposit-modal__input"
                  type="tel"
                  value={form.mobile}
                  onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  placeholder="10-digit mobile"
                  required
                />
              </div>
              <div className="deposit-modal__field">
                <label htmlFor="cip-city">City</label>
                <input
                  id="cip-city"
                  className="deposit-modal__input"
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  placeholder="Your city"
                  required
                />
              </div>
              <div className="deposit-modal__field">
                <label htmlFor="cip-amount">Expected amount (USDT) — optional</label>
                <input
                  id="cip-amount"
                  className="deposit-modal__input"
                  type="number"
                  step="any"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="e.g. 5000"
                />
              </div>
              {err && <p className="deposit-modal__error">{err}</p>}
              <div className="deposit-modal__footer">
                <button type="button" className="deposit-modal__footer-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="deposit-modal__submit" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 size={16} className="deposit-modal__spin" /> Sending…
                    </>
                  ) : (
                    'Send request'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
