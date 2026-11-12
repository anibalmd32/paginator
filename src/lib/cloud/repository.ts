import type { PreflightVerdict } from '@/lib/types';

import type { ProjectRecord, ProjectWrite } from './backend';
import { getBackend } from './backend';
import { apiErrorCode, CloudError, isCloudError, toCloudError } from './errors';
import { normalizeTitle, parseSnapshot, SNAPSHOT_MAX_BYTES, snapshotByteSize } from './snapshot';
import type { ProjectSnapshot } from './snapshot';

export interface ProjectRow {
  id: string;
  title: string;
  pageCount: number;
  sheetCount: number;
  verdict: PreflightVerdict;
  createdAt: string;
  updatedAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function newProjectId(): string {
  const cryptoApi: Crypto | undefined = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toProjectRow(record: ProjectRecord): ProjectRow {
  return {
    id: record.id,
    title: record.title,
    pageCount: record.page_count,
    sheetCount: record.sheet_count,
    verdict: record.verdict,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

async function run<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toCloudError(error);
  }
}

export function listProjects(): Promise<ProjectRow[]> {
  return run(async () => {
    const backend = await getBackend();
    return (await backend.listProjects()).map(toProjectRow);
  });
}

export function getProject(id: string): Promise<{ row: ProjectRow; snapshot: ProjectSnapshot }> {
  return run(async () => {
    if (!isProjectId(id)) throw new CloudError('not-found');
    const backend = await getBackend();
    const stored = await backend.getProject(id);
    if (!stored) throw new CloudError('not-found');
    const parsed = parseSnapshot(stored.snapshot);
    if (!parsed) {
      throw new CloudError('unknown', 'Esta revista guardada está dañada o es de una versión más nueva de Paginator; no se puede abrir.');
    }
    const row = toProjectRow(stored);
    const title = normalizeTitle(row.title, parsed.title);
    return { row, snapshot: { ...parsed, title, config: { ...parsed.config, title } } };
  });
}

export interface SaveProjectInput {
  id?: string;
  snapshot: ProjectSnapshot;
  expectedUpdatedAt?: string | null | undefined;
  createIfMissing?: boolean;
}

export function saveProject(input: SaveProjectInput): Promise<ProjectRow> {
  return run(async () => {
    const snapshot = parseSnapshot(input.snapshot);
    if (!snapshot) throw new CloudError('unknown', 'Los datos de la revista no son válidos; no se pueden guardar.');
    if (snapshotByteSize(snapshot) > SNAPSHOT_MAX_BYTES) {
      throw new CloudError('unknown', 'La revista tiene demasiadas páginas o archivos para guardarla en la nube.');
    }
    const write: ProjectWrite = {
      title: snapshot.title,
      snapshot,
      page_count: snapshot.summary.pageCount,
      sheet_count: snapshot.summary.sheetCount,
      verdict: snapshot.summary.verdict,
    };

    if (input.id !== undefined && !isProjectId(input.id)) throw new CloudError('not-found');
    const backend = await getBackend();
    const { id } = input;
    if (id === undefined) return toProjectRow(await backend.insertProject(write));
    const expected = input.expectedUpdatedAt ?? undefined;
    const updated = await backend.updateProject(id, write, expected);
    if (updated) return toProjectRow(updated);

    if (input.createIfMissing) {
      try {
        return toProjectRow(await backend.insertProject(write, id));
      } catch (error) {
        if (isCloudError(error) && apiErrorCode(error) === '23505') {
          const again = await backend.updateProject(id, write);
          if (again) return toProjectRow(again);
        }
        throw error;
      }
    }
    if (expected !== undefined && (await backend.getProject(id))) throw new CloudError('conflict');
    throw new CloudError('not-found');
  });
}

export function renameProject(id: string, title: string): Promise<ProjectRow> {
  return run(async () => {
    const clean = normalizeTitle(title, '');
    if (!clean) throw new CloudError('unknown', 'Escribe un título para la revista.');
    if (!isProjectId(id)) throw new CloudError('not-found');
    const backend = await getBackend();
    const updated = await backend.renameProject(id, clean);
    if (!updated) throw new CloudError('not-found');
    return toProjectRow(updated);
  });
}

export function deleteProject(id: string): Promise<void> {
  return run(async () => {
    if (!isProjectId(id)) return;
    const backend = await getBackend();
    await backend.deleteProject(id);
  });
}
