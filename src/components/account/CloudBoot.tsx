import { CircleAlert, Library, LogIn } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, EmptyState, Icon, Spinner, toast } from '@/components/ui';
import {
  clearPendingSave,
  getProject,
  isCloudError,
  isProjectId,
  readPendingSave,
  saveProject,
  signInWithGoogle,
  stashPendingSave,
} from '@/lib/cloud';
import type { CloudErrorCode, PendingSave } from '@/lib/cloud';
import { useProjectStore } from '@/lib/store';

import { PROJECT_PARAM } from './accountModel';
import styles from './CloudBoot.module.css';
import { LinkButton } from './LinkButton';
import { useCloudAuth } from './useCloudAuth';

type View =
  | { kind: 'none' }
  | { kind: 'opening' }
  | { kind: 'saving'; title: string }
  | { kind: 'sign-in'; projectId: string }
  | { kind: 'open-error'; projectId: string; code: CloudErrorCode; message: string }
  | { kind: 'save-error'; pending: PendingSave; message: string };

function setProjectParam(projectId: string | null): void {
  const url = new URL(window.location.href);
  if (projectId === null) url.searchParams.delete(PROJECT_PARAM);
  else url.searchParams.set(PROJECT_PARAM, projectId);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Algo falló al hablar con el servidor.';
}

export function CloudBoot() {
  const { mode, status } = useCloudAuth();
  const [view, setView] = useState<View>({ kind: 'none' });
  const started = useRef(false);

  const open = useCallback(async (projectId: string): Promise<void> => {
    setView({ kind: 'opening' });
    try {
      const { row, snapshot } = await getProject(projectId);
      useProjectStore.getState().openSavedProject(row.id, snapshot, row.updatedAt);
      setView({ kind: 'none' });
    } catch (error) {
      const code = isCloudError(error) ? error.code : 'unknown';
      if (code === 'not-signed-in') {
        setView({ kind: 'sign-in', projectId });
        return;
      }
      setView({ kind: 'open-error', projectId, code, message: messageOf(error) });
    }
  }, []);

  const uploadPending = useCallback(async (pending: PendingSave): Promise<void> => {
    setView({ kind: 'saving', title: pending.snapshot.title });
    const create = () => saveProject({ id: pending.newId, snapshot: pending.snapshot, createIfMissing: true });
    try {
      let row;
      if (pending.projectId === null) {
        row = await create();
      } else {
        try {
          row = await saveProject({ id: pending.projectId, snapshot: pending.snapshot });
        } catch (error) {
          if (!(isCloudError(error) && error.code === 'not-found')) throw error;
          row = await create();
        }
      }
      clearPendingSave();
      useProjectStore
        .getState()
        .openSavedProject(row.id, { ...pending.snapshot, title: row.title, config: { ...pending.snapshot.config, title: row.title } }, row.updatedAt);
      setProjectParam(row.id);
      setView({ kind: 'none' });
      toast({
        id: 'guardar',
        title: 'Revista guardada en tu cuenta',
        description: 'Vuelve a cargar sus archivos para seguir trabajando: Paginator los reconocerá y recuperará el orden.',
        duration: 9000,
      });
    } catch (error) {
      setView({ kind: 'save-error', pending, message: messageOf(error) });
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    if (mode === 'disabled') {
      started.current = true;
      if (new URL(window.location.href).searchParams.has(PROJECT_PARAM)) setProjectParam(null);
      return;
    }
    if (status === 'loading') return;
    started.current = true;

    const read = readPendingSave();
    if (read.kind === 'ready' && status === 'signed-in') {
      void uploadPending(read.pending);
      return;
    }
    if (read.kind === 'damaged') {
      clearPendingSave();
      toast({
        id: 'guardar',
        tone: 'warning',
        title: 'La revista pendiente de guardar no se pudo recuperar',
        description: 'Sus datos en esta pestaña están dañados. Vuelve a cargar los archivos, ordénalos y pulsa «Guardar».',
        duration: null,
      });
    }
    if (read.kind === 'ready' || read.kind === 'expired') {
      const { pending } = read;
      clearPendingSave();
      useProjectStore.getState().openSavedProject(null, pending.snapshot);
      setProjectParam(null);
      if (read.kind === 'expired') {
        toast({
          id: 'guardar',
          tone: 'warning',
          title: 'La revista no se guardó',
          description:
            'Pasó más de una hora desde que saliste a entrar con Google, así que no se ha subido sola. La configuración y el orden siguen aquí: vuelve a cargar los archivos y pulsa «Guardar».',
          duration: null,
        });
        return;
      }
      toast({
        id: 'guardar',
        tone: 'warning',
        title: 'La revista no se guardó',
        description: 'No llegaste a entrar con Google. Vuelve a cargar los archivos para seguir, o entra ahora y se guardará.',
        duration: null,
        action: {
          label: 'Entrar y guardar',
          onClick: () => {
            if (!stashPendingSave(pending)) {
              toast({
                id: 'guardar',
                tone: 'error',
                title: 'La revista no sobreviviría al acceso',
                description:
                  'Este navegador no deja guardar datos de la pestaña. Entra desde el menú de cuenta, vuelve a cargar los archivos y pulsa «Guardar».',
                duration: null,
              });
              return;
            }
            void signInWithGoogle({ next: '/app' }).catch((error: unknown) => {
              clearPendingSave();
              toast({ id: 'guardar', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: messageOf(error) });
            });
          },
        },
      });
      return;
    }

    const projectId = new URL(window.location.href).searchParams.get(PROJECT_PARAM);
    if (projectId === null) return;
    if (!isProjectId(projectId)) {
      setView({ kind: 'open-error', projectId, code: 'not-found', message: 'El enlace no lleva a ninguna revista guardada.' });
      return;
    }
    if (status !== 'signed-in') {
      setView({ kind: 'sign-in', projectId });
      return;
    }
    void open(projectId);
  }, [mode, status, open, uploadPending]);

  useEffect(
    () =>
      useProjectStore.subscribe((state, previous) => {
        if (state.cloudProjectId === previous.cloudProjectId) return;
        setProjectParam(state.cloudProjectId);
      }),
    [],
  );

  useEffect(() => {
    if (view.kind === 'sign-in' && status === 'signed-in') void open(view.projectId);
  }, [view, status, open]);

  const startFresh = (): void => {
    setProjectParam(null);
    setView({ kind: 'none' });
  };

  if (view.kind === 'none') return null;

  if (view.kind === 'opening' || view.kind === 'saving') {
    return (
      <div className={styles.cover} aria-busy="true">
        <div className={styles.working}>
          <Spinner size={20} />
          <p className={styles.workingTitle}>{view.kind === 'opening' ? 'Abriendo tu revista guardada…' : `Guardando «${view.title}» en tu cuenta…`}</p>
          <p className={styles.workingNote}>Solo viajan la configuración y el orden de páginas; tus archivos siguen en tu equipo.</p>
        </div>
      </div>
    );
  }

  if (view.kind === 'sign-in') {
    return (
      <div className={styles.cover}>
        <EmptyState
          icon={LogIn}
          title="Entra para abrir esta revista"
          description="Está guardada en una cuenta de Paginator. Entra con la misma cuenta de Google con la que la guardaste."
          actions={
            <>
              <Button
                variant="primary"
                iconStart={<Icon icon={LogIn} />}
                onClick={() =>
                  void signInWithGoogle().catch((error: unknown) =>
                    toast({ id: 'cuenta', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: messageOf(error) }),
                  )
                }
              >
                Entrar con Google
              </Button>
              <Button onClick={startFresh}>Empezar sin ella</Button>
            </>
          }
        />
      </div>
    );
  }

  if (view.kind === 'save-error') {
    return (
      <div className={styles.cover}>
        <EmptyState
          icon={CircleAlert}
          title="No se pudo guardar la revista"
          description={`${view.message} La configuración y el orden siguen aquí: puedes reintentarlo o seguir sin guardar.`}
          actions={
            <>
              <Button variant="primary" onClick={() => void uploadPending(view.pending)}>
                Reintentar
              </Button>
              <Button
                onClick={() => {
                  clearPendingSave();
                  useProjectStore.getState().openSavedProject(null, view.pending.snapshot);
                  setView({ kind: 'none' });
                }}
              >
                Seguir sin guardar
              </Button>
            </>
          }
        />
      </div>
    );
  }

  const retryable = view.code === 'network' || view.code === 'unknown';
  return (
    <div className={styles.cover}>
      <EmptyState
        icon={CircleAlert}
        title={view.code === 'not-found' ? 'Esta revista no está en tu cuenta' : 'No se pudo abrir la revista'}
        description={
          view.code === 'not-found'
            ? 'Puede que se borrara o que la guardaras con otra cuenta de Google. Tus revistas están en «Mis revistas».'
            : view.message
        }
        actions={
          <>
            {retryable && (
              <Button variant="primary" onClick={() => void open(view.projectId)}>
                Reintentar
              </Button>
            )}
            <LinkButton href="/revistas" iconStart={<Icon icon={Library} />}>
              Ir a Mis revistas
            </LinkButton>
            <Button variant="ghost" onClick={startFresh}>
              Empezar sin ella
            </Button>
          </>
        }
      />
    </div>
  );
}
