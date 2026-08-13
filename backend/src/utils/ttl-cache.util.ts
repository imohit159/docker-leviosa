interface CacheEntry<TValue> {
  value: TValue;
  expiresAt: number;
}

export interface TtlCacheInstance<TValue> {
  /** Runs `producer` only when no live entry exists. Concurrent callers share one flight. */
  resolve(key: string, producer: () => Promise<TValue>): Promise<TValue>;
  peek(key: string): TValue | undefined;
  invalidate(key?: string): void;
}

/**
 * Small read-through cache with request coalescing. Used to stop a burst of API
 * calls from turning into a burst of Docker Engine calls: listing containers is
 * cheap but not free, and every volume row needs the same inventory.
 */
export const TtlCache = Object.freeze({
  create<TValue>(ttlMs: number): TtlCacheInstance<TValue> {
    const entries = new Map<string, CacheEntry<TValue>>();
    const inFlight = new Map<string, Promise<TValue>>();

    const isLive = (entry: CacheEntry<TValue> | undefined): entry is CacheEntry<TValue> =>
      entry !== undefined && entry.expiresAt > Date.now();

    return {
      async resolve(key, producer) {
        const cached = entries.get(key);
        if (isLive(cached)) {
          return cached.value;
        }

        const pending = inFlight.get(key);
        if (pending) {
          return pending;
        }

        const flight = producer()
          .then((value) => {
            if (ttlMs > 0) {
              entries.set(key, { value, expiresAt: Date.now() + ttlMs });
            }
            return value;
          })
          .finally(() => {
            inFlight.delete(key);
          });

        inFlight.set(key, flight);
        return flight;
      },

      peek(key) {
        const cached = entries.get(key);
        return isLive(cached) ? cached.value : undefined;
      },

      invalidate(key) {
        if (key === undefined) {
          entries.clear();
          return;
        }
        entries.delete(key);
      },
    };
  },
});
