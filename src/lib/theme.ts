export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'paginator:tema';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export type ThemeListener = (choice: ThemeChoice, resolved: ResolvedTheme) => void;

const listeners = new Set<ThemeListener>();
let detachGlobal: (() => void) | null = null;

const hasDom = (): boolean => typeof window !== 'undefined' && typeof document !== 'undefined';

function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getThemeChoice(): ThemeChoice {
  if (!hasDom()) return 'system';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : 'system';
  } catch {
    const attribute = document.documentElement.dataset['theme'];
    return isThemeChoice(attribute) ? attribute : 'system';
  }
}

export function resolvedTheme(choice: ThemeChoice = getThemeChoice()): ResolvedTheme {
  if (choice !== 'system') return choice;
  if (!hasDom() || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyThemeAttribute(choice: ThemeChoice): void {
  if (!hasDom()) return;
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset['theme'];
  else root.dataset['theme'] = choice;
}

function notify(): void {
  const choice = getThemeChoice();
  const resolved = resolvedTheme(choice);
  for (const listener of [...listeners]) listener(choice, resolved);
}

export function setThemeChoice(choice: ThemeChoice): void {
  if (!hasDom()) return;
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch (cause) {
    console.warn('No se pudo guardar la preferencia de tema.', cause);
  }
  applyThemeAttribute(choice);
  notify();
}

function attachGlobal(): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
  const onSystemChange = (): void => notify();
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    applyThemeAttribute(getThemeChoice());
    notify();
  };
  media?.addEventListener('change', onSystemChange);
  window.addEventListener('storage', onStorage);
  return () => {
    media?.removeEventListener('change', onSystemChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function subscribeTheme(callback: ThemeListener): () => void {
  if (!hasDom()) return () => {};
  listeners.add(callback);
  detachGlobal ??= attachGlobal();
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && detachGlobal) {
      detachGlobal();
      detachGlobal = null;
    }
  };
}

export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})();`;
