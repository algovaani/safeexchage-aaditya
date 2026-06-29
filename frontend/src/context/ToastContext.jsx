import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { friendlyApiMessage } from '../utils/apiMessage.js';
import { emitToast, subscribeToast } from '../utils/toastBus.js';
import '../components/ToastStack.css';

const ToastContext = createContext(null);

const TITLES = {
  success: 'Success',
  error: 'Something went wrong',
  warning: 'Please check',
  info: 'Notice',
};

function ToastIcon({ type }) {
  const props = { size: 18, className: `toast-item__icon toast-item__icon--${type}` };
  if (type === 'success') return <CheckCircle2 {...props} />;
  if (type === 'warning') return <AlertTriangle {...props} />;
  if (type === 'info') return <Info {...props} />;
  return <AlertCircle {...props} />;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((type, message, options = {}) => {
    const text = friendlyApiMessage(message, TITLES[type]);
    const id = ++idRef.current;
    const duration = options.duration ?? (type === 'error' ? 7000 : 5000);

    setToasts((prev) => [...prev.slice(-4), { id, type, message: text, title: options.title || TITLES[type] }]);

    if (duration > 0) {
      window.setTimeout(() => dismiss(id), duration);
    }

    return id;
  }, [dismiss]);

  const value = useMemo(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      warning: (message, options) => push('warning', message, options),
      info: (message, options) => push('info', message, options),
      dismiss,
    }),
    [push, dismiss]
  );

  useEffect(() => {
    return subscribeToast(({ type, message, options }) => {
      push(type, message, options);
    });
  }, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-item toast-item--${toast.type}`} role="status">
            <ToastIcon type={toast.type} />
            <div className="toast-item__body">
              <div className="toast-item__title">{toast.title}</div>
              <div className="toast-item__message">{toast.message}</div>
            </div>
            <button type="button" className="toast-item__close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
