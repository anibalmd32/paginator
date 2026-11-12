import { CircleCheck, CircleDashed, FolderOpen, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, Callout, Icon, Spinner, Tooltip } from '@/components/ui';
import type { ProjectSnapshot } from '@/lib/cloud';
import { useProjectStore } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import { formatBytes, plural } from './accountModel';
import styles from './RestoreNotice.module.css';

const OPEN_LIST_MAX = 6;

type DemoVariant = 'pages' | 'reader-spreads' | 'printer-spreads';

function demoOptionsOf(snapshot: ProjectSnapshot): { pageCount: number; variant: DemoVariant; withBleedAndMarks: boolean } | null {
  const isDemo = snapshot.files.length > 0 && snapshot.files.every((file) => file.kind === 'image' && file.name.startsWith('canto_'));
  if (!isDemo) return null;
  const { config } = snapshot;
  const variant: DemoVariant = config.inputMode === 'pages' ? 'pages' : config.spreadKind === 'printer' ? 'printer-spreads' : 'reader-spreads';
  return { pageCount: snapshot.summary.pageCount, variant, withBleedAndMarks: config.bleedMm > 0 && config.marksMm > 0 };
}

export interface RestoreNoticeProps {
  onChooseFiles: () => void;
  className?: string | undefined;
}

export function RestoreNotice({ onChooseFiles, className }: RestoreNoticeProps) {
  const pending = useProjectStore((state) => state.pendingRestore);
  const assets = useProjectStore((state) => state.assets);
  const fingerprints = useProjectStore((state) => state.fingerprints);
  const fingerprintErrors = useProjectStore((state) => state.fingerprintErrors);
  const busy = useProjectStore((state) => state.ingest.busy);
  const loadDemo = useProjectStore((state) => state.loadDemo);
  const dismissRestore = useProjectStore((state) => state.dismissRestore);
  const cloudProjectId = useProjectStore((state) => state.cloudProjectId);

  if (!pending) return null;
  const { snapshot, plan } = pending;

  if (pending.status === 'restored') {
    const extras = (plan?.extraAssetIds ?? []).filter((id) => assets.some((asset) => asset.id === id)).length;
    const restoredPages = snapshot.pages.length;
    return (
      <Callout tone="success" live className={className} title="Revista restaurada" onDismiss={dismissRestore}>
        <p>
          {plural(restoredPages, 'página vuelve', 'páginas vuelven')} a estar en el orden guardado
          {extras === 1 ? '; el archivo que no era de la revista va detrás' : extras > 1 ? '; los archivos que no eran de la revista van detrás' : ''}.{' '}
          {cloudProjectId ? `«Guardar» actualiza «${snapshot.title}» en tu cuenta.` : '«Guardar» la guarda en tu cuenta.'}
        </p>
      </Callout>
    );
  }

  const total = snapshot.files.length;
  const matched = plan ? plan.matches.filter((id) => id !== null).length : 0;
  const reading = assets.filter((asset) => !fingerprints.has(asset.id) && !fingerprintErrors.has(asset.id)).length;
  const extraNames = (plan?.extraAssetIds ?? []).map((id) => assets.find((asset) => asset.id === id)?.name ?? 'archivo');
  const unreadable = assets.filter((asset) => fingerprintErrors.has(asset.id)).map((asset) => asset.name);
  const broken = plan !== null && total > 0 && matched === total && plan.pages === null;
  const demo = demoOptionsOf(snapshot);

  const rows = snapshot.files.map((file, index) => {
    const ok = plan?.matches[index] != null;
    return (
      <li key={`${String(index)}-${file.sha256}`} className={cx(styles.row, ok && styles.ok)}>
        <Icon icon={ok ? CircleCheck : CircleDashed} size={14} className={styles.rowIcon} />
        <span className={styles.name} title={file.name}>
          {file.name}
        </span>
        <span className={styles.size}>{formatBytes(file.size)}</span>
        <span className={styles.state}>{ok ? 'Reconocido' : 'Falta'}</span>
      </li>
    );
  });

  const list: ReactNode =
    total > OPEN_LIST_MAX ? (
      <details className={styles.details}>
        <summary className={styles.summary}>Ver los {total} archivos</summary>
        <ul className={styles.list}>{rows}</ul>
      </details>
    ) : (
      <ul className={styles.list}>{rows}</ul>
    );

  return (
    <Callout tone={broken ? 'error' : extraNames.length > 0 ? 'warning' : 'info'} {...(broken ? {} : { icon: FolderOpen })} className={cx(styles.notice, className)} title="Vuelve a cargar los archivos de esta revista">
      <p className={styles.lead}>
        De «{snapshot.title}» se conservan la configuración y el orden de páginas, no los archivos: nunca salen de tu equipo. Cárgalos de
        nuevo y Paginator los reconocerá por su contenido, aunque hayan cambiado de nombre.
      </p>

      <p className={styles.tally} aria-live="polite">
        <span className={styles.figure}>
          {matched} de {total}
        </span>{' '}
        {total === 1 ? 'archivo reconocido' : 'archivos reconocidos'}
        {reading > 0 && (
          <span className={styles.reading}>
            <Spinner size={12} /> reconociendo {plural(reading, 'archivo', 'archivos')}…
          </span>
        )}
      </p>

      {list}

      {extraNames.length > 0 && (
        <p className={styles.extra}>
          <strong>{extraNames.length === 1 ? 'Este archivo no es de la revista' : 'Estos archivos no son de la revista'}:</strong>{' '}
          {extraNames.join(', ')}.{' '}
          {extraNames.length === 1
            ? 'No coincide con ninguno de los guardados; puedes seguir con él y sus páginas irán detrás.'
            : 'No coinciden con ninguno de los guardados; puedes seguir con ellos y sus páginas irán detrás.'}
        </p>
      )}
      {unreadable.length > 0 && (
        <p className={styles.extra}>
          <strong>No se pudo leer:</strong> {unreadable.join(', ')}. Quítalo y vuelve a cargarlo.
        </p>
      )}
      {broken && <p className={styles.extra}>Los archivos coinciden, pero su contenido no encaja con el orden guardado. Sigue sin restaurar y revisa el orden a mano.</p>}

      <div className={styles.actions}>
        <Button size="sm" iconStart={<Icon icon={FolderOpen} size={14} />} onClick={onChooseFiles} disabled={busy}>
          Elegir archivos
        </Button>
        {demo && (
          <Button size="sm" iconStart={<Icon icon={Sparkles} size={14} />} disabled={busy} onClick={() => void loadDemo(demo)}>
            Volver a generar la revista de ejemplo
          </Button>
        )}
        <Tooltip content="La revista guardada no cambia; si guardas, este trabajo irá como una revista nueva." placement="top">
          <Button size="sm" variant="ghost" onClick={dismissRestore}>
            Seguir sin restaurar
          </Button>
        </Tooltip>
      </div>
    </Callout>
  );
}
