import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';

import type { CloudUser } from './backend';
import { getBackend } from './backend';
import { cloudMode } from './config';
import { CloudError, toCloudError } from './errors';
import { callbackUrl, currentPath, DEFAULT_NEXT, safeNextPath } from './redirect';

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: CloudUser | null;
  error: string | null;
  init(): void;
}

let initialized = false;

export const useAuth: UseBoundStore<StoreApi<AuthState>> = create<AuthState>()((set) => ({
  status: cloudMode() === 'disabled' ? 'disabled' : 'loading',
  user: null,
  error: null,
  init: () => {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;
    if (cloudMode() === 'disabled') {
      set({ status: 'disabled', user: null, error: null });
      return;
    }
    const apply = (user: CloudUser | null): void => set({ status: user ? 'signed-in' : 'signed-out', user, error: null });
    getBackend()
      .then(async (backend) => {
        backend.onUserChange(apply);
        apply(await backend.getUser());
      })
      .catch((error: unknown) => {
        initialized = false;
        set({ status: 'signed-out', user: null, error: toCloudError(error).message });
      });
  },
}));

export async function signInWithGoogle(options?: { next?: string }): Promise<void> {
  if (typeof window === 'undefined') throw new CloudError('unknown', 'El acceso solo puede iniciarse en el navegador.');
  const next = options?.next === undefined ? currentPath() : safeNextPath(options.next);
  try {
    const backend = await getBackend();
    useAuth.setState({ error: null });
    await backend.signInWithGoogle(callbackUrl(window.location.origin, next));
  } catch (error) {
    throw toCloudError(error);
  }
}

export async function signOut(): Promise<void> {
  try {
    const backend = await getBackend();
    await backend.signOut();
    useAuth.setState({ status: 'signed-out', user: null, error: null });
  } catch (error) {
    throw toCloudError(error);
  }
}

function authErrorFrom(url: URL): { code: string; description: string } | null {
  const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  for (const params of [url.searchParams, hash]) {
    const code = params.get('error_code') ?? params.get('error');
    if (code) return { code, description: params.get('error_description') ?? '' };
  }
  return null;
}

export function authErrorMessage(code: string, description: string): string {
  if (code === 'access_denied' || /denied|cancel/i.test(description)) {
    return 'Cancelaste el acceso con Google. Puedes volver a intentarlo cuando quieras.';
  }
  if (/database error saving new user/i.test(description)) {
    return 'No se pudo crear tu cuenta en el servidor. Si administras esta instalación, revisa la migración de la base de datos.';
  }
  if (/redirect|url/i.test(code) || /redirect/i.test(description)) {
    return 'El servidor de cuentas no acepta esta dirección de vuelta. Si administras esta instalación, revisa las «Redirect URLs» de Supabase.';
  }
  return 'No se pudo completar el acceso con Google. Vuelve a intentarlo.';
}

export async function completeSignIn(url: URL): Promise<{ next: string; error: string | null }> {
  const next = safeNextPath(url.searchParams.get('next'), DEFAULT_NEXT);
  if (cloudMode() === 'disabled') {
    return { next, error: 'Las cuentas no están disponibles en esta instalación de Paginator.' };
  }

  const failure = authErrorFrom(url);
  if (failure) {
    console.warn('Paginator: el acceso volvió con error', failure);
    return { next, error: authErrorMessage(failure.code, failure.description) };
  }

  try {
    const backend = await getBackend();
    const code = url.searchParams.get('code');
    if (code) {
      const error = await backend.exchangeCode(code);
      if (error) return { next, error };
    }
    const user = await backend.getUser();
    useAuth.setState({ status: user ? 'signed-in' : 'signed-out', user, error: null });
    if (!user) return { next, error: 'No llegó la autorización de Google. Vuelve a intentarlo.' };
    return { next, error: null };
  } catch (error) {
    return { next, error: toCloudError(error).message };
  }
}
