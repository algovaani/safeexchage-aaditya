import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import '../DialogModal.css';

function fmtUsdt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0.00';
  return v.toFixed(2);
}

export default function DepositApproveModal({ row, onClose, onConfirm, busy = false }) {
  const [applyBonus, setApplyBonus] = useState(false);
  const [bonusPercent, setBonusPercent] = useState('');
  const [bonusFlat, setBonusFlat] = useState('');

  const creditUsdt = useMemo(() => {
    if (!row) return 0;
    const usdt = Number(row.usdtAmount);
    if (Number.isFinite(usdt) && usdt > 0) return usdt;
    if (String(row.currency || '').toUpperCase() === 'USDT') return Number(row.amount) || 0;
    return Number(row.amount) || 0;
  }, [row]);

  const bonusTotal = useMemo(() => {
    if (!applyBonus) return 0;
    const pct = Math.max(0, Number(bonusPercent) || 0);
    const flat = Math.max(0, Number(bonusFlat) || 0);
    return Math.round((flat + (creditUsdt * pct) / 100) * 100) / 100;
  }, [applyBonus, bonusPercent, bonusFlat, creditUsdt]);

  useEffect(() => {
    if (!row) return;
    setApplyBonus(false);
    setBonusPercent('');
    setBonusFlat('');
  }, [row]);

  if (!row) return null;

  const user = row.user || {};
  const userLabel = user.mobile || user.email || row.userLabel || 'User';

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    await onConfirm({
      apply_bonus: applyBonus,
      bonus_percent: applyBonus ? Math.max(0, Number(bonusPercent) || 0) : 0,
      bonus_flat: applyBonus ? Math.max(0, Number(bonusFlat) || 0) : 0,
    });
  }

  return (
    <div className="dialog-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="dialog-modal dialog-modal--deposit-approve"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-approve-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-modal__header">
          <div className="dialog-modal__header-text">
            <h2 id="deposit-approve-title">Approve deposit</h2>
            <p>
              Credit wallet for <strong>{userLabel}</strong>
            </p>
          </div>
          <button type="button" className="dialog-modal__close" aria-label="Close" disabled={busy} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <form className="dialog-modal__body" onSubmit={handleSubmit}>
          <dl className="deposit-approve__summary">
            <dt>Deposit</dt>
            <dd>
              {row.amount} {row.currency || 'USDT'}
            </dd>
            <dt>USDT credit</dt>
            <dd>{fmtUsdt(creditUsdt)} USDT</dd>
          </dl>

          <label className="deposit-approve__check">
            <input
              type="checkbox"
              checked={applyBonus}
              onChange={(e) => setApplyBonus(e.target.checked)}
              disabled={busy}
            />
            <span>Add trading bonus (not withdrawable)</span>
          </label>

          {applyBonus && (
            <div className="deposit-approve__bonus-fields">
              <label className="dialog-modal__field">
                <span>Bonus % of USDT credit</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 10"
                  value={bonusPercent}
                  onChange={(e) => setBonusPercent(e.target.value)}
                  disabled={busy}
                />
              </label>
              <label className="dialog-modal__field">
                <span>Flat bonus (USDT)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 100"
                  value={bonusFlat}
                  onChange={(e) => setBonusFlat(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="deposit-approve__bonus-total">
                Total trading bonus: <strong>{fmtUsdt(bonusTotal)} USDT</strong>
              </p>
              <p className="deposit-approve__hint">
                Bonus is added to balance for spot trading only. Users cannot withdraw this amount.
              </p>
            </div>
          )}

          <div className="dialog-modal__actions">
            <button type="button" className="dialog-modal__btn dialog-modal__btn--ghost" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dialog-modal__btn dialog-modal__btn--primary" disabled={busy}>
              {busy ? 'Approving…' : 'Approve & credit wallet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
