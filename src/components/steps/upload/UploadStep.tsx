import { ArrowLeft, ArrowRight, FilePlus2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { RestoreNotice } from '@/components/account/RestoreNotice';
import { StepLayout } from '@/components/shell';
import { Button, EmptyState, Icon, toast, Tooltip, VisuallyHidden } from '@/components/ui';
import { TRIM_PRESETS } from '@/lib/imposition';
import { ACCEPT_ATTR } from '@/lib/ingest';
import { useDerived, useProjectStore } from '@/lib/store';
import type { PageBox } from '@/lib/store';
import type { Issue } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { EmptyIntake } from './EmptyIntake';
import { FilesPanel } from './FilesPanel';
import { formatTrim, guideFragments, plural } from './format';
import { GridToolbar } from './GridToolbar';
import { IngestAlerts, IngestProgress } from './IngestMessages';
import { LoadIssues } from './LoadIssues';
import { PageInspector } from './PageInspector';
import { PRINTER_LOCK, ReadingGrid, type ThumbSize } from './ReadingGrid';
import { SegmentationPanel } from './SegmentationPanel';
import styles from './UploadStep.module.css';
import { useFileIntake } from './useFileIntake';

const NEED_PAGES = 'Carga al menos una página para verificar los pliegos';

let rememberedThumb: ThumbSize = 'm';

export function UploadStep() {
  const config = useProjectStore((state) => state.config);
  const assets = useProjectStore((state) => state.assets);
  const pages = useProjectStore((state) => state.pages);
  const busy = useProjectStore((state) => state.ingest.busy);
  const guides = useProjectStore((state) => state.viewer.guides);
  const addFiles = useProjectStore((state) => state.addFiles);
  const goToStep = useProjectStore((state) => state.goToStep);
  const applyFix = useProjectStore((state) => state.applyFix);
  const resetPageOrder = useProjectStore((state) => state.resetPageOrder);
  const derived = useDerived();

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thumb, setThumb] = useState<ThumbSize>(rememberedThumb);
  const [message, setMessage] = useState('');

  const announce = useCallback((text: string): void => {
    setMessage('');
    window.requestAnimationFrame(() => setMessage(text));
  }, []);

  const receive = useCallback(
    (files: File[]): void => {
      if (files.length === 0) return;
      announce(`Cargando ${String(files.length)} ${plural(files.length, 'archivo', 'archivos')}.`);
      void addFiles(files);
    },
    [addFiles, announce],
  );

  const intake = useFileIntake(receive);
  const chooseFiles = useCallback((): void => inputRef.current?.click(), []);

  const onInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    receive(files);
  };

  const selectedExists = selectedId !== null && derived.effectivePages.some((page) => page.id === selectedId);
  useEffect(() => {
    if (selectedId !== null && !selectedExists) setSelectedId(null);
  }, [selectedId, selectedExists]);

  const changeThumb = (size: ThumbSize): void => {
    rememberedThumb = size;
    setThumb(size);
  };

  const showPage = useCallback(
    (pageNumber: number): void => {
      const page = derived.effectivePages[pageNumber - 1];
      if (page) setSelectedId(page.id);
    },
    [derived.effectivePages],
  );

  const fix = useCallback(
    (issue: Issue): void => {
      if (!issue.fix) return;
      applyFix(issue.fix);
      toast({ id: `arreglo-${issue.code}`, title: 'Arreglo aplicado', description: issue.fix.label });
    },
    [applyFix],
  );

  const hasFiles = assets.length > 0;
  const hasPages = pages.length > 0;
  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';
  const box: PageBox = guides.bleed ? 'source' : guides.trim ? 'bleed' : 'trim';
  const autoBlanks = derived.effectivePages.filter((page) => page.origin === 'auto-blank').length;

  const [pagesFragment, ...restFragments] = guideFragments(derived.pageCount, assets.length, formatTrim(derived.trim, TRIM_PRESETS));
  const blanksFragment = autoBlanks > 0 ? `${String(autoBlanks)} ${plural(autoBlanks, 'cortesía', 'cortesías')}` : null;
  const guide = hasFiles
    ? [pagesFragment, blanksFragment, ...restFragments]
    : [
        'Sin archivos',
        config.declaredPageCount !== null ? `${String(config.declaredPageCount)} páginas declaradas` : 'Total según lo que cargues',
        config.trim.mode === 'fixed' ? formatTrim(config.trim, TRIM_PRESETS) : 'Formato según el archivo',
      ];

  const sheets = derived.imposition.sheets.length;
  const footerNote = hasPages
    ? `${String(derived.pageCount)} páginas en ${String(sheets)} ${plural(sheets, 'pliego', 'pliegos')}`
    : busy
      ? 'Analizando archivos…'
      : NEED_PAGES;

  const primary = (
    <Tooltip content={hasPages ? null : NEED_PAGES} placement="top">
      <Button
        variant="primary"
        iconEnd={<Icon icon={ArrowRight} />}
        aria-disabled={hasPages ? undefined : true}
        onClick={() => {
          if (hasPages) goToStep(3);
        }}
      >
        Verificar pliegos
      </Button>
    </Tooltip>
  );

  return (
    <>
      <StepLayout
        title="Carga y segmentación"
        guide={guide}
        flush
        backAction={
          <Button variant="ghost" iconStart={<Icon icon={ArrowLeft} />} onClick={() => goToStep(1)}>
            Atrás
          </Button>
        }
        footerNote={footerNote}
        primaryAction={primary}
      >
        <input
          ref={inputRef}
          id="file-input"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onInputChange}
        />
        <VisuallyHidden role="status" aria-live="polite">
          {message}
        </VisuallyHidden>

        {!hasFiles ? (
          <div className={styles.emptyScroll}>
            <EmptyIntake intake={intake} onChooseFiles={chooseFiles} notice={<RestoreNotice onChooseFiles={chooseFiles} />} />
          </div>
        ) : (
          <div className={styles.columns}>
            <section className={styles.main} aria-labelledby="carga-paginas-titulo">
              <header className={styles.mainHead}>
                <div className={styles.mainHeadGrid}>
                  <h2 id="carga-paginas-titulo" className={styles.mainTitle}>
                    Páginas en orden de lectura
                  </h2>
                  <GridToolbar thumb={thumb} onThumbChange={changeThumb} className={styles.mainTools} />
                  <p className={styles.mainNote}>
                    {printer
                      ? PRINTER_LOCK
                      : 'Arrastra una página para cambiarla de sitio, o enfócala y usa Alt + ← / →. Clic o Intro para inspeccionarla.'}
                  </p>
                </div>
              </header>

              <div className={styles.status}>
                <RestoreNotice onChooseFiles={chooseFiles} />
                <IngestProgress />
                <IngestAlerts className={styles.alerts} />
              </div>

              {hasPages ? (
                <ReadingGrid selectedId={selectedId} onSelect={setSelectedId} thumb={thumb} box={box} announce={announce} />
              ) : (
                <EmptyState
                  className={styles.noPages}
                  icon={FilePlus2}
                  title="No queda ninguna página"
                  description="Has quitado todas las páginas de los archivos cargados. Restablece el orden para recuperarlas o añade archivos nuevos."
                  actions={
                    <>
                      <Button variant="primary" onClick={resetPageOrder}>
                        Restablecer orden
                      </Button>
                      <Button onClick={chooseFiles}>Añadir archivos</Button>
                    </>
                  }
                />
              )}

              <div className={cx(styles.dropOverlay, intake.dragging && styles.dropOverlayOn)} aria-hidden="true">
                <p className={styles.dropText}>
                  {intake.count > 0
                    ? `Suelta para añadir ${String(intake.count)} ${plural(intake.count, 'archivo', 'archivos')}`
                    : 'Suelta para añadir los archivos'}
                </p>
                <p className={styles.dropSub}>{printer ? 'Se vuelve a calcular la imposición inversa con todas las caras' : 'Se añaden detrás de las páginas actuales'}</p>
              </div>
            </section>

            <aside className={styles.side} aria-label="Archivos, segmentación e inspector">
              <FilesPanel onAddFiles={chooseFiles} announce={announce} />
              <SegmentationPanel selectedId={selectedId} onGoToConfig={() => goToStep(1)} />
              {selectedId !== null && selectedExists ? (
                <PageInspector pageId={selectedId} onApplyFix={fix} />
              ) : hasPages ? (
                <p className={styles.inspectHint}>Selecciona una página (clic o Intro) para ver su archivo, sus cajas y sus incidencias.</p>
              ) : null}
              <LoadIssues onShowPage={showPage} onApplyFix={fix} />
            </aside>
          </div>
        )}
      </StepLayout>
    </>
  );
}
