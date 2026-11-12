import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react';

import { Button, Icon, IconButton, StatusBadge, TextField, toast } from '@/components/ui';
import type { StatusTone } from '@/components/ui';
import { deleteProject, renameProject, TITLE_MAX_LENGTH } from '@/lib/cloud';
import type { ProjectRow } from '@/lib/cloud';
import type { PreflightVerdict } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { formatFullDate, formatUpdatedAt, plural, projectHref, VERDICT_TEXT } from './accountModel';
import { LinkButton } from './LinkButton';
import styles from './ProjectList.module.css';

const VERDICT_TONE: Record<PreflightVerdict, StatusTone> = { ok: 'success', warnings: 'warning', errors: 'error' };

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Algo falló al hablar con el servidor.';
}

export interface ProjectListProps {
  rows: ProjectRow[];
  onRenamed: (row: ProjectRow) => void;
  onDeleted: (id: string) => void;
}

export function ProjectList({ rows, onRenamed, onDeleted }: ProjectListProps) {
  return (
    <div className={styles.table}>
      <div className={styles.head} aria-hidden="true">
        <span>Revista</span>
        <span className={styles.num}>Páginas</span>
        <span className={styles.num}>Pliegos</span>
        <span>Pre-vuelo</span>
        <span>Modificada</span>
        <span />
      </div>
      <ol className={styles.list} aria-label="Revistas guardadas">
        {rows.map((row, index) => (
          <ProjectItem key={row.id} row={row} nextId={rows[index + 1]?.id ?? rows[index - 1]?.id ?? null} onRenamed={onRenamed} onDeleted={onDeleted} />
        ))}
      </ol>
    </div>
  );
}

type Mode = { kind: 'view' } | { kind: 'rename'; draft: string; error: string | null; busy: boolean } | { kind: 'delete'; error: string | null; busy: boolean };

interface ProjectItemProps {
  row: ProjectRow;
  nextId: string | null;
  onRenamed: (row: ProjectRow) => void;
  onDeleted: (id: string) => void;
}

function ProjectItem({ row, nextId, onRenamed, onDeleted }: ProjectItemProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'view' });
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const titleId = `revista-${row.id}`;

  useEffect(() => {
    if (mode.kind === 'rename' && !mode.busy) inputRef.current?.focus();
    if (mode.kind === 'delete' && !mode.busy) cancelDeleteRef.current?.focus();
  }, [mode.kind]);

  const backToView = (): void => {
    setMode({ kind: 'view' });
    requestAnimationFrame(() => renameRef.current?.focus());
  };

  const submitRename = async (event?: SubmitEvent<HTMLFormElement>): Promise<void> => {
    event?.preventDefault();
    if (mode.kind !== 'rename' || mode.busy) return;
    const title = mode.draft.trim();
    if (!title) {
      setMode({ ...mode, error: 'Escribe un título para la revista.' });
      return;
    }
    if (title === row.title) {
      backToView();
      return;
    }
    setMode({ ...mode, busy: true, error: null });
    try {
      const updated = await renameProject(row.id, title);
      onRenamed(updated);
      backToView();
    } catch (error) {
      setMode({ kind: 'rename', draft: title, busy: false, error: messageOf(error) });
    }
  };

  const confirmDelete = async (): Promise<void> => {
    if (mode.kind !== 'delete' || mode.busy) return;
    setMode({ kind: 'delete', busy: true, error: null });
    try {
      await deleteProject(row.id);
      onDeleted(row.id);
      toast({ id: 'revistas', title: 'Revista borrada', description: `«${row.title}» ya no está en tu cuenta. Tus archivos no se han tocado.` });
      requestAnimationFrame(() => {
        const target = nextId ? document.querySelector<HTMLElement>(`[data-open="${nextId}"]`) : document.getElementById('mis-revistas-titulo');
        target?.focus();
      });
    } catch (error) {
      setMode({ kind: 'delete', busy: false, error: messageOf(error) });
    }
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      backToView();
    }
  };

  if (mode.kind === 'delete') {
    return (
      <li className={cx(styles.row, styles.confirm)} aria-labelledby={titleId}>
        <div className={styles.confirmText}>
          <p id={titleId} className={styles.confirmTitle}>
            ¿Borrar «{row.title}» de tu cuenta?
          </p>
          <p className={styles.confirmNote}>Se pierden la configuración y el orden guardados. Tus archivos no se tocan: nunca salieron de tu equipo.</p>
          {mode.error && (
            <p className={styles.error} role="alert">
              {mode.error}
            </p>
          )}
        </div>
        <div className={styles.confirmActions}>
          <Button ref={cancelDeleteRef} size="sm" onClick={backToView} disabled={mode.busy}>
            Cancelar
          </Button>
          <Button size="sm" variant="danger" loading={mode.busy} onClick={() => void confirmDelete()}>
            Borrar revista
          </Button>
        </div>
      </li>
    );
  }

  const updated = formatUpdatedAt(row.updatedAt);
  return (
    <li className={styles.row} aria-labelledby={titleId}>
      <div className={styles.titleCell}>
        {mode.kind === 'rename' ? (
          <form className={styles.renameForm} onSubmit={(event) => void submitRename(event)}>
            <TextField
              ref={inputRef}
              size="sm"
              label="Nuevo título"
              labelHidden
              value={mode.draft}
              maxLength={TITLE_MAX_LENGTH}
              disabled={mode.busy}
              error={mode.error ?? undefined}
              onValueChange={(draft) => setMode({ ...mode, draft, error: null })}
              onKeyDown={onRenameKey}
              fieldClassName={styles.renameField}
              autoComplete="off"
              spellCheck={false}
            />
            <div className={styles.renameActions}>
              <Button size="sm" variant="ghost" onClick={backToView} disabled={mode.busy}>
                Cancelar
              </Button>
              <Button size="sm" type="submit" loading={mode.busy}>
                Guardar título
              </Button>
            </div>
          </form>
        ) : (
          <a id={titleId} className={styles.title} href={projectHref(row.id)}>
            {row.title}
          </a>
        )}
        <p className={styles.compactData}>
          {plural(row.pageCount, 'pág.', 'págs.')} · {plural(row.sheetCount, 'pliego', 'pliegos')} · {updated}
        </p>
      </div>

      <span className={cx(styles.num, styles.data)}>
        <span className="visually-hidden">Páginas: </span>
        {row.pageCount}
      </span>
      <span className={cx(styles.num, styles.data)}>
        <span className="visually-hidden">Pliegos: </span>
        {row.sheetCount}
      </span>
      <span className={styles.verdict}>
        <StatusBadge tone={VERDICT_TONE[row.verdict]} size="sm">
          {VERDICT_TEXT[row.verdict]}
        </StatusBadge>
      </span>
      <time className={styles.date} dateTime={row.updatedAt} title={formatFullDate(row.updatedAt)}>
        <span className="visually-hidden">Modificada: </span>
        {updated}
      </time>

      <div className={styles.actions}>
        <LinkButton size="sm" href={projectHref(row.id)} data-open={row.id} aria-label={`Abrir «${row.title}»`}>
          Abrir
        </LinkButton>
        <IconButton
          ref={renameRef}
          size="sm"
          label="Renombrar"
          icon={<Icon icon={Pencil} size={14} />}
          aria-pressed={mode.kind === 'rename' ? true : undefined}
          onClick={() => setMode(mode.kind === 'rename' ? { kind: 'view' } : { kind: 'rename', draft: row.title, error: null, busy: false })}
        />
        <IconButton size="sm" label="Borrar" icon={<Icon icon={Trash2} size={14} />} onClick={() => setMode({ kind: 'delete', error: null, busy: false })} />
      </div>
    </li>
  );
}
