import { describe, expect, test } from 'bun:test';

import { abortError, isAbortError, JobQueue, SharedJob, throwIfAborted } from './queue';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void } {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('la promesa no se rechazó');
}

describe('utilidades de cancelación', () => {
  test('abortError es un DOMException AbortError', () => {
    const error = abortError();
    expect(error).toBeInstanceOf(DOMException);
    expect(error.name).toBe('AbortError');
    expect(isAbortError(error)).toBe(true);
    expect(isAbortError(new Error('otro'))).toBe(false);
  });

  test('throwIfAborted', () => {
    const controller = new AbortController();
    expect(() => throwIfAborted(controller.signal)).not.toThrow();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    controller.abort();
    expect(() => throwIfAborted(controller.signal)).toThrow();
  });
});

describe('JobQueue', () => {
  test('no supera la concurrencia', async () => {
    const queue = new JobQueue(2);
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    const jobs = gates.map((gate, i) =>
      queue.enqueue(async () => {
        running++;
        peak = Math.max(peak, running);
        await gate.promise;
        running--;
        return i;
      }, 'background'),
    );
    await tick();
    expect(queue.running).toBe(2);
    expect(queue.pending).toBe(3);
    for (const gate of gates) {
      gate.resolve();
      await tick();
    }
    expect(await Promise.all(jobs.map((job) => job.promise))).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
    expect(queue.running).toBe(0);
  });

  test('lo visible pasa por delante de lo de fondo, aunque llegue después', async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const run = (name: string) => async (): Promise<void> => {
      order.push(name);
    };
    const jobs = [
      queue.enqueue(run('fondo-1'), 'background'),
      queue.enqueue(run('fondo-2'), 'background'),
      queue.enqueue(run('visible'), 'visible'),
    ];
    await Promise.all(jobs.map((job) => job.promise));
    expect(order).toEqual(['visible', 'fondo-1', 'fondo-2']);
  });

  test('promote adelanta un trabajo que espera', async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const gate = deferred<void>();
    const first = queue.enqueue(async () => {
      await gate.promise;
      order.push('a');
    }, 'background');
    const second = queue.enqueue(async () => void order.push('b'), 'background');
    const third = queue.enqueue(async () => void order.push('c'), 'background');
    await tick();
    third.promote();
    gate.resolve();
    await Promise.all([first.promise, second.promise, third.promise]);
    expect(order).toEqual(['a', 'c', 'b']);
  });

  test('cancelar un trabajo en espera impide que arranque', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<void>();
    let started = false;
    const first = queue.enqueue(() => gate.promise, 'visible');
    const second = queue.enqueue(async () => {
      started = true;
    }, 'visible');
    await tick();
    second.cancel();
    expect(isAbortError(await rejectionOf(second.promise))).toBe(true);
    gate.resolve();
    await first.promise;
    await tick();
    expect(started).toBe(false);
    expect(queue.pending).toBe(0);
  });

  test('cancelar un trabajo en marcha aborta su señal y no libera el hueco hasta que termina', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<void>();
    let seen: AbortSignal | undefined;
    const job = queue.enqueue(async (signal) => {
      seen = signal;
      await gate.promise;
    }, 'visible');
    const next = queue.enqueue(async () => 'siguiente', 'visible');
    await tick();
    job.cancel();
    expect(seen?.aborted).toBe(true);
    expect(isAbortError(await rejectionOf(job.promise))).toBe(true);
    expect(queue.running).toBe(1);
    gate.resolve();
    expect(await next.promise).toBe('siguiente');
  });

  test('discard recibe el resultado de un trabajo que terminó después de cancelarse', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<string>();
    const discarded: string[] = [];
    const job = queue.enqueue(
      () => gate.promise,
      'visible',
      (value) => discarded.push(value),
    );
    await tick();
    job.cancel();
    gate.resolve('render');
    await tick();
    expect(discarded).toEqual(['render']);
  });

  test('un fallo se propaga y la cola sigue', async () => {
    const queue = new JobQueue(1);
    const bad = queue.enqueue(async () => {
      throw new Error('falló');
    }, 'visible');
    const good = queue.enqueue(async () => 7, 'visible');
    expect(await rejectionOf(bad.promise)).toBeInstanceOf(Error);
    expect(await good.promise).toBe(7);
  });
});

describe('SharedJob', () => {
  test('varios solicitantes reciben el mismo resultado de un solo trabajo', async () => {
    const queue = new JobQueue(1);
    let runs = 0;
    const delivered: string[] = [];
    let settled = 0;
    const shared = new SharedJob(
      queue.enqueue(async () => {
        runs++;
        return 'superficie';
      }, 'background'),
      { onDeliver: (value) => delivered.push(value), onSettled: () => settled++ },
    );
    const results = await Promise.all([shared.join(), shared.join(), shared.join()]);
    expect(results).toEqual(['superficie', 'superficie', 'superficie']);
    expect(runs).toBe(1);
    expect(delivered).toHaveLength(3);
    expect(settled).toBe(1);
    expect(shared.settled).toBe(true);
  });

  test('abortar a un solicitante no cancela el trabajo si queda otro', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<string>();
    let jobSignal: AbortSignal | undefined;
    const shared = new SharedJob(
      queue.enqueue((signal) => {
        jobSignal = signal;
        return gate.promise;
      }, 'background'),
    );
    const controller = new AbortController();
    const leaving = shared.join(controller.signal);
    const staying = shared.join();
    await tick();
    controller.abort();
    expect(isAbortError(await rejectionOf(leaving))).toBe(true);
    expect(jobSignal?.aborted).toBe(false);
    expect(shared.waiters).toBe(1);
    gate.resolve('ok');
    expect(await staying).toBe('ok');
  });

  test('cuando se va el último solicitante, el trabajo se cancela de verdad', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<string>();
    let jobSignal: AbortSignal | undefined;
    let settled = 0;
    const shared = new SharedJob(
      queue.enqueue((signal) => {
        jobSignal = signal;
        return gate.promise;
      }, 'background'),
      { onSettled: () => settled++ },
    );
    const controller = new AbortController();
    const only = shared.join(controller.signal);
    await tick();
    controller.abort();
    expect(isAbortError(await rejectionOf(only))).toBe(true);
    expect(jobSignal?.aborted).toBe(true);
    expect(shared.settled).toBe(true);
    expect(settled).toBe(1);
    gate.resolve('tarde');
    await tick();
  });

  test('sumarse con prioridad visible adelanta el trabajo en la cola', async () => {
    const queue = new JobQueue(1);
    const order: string[] = [];
    const gate = deferred<void>();
    const blocker = queue.enqueue(() => gate.promise, 'visible');
    const other = queue.enqueue(async () => void order.push('otro'), 'background');
    const shared = new SharedJob(queue.enqueue(async () => void order.push('compartido'), 'background'));
    const joined = shared.join(undefined, 'visible');
    await tick();
    gate.resolve();
    await Promise.all([blocker.promise, other.promise, joined]);
    expect(order).toEqual(['compartido', 'otro']);
  });

  test('una señal ya abortada o un trabajo ya terminado rechazan al sumarse', async () => {
    const queue = new JobQueue(1);
    const shared = new SharedJob(queue.enqueue(async () => 1, 'visible'));
    const controller = new AbortController();
    controller.abort();
    expect(isAbortError(await rejectionOf(shared.join(controller.signal)))).toBe(true);
    expect(await shared.join()).toBe(1);
    expect(isAbortError(await rejectionOf(shared.join()))).toBe(true);
  });

  test('el resultado sin nadie esperando va a onOrphan', async () => {
    const queue = new JobQueue(1);
    const orphans: number[] = [];
    const job = queue.enqueue(async () => 5, 'visible');
    const shared = new SharedJob(job, { onOrphan: (value) => orphans.push(value) });
    await job.promise;
    await tick();
    expect(orphans).toEqual([5]);
    expect(shared.settled).toBe(true);
  });

  test('un fallo del trabajo llega a todos los solicitantes', async () => {
    const queue = new JobQueue(1);
    const shared = new SharedJob(
      queue.enqueue(async () => {
        throw new Error('No se pudo dibujar la página');
      }, 'visible'),
    );
    const errors = await Promise.all([rejectionOf(shared.join()), rejectionOf(shared.join())]);
    for (const error of errors) expect((error as Error).message).toBe('No se pudo dibujar la página');
  });

  test('abort rechaza a todos con AbortError', async () => {
    const queue = new JobQueue(1);
    const gate = deferred<number>();
    const shared = new SharedJob(queue.enqueue(() => gate.promise, 'visible'));
    const waiting = [shared.join(), shared.join()];
    await tick();
    shared.abort();
    for (const promise of waiting) expect(isAbortError(await rejectionOf(promise))).toBe(true);
    gate.resolve(1);
  });
});
