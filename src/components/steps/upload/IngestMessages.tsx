import { Callout, ProgressBar } from '@/components/ui';
import { useProjectStore } from '@/lib/store';

import styles from './IngestMessages.module.css';
import { plural } from './format';

export function IngestProgress({ className }: { className?: string | undefined }) {
  const ingest = useProjectStore((state) => state.ingest);
  if (!ingest.busy) return null;
  const progress = ingest.progress;
  const demo = ingest.source === 'demo';
  const label = demo
    ? 'Preparando la revista de ejemplo'
    : progress
      ? `Analizando ${progress.fileName}`
      : 'Abriendo archivos';
  const valueText = progress && progress.total > 0 ? `${String(Math.min(progress.done, progress.total))} de ${String(progress.total)}` : false;
  const value = progress && progress.total > 0 ? progress.done / progress.total : null;
  return (
    <div className={className} role="status" aria-live="polite">
      <ProgressBar value={value} label={label} valueText={valueText} />
    </div>
  );
}

function sentence(reason: string): string {
  const text = reason.trim();
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function IngestAlerts({ className }: { className?: string | undefined }) {
  const rejected = useProjectStore((state) => state.ingest.rejected);
  const error = useProjectStore((state) => state.ingest.error);
  const dismiss = useProjectStore((state) => state.dismissIngestMessages);
  if (rejected.length === 0 && !error) return null;

  return (
    <div className={className}>
      {error ? (
        <Callout tone="error" title="No se pudo completar la carga" onDismiss={dismiss} live>
          {error} Vuelve a intentarlo; si se repite, exporta de nuevo el archivo desde la aplicación de maquetación.
        </Callout>
      ) : null}
      {rejected.length > 0 ? (
        <Callout
          tone="warning"
          title={`${String(rejected.length)} ${plural(rejected.length, 'archivo no se ha cargado', 'archivos no se han cargado')}`}
          onDismiss={dismiss}
          live
        >
          <ul className={styles.rejected}>
            {rejected.map((file, index) => (
              <li key={`${file.name}-${String(index)}`}>{sentence(file.reason)}</li>
            ))}
          </ul>
        </Callout>
      ) : null}
    </div>
  );
}
