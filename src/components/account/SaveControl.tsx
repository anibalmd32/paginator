import { Check, CircleAlert, CopyPlus, LogIn, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Icon, Kbd, Popover, toast, Tooltip } from '@/components/ui';
import { clearPendingSave, CloudError, isCloudError, saveProject, signInWithGoogle, stashPendingSave } from '@/lib/cloud';
import type { ProjectSnapshot } from '@/lib/cloud';
import { currentSnapshot, currentWorkEpoch, fingerprintProgress, useProjectStore } from '@/lib/store';
import type { ProjectState } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import { formatTime, markSaveNoteSeen, NOT_SAVED_SHORT, NOT_SAVED_WHAT, plural, PROJECT_PARAM, SAVED_WHAT, saveNoteSeen } from './accountModel';
import barStyles from './onBar.module.css';
import styles from './SaveControl.module.css';
import { useCloudAuth } from './useCloudAuth';

type PopoverKind = 'note' | 'signin' | 'conflict';

interface SaveOptions {
  overwrite?: boolean;
}

interface SavedMark {
  at: Date;
  config: ProjectState['config'];
  pages: ProjectState['pages'];
  assets: ProjectState['assets'];
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Algo falló al preparar la revista para guardarla.';
}

function rememberInUrl(projectId: string): void {
  const url = new URL(window.location.href);
  if (url.searchParams.get(PROJECT_PARAM) === projectId) return;
  url.searchParams.set(PROJECT_PARAM, projectId);
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
}

export function SaveControl() {
  const { status } = useCloudAuth();
  const hasPages = useProjectStore((state) => state.pages.length > 0);
  const busy = useProjectStore((state) => state.ingest.busy);
  const waiting = useProjectStore((state) => state.pendingRestore?.status === 'waiting');
  const cloudProjectId = useProjectStore((state) => state.cloudProjectId);
  const config = useProjectStore((state) => state.config);
  const pages = useProjectStore((state) => state.pages);
  const assets = useProjectStore((state) => state.assets);
  const fingerprints = useProjectStore((state) => state.fingerprints);
  const fingerprintErrors = useProjectStore((state) => state.fingerprintErrors);

  const [phase, setPhase] = useState<'idle' | 'saving' | 'redirecting' | 'error'>('idle');
  const [popover, setPopover] = useState<PopoverKind | null>(null);
  const [saved, setSaved] = useState<SavedMark | null>(null);

  const progress = fingerprintProgress({ assets, fingerprints, fingerprintErrors });
  const reading = progress.total - progress.done - progress.failed;
  const clean = saved !== null && saved.config === config && saved.pages === pages && saved.assets === assets;

  const blocked: string | null = !hasPages
    ? 'Carga las páginas de la revista para poder guardarla'
    : waiting
      ? 'Vuelve a cargar los archivos de esta revista antes de guardar: si no, se guardaría sin ellos'
      : busy
        ? 'Espera a que termine la carga de archivos'
        : progress.failed > 0
          ? 'Un archivo no se pudo leer para reconocerlo: quítalo y vuelve a cargarlo para poder guardar'
          : reading > 0
            ? `Reconociendo ${plural(reading, 'archivo', 'archivos')}…`
            : status === 'loading'
              ? 'Comprobando tu sesión…'
              : null;

  const snapshotOrToast = (): ProjectSnapshot | null => {
    try {
      return currentSnapshot(useProjectStore.getState());
    } catch (error) {
      toast({ id: 'guardar', tone: 'error', title: 'No se puede guardar todavía', description: messageOf(error) });
      return null;
    }
  };

  const saveRef = useRef<(options?: SaveOptions) => Promise<void>>(() => Promise.resolve());
  const save = useCallback(async (options: SaveOptions = {}): Promise<void> => {
    const state = useProjectStore.getState();
    let snapshot: ProjectSnapshot;
    try {
      snapshot = currentSnapshot(state);
    } catch (error) {
      toast({ id: 'guardar', tone: 'error', title: 'No se puede guardar todavía', description: messageOf(error) });
      return;
    }
    const projectId = state.cloudProjectId;
    const mark = { config: state.config, pages: state.pages, assets: state.assets };
    const epoch = currentWorkEpoch();
    const sameWork = (): boolean => currentWorkEpoch() === epoch && useProjectStore.getState().cloudProjectId === projectId;
    setPopover(null);
    setPhase('saving');
    toast.dismiss('guardar');
    try {
      const row = await saveProject(
        projectId ? { id: projectId, snapshot, expectedUpdatedAt: options.overwrite ? null : state.cloudProjectVersion } : { snapshot },
      );
      markSaveNoteSeen();
      setPhase('idle');
      if (sameWork()) {
        useProjectStore.getState().setCloudProjectId(row.id, row.updatedAt);
        rememberInUrl(row.id);
        setSaved({ at: new Date(), ...mark });
      }
      if (!projectId) {
        toast({
          id: 'guardar',
          title: 'Guardada en Mis revistas',
          description: `«${row.title}» ya está en tu cuenta. Los archivos siguen solo en tu equipo.`,
          action: { label: 'Ver Mis revistas', onClick: () => window.location.assign('/revistas') },
        });
      }
    } catch (error) {
      const failure = isCloudError(error) ? error : new CloudError('unknown');
      setPhase('error');
      if (failure.code === 'not-signed-in') {
        setPopover('signin');
        return;
      }
      if (failure.code === 'not-found' && projectId) {
        if (sameWork()) useProjectStore.getState().setCloudProjectId(null);
        setPhase('idle');
        toast({
          id: 'guardar',
          tone: 'error',
          title: 'Esa revista ya no está en tu cuenta',
          description: 'Se borró desde otra ventana o es de otra cuenta. Puedes guardar este trabajo como una revista nueva.',
          action: { label: 'Guardar como nueva', onClick: () => void saveRef.current() },
        });
        return;
      }
      if (failure.code === 'conflict' && projectId) {
        if (sameWork()) setPopover('conflict');
        else setPhase('idle');
        return;
      }
      if (failure.code === 'quota') {
        toast({
          id: 'guardar',
          tone: 'error',
          title: 'No caben más revistas en tu cuenta',
          description: failure.message,
          duration: null,
          action: { label: 'Ver Mis revistas', onClick: () => window.location.assign('/revistas') },
        });
        return;
      }
      toast({ id: 'guardar', tone: 'error', title: 'No se pudo guardar', description: failure.message, action: { label: 'Reintentar', onClick: () => void saveRef.current() } });
    }
  }, []);
  saveRef.current = save;

  const goToGoogle = async (): Promise<void> => {
    setPopover(null);
    setPhase('redirecting');
    try {
      await signInWithGoogle({ next: '/app' });
    } catch (error) {
      clearPendingSave();
      setPhase('idle');
      toast({ id: 'guardar', tone: 'error', title: 'No se pudo abrir el acceso con Google', description: messageOf(error) });
    }
  };

  const signInAndSave = async (): Promise<void> => {
    const snapshot = snapshotOrToast();
    if (!snapshot) return;
    if (!stashPendingSave({ snapshot, projectId: useProjectStore.getState().cloudProjectId })) {
      setPopover(null);
      toast({
        id: 'guardar',
        tone: 'error',
        title: 'La revista no sobreviviría al acceso',
        description:
          'Este navegador no deja guardar datos de la pestaña, así que al volver de Google no habría nada que guardar. Si entras igualmente, después vuelve a cargar los archivos y pulsa «Guardar».',
        duration: null,
        action: { label: 'Entrar sin guardar', onClick: () => void goToGoogle() },
      });
      return;
    }
    markSaveNoteSeen();
    await goToGoogle();
  };

  const activate = (fromShortcut: boolean): void => {
    if (phase === 'saving' || phase === 'redirecting') return;
    if (blocked) {
      if (fromShortcut) toast({ id: 'guardar', tone: 'info', title: 'Todavía no se puede guardar', description: blocked });
      return;
    }
    if (status !== 'signed-in') {
      setPopover((current) => (current === 'signin' ? null : 'signin'));
      return;
    }
    if (!saveNoteSeen()) {
      setPopover((current) => (current === 'note' ? null : 'note'));
      return;
    }
    void save();
  };
  const activateRef = useRef(activate);
  activateRef.current = activate;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
      window.requestAnimationFrame(() => activateRef.current(true));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shortcut = <Kbd keys={isMac() ? ['⌘', 'S'] : ['Ctrl', 'S']} inverse />;
  const savedAt = phase === 'idle' && clean && saved !== null ? saved.at : null;
  const settled = savedAt !== null;
  const tooltip = popover
    ? null
    : (blocked ?? (settled ? (
        <>Guardado en tu cuenta a las {formatTime(savedAt)}</>
      ) : (
        <>
          {cloudProjectId ? 'Guardar los cambios en tu cuenta' : 'Guardar en tu cuenta'} {shortcut}
        </>
      )));

  const label =
    phase === 'saving'
      ? 'Guardando…'
      : phase === 'redirecting'
        ? 'Abriendo Google…'
        : phase === 'error'
          ? 'Reintentar'
          : settled
            ? `Guardado ${formatTime(savedAt)}`
            : 'Guardar';
  const icon = phase === 'error' ? CircleAlert : settled ? Check : Save;

  return (
    <Popover
      open={popover !== null}
      onOpenChange={(open) => {
        if (!open) setPopover(null);
      }}
      title={popover === 'signin' ? 'Entra para guardar' : popover === 'conflict' ? 'La revista cambió en tu cuenta' : 'Guardar en tu cuenta'}
      placement="bottom"
      align="end"
      className={styles.panel}
      trigger={(props) => (
        <Tooltip content={tooltip} placement="bottom" align="end">
          <Button
            {...props}
            size="sm"
            className={cx(barStyles.button, settled && barStyles.settled, phase === 'error' && styles.failed)}
            iconStart={<Icon icon={icon} size={14} />}
            loading={phase === 'saving' || phase === 'redirecting'}
            aria-disabled={blocked ? true : undefined}
            aria-haspopup={status === 'signed-in' && saveNoteSeen() ? undefined : 'dialog'}
            onClick={() => activate(false)}
          >
            <span className={cx(styles.text, barStyles.figure)}>{label}</span>
          </Button>
        </Tooltip>
      )}
    >
      {(close) =>
        popover === 'signin' ? (
          <div className={styles.body}>
            <p>Para guardar la revista en tu cuenta, entra con Google. Saldrás un momento de Paginator y volverás aquí.</p>
            <ul className={styles.facts}>
              <li>{SAVED_WHAT}</li>
              <li>{NOT_SAVED_SHORT}</li>
            </ul>
            <p className={styles.strong}>Al volver, la revista se guardará sola y te pediremos que cargues de nuevo los mismos archivos.</p>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" iconStart={<Icon icon={LogIn} size={14} />} onClick={() => void signInAndSave()}>
                Entrar con Google y guardar
              </Button>
            </div>
          </div>
        ) : popover === 'conflict' ? (
          <div className={styles.body}>
            <p>
              «{config.title}» se guardó o se renombró desde otra ventana o equipo después de abrirla aquí. Si sobrescribes, lo de
              allí se pierde y queda lo de esta pestaña.
            </p>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => void save({ overwrite: true })}>
                Sobrescribir
              </Button>
              <Button
                variant="primary"
                size="sm"
                iconStart={<Icon icon={CopyPlus} size={14} />}
                onClick={() => {
                  useProjectStore.getState().setCloudProjectId(null);
                  void save();
                }}
              >
                Guardar como nueva
              </Button>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <ul className={styles.facts}>
              <li>{SAVED_WHAT}</li>
              <li>{NOT_SAVED_WHAT}</li>
            </ul>
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" iconStart={<Icon icon={Save} size={14} />} onClick={() => void save()}>
                Guardar
              </Button>
            </div>
          </div>
        )
      }
    </Popover>
  );
}
