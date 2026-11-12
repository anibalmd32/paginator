import { cloudMode, supabaseSettings } from './config';
import type { Database } from './database.types';
import { CloudError } from './errors';
import type { ProjectSnapshot } from './snapshot';

export interface CloudUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

type ProjectTableRow = Database['public']['Tables']['projects']['Row'];

export type ProjectRecord = Omit<ProjectTableRow, 'user_id' | 'snapshot'>;

export type StoredProject = ProjectRecord & { snapshot: unknown };

export interface ProjectWrite {
  title: string;
  snapshot: ProjectSnapshot;
  page_count: number;
  sheet_count: number;
  verdict: ProjectTableRow['verdict'];
}

export interface CloudBackend {
  readonly mode: 'supabase' | 'mock';
  getUser(): Promise<CloudUser | null>;
  onUserChange(listener: (user: CloudUser | null) => void): () => void;
  signInWithGoogle(redirectTo: string): Promise<void>;
  exchangeCode(code: string): Promise<string | null>;
  signOut(): Promise<void>;

  listProjects(): Promise<ProjectRecord[]>;
  getProject(id: string): Promise<StoredProject | null>;
  insertProject(write: ProjectWrite, id?: string): Promise<ProjectRecord>;
  updateProject(id: string, write: ProjectWrite, expectedUpdatedAt?: string): Promise<ProjectRecord | null>;
  renameProject(id: string, title: string): Promise<ProjectRecord | null>;
  deleteProject(id: string): Promise<void>;
}

let backendPromise: Promise<CloudBackend> | null = null;

export function getBackend(): Promise<CloudBackend> {
  if (backendPromise) return backendPromise;
  const mode = cloudMode();
  if (mode === 'disabled') return Promise.reject(new CloudError('not-configured'));

  const loading: Promise<CloudBackend> =
    mode === 'mock'
      ? import.meta.env.PUBLIC_PAGINATOR_CLOUD !== undefined
        ? import('./mock').then((module) => module.createMockBackend(module.browserMockEnv()))
        : Promise.reject(new CloudError('not-configured'))
      : import.meta.env.PUBLIC_SUPABASE_URL !== undefined && import.meta.env.PUBLIC_SUPABASE_ANON_KEY !== undefined
        ? import('./supabase').then((module) => {
            const settings = supabaseSettings();
            if (!settings) throw new CloudError('not-configured');
            return module.createSupabaseBackend(settings);
          })
        : Promise.reject(new CloudError('not-configured'));

  backendPromise = loading.catch((error: unknown) => {
    backendPromise = null;
    if (error instanceof CloudError) throw error;
    throw new CloudError('network', 'No se pudo cargar el módulo de cuentas. Comprueba tu conexión y vuelve a intentarlo.', {
      cause: error,
    });
  });
  return backendPromise;
}
