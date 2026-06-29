const listeners = new Set();

export function subscribeToast(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitToast(toast) {
  for (const listener of listeners) {
    listener(toast);
  }
}
