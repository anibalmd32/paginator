import { useEffect } from 'react';

import { cloudMode, useAuth } from '@/lib/cloud';
import type { AuthStatus, CloudMode, CloudUser } from '@/lib/cloud';

export interface CloudAuth {
  mode: CloudMode;
  status: AuthStatus;
  user: CloudUser | null;
  error: string | null;
}

export function useCloudAuth(): CloudAuth {
  const status = useAuth((state) => state.status);
  const user = useAuth((state) => state.user);
  const error = useAuth((state) => state.error);
  useEffect(() => {
    useAuth.getState().init();
  }, []);
  return { mode: cloudMode(), status, user, error };
}
