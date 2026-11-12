export type Priority = 'visible' | 'background';

export function abortError(): DOMException {
  return new DOMException('Operación cancelada.', 'AbortError');
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function throwIfAborted(signal: AbortSignal | null | undefined): void {
  if (signal?.aborted) throw abortError();
}

export interface Job<T> {
  readonly promise: Promise<T>;
  promote(): void;
  cancel(): void;
}

interface Entry {
  priority: Priority;
  state: 'queued' | 'running' | 'done';
  cancelled: boolean;
  start: () => Promise<void>;
  rejectNow: (reason: unknown) => void;
  controller: AbortController;
}

export class JobQueue {
  readonly #lanes: Record<Priority, Entry[]> = { visible: [], background: [] };
  readonly #concurrency: number;
  #running = 0;
  #pumpScheduled = false;

  constructor(concurrency: number) {
    this.#concurrency = Math.max(1, Math.floor(concurrency));
  }

  get running(): number {
    return this.#running;
  }

  get pending(): number {
    return this.#lanes.visible.length + this.#lanes.background.length;
  }

  enqueue<T>(run: (signal: AbortSignal) => Promise<T>, priority: Priority, discard?: (value: T) => void): Job<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    promise.catch(() => undefined);

    const controller = new AbortController();
    const entry: Entry = {
      priority,
      state: 'queued',
      cancelled: false,
      controller,
      rejectNow: reject,
      start: async () => {
        try {
          const value = await run(controller.signal);
          if (entry.cancelled) discard?.(value);
          else resolve(value);
        } catch (error) {
          if (!entry.cancelled) reject(error);
        }
      },
    };
    this.#lanes[priority].push(entry);
    this.#schedulePump();

    return {
      promise,
      promote: () => {
        if (entry.state !== 'queued' || entry.priority === 'visible') return;
        this.#remove(entry);
        entry.priority = 'visible';
        this.#lanes.visible.push(entry);
      },
      cancel: () => {
        if (entry.state === 'done' || entry.cancelled) return;
        entry.cancelled = true;
        if (entry.state === 'queued') {
          this.#remove(entry);
          entry.state = 'done';
        } else {
          controller.abort();
        }
        entry.rejectNow(abortError());
      },
    };
  }

  #remove(entry: Entry): void {
    const lane = this.#lanes[entry.priority];
    const index = lane.indexOf(entry);
    if (index >= 0) lane.splice(index, 1);
  }

  #schedulePump(): void {
    if (this.#pumpScheduled) return;
    this.#pumpScheduled = true;
    queueMicrotask(() => {
      this.#pumpScheduled = false;
      this.#pump();
    });
  }

  #pump(): void {
    while (this.#running < this.#concurrency) {
      const entry = this.#lanes.visible.shift() ?? this.#lanes.background.shift();
      if (!entry) return;
      entry.state = 'running';
      this.#running++;
      void entry.start().finally(() => {
        entry.state = 'done';
        this.#running--;
        this.#pump();
      });
    }
  }
}

export interface SharedJobHooks<T> {
  onDeliver?: (value: T) => void;
  onOrphan?: (value: T) => void;
  onSettled?: () => void;
}

interface Waiter<T> {
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  detach: () => void;
}

export class SharedJob<T> {
  readonly #job: Job<T>;
  readonly #hooks: SharedJobHooks<T>;
  readonly #waiters = new Set<Waiter<T>>();
  #settled = false;

  constructor(job: Job<T>, hooks: SharedJobHooks<T> = {}) {
    this.#job = job;
    this.#hooks = hooks;
    job.promise.then(
      (value) => {
        if (this.#settled) {
          hooks.onOrphan?.(value);
          return;
        }
        this.#finish();
        const waiters = this.#drain();
        if (waiters.length === 0) hooks.onOrphan?.(value);
        for (const waiter of waiters) {
          hooks.onDeliver?.(value);
          waiter.resolve(value);
        }
      },
      (error: unknown) => {
        if (this.#settled) return;
        this.#finish();
        for (const waiter of this.#drain()) waiter.reject(error);
      },
    );
  }

  get settled(): boolean {
    return this.#settled;
  }

  get waiters(): number {
    return this.#waiters.size;
  }

  join(signal?: AbortSignal | null, priority: Priority = 'background'): Promise<T> {
    if (signal?.aborted || this.#settled) return Promise.reject(abortError());
    if (priority === 'visible') this.#job.promote();
    return new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        waiter.detach();
        this.#waiters.delete(waiter);
        reject(abortError());
        if (this.#waiters.size === 0) this.abort();
      };
      const waiter: Waiter<T> = {
        resolve,
        reject,
        detach: () => signal?.removeEventListener('abort', onAbort),
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.#waiters.add(waiter);
    });
  }

  abort(): void {
    if (this.#settled) return;
    this.#finish();
    this.#job.cancel();
    for (const waiter of this.#drain()) waiter.reject(abortError());
  }

  #finish(): void {
    this.#settled = true;
    this.#hooks.onSettled?.();
  }

  #drain(): Waiter<T>[] {
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    for (const waiter of waiters) waiter.detach();
    return waiters;
  }
}
