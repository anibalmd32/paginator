import { LogIn } from 'lucide-react';
import { useState } from 'react';

import { Icon, Spinner, toast, Toaster } from '@/components/ui';
import { DEFAULT_NEXT, signInWithGoogle } from '@/lib/cloud';

import { displayName } from './accountModel';
import { Avatar } from './Avatar';
import styles from './LandingAccount.module.css';
import { useCloudAuth } from './useCloudAuth';

export function LandingAccount() {
  const { mode, status, user } = useCloudAuth();
  const [leaving, setLeaving] = useState(false);

  if (mode === 'disabled' || status === 'loading') return null;

  if (status === 'signed-in' && user) {
    return (
      <a className={`${styles.action} ${styles.withAvatar}`} href="/revistas" aria-label={`Mis revistas (${displayName(user)})`} title={displayName(user)}>
        <Avatar user={user} size={22} />
        <span className={styles.label}>Mis revistas</span>
      </a>
    );
  }

  const enter = async (): Promise<void> => {
    setLeaving(true);
    try {
      await signInWithGoogle({ next: DEFAULT_NEXT });
    } catch (error) {
      setLeaving(false);
      toast({ id: 'cuenta', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: error instanceof Error ? error.message : undefined });
    }
  };

  return (
    <>
      <button type="button" className={styles.action} aria-label="Entrar con Google" aria-busy={leaving ? true : undefined} onClick={() => void enter()}>
        {leaving ? <Spinner size={16} /> : <Icon icon={LogIn} size={16} />}
        <span className={styles.label}>Entrar con Google</span>
      </button>
      <Toaster />
    </>
  );
}
