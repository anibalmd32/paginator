import '@fontsource-variable/archivo';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReadingDirection } from '@/lib/types';
import { checkDemoPage, DEMO_TITLE, demoConfigPatch, describeDemoFiles, generateDemoFiles, prepareDemoFonts } from '@/lib/demo';
import type { DemoVariant } from '@/lib/demo';

const COUNTS = [8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64];
const VARIANTS: { value: DemoVariant; label: string }[] = [
  { value: 'pages', label: 'Páginas sueltas' },
  { value: 'reader-spreads', label: 'Pliegos de lectura' },
  { value: 'printer-spreads', label: 'Caras impuestas (a caballo)' },
];

function param(name: string): string | null {
  return typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name);
}

function numberParam(name: string, fallback: number): number {
  const value = Number(param(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function PageCanvas(props: { page: number; total: number; dir: ReadingDirection; width: number; onIssues: (page: number, issues: string[]) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { page, total, dir, width, onIssues } = props;
  const height = Math.round((width * 297) / 210);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    onIssues(page, checkDemoPage(ctx, page, total, canvas.width, canvas.height, dir));
  }, [page, total, dir, width, height, onIssues]);
  return <canvas ref={ref} data-page={page} style={{ width, height, display: 'block' }} />;
}

export function DemoLab() {
  const [total, setTotal] = useState(() => numberParam('pages', 24));
  const [dir, setDir] = useState<ReadingDirection>(() => (param('dir') === 'rtl' ? 'rtl' : 'ltr'));
  const [variant, setVariant] = useState<DemoVariant>(() => (VARIANTS.find((v) => v.value === param('variant'))?.value ?? 'pages'));
  const [bleed, setBleed] = useState(() => param('bleed') === '1');
  const [size] = useState(() => numberParam('size', 260));
  const [fontsReady, setFontsReady] = useState(false);
  const [issues, setIssues] = useState<Record<number, string[]>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [files, setFiles] = useState<{ name: string; url: string; size: number }[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void prepareDemoFonts().then(() => setFontsReady(true));
  }, []);

  useEffect(() => setIssues({}), [total, dir]);

  const reportIssues = useMemo(
    () => (page: number, list: string[]) =>
      setIssues((current) => (current[page]?.join('|') === list.join('|') && page in current ? current : { ...current, [page]: list })),
    [],
  );

  const spreads = useMemo(() => {
    const from = numberParam('from', 0);
    const to = Math.min(total / 2, numberParam('to', total / 2));
    const list: { index: number; left: number | null; right: number | null }[] = [];
    for (let s = Math.min(from, to); s <= to; s++) {
      const a = 2 * s >= 1 ? 2 * s : null;
      const b = 2 * s + 1 <= total ? 2 * s + 1 : null;
      list.push(dir === 'ltr' ? { index: s, left: a, right: b } : { index: s, left: b, right: a });
    }
    return list;
  }, [total, dir]);

  const allIssues = Object.entries(issues).flatMap(([, list]) => list);
  const unique = [...new Set(allIssues)];
  const checked = Object.keys(issues).length;

  async function generate() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    for (const file of files) URL.revokeObjectURL(file.url);
    setFiles([]);
    const started = performance.now();
    try {
      const result = await generateDemoFiles({
        pageCount: total,
        variant,
        withBleedAndMarks: bleed,
        readingDirection: dir,
        signal: controller.signal,
        onProgress: (done, count) => setProgress({ done, total: count }),
      });
      setElapsed(performance.now() - started);
      setFiles(result.map((file) => ({ name: file.name, url: URL.createObjectURL(file), size: file.size })));
    } catch (error) {
      if (!controller.signal.aborted) console.error('No se pudo generar la revista de ejemplo', error);
    }
  }

  useEffect(() => {
    if (fontsReady && param('files') === '1') void generate();
  }, [fontsReady]);

  function downloadAll() {
    for (const file of files) {
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      link.click();
    }
  }

  const expected = describeDemoFiles(total, variant, dir, bleed);
  const patch = demoConfigPatch({ pageCount: total, variant, withBleedAndMarks: bleed, readingDirection: dir });

  return (
    <div className="lab">
      <header className="lab-bar">
        <strong>{DEMO_TITLE}</strong>
        <label>
          Páginas{' '}
          <select value={total} onChange={(e) => setTotal(Number(e.target.value))}>
            {COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Variante{' '}
          <select value={variant} onChange={(e) => setVariant(e.target.value as DemoVariant)}>
            {VARIANTS.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" checked={bleed} onChange={(e) => setBleed(e.target.checked)} /> Sangrado y marcas
        </label>
        <label>
          Lectura{' '}
          <select value={dir} onChange={(e) => setDir(e.target.value as ReadingDirection)}>
            <option value="ltr">Izquierda → derecha</option>
            <option value="rtl">Derecha → izquierda</option>
          </select>
        </label>
        <button type="button" onClick={() => void generate()} disabled={!fontsReady}>
          Generar archivos
        </button>
        <button type="button" onClick={downloadAll} disabled={files.length === 0}>
          Descargar {files.length > 0 ? `${files.length} archivos` : ''}
        </button>
        {progress && (
          <span data-testid="progress">
            {progress.done}/{progress.total}
            {elapsed !== null && progress.done === progress.total ? ` · ${(elapsed / 1000).toFixed(1)} s` : ''}
          </span>
        )}
      </header>

      <section className="lab-status" data-testid="issues" data-checked={checked} data-count={unique.length}>
        {!fontsReady
          ? 'Cargando fuentes…'
          : unique.length === 0
            ? `Composición sin desbordes en ${checked} páginas.`
            : unique.map((issue) => <div key={issue}>⚠ {issue}</div>)}
        <div className="lab-meta">
          Archivos previstos: {expected.length} ({expected[0]?.name} … {expected[expected.length - 1]?.name}) · Configuración:{' '}
          <code>{JSON.stringify(patch)}</code>
        </div>
      </section>

      {fontsReady && (
        <main className="lab-grid">
          {spreads.map((spread) => (
            <figure key={`${total}-${dir}-${spread.index}`} className="lab-spread" data-spread={spread.index}>
              <div className="lab-pair">
                {spread.left !== null ? (
                  <PageCanvas page={spread.left} total={total} dir={dir} width={size} onIssues={reportIssues} />
                ) : (
                  <div style={{ width: size }} />
                )}
                {spread.right !== null ? (
                  <PageCanvas page={spread.right} total={total} dir={dir} width={size} onIssues={reportIssues} />
                ) : (
                  <div style={{ width: size }} />
                )}
              </div>
              <figcaption>
                {spread.index === 0 ? 'Portada' : spread.index === total / 2 ? 'Contraportada' : `Pliego ${spread.left} · ${spread.right}`}
              </figcaption>
            </figure>
          ))}
        </main>
      )}

      {files.length > 0 && (
        <section className="lab-files" data-testid="files">
          {files.map((file) => (
            <figure key={file.name}>
              <a href={file.url} download={file.name}>
                <img src={file.url} alt={file.name} />
              </a>
              <figcaption>
                {file.name} · {Math.round(file.size / 1024)} KB
              </figcaption>
            </figure>
          ))}
        </section>
      )}
    </div>
  );
}
