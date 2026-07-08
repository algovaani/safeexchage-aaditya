import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, HelpCircle, Info, X } from 'lucide-react';
import '../components/DialogModal.css';

const DialogContext = createContext(null);

function DialogIcon({ variant }) {
  if (variant === 'danger' || variant === 'warning') {
    return <AlertTriangle size={22} className={`dialog-modal__icon dialog-modal__icon--${variant}`} />;
  }
  if (variant === 'info') {
    return <Info size={22} className="dialog-modal__icon dialog-modal__icon--info" />;
  }
  return <HelpCircle size={22} className="dialog-modal__icon dialog-modal__icon--primary" />;
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const firstFieldRef = useRef(null);

  const closeDialog = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const openDialog = useCallback((config) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setDialog({
        type: config.type || 'confirm',
        title: config.title || 'Confirm',
        message: config.message || '',
        confirmLabel: config.confirmLabel || (config.type === 'alert' ? 'OK' : 'Confirm'),
        cancelLabel: config.cancelLabel || 'Cancel',
        variant: config.variant || 'primary',
        label: config.label || '',
        placeholder: config.placeholder || '',
        defaultValue: config.defaultValue ?? '',
        required: Boolean(config.required),
        fields: Array.isArray(config.fields) ? config.fields : null,
        values: config.fields
          ? Object.fromEntries(
              config.fields.map((field) => [field.key, field.defaultValue ?? ''])
            )
          : { value: config.defaultValue ?? '' },
      });
    });
  }, []);

  const confirm = useCallback(
    (config) => openDialog({ ...config, type: 'confirm' }),
    [openDialog]
  );

  const alert = useCallback(
    (config) => openDialog({ ...config, type: 'alert' }),
    [openDialog]
  );

  const prompt = useCallback(
    (config) => openDialog({ ...config, type: 'prompt' }),
    [openDialog]
  );

  useEffect(() => {
    if (!dialog) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeDialog(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, closeDialog]);

  useEffect(() => {
    if (dialog?.type === 'prompt' && firstFieldRef.current) {
      firstFieldRef.current.focus();
    }
  }, [dialog]);

  const value = useMemo(() => ({ confirm, alert, prompt }), [confirm, alert, prompt]);

  function updateField(key, nextValue) {
    setDialog((prev) => {
      if (!prev) return prev;
      return { ...prev, values: { ...prev.values, [key]: nextValue } };
    });
  }

  function handleConfirm() {
    if (!dialog) return;

    if (dialog.type === 'confirm' || dialog.type === 'alert') {
      closeDialog(true);
      return;
    }

    if (dialog.fields?.length) {
      for (const field of dialog.fields) {
        const val = String(dialog.values[field.key] ?? '').trim();
        if (field.required && !val) return;
      }
      closeDialog({ ...dialog.values });
      return;
    }

    const value = String(dialog.values.value ?? '').trim();
    if (dialog.required && !value) return;
    closeDialog(value);
  }

  const isPrompt = dialog?.type === 'prompt';
  const confirmVariant = dialog?.variant || 'primary';

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="dialog-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (dialog.type !== 'alert') closeDialog(null);
          }}
        >
          <div
            className="dialog-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dialog-modal__header">
              <DialogIcon variant={confirmVariant} />
              <div className="dialog-modal__header-text">
                <h2 id="dialog-modal-title">{dialog.title}</h2>
                {dialog.message ? <p>{dialog.message}</p> : null}
              </div>
              {dialog.type !== 'alert' && (
                <button
                  type="button"
                  className="dialog-modal__close"
                  aria-label="Close"
                  onClick={() => closeDialog(null)}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {isPrompt && (
              <div className="dialog-modal__body">
                {dialog.fields?.length ? (
                  dialog.fields.map((field, index) => (
                    <label key={field.key} className="dialog-modal__field">
                      <span>{field.label}</span>
                      <input
                        ref={index === 0 ? firstFieldRef : undefined}
                        type={field.type || 'text'}
                        value={dialog.values[field.key] ?? ''}
                        placeholder={field.placeholder || ''}
                        onChange={(e) => updateField(field.key, e.target.value)}
                      />
                    </label>
                  ))
                ) : (
                  <label className="dialog-modal__field">
                    {dialog.label ? <span>{dialog.label}</span> : null}
                    <input
                      ref={firstFieldRef}
                      type="text"
                      value={dialog.values.value ?? ''}
                      placeholder={dialog.placeholder || ''}
                      onChange={(e) => updateField('value', e.target.value)}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="dialog-modal__actions">
              {dialog.type !== 'alert' && (
                <button type="button" className="dialog-modal__btn dialog-modal__btn--ghost" onClick={() => closeDialog(null)}>
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                className={`dialog-modal__btn dialog-modal__btn--${confirmVariant}`}
                onClick={handleConfirm}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error('useDialog must be used within DialogProvider');
  }
  return ctx;
}
