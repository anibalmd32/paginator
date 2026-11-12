import { Box } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { Button, Icon, StatusBadge } from '@/components/ui';
import { rasterize } from '@/lib/ingest';
import { pageRegion, useDerived, useProjectStore } from '@/lib/store';
import type { Issue, NormRect, SourceUnit } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { decimal, slotLabel } from './format';
import { Panel } from './Panel';
import styles from './PageInspector.module.css';

const WHOLE: NormRect = { x: 0, y: 0, w: 1, h: 1 };

function boxStyle(rect: NormRect): CSSProperties {
  const pct = (value: number) => `${(value * 100).toFixed(3)}%`;
  return { left: pct(rect.x), top: pct(rect.y), width: pct(rect.w), height: pct(rect.h) };
}

export interface PageInspectorProps {
  pageId: string;
  onApplyFix: (issue: Issue) => void;
}

export function PageInspector({ pageId, onApplyFix }: PageInspectorProps) {
  const derived = useDerived();
  const config = useProjectStore((state) => state.config);
  const assets = useProjectStore((state) => state.assets);
  const openPageInViewer = useProjectStore((state) => state.openPageInViewer);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [pageId]);

  const index = derived.effectivePages.findIndex((page) => page.id === pageId);
  const page = derived.effectivePages[index];
  if (!page) return null;
  const pageNumber = index + 1;
  const unit = page.unitId !== null ? derived.unitsById.get(page.unitId) : undefined;
  const asset = unit ? assets.find((candidate) => candidate.id === unit.assetId) : undefined;
  const region = unit ? pageRegion(pageNumber, 'source') : null;
  const placement = derived.imposition.placements[pageNumber - 1];
  const issues = derived.issuesByPage.get(pageNumber) ?? [];

  const halfText = page.half === 'left' ? 'mitad izquierda' : page.half === 'right' ? 'mitad derecha' : null;
  const blankText = page.origin === 'auto-blank' ? 'Cortesía añadida para cerrar el último pliego' : 'Blanca insertada a mano';

  return (
    <Panel
      ref={panelRef}
      id="carga-inspector"
      title={`Página ${String(pageNumber)}`}
      aside={
        <Button size="sm" variant="ghost" iconStart={<Icon icon={Box} size={14} />} onClick={() => openPageInViewer(pageNumber)}>
          Ver en 3D
        </Button>
      }
    >
      {unit && region ? (
        <UnitView unit={unit} source={region.geometry.source} bleed={region.geometry.bleed} trim={region.geometry.trim} safe={region.geometry.safe} half={page.half} />
      ) : (
        <div className={styles.blank} style={{ aspectRatio: String(derived.trim.widthMm / derived.trim.heightMm) }}>
          <span>{page.origin === 'auto-blank' ? 'Cortesía' : 'Blanca'}</span>
        </div>
      )}

      {unit && region ? (
        <ul className={styles.legend} aria-label="Cajas superpuestas">
          <li><span className={cx(styles.key, styles.keySource)} aria-hidden="true" />Archivo</li>
          {config.bleedMm > 0 ? <li><span className={cx(styles.key, styles.keyBleed)} aria-hidden="true" />Sangrado</li> : null}
          <li><span className={cx(styles.key, styles.keyTrim)} aria-hidden="true" />Corte</li>
          <li><span className={cx(styles.key, styles.keySafe)} aria-hidden="true" />Zona segura</li>
        </ul>
      ) : null}

      <dl className={styles.facts}>
        <dt>Origen</dt>
        <dd>
          {unit && asset ? (
            <>
              <span className={styles.file} title={asset.name}>
                {asset.name}
              </span>
              <span className={styles.sub}>
                {asset.kind === 'pdf' ? `p. ${String(unit.indexInAsset + 1)} de ${String(asset.unitCount)}` : 'imagen'}
                {halfText ? ` · ${halfText}` : ''}
              </span>
            </>
          ) : (
            blankText
          )}
        </dd>
        {unit ? (
          <>
            <dt>Tamaño</dt>
            <dd>{sizeText(unit)}</dd>
            {unit.widthMm === null && region ? (
              <>
                <dt>Resolución</dt>
                <dd>{resolutionText(unit, region.geometry.trim, derived.trim.widthMm)}</dd>
              </>
            ) : null}
            <dt>Folio impreso</dt>
            <dd>{page.detectedFolio !== null ? String(page.detectedFolio) : <span className={styles.sub}>No detectado</span>}</dd>
          </>
        ) : null}
        <dt>Casilla</dt>
        <dd>
          {slotLabel(placement)}
          {placement ? <span className={styles.sub}>Cuadernillo {placement.signature + 1}</span> : null}
        </dd>
      </dl>

      {issues.length > 0 ? (
        <ul className={styles.issues} aria-label={`Incidencias de la página ${String(pageNumber)}`}>
          {issues.map((issue) => (
            <li key={issue.id} className={styles.issue}>
              <StatusBadge tone={issue.severity} size="sm" />
              <p className={styles.issueTitle}>{issue.title}</p>
              <p className={styles.issueDetail}>{issue.detail}</p>
              {issue.fix ? (
                <Button size="sm" variant="secondary" onClick={() => onApplyFix(issue)} className={styles.fix}>
                  {issue.fix.label}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.clean}>
          <StatusBadge tone="success" size="sm">Sin incidencias</StatusBadge>
        </p>
      )}
    </Panel>
  );
}

function sizeText(unit: SourceUnit): string {
  if (unit.widthMm !== null && unit.heightMm !== null) return `${decimal(unit.widthMm)} × ${decimal(unit.heightMm)} mm`;
  return `${String(Math.round(unit.width))} × ${String(Math.round(unit.height))} px`;
}

function resolutionText(unit: SourceUnit, trim: NormRect, trimWidthMm: number): string {
  if (trimWidthMm <= 0) return '—';
  const pixels = trim.w * unit.width;
  const ppi = pixels / (trimWidthMm / 25.4);
  return `${String(Math.round(ppi))} ppp a ${decimal(trimWidthMm)} mm de ancho`;
}

interface UnitViewProps {
  unit: SourceUnit;
  source: NormRect;
  bleed: NormRect;
  trim: NormRect;
  safe: NormRect;
  half: 'full' | 'left' | 'right';
}

type LoadState = 'loading' | 'ready' | 'error';

function UnitView({ unit, source, bleed, trim, safe, half }: UnitViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<{ unitId: string; status: LoadState }>({ unitId: unit.id, status: 'loading' });
  const status = state.unitId === unit.id ? state.status : 'loading';

  useEffect(() => {
    const controller = new AbortController();
    setState({ unitId: unit.id, status: 'loading' });
    rasterize(unit.id, WHOLE, 'mid', { signal: controller.signal, priority: 'visible' })
      .then((bitmap) => {
        const canvas = canvasRef.current;
        if (controller.signal.aborted || !canvas) {
          bitmap.close();
          return;
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
        bitmap.close();
        setState({ unitId: unit.id, status: 'ready' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
        console.warn(`No se pudo dibujar la unidad «${unit.label}» en el inspector.`, error);
        setState({ unitId: unit.id, status: 'error' });
      });
    return () => controller.abort();
  }, [unit.id, unit.label]);

  const aspect = unit.width > 0 && unit.height > 0 ? unit.width / unit.height : 0.707;

  return (
    <div className={styles.unit} style={{ aspectRatio: String(aspect), maxWidth: `calc(20rem * ${aspect.toFixed(4)})` }} data-status={status}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={`Vista de ${unit.label}`} role="img" />
      {status === 'error' ? <span className={styles.unitNote}>Sin vista previa</span> : null}
      {half !== 'full' ? (
        <span className={styles.dim} style={boxStyle(half === 'left' ? { x: 0.5, y: 0, w: 0.5, h: 1 } : { x: 0, y: 0, w: 0.5, h: 1 })} aria-hidden="true" />
      ) : null}
      <span className={styles.boxes} aria-hidden="true">
        <span className={styles.source} style={boxStyle(source)} />
        <span className={styles.bleed} style={boxStyle(bleed)} />
        <span className={styles.trim} style={boxStyle(trim)} />
        <span className={styles.safe} style={boxStyle(safe)} />
      </span>
    </div>
  );
}
