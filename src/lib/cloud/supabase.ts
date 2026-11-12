import { createClient } from '@supabase/supabase-js';
import type { AuthError, PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';

import type { CloudBackend, CloudUser, ProjectRecord, ProjectWrite } from './backend';
import type { KeyValueStorage } from './mock';
import type { SupabaseSettings } from './config';
import type { Database, Json } from './database.types';
import { CloudError, cloudErrorFromApi } from './errors';

const RECORD_COLUMNS = 'id, title, page_count, sheet_count, verdict, created_at, updated_at';
const FULL_COLUMNS = `${RECORD_COLUMNS}, snapshot`;

type Client = SupabaseClient<Database>;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function userFromSupabase(user: User): CloudUser {
  const meta: Record<string, unknown> = user.user_metadata;
  return {
    id: user.id,
    email: user.email ?? text(meta['email']),
    name: text(meta['full_name']) ?? text(meta['name']),
    avatarUrl: text(meta['avatar_url']) ?? text(meta['picture']),
  };
}

export function exchangeErrorMessage(error: Pick<AuthError, 'message' | 'status' | 'code'>): string {
  const code = String(error.code ?? '');
  if (error.status === 0 || /fetch|network/i.test(error.message)) {
    return 'No hay conexión con el servidor de cuentas. Comprueba tu red y vuelve a intentarlo.';
  }
  if (/verifier|flow_state|bad_code|expired|invalid_grant/i.test(`${code} ${error.message}`)) {
    return 'El enlace de acceso caducó o se abrió en otro navegador. Vuelve a intentarlo desde aquí.';
  }
  return 'No se pudo completar el acceso con Google. Vuelve a intentarlo.';
}

function fail(error: PostgrestError, status: number): CloudError {
  return cloudErrorFromApi({ status, code: error.code, message: error.message });
}

export interface SupabaseBackendOverrides {
  fetch?: typeof fetch;
  storage?: KeyValueStorage;
}

export function createSupabaseBackend(settings: SupabaseSettings, overrides: SupabaseBackendOverrides = {}): CloudBackend {
  const client: Client = createClient<Database>(settings.url, settings.anonKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: !overrides.fetch,
      ...(overrides.storage ? { storage: overrides.storage } : {}),
    },
    ...(overrides.fetch ? { global: { fetch: overrides.fetch } } : {}),
  });

  async function currentUser(): Promise<User | null> {
    const { data } = await client.auth.getSession();
    return data.session?.user ?? null;
  }

  async function requireUserId(): Promise<string> {
    const user = await currentUser();
    if (!user) throw new CloudError('not-signed-in');
    return user.id;
  }

  const toJson = (write: ProjectWrite): Omit<Database['public']['Tables']['projects']['Insert'], 'id'> => ({
    ...write,
    snapshot: write.snapshot as unknown as Json,
  });

  return {
    mode: 'supabase',

    getUser: async () => {
      const user = await currentUser();
      return user ? userFromSupabase(user) : null;
    },

    onUserChange: (listener) => {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(session ? userFromSupabase(session.user) : null);
      });
      return () => data.subscription.unsubscribe();
    },

    signInWithGoogle: async (redirectTo) => {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      });
      if (error) {
        throw new CloudError(error.status === 0 ? 'network' : 'unknown', 'No se pudo abrir el acceso con Google. Vuelve a intentarlo.', {
          cause: error,
        });
      }
    },

    exchangeCode: async (code) => {
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return null;
      if (await currentUser()) return null;
      console.warn('Paginator: no se pudo canjear el código de acceso', error);
      return exchangeErrorMessage(error);
    },

    signOut: async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error && (await currentUser())) throw new CloudError('unknown', 'No se pudo cerrar la sesión. Vuelve a intentarlo.', { cause: error });
    },

    listProjects: async () => {
      const userId = await requireUserId();
      const { data, error, status } = await client
        .from('projects')
        .select(RECORD_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });
      if (error) throw fail(error, status);
      return data satisfies ProjectRecord[];
    },

    getProject: async (id) => {
      const userId = await requireUserId();
      const { data, error, status } = await client.from('projects').select(FULL_COLUMNS).eq('id', id).eq('user_id', userId).maybeSingle();
      if (error) throw fail(error, status);
      return data;
    },

    insertProject: async (write, id) => {
      await requireUserId();
      const row = id === undefined ? toJson(write) : { ...toJson(write), id };
      const { data, error, status } = await client.from('projects').insert(row).select(RECORD_COLUMNS).single();
      if (error) throw fail(error, status);
      return data;
    },

    updateProject: async (id, write, expectedUpdatedAt) => {
      const userId = await requireUserId();
      let query = client.from('projects').update(toJson(write)).eq('id', id).eq('user_id', userId);
      if (expectedUpdatedAt !== undefined) query = query.eq('updated_at', expectedUpdatedAt);
      const { data, error, status } = await query.select(RECORD_COLUMNS).maybeSingle();
      if (error) throw fail(error, status);
      return data;
    },

    renameProject: async (id, title) => {
      const userId = await requireUserId();
      const { data, error, status } = await client
        .from('projects')
        .update({ title })
        .eq('id', id)
        .eq('user_id', userId)
        .select(RECORD_COLUMNS)
        .maybeSingle();
      if (error) throw fail(error, status);
      return data;
    },

    deleteProject: async (id) => {
      const userId = await requireUserId();
      const { error, status } = await client.from('projects').delete().eq('id', id).eq('user_id', userId);
      if (error) throw fail(error, status);
    },
  };
}
