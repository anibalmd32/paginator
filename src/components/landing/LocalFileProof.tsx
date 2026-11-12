import { useEffect, useRef, useState, type DragEvent } from 'react';

import { ACCEPT_ATTR, classifyFile, unsupportedReason } from '@/lib/ingest/accept';

import styles from './LocalFileProof.module.css';

const HASH_LIMIT_BYTES = 256 * 1024 * 1024;
const PRINT_PPI = 300;

interface Reading {
  name: string;
  kindLabel: string;
  bytes: number;
  dimensions: { width: number; height: number } | null;
  pdfVersion: string | null;
  digest: string | null;
  previewUrl: string | null;
  note: string | null;
  elapsedMs: number;
}

type State = { status: 'idle' } | { status: 'reading'; name: string } | { status: 'done'; reading: Reading };

const integer = new Intl.NumberFormat('es-ES', { useGrouping: true });
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${integer.format(bytes)} bytes`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${decimal.format(value)} ${units[unit] ?? 'GB'} (${integer.format(bytes)} bytes)`;
}

function toMm(px: number): string {
  return integer.format(Math.round((px / PRINT_PPI) * 25.4));
}

function imageKindLabel(file: File): string {
  const sub = file.type.split('/')[1]?.split(';')[0]?.toUpperCase();
  if (sub === 'JPEG' || sub === 'JPG' || sub === 'PJPEG') return 'Imagen JPG';
  if (sub) return `Imagen ${sub}`;
  const ext = file.name.split('.').pop()?.toUpperCase();
  return ext ? `Imagen ${ext === 'JPEG' ? 'JPG' : ext}` : 'Imagen';
}

async function sha256(file: File): Promise<string | null> {
  if (file.size > HASH_LIMIT_BYTES || typeof crypto === 'undefined' || !('subtle' in crypto)) return null;
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readPdfVersion(file: File): Promise<string | null> {
  const head = await file.slice(0, 1024).text();
  return /%PDF-(\d\.\d)/.exec(head)?.[1] ?? null;
}

async function readFile(file: File): Promise<Reading> {
  const started = performance.now();
  const kind = classifyFile(file);
  let kindLabel = file.type ? file.type : 'Tipo desconocido';
  let dimensions: Reading['dimensions'] = null;
  let pdfVersion: string | null = null;
  let previewUrl: string | null = null;
  let note: string | null = null;

  if (kind === 'pdf') {
    pdfVersion = await readPdfVersion(file);
    kindLabel = pdfVersion ? `PDF ${pdfVersion}` : 'PDF';
    if (!pdfVersion) note = 'La cabecera no dice «%PDF-»: puede que el archivo no sea un PDF válido.';
  } else if (kind === 'image') {
    kindLabel = imageKindLabel(file);
    try {
      const bitmap = await createImageBitmap(file);
      dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      previewUrl = URL.createObjectURL(file);
    } catch {
      note = 'El navegador no ha podido decodificar la imagen.';
    }
  } else {
    note = `${unsupportedReason(file.name)}. Aun así se ha leído aquí mismo.`;
  }

  const digest = await sha256(file);
  return {
    name: file.name,
    kindLabel,
    bytes: file.size,
    dimensions,
    pdfVersion,
    digest,
    previewUrl,
    note,
    elapsedMs: performance.now() - started,
  };
}

export function LocalFileProof() {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ticket = useRef(0);

  const previewUrl = state.status === 'done' ? state.reading.previewUrl : null;
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const take = (file: File | undefined): void => {
    if (!file) return;
    const mine = ++ticket.current;
    setState({ status: 'reading', name: file.name });
    readFile(file).then(
      (reading) => {
        if (mine === ticket.current) setState({ status: 'done', reading });
        else if (reading.previewUrl) URL.revokeObjectURL(reading.previewUrl);
      },
      () => {
        if (mine !== ticket.current) return;
        setState({
          status: 'done',
          reading: {
            name: file.name,
            kindLabel: file.type || 'Tipo desconocido',
            bytes: file.size,
            dimensions: null,
            pdfVersion: null,
            digest: null,
            previewUrl: null,
            note: 'No se ha podido leer el archivo. Puede que ya no exista o que el sistema no deje abrirlo.',
            elapsedMs: 0,
          },
        });
      },
    );
  };

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    take(event.dataTransfer.files[0]);
  };

  const reading = state.status === 'done' ? state.reading : null;

  return (
    <div
      className={styles.proof}
      data-dragging={dragging || undefined}
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <div className={styles.pick}>
        <button type="button" className="l-action" onClick={() => inputRef.current?.click()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 3v5h5" />
          </svg>
          Elige un PDF o una imagen
        </button>
        <span className={styles.hint}>o arrástralo aquí</span>
        <input
          ref={inputRef}
          className={styles.input}
          type="file"
          accept={ACCEPT_ATTR}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            take(event.currentTarget.files?.[0]);
            event.currentTarget.value = '';
          }}
        />
      </div>

      <div className={styles.sheet} aria-live="polite">
        {state.status === 'idle' && (
          <p className={styles.empty}>
            Aquí aparecerán su tipo, su tamaño, sus dimensiones y su huella SHA-256, leídos en esta pestaña sin enviarlos a
            ninguna parte.
          </p>
        )}
        {state.status === 'reading' && <p className={styles.empty}>Leyendo «{state.name}» en tu navegador…</p>}
        {reading && (
          <div className={styles.result} data-preview={reading.previewUrl ? '' : undefined}>
            {reading.previewUrl && (
              <div className={styles.preview}>
                <img src={reading.previewUrl} alt={`Vista previa de «${reading.name}», dibujada desde tu equipo`} decoding="async" />
              </div>
            )}
            <dl className={styles.facts}>
              <div>
                <dt>Archivo</dt>
                <dd className={styles.name}>{reading.name}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{reading.kindLabel}</dd>
              </div>
              <div>
                <dt>Tamaño</dt>
                <dd className={styles.num}>{formatBytes(reading.bytes)}</dd>
              </div>
              {reading.dimensions && (
                <div>
                  <dt>Dimensiones</dt>
                  <dd className={styles.num}>
                    {integer.format(reading.dimensions.width)} × {integer.format(reading.dimensions.height)} px
                    <span className={styles.aside}>
                      {toMm(reading.dimensions.width)} × {toMm(reading.dimensions.height)} mm a {PRINT_PPI} ppp
                    </span>
                  </dd>
                </div>
              )}
              {reading.digest && (
                <div>
                  <dt>SHA-256</dt>
                  <dd className={styles.num} title={reading.digest}>
                    {reading.digest.slice(0, 16)}…
                  </dd>
                </div>
              )}
            </dl>
            {reading.note && <p className={styles.note}>{reading.note}</p>}
            <p className={styles.verdict}>
              Leído en tu navegador en {integer.format(Math.max(1, Math.round(reading.elapsedMs)))} ms. No se ha enviado
              nada.
            </p>
          </div>
        )}
      </div>

      <p className={styles.foot}>
        Esta lectura no hace ninguna petición de red: puedes desconectar el wifi y repetirla. Paginator lee tus archivos
        del mismo modo.
      </p>
    </div>
  );
}
