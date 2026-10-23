/** Small in-process TTL + LRU cache. Single-instance only; documented in SYSTEM_ARCHITECTURE.md. */
export class TtlCache<V> {
  private store = new Map<string, { value: V; expires: number }>();
  constructor(private readonly max = 1000) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, hit);
    return hit.value;
  }

  set(key: string, value: V, ttlMs: number, now = Date.now()): void {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, { value, expires: now + ttlMs });
    while (this.store.size > this.max) this.store.delete(this.store.keys().next().value as string);
  }

  async wrap(key: string, ttlMs: number, fn: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const v = await fn();
    this.set(key, v, ttlMs);
    return v;
  }

  clear() {
    this.store.clear();
  }
}
