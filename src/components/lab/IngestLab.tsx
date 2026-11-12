import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactElement } from 'react';

import {
  ACCEPT_ATTR,
  ingestFiles,
  ingestStats,
  rasterize,
  releaseAll,
  releaseAsset,
  thumbnailUrl,
  tierLongSide,
} from '@/lib/ingest';
import type { IngestProgress, RejectedFile } from '@/lib/ingest';
import type { NormRect, RasterTier, SourceAsset, SourceUnit } from '@/lib/types';

const FULL: NormRect = { x: 0, y: 0, w: 1, h: 1 };
const LEFT: NormRect = { x: 0, y: 0, w: 0.5, h: 1 };
const RIGHT: NormRect = { x: 0.5, y: 0, w: 0.5, h: 1 };

type RegionChoice = 'full' | 'halves' | 'left' | 'right';

const REGION_LABELS: Record<RegionChoice, string> = {
  full: 'Unidad entera',
  halves: 'Dos mitades (partida por el lomo)',
  left: 'Solo mitad izquierda',
  right: 'Solo mitad derecha',
};

const REGION_RECTS: Record<RegionChoice, NormRect[]> = {
  full: [FULL],
  halves: [LEFT, RIGHT],
  left: [LEFT],
  right: [RIGHT],
};

const TIERS: RasterTier[] = ['thumb', 'mid', 'high'];

type Stats = ReturnType<typeof ingestStats>;

interface RasterReport {
  tier: RasterTier;
  sizes: string[];
  ms: number;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatMm(unit: SourceUnit): string {
  if (unit.widthMm === null || unit.heightMm === null) return '—';
  return `${unit.widthMm.toFixed(1)} × ${unit.heightMm.toFixed(1)}`;
}

function formatSize(unit: SourceUnit, kind: SourceAsset['kind'] | undefined): string {
  const round = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return `${round(unit.width)} × ${round(unit.height)} ${kind === 'pdf' ? 'pt' : 'px'}`;
}

function formatFolios(unit: SourceUnit): string {
  if (unit.folios.length === 0) return '—';
  return unit.folios.map((hit) => `${hit.value} (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)})`).join(' · ');
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Thumb({ unitId, rect, alt }: { unitId: string; rect: NormRect; alt: string }): ReactElement {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const { x, y, w, h } = rect;

  useEffect(() => {
    const controller = new AbortController();
    setUrl(null);
    setFailed(null);
    thumbnailUrl(unitId, { x, y, w, h }, { signal: controller.signal }).then(setUrl, (error: unknown) => {
      if (!isAbort(error)) setFailed(messageOf(error));
    });
    return () => controller.abort();
  }, [unitId, x, y, w, h]);

  if (url !== null) return <img src={url} alt={alt} data-thumb={unitId} />;
  return <div className="placeholder" role="img" aria-label={failed ?? `Cargando ${alt}`} title={failed ?? undefined} />;
}

export function IngestLab(): ReactElement {
  const [assets, setAssets] = useState<SourceAsset[]>([]);
  const [units, setUnits] = useState<SourceUnit[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [progress, setProgress] = useState<IngestProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>(() => ingestStats());
  const [splitThumbs, setSplitThumbs] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [region, setRegion] = useState<RegionChoice>('full');
  const [rasterBusy, setRasterBusy] = useState(false);
  const [rasterReport, setRasterReport] = useState<RasterReport | null>(null);
  const [rasterError, setRasterError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const unitCount = useRef(0);
  const ingestChain = useRef<Promise<void>>(Promise.resolve());
  const rasterAbort = useRef<AbortController | null>(null);
  const canvasHost = useRef<HTMLDivElement | null>(null);

  const refreshStats = useCallback(() => setStats(ingestStats()), []);

  useEffect(() => {
    const timer = window.setInterval(refreshStats, 500);
    return () => window.clearInterval(timer);
  }, [refreshStats]);

  useEffect(() => () => releaseAll(), []);

  useEffect(() => {
    const hook = { ingestStats, rasterize, thumbnailUrl, releaseAsset, releaseAll, tierLongSide, units, assets, rejected };
    (window as Window & { __ingestLab?: typeof hook }).__ingestLab = hook;
  }, [units, assets, rejected]);

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      ingestChain.current = ingestChain.current.then(async () => {
        setBusy(true);
        setError(null);
        try {
          const result = await ingestFiles(files, { startOrder: unitCount.current, onProgress: setProgress });
          unitCount.current += result.units.length;
          setAssets((previous) => [...previous, ...result.assets]);
          setUnits((previous) => [...previous, ...result.units]);
          setRejected(result.rejected);
          setSelectedUnitId((previous) => previous ?? result.units[0]?.id ?? null);
        } catch (failure) {
          setError(messageOf(failure));
        } finally {
          setBusy(false);
          setProgress(null);
          refreshStats();
        }
      });
    },
    [refreshStats],
  );

  const clearCanvases = useCallback(() => {
    rasterAbort.current?.abort();
    const host = canvasHost.current;
    if (host) {
      for (const canvas of host.querySelectorAll('canvas')) {
        canvas.width = 0;
        canvas.height = 0;
      }
      host.replaceChildren();
    }
    setRasterReport(null);
    setRasterError(null);
  }, []);

  const removeAsset = useCallback(
    (assetId: string) => {
      releaseAsset(assetId);
      setAssets((previous) => previous.filter((asset) => asset.id !== assetId));
      setUnits((previous) => {
        const kept = previous.filter((unit) => unit.assetId !== assetId).map((unit, order) => ({ ...unit, order }));
        unitCount.current = kept.length;
        return kept;
      });
      setSelectedUnitId((previous) => (previous?.startsWith(`${assetId}/`) ? null : previous));
      clearCanvases();
      refreshStats();
    },
    [clearCanvases, refreshStats],
  );

  const removeAll = useCallback(() => {
    releaseAll();
    unitCount.current = 0;
    setAssets([]);
    setUnits([]);
    setRejected([]);
    setSelectedUnitId(null);
    clearCanvases();
    refreshStats();
  }, [clearCanvases, refreshStats]);

  const runRaster = useCallback(
    async (tier: RasterTier) => {
      const host = canvasHost.current;
      if (selectedUnitId === null || !host) return;
      clearCanvases();
      const controller = new AbortController();
      rasterAbort.current = controller;
      setRasterBusy(true);
      const started = performance.now();
      try {
        const bitmaps = await Promise.all(
          REGION_RECTS[region].map((rect) => rasterize(selectedUnitId, rect, tier, { signal: controller.signal, priority: 'visible' })),
        );
        const ms = Math.round(performance.now() - started);
        const sizes: string[] = [];
        for (const bitmap of bitmaps) {
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
          sizes.push(`${bitmap.width} × ${bitmap.height}`);
          bitmap.close();
          host.append(canvas);
        }
        setRasterReport({ tier, sizes, ms });
      } catch (failure) {
        if (!isAbort(failure)) setRasterError(messageOf(failure));
      } finally {
        if (rasterAbort.current === controller) {
          rasterAbort.current = null;
          setRasterBusy(false);
        }
        refreshStats();
      }
    },
    [clearCanvases, refreshStats, region, selectedUnitId],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragOver(false);
    addFiles([...event.dataTransfer.files]);
  };

  const kindOf = new Map(assets.map((asset) => [asset.id, asset.kind]));
  const selectedUnit = units.find((unit) => unit.id === selectedUnitId) ?? null;

  return (
    <main className="lab">
      <h1>Laboratorio · Ingesta</h1>
      <p className="muted">
        Suelta PDF o imágenes PNG/JPG/WebP para ver qué entiende la ingesta: orden, tamaños, folios, miniaturas y rasterizado.
      </p>

      <section aria-label="Carga de archivos">
        <div
          className="drop"
          data-over={dragOver}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <label htmlFor="lab-files">Suelta aquí los archivos o elígelos:</label>
          <input
            id="lab-files"
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(event) => {
              addFiles([...(event.currentTarget.files ?? [])]);
              event.currentTarget.value = '';
            }}
          />
          <button type="button" onClick={removeAll} disabled={assets.length === 0 || busy}>
            Quitar todo
          </button>
        </div>

        <p id="lab-status" role="status" style={{ marginTop: 10 }}>
          {busy
            ? progress
              ? `Analizando “${progress.fileName}”: ${progress.done} de ${progress.total} unidades…`
              : 'Analizando…'
            : `${assets.length} archivo(s), ${units.length} unidad(es).`}
        </p>
        {error !== null && (
          <p className="error" id="lab-error">
            {error}
          </p>
        )}
        {rejected.length > 0 && (
          <div id="lab-rejected">
            <strong className="error">Archivos rechazados ({rejected.length})</strong>
            <ul>
              {rejected.map((item, index) => (
                <li key={`${item.name}-${index}`}>{item.reason}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-label="Estadísticas">
        <h2>ingestStats()</h2>
        <div className="stats" id="lab-stats">
          <span>
            Archivos: <b>{stats.assets}</b>
          </span>
          <span>
            Unidades: <b>{stats.units}</b>
          </span>
          <span>
            Renders en caché: <b>{stats.cachedRenders}</b>
          </span>
          <span>
            Memoria en caché: <b>{formatBytes(stats.cachedBytes)}</b>
          </span>
        </div>
        {assets.length > 0 && (
          <ul id="lab-assets">
            {assets.map((asset) => (
              <li key={asset.id}>
                {asset.name} — {asset.kind === 'pdf' ? 'PDF' : 'imagen'}, {asset.unitCount} unidad(es),{' '}
                {(asset.sizeBytes / 1024).toFixed(1)} kB{' '}
                <button type="button" onClick={() => removeAsset(asset.id)} disabled={busy}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Unidades">
        <h2>Unidades ({units.length})</h2>
        {units.length === 0 ? (
          <p className="muted">Todavía no hay unidades.</p>
        ) : (
          <div className="table-wrap">
            <table id="lab-units">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Etiqueta</th>
                  <th>Tamaño</th>
                  <th>mm</th>
                  <th>Nº en nombre</th>
                  <th>Folios detectados (valor y posición x, y)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.id} data-selected={unit.id === selectedUnitId} data-unit={unit.id}>
                    <td>{unit.order}</td>
                    <td>{unit.label}</td>
                    <td>{formatSize(unit, kindOf.get(unit.assetId))}</td>
                    <td>{formatMm(unit)}</td>
                    <td>{unit.filenameNumber ?? '—'}</td>
                    <td data-folios={unit.folios.map((hit) => hit.value).join(',')}>{formatFolios(unit)}</td>
                    <td>
                      <button type="button" aria-pressed={unit.id === selectedUnitId} onClick={() => setSelectedUnitId(unit.id)}>
                        Elegir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="Miniaturas">
        <h2>Miniaturas</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <button type="button" id="lab-split" aria-pressed={splitThumbs} onClick={() => setSplitThumbs((value) => !value)}>
            Partir por el lomo (dos mitades)
          </button>
          <span className="muted">Cada miniatura es una URL de blob de thumbnailUrl().</span>
        </div>
        <div className="thumbs" id="lab-thumbs">
          {units.map((unit) => (
            <figure key={unit.id}>
              <div className="pair">
                {splitThumbs ? (
                  <>
                    <Thumb unitId={unit.id} rect={LEFT} alt={`${unit.label}, mitad izquierda`} />
                    <Thumb unitId={unit.id} rect={RIGHT} alt={`${unit.label}, mitad derecha`} />
                  </>
                ) : (
                  <Thumb unitId={unit.id} rect={FULL} alt={unit.label} />
                )}
              </div>
              <figcaption title={unit.label}>{unit.label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section aria-label="Rasterizado">
        <h2>Rasterizar una unidad</h2>
        <div className="row">
          <label htmlFor="lab-unit">Unidad</label>
          <select
            id="lab-unit"
            value={selectedUnitId ?? ''}
            onChange={(event) => setSelectedUnitId(event.currentTarget.value || null)}
            disabled={units.length === 0}
          >
            {units.length === 0 && <option value="">(sin unidades)</option>}
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.order} · {unit.label}
              </option>
            ))}
          </select>
          <label htmlFor="lab-region">Región</label>
          <select id="lab-region" value={region} onChange={(event) => setRegion(event.currentTarget.value as RegionChoice)}>
            {(Object.keys(REGION_LABELS) as RegionChoice[]).map((choice) => (
              <option key={choice} value={choice}>
                {REGION_LABELS[choice]}
              </option>
            ))}
          </select>
          {TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              id={`lab-raster-${tier}`}
              onClick={() => void runRaster(tier)}
              disabled={selectedUnit === null || rasterBusy}
            >
              Rasterizar a {tier} (~{tierLongSide(tier)} px)
            </button>
          ))}
          <button type="button" onClick={clearCanvases} disabled={!rasterBusy && rasterReport === null}>
            {rasterBusy ? 'Cancelar' : 'Limpiar'}
          </button>
        </div>
        <p id="lab-raster-info" role="status" style={{ marginTop: 10 }}>
          {rasterBusy
            ? 'Rasterizando…'
            : rasterReport
              ? `${rasterReport.tier}: ${rasterReport.sizes.join(' + ')} px en ${rasterReport.ms} ms`
              : 'Elige una unidad y un nivel.'}
        </p>
        {rasterError !== null && <p className="error">{rasterError}</p>}
        <div className="stage">
          <div className="canvases" id="lab-canvases" ref={canvasHost} />
        </div>
      </section>
    </main>
  );
}
