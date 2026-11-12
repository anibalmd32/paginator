export class ByteLru<K, V> {
  readonly #entries = new Map<K, { value: V; bytes: number }>();
  readonly #onEvict: (value: V, key: K) => void;
  #budget: number;
  #bytes = 0;

  constructor(budgetBytes: number, onEvict: (value: V, key: K) => void) {
    this.#budget = budgetBytes;
    this.#onEvict = onEvict;
  }

  get size(): number {
    return this.#entries.size;
  }

  get bytes(): number {
    return this.#bytes;
  }

  get budget(): number {
    return this.#budget;
  }

  set budget(budgetBytes: number) {
    this.#budget = budgetBytes;
    this.#trim();
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  get(key: K): V | undefined {
    const entry = this.#entries.get(key);
    if (!entry) return undefined;
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V, bytes: number): boolean {
    if (bytes > this.#budget) return false;
    this.delete(key);
    this.#entries.set(key, { value, bytes });
    this.#bytes += bytes;
    this.#trim();
    return true;
  }

  delete(key: K): boolean {
    const entry = this.#entries.get(key);
    if (!entry) return false;
    this.#entries.delete(key);
    this.#bytes -= entry.bytes;
    this.#onEvict(entry.value, key);
    return true;
  }

  deleteWhere(predicate: (value: V, key: K) => boolean): number {
    let removed = 0;
    for (const [key, entry] of [...this.#entries]) {
      if (predicate(entry.value, key) && this.delete(key)) removed++;
    }
    return removed;
  }

  clear(): void {
    for (const key of [...this.#entries.keys()]) this.delete(key);
  }

  values(): V[] {
    return [...this.#entries.values()].map((entry) => entry.value);
  }

  #trim(): void {
    for (const key of this.#entries.keys()) {
      if (this.#bytes <= this.#budget) break;
      this.delete(key);
    }
  }
}
