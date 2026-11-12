import { DEFAULT_CONFIG } from '@/lib/imposition';
import type { GuideVisibility, MagazineConfig } from '@/lib/types';

const CONFIG_KEY = 'paginator:config:v1';
const GUIDES_KEY = 'paginator:guides:v1';

function readJson(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadConfig(): MagazineConfig {
  const stored = readJson(CONFIG_KEY);
  if (!isRecord(stored)) return DEFAULT_CONFIG;

  const merged: Record<string, unknown> = { ...DEFAULT_CONFIG };
  for (const [key, fallback] of Object.entries(DEFAULT_CONFIG)) {
    const value = stored[key];
    if (value === undefined) continue;
    if (fallback === null || typeof fallback !== 'object') {
      if (typeof value === typeof fallback || (key === 'declaredPageCount' && (value === null || typeof value === 'number'))) {
        merged[key] = value;
      }
    } else if (isRecord(value)) {
      merged[key] = key === 'trim' ? value : { ...(fallback as Record<string, unknown>), ...value };
    }
  }

  const config = merged as unknown as MagazineConfig;
  return { ...config, title: DEFAULT_CONFIG.title, declaredPageCount: null };
}

export function saveConfig(config: MagazineConfig): void {
  writeJson(CONFIG_KEY, config);
}

const DEFAULT_GUIDES: GuideVisibility = { trim: false, bleed: false, safe: false };

export function loadGuides(): GuideVisibility {
  const stored = readJson(GUIDES_KEY);
  if (!isRecord(stored)) return DEFAULT_GUIDES;
  return {
    trim: typeof stored['trim'] === 'boolean' ? stored['trim'] : DEFAULT_GUIDES.trim,
    bleed: typeof stored['bleed'] === 'boolean' ? stored['bleed'] : DEFAULT_GUIDES.bleed,
    safe: typeof stored['safe'] === 'boolean' ? stored['safe'] : DEFAULT_GUIDES.safe,
  };
}

export function saveGuides(guides: GuideVisibility): void {
  writeJson(GUIDES_KEY, guides);
}
