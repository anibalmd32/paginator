import { ArrowDownAZ, FileImage, FileText, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button, Icon, IconButton, Tag } from '@/components/ui';
import { useProjectStore } from '@/lib/store';

import styles from './FilesPanel.module.css';
import { assetMeta, plural } from './format';
import { Panel } from './Panel';

export interface FilesPanelProps {
  onAddFiles: () => void;
  announce: (message: string) => void;
}

export function FilesPanel({ onAddFiles, announce }: FilesPanelProps) {
  const assets = useProjectStore((state) => state.assets);
  const isDemo = useProjectStore((state) => state.isDemo);
  const busy = useProjectStore((state) => state.ingest.busy);
  const removeAsset = useProjectStore((state) => state.removeAsset);
  const sortFilesByName = useProjectStore((state) => state.sortFilesByName);
  const clearFiles = useProjectStore((state) => state.clearFiles);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  const total = assets.length;

  return (
    <Panel
      id="carga-archivos"
      title="Archivos"
      aside={isDemo ? <Tag size="sm">Ejemplo sintético</Tag> : `${String(total)} ${plural(total, 'archivo', 'archivos')}`}
    >
      <ul className={styles.list}>
        {assets.map((asset) => (
          <li key={asset.id} className={styles.item}>
            <Icon icon={asset.kind === 'pdf' ? FileText : FileImage} className={styles.kind} />
            <span className={styles.text}>
              <span className={styles.name} title={asset.name}>
                {asset.name}
              </span>
              <span className={styles.meta}>{assetMeta(asset)}</span>
            </span>
            <IconButton
              size="sm"
              label={`Quitar ${asset.name}`}
              icon={<Icon icon={X} size={14} />}
              tooltipPlacement="left"
              disabled={busy}
              onClick={() => {
                removeAsset(asset.id);
                announce(`${asset.name} quitado.`);
              }}
            />
          </li>
        ))}
      </ul>

      {confirming ? (
        <div className={styles.confirm} role="group" aria-labelledby="carga-vaciar-pregunta">
          <p id="carga-vaciar-pregunta" className={styles.question}>
            ¿Quitar {total === 1 ? 'el archivo' : `los ${String(total)} archivos`} y todas sus páginas?
          </p>
          <div className={styles.actions}>
            <Button ref={cancelRef} size="sm" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="danger"
              iconStart={<Icon icon={Trash2} size={14} />}
              onClick={() => {
                setConfirming(false);
                clearFiles();
                announce('Archivos quitados.');
              }}
            >
              Vaciar
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button size="sm" iconStart={<Icon icon={Plus} size={14} />} onClick={onAddFiles} disabled={busy}>
            Añadir archivos
          </Button>
          <Button size="sm" variant="ghost" iconStart={<Icon icon={ArrowDownAZ} size={14} />} onClick={sortFilesByName} disabled={busy || total < 2}>
            Ordenar por nombre
          </Button>
          <Button size="sm" variant="ghost" iconStart={<Icon icon={Trash2} size={14} />} onClick={() => setConfirming(true)} disabled={busy} className={styles.clear}>
            Vaciar
          </Button>
        </div>
      )}
    </Panel>
  );
}
