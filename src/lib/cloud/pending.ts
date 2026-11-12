import { isProjectId, newProjectId } from './repository';
import { parseSnapshot } from './snapshot';
import type { ProjectSnapshot } from './snapshot';

const KEY = 'paginator:cloud:pending-save:v1';
const MAX_AGE_MS = 60 * 60 * 1000;

export interface PendingSave {
  snapshot: ProjectSnapshot;
  projectId: string | null;
  newId: string;
}

export type PendingSaveRead =
  | { kind: 'none' }
  | { kind: 'ready'; pending: PendingSave }
  | { kind: 'expired'; pending: PendingSave }
  | { kind: 'damaged' };

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function serialize(pending: PendingSave, savedAt: number): string {
  return JSON.stringify({ savedAt, projectId: pending.projectId, newId: pending.newId, snapshot: pending.snapshot });
}

export function stashPendingSave(pending: Omit<PendingSave, 'newId'> & { newId?: string }, now: number = Date.now()): boolean {
  const store = storage();
  if (!store) return false;
  const text = serialize({ ...pending, newId: pending.newId ?? newProjectId() }, now);
  try {
    store.setItem(KEY, text);
    return store.getItem(KEY) === text;
  } catch {
    return false;
  }
}

export function readPendingSave(now: number = Date.now()): PendingSaveRead {
  const store = storage();
  if (!store) return { kind: 'none' };
  let raw: string | null;
  try {
    raw = store.getItem(KEY);
  } catch {
    return { kind: 'none' };
  }
  if (!raw) return { kind: 'none' };
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return { kind: 'damaged' };
    const { savedAt, projectId, newId, snapshot } = data as Record<string, unknown>;
    const parsed = parseSnapshot(snapshot);
    if (typeof savedAt !== 'number' || !parsed) return { kind: 'damaged' };
    const pending: PendingSave = {
      snapshot: parsed,
      projectId: isProjectId(projectId) ? projectId : null,
      newId: isProjectId(newId) ? newId : newProjectId(),
    };
    if (pending.newId !== newId) {
      try {
        store.setItem(KEY, serialize(pending, savedAt));
      } catch {
      }
    }
    const fresh = now - savedAt <= MAX_AGE_MS && now >= savedAt;
    return fresh ? { kind: 'ready', pending } : { kind: 'expired', pending };
  } catch {
    return { kind: 'damaged' };
  }
}

export function takePendingSave(now: number = Date.now()): PendingSave | null {
  const read = readPendingSave(now);
  clearPendingSave();
  return read.kind === 'ready' ? read.pending : null;
}

export function clearPendingSave(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
  }
}

export function hasPendingSave(): boolean {
  try {
    return storage()?.getItem(KEY) != null;
  } catch {
    return false;
  }
}
