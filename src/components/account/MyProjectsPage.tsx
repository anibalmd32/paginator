import { CloudOff, Library, LogIn, Plus, RotateCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { AppShell, StepLayout } from '@/components/shell';
import { Button, Callout, EmptyState, Icon, Kbd, Skeleton, toast } from '@/components/ui';
import { listProjects, signInWithGoogle } from '@/lib/cloud';
import type { ProjectRow } from '@/lib/cloud';

import { AccountBar } from './AccountBar';
import { AccountMenu } from './AccountMenu';
import { plural } from './accountModel';
import { LinkButton } from './LinkButton';
import styles from './MyProjectsPage.module.css';
import { ProjectList } from './ProjectList';
import { useCloudAuth } from './useCloudAuth';

type ListState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready'; rows: ProjectRow[] } | { kind: 'error'; message: string };

const NEXT = '/revistas';

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Algo falló al hablar con el servidor.';
}

export function MyProjectsPage() {
  const { mode, status, user } = useCloudAuth();
  const [list, setList] = useState<ListState>({ kind: 'idle' });

  const load = useCallback(async (): Promise<void> => {
    setList({ kind: 'loading' });
    try {
      setList({ kind: 'ready', rows: await listProjects() });
    } catch (error) {
      setList({ kind: 'error', message: messageOf(error) });
    }
  }, []);

  useEffect(() => {
    if (status === 'signed-in') void load();
    else setList({ kind: 'idle' });
  }, [status, user?.id, load]);

  const enter = (): void => {
    void signInWithGoogle({ next: NEXT }).catch((error: unknown) =>
      toast({ id: 'cuenta', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: messageOf(error) }),
    );
  };

  const rows = list.kind === 'ready' ? list.rows : null;
  const guide =
    status === 'signed-in' && rows
      ? [rows.length === 0 ? 'Sin revistas guardadas' : plural(rows.length, 'revista guardada', 'revistas guardadas'), user?.email ?? null]
      : status === 'signed-in'
        ? [user?.email ?? null]
        : null;

  let body;
  if (mode === 'disabled') {
    body = (
      <EmptyState
        className={styles.state}
        icon={CloudOff}
        title="Las cuentas no están disponibles en esta instalación"
        description="Puedes verificar e imponer revistas igual que siempre; lo que no se puede aquí es guardarlas en una cuenta."
        actions={
          <LinkButton variant="primary" href="/app">
            Abrir Paginator
          </LinkButton>
        }
      />
    );
  } else if (status === 'loading' || list.kind === 'loading' || (status === 'signed-in' && list.kind === 'idle')) {
    body = (
      <div className={styles.loading} aria-busy="true" aria-label="Cargando tus revistas">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={styles.skeletonRow}>
            <Skeleton width={`${String(40 - index * 6)}%`} height={16} />
            <Skeleton width="4rem" height={14} />
            <Skeleton width="6rem" height={18} />
          </div>
        ))}
      </div>
    );
  } else if (status !== 'signed-in') {
    body = (
      <EmptyState
        className={styles.state}
        icon={LogIn}
        title="Entra para ver tus revistas"
        description="Las revistas que guardes desde Paginator quedan en tu cuenta (entras con Google), listas para volver a abrirlas desde cualquier equipo."
        actions={
          <Button variant="primary" iconStart={<Icon icon={LogIn} />} onClick={enter}>
            Entrar con Google
          </Button>
        }
        footnote="Solo se guardan la configuración y el orden de páginas. Tus archivos no salen de tu equipo."
      />
    );
  } else if (list.kind === 'error') {
    body = (
      <Callout
        tone="error"
        live
        title="No se pudieron cargar tus revistas"
        action={
          <Button size="sm" iconStart={<Icon icon={RotateCw} size={14} />} onClick={() => void load()}>
            Reintentar
          </Button>
        }
      >
        <p>{list.message}</p>
      </Callout>
    );
  } else if (rows && rows.length === 0) {
    body = (
      <EmptyState
        className={styles.state}
        icon={Library}
        title="Aún no tienes revistas guardadas"
        description={
          <>
            Abre Paginator, carga las páginas de una revista y pulsa «Guardar» (o <Kbd keys={['Ctrl', 'S']} />). Aparecerá aquí para volver a
            abrirla cuando quieras.
          </>
        }
        actions={
          <LinkButton variant="primary" href="/app" iconStart={<Icon icon={Plus} />}>
            Abrir Paginator
          </LinkButton>
        }
        footnote="Se guardan la configuración, el orden de páginas y la huella de cada archivo. Los archivos no: al abrir la revista te pediremos que los cargues."
      />
    );
  } else if (rows) {
    body = (
      <>
        <ProjectList
          rows={rows}
          onRenamed={(updated) => setList({ kind: 'ready', rows: rows.map((row) => (row.id === updated.id ? updated : row)) })}
          onDeleted={(id) => setList({ kind: 'ready', rows: rows.filter((row) => row.id !== id) })}
        />
        <p className={styles.privacy}>
          <Icon icon={ShieldCheck} size={14} />
          En tu cuenta solo están la configuración, el orden de páginas, el nombre y la huella de cada archivo y el resumen del pre-vuelo.
          Los archivos siguen en tu equipo: al abrir una revista te pediremos que los vuelvas a cargar.
        </p>
      </>
    );
  }

  return (
    <AppShell
      header={
        <AccountBar label="Mis revistas">
          <AccountMenu next={NEXT} onProjectsPage />
        </AccountBar>
      }
    >
      <StepLayout
        title={<span id="mis-revistas-titulo" tabIndex={-1} className={styles.heading}>Mis revistas</span>}
        guide={guide}
        actions={
          rows && rows.length > 0 ? (
            <LinkButton variant="primary" href="/app" iconStart={<Icon icon={Plus} />}>
              Nueva revista
            </LinkButton>
          ) : undefined
        }
      >
        {body}
      </StepLayout>
    </AppShell>
  );
}
