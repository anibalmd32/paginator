import { useSyncExternalStore } from 'react';

import { getThemeChoice, resolvedTheme, setThemeChoice, subscribeTheme, type ResolvedTheme, type ThemeChoice } from '@/lib/theme';

export interface UseThemeResult {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
}

const getChoiceSnapshot = (): ThemeChoice => getThemeChoice();
const getResolvedSnapshot = (): ResolvedTheme => resolvedTheme();
const getServerChoice = (): ThemeChoice => 'system';
const getServerResolved = (): ResolvedTheme => 'light';
const subscribe = (onChange: () => void): (() => void) => subscribeTheme(onChange);

export function useTheme(): UseThemeResult {
  const choice = useSyncExternalStore(subscribe, getChoiceSnapshot, getServerChoice);
  const resolved = useSyncExternalStore(subscribe, getResolvedSnapshot, getServerResolved);
  return { choice, resolved, setChoice: setThemeChoice };
}
