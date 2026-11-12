import { CircleAlert, CloudOff, LogIn } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AppShell } from '@/components/shell';
import { Button, Callout, EmptyState, Icon, Spinner } from '@/components/ui';
import { cloudMode, completeSignIn, DEFAULT_NEXT, hasPendingSave, signInWithGoogle } from '@/lib/cloud';

import { AccountBar } from './AccountBar';
import styles from './AuthCallback.module.css';
import { LinkButton } from './LinkButton';

type State = { kind: 'working' } | { kind: 'error'; message: string; next: string; pendingSave: boolean };

const ACCOUNTS = cloudMode() !== 'disabled';

let completion: Promise<{ next: string; error: string | null }> | null = null;

function backLabel(next: string): string {
  if (next.startsWith('/app')) return 'Volver a Paginator sin entrar';
  if (next.startsWith('/revistas')) return 'Volver sin entrar';
  return 'Volver sin entrar';
}

export function AuthCallback() {
  const [state, setState] = useState<State>({ kind: 'working' });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!ACCOUNTS) return;
    completion ??= completeSignIn(new URL(window.location.href));
    let active = true;
    void completion.then(({ next, error }) => {
      if (!active) return;
      if (error) {
        setState({ kind: 'error', message: error, next, pendingSave: hasPendingSave() });
        return;
      }
      window.location.replace(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const retry = async (next: string): Promise<void> => {
    setRetrying(true);
    try {
      await signInWithGoogle({ next });
    } catch (error) {
      setRetrying(false);
      setState((current) => (current.kind === 'error' ? { ...current, message: error instanceof Error ? error.message : current.message } : current));
    }
  };

  return (
    <AppShell header={<AccountBar label="Entrar" />}>
      <div className={styles.page}>
        {!ACCOUNTS ? (
          <EmptyState
            icon={CloudOff}
            title="Las cuentas no están disponibles en esta instalación"
            description="Puedes verificar e imponer revistas igual que siempre; lo que no se puede aquí es entrar ni guardarlas en una cuenta."
            actions={
              <LinkButton variant="primary" href="/app">
                Abrir Paginator
              </LinkButton>
            }
          />
        ) : state.kind === 'working' ? (
          <div className={styles.working} role="status">
            <Spinner size={20} />
            <p className={styles.title}>Entrando con Google…</p>
            <p className={styles.note}>Un momento: estamos comprobando tu acceso.</p>
          </div>
        ) : (
          <div className={styles.failure}>
            <Callout tone="error" icon={CircleAlert} live title="No se pudo entrar">
              <p>{state.message}</p>
              {state.pendingSave && <p>Tu revista sigue pendiente de guardar: si vuelves a intentarlo, se guardará al entrar.</p>}
            </Callout>
            <div className={styles.actions}>
              <Button variant="primary" iconStart={<Icon icon={LogIn} />} loading={retrying} onClick={() => void retry(state.next)}>
                Volver a intentarlo
              </Button>
              <LinkButton href={state.next || DEFAULT_NEXT}>{backLabel(state.next)}</LinkButton>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
