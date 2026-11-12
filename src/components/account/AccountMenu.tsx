import { Library, LogIn, LogOut } from 'lucide-react';
import { useState } from 'react';

import { Button, Icon, Popover, toast, Tooltip } from '@/components/ui';
import { signInWithGoogle, signOut } from '@/lib/cloud';
import { cx } from '@/lib/utils/cx';

import styles from './AccountMenu.module.css';
import { displayName, firstName } from './accountModel';
import { Avatar } from './Avatar';
import barStyles from './onBar.module.css';
import { useCloudAuth } from './useCloudAuth';

export interface AccountMenuProps {
  next?: string;
  onProjectsPage?: boolean;
  onSignedOut?: () => void;
  signInWarning?: string | null;
  signedOutNote?: string | null;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Vuelve a intentarlo en un momento.';
}

export function AccountMenu({ next, onProjectsPage = false, onSignedOut, signInWarning = null, signedOutNote = null }: AccountMenuProps) {
  const { mode, status, user, error } = useCloudAuth();
  const [pending, setPending] = useState<'in' | 'out' | null>(null);

  if (mode === 'disabled') return null;

  if (status === 'loading') {
    return <span className={styles.placeholder} aria-hidden="true" />;
  }

  if (status !== 'signed-in' || !user) {
    const enter = async (): Promise<void> => {
      setPending('in');
      try {
        await signInWithGoogle(next === undefined ? undefined : { next });
      } catch (failure) {
        setPending(null);
        toast({ id: 'cuenta', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: messageOf(failure) });
      }
    };
    const tip = error ?? 'Guarda tus revistas y ábrelas desde cualquier equipo';
    if (signInWarning) {
      return (
        <Popover
          title="¿Entrar ahora?"
          placement="bottom"
          align="end"
          className={styles.confirm}
          trigger={(props) => (
            <Button {...props} size="sm" className={barStyles.ghost} iconStart={<Icon icon={LogIn} size={14} />} loading={pending === 'in'}>
              <span className={styles.label}>Entrar con Google</span>
            </Button>
          )}
        >
          {(close) => (
            <div className={styles.confirmBody}>
              <p>{signInWarning}</p>
              <div className={styles.confirmActions}>
                <Button size="sm" variant="ghost" onClick={close}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void enter()}>
                  Entrar igualmente
                </Button>
              </div>
            </div>
          )}
        </Popover>
      );
    }
    return (
      <Tooltip content={tip} placement="bottom" align="end">
        <Button size="sm" className={barStyles.ghost} iconStart={<Icon icon={LogIn} size={14} />} loading={pending === 'in'} onClick={() => void enter()}>
          <span className={styles.label}>Entrar con Google</span>
        </Button>
      </Tooltip>
    );
  }

  const leave = async (close: () => void): Promise<void> => {
    setPending('out');
    try {
      await signOut();
      close();
      toast(signedOutNote ? { id: 'cuenta', title: 'Sesión cerrada', description: signedOutNote } : { id: 'cuenta', title: 'Sesión cerrada' });
      onSignedOut?.();
    } catch (failure) {
      toast({ id: 'cuenta', tone: 'error', title: 'No se pudo cerrar la sesión', description: messageOf(failure) });
    } finally {
      setPending(null);
    }
  };

  const name = displayName(user);
  return (
    <Popover
      aria-label="Tu cuenta"
      placement="bottom"
      align="end"
      className={styles.panel}
      trigger={(props) => (
        <Button {...props} size="sm" className={cx(barStyles.ghost, styles.trigger)} aria-label={`Tu cuenta: ${name}`} iconStart={<Avatar user={user} size={22} />}>
          <span className={styles.name}>{firstName(user)}</span>
        </Button>
      )}
    >
      {(close) => (
        <div className={styles.menu}>
          <div className={styles.who}>
            <Avatar user={user} size={36} />
            <div className={styles.whoText}>
              <p className={styles.fullName}>{name}</p>
              {user.email && <p className={styles.email}>{user.email}</p>}
            </div>
          </div>
          <div className={styles.items}>
            {!onProjectsPage && (
              <a className={styles.item} href="/revistas">
                <Icon icon={Library} size={16} />
                Mis revistas
              </a>
            )}
            <button type="button" className={styles.item} aria-busy={pending === 'out' ? true : undefined} onClick={() => void leave(close)}>
              <Icon icon={LogOut} size={16} />
              {pending === 'out' ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
