// Minimal publish/subscribe used to tell the UI that auth or progress changed.

export function createBus() {
  const handlers = new Map();
  return {
    /** @returns {() => void} unsubscribe */
    on(type, handler) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(handler);
      return () => handlers.get(type)?.delete(handler);
    },
    emit(type, payload) {
      for (const handler of handlers.get(type) || []) handler(payload);
    },
  };
}
