export const DEFAULT_NEXT = '/revistas';
export const CALLBACK_PATH = '/auth/callback';

const MAX_NEXT_LENGTH = 2048;
const PROBE_ORIGIN = 'https://paginator.invalid';

export function safeNextPath(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;

  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) return fallback;
  if (url.pathname.startsWith('//')) return fallback;

  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === CALLBACK_PATH) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function callbackUrl(origin: string, next: string): string {
  const url = new URL(CALLBACK_PATH, origin);
  url.searchParams.set('next', safeNextPath(next));
  return url.href;
}

export function currentPath(): string {
  if (typeof window === 'undefined') return DEFAULT_NEXT;
  const { pathname, search, hash } = window.location;
  return safeNextPath(`${pathname}${search}${hash}`);
}
