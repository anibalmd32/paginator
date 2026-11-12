export type CloudMode = 'supabase' | 'mock' | 'disabled';

export interface CloudEnv {
  supabaseUrl?: string | undefined;
  supabaseAnonKey?: string | undefined;
  cloudFlag?: string | undefined;
}

export interface SupabaseSettings {
  url: string;
  anonKey: string;
}

export function normalizeSupabaseUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function supabaseSettingsFrom(env: CloudEnv): SupabaseSettings | null {
  const url = normalizeSupabaseUrl(env.supabaseUrl);
  const anonKey = env.supabaseAnonKey?.trim() ?? '';
  return url && anonKey ? { url, anonKey } : null;
}

export function resolveCloudMode(env: CloudEnv): CloudMode {
  if (supabaseSettingsFrom(env)) return 'supabase';
  if (env.cloudFlag?.trim().toLowerCase() === 'mock') return 'mock';
  return 'disabled';
}

function buildEnv(): CloudEnv {
  return {
    supabaseUrl: import.meta.env.PUBLIC_SUPABASE_URL,
    supabaseAnonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
    cloudFlag: import.meta.env.PUBLIC_PAGINATOR_CLOUD,
  };
}

let warned = false;

export function cloudMode(): CloudMode {
  const env = buildEnv();
  const mode = resolveCloudMode(env);
  if (!warned && mode === 'disabled' && (env.supabaseUrl?.trim() || env.supabaseAnonKey?.trim())) {
    warned = true;
    console.warn('Paginator: PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_ANON_KEY deben estar las dos y ser válidas; cuentas desactivadas.');
  }
  return mode;
}

export function supabaseSettings(): SupabaseSettings | null {
  return supabaseSettingsFrom(buildEnv());
}
