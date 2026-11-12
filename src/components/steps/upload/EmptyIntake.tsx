import { FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button, Icon, Kbd, toast } from '@/components/ui';
import { useProjectStore } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import { ImposedGlyph, IntakeDiagram, MarksGlyph, PageGlyph, SpreadGlyph } from './Diagrams';
import styles from './EmptyIntake.module.css';
import { expectationText, plural } from './format';
import { IngestAlerts, IngestProgress } from './IngestMessages';
import type { FileIntake } from './useFileIntake';

type DemoChoice = 'pages' | 'reader' | 'printer' | 'marks';

interface DemoOption {
  id: DemoChoice;
  title: string;
  detail: string;
  glyph: ReactNode;
  options: { pageCount: number; variant: 'pages' | 'reader-spreads' | 'printer-spreads'; withBleedAndMarks: boolean };
  configNote: string;
}

const DEMO_PAGES = 24;

const DEMO_OPTIONS: readonly DemoOption[] = [
  {
    id: 'pages',
    title: 'Páginas sueltas',
    detail: `${String(DEMO_PAGES)} imágenes, una por página`,
    glyph: <PageGlyph />,
    options: { pageCount: DEMO_PAGES, variant: 'pages', withBleedAndMarks: false },
    configNote: 'Entrada en páginas individuales.',
  },
  {
    id: 'reader',
    title: 'Pliegos de lectura',
    detail: `Portada, ${String(DEMO_PAGES / 2 - 1)} dobles y contraportada`,
    glyph: <SpreadGlyph />,
    options: { pageCount: DEMO_PAGES, variant: 'reader-spreads', withBleedAndMarks: false },
    configNote: 'Entrada en pliegos de lectura.',
  },
  {
    id: 'printer',
    title: 'Pliegos de imprenta',
    detail: `${String(DEMO_PAGES / 2)} caras ya impuestas a caballo`,
    glyph: <ImposedGlyph />,
    options: { pageCount: DEMO_PAGES, variant: 'printer-spreads', withBleedAndMarks: false },
    configNote: 'Entrada en pliegos de imprenta, grapada a caballo.',
  },
  {
    id: 'marks',
    title: 'Con sangrado y marcas',
    detail: '3 mm de sangrado y marcas de corte',
    glyph: <MarksGlyph />,
    options: { pageCount: DEMO_PAGES, variant: 'pages', withBleedAndMarks: true },
    configNote: 'Entrada en páginas individuales, con 3 mm de sangrado y marcas de corte a 5 mm.',
  },
];

export interface EmptyIntakeProps {
  intake: FileIntake;
  onChooseFiles: () => void;
  notice?: ReactNode;
}

export function EmptyIntake({ intake, onChooseFiles, notice }: EmptyIntakeProps) {
  const config = useProjectStore((state) => state.config);
  const busy = useProjectStore((state) => state.ingest.busy);
  const goToStep = useProjectStore((state) => state.goToStep);
  const loadDemo = useProjectStore((state) => state.loadDemo);

  const runDemo = (option: DemoOption): void => {
    void loadDemo(option.options).then(() => {
      const state = useProjectStore.getState();
      if (state.ingest.error || state.pages.length === 0) return;
      toast({
        id: 'carga-ejemplo',
        title: 'Revista de ejemplo cargada',
        description: `${String(state.pages.length)} páginas sintéticas. Configuración ajustada: ${option.configNote}`,
      });
    });
  };

  const dropTitle = intake.count > 0
    ? `Suelta para cargar ${String(intake.count)} ${plural(intake.count, 'archivo', 'archivos')}`
    : 'Suelta para cargar los archivos';

  return (
    <div className={styles.wrap}>
      {notice}
      <section
        className={cx(styles.zone, intake.dragging && styles.dragging, busy && styles.busy)}
        aria-labelledby="carga-zona-titulo"
        aria-describedby="carga-zona-ayuda"
      >
        <IntakeDiagram className={styles.diagram} />
        <h2 id="carga-zona-titulo" className={styles.title}>
          {intake.dragging ? dropTitle : 'Suelta aquí las páginas de la revista'}
        </h2>
        <p id="carga-zona-ayuda" className={styles.help}>
          PDF multipágina o imágenes PNG, JPG o WebP, en páginas sueltas o en pliegos dobles. Arrástralos a cualquier parte de la
          ventana o pégalos con <Kbd keys={['Ctrl', 'V']} />.
        </p>

        {busy ? (
          <IngestProgress className={styles.progress} />
        ) : (
          <div className={styles.actions}>
            <Button variant="primary" iconStart={<Icon icon={FolderOpen} />} onClick={onChooseFiles}>
              Elegir archivos
            </Button>
          </div>
        )}

        <p className={styles.expect}>
          <span>{expectationText(config)}</span>
          <span aria-hidden="true" className={styles.dot}>
            ·
          </span>
          <button type="button" className={styles.link} onClick={() => goToStep(1)}>
            Cambiar en Configuración
          </button>
        </p>
      </section>

      <IngestAlerts className={styles.alerts} />

      <section className={styles.demo} aria-labelledby="carga-ejemplo-titulo">
        <div className={styles.demoHead}>
          <h2 id="carga-ejemplo-titulo" className={styles.demoTitle}>
            Probar con la revista de ejemplo
          </h2>
          <p className={styles.demoNote}>«Canto», revista sintética de {DEMO_PAGES} páginas. Ajusta la configuración a lo que carga.</p>
        </div>
        <ul className={styles.demoList}>
          {DEMO_OPTIONS.map((option) => (
            <li key={option.id}>
              <button type="button" className={styles.demoOption} onClick={() => runDemo(option)} disabled={busy}>
                <span className={styles.demoGlyph}>{option.glyph}</span>
                <span className={styles.demoText}>
                  <span className={styles.demoName}>{option.title}</span>
                  <span className={styles.demoDetail}>{option.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <p className={styles.privacy}>
        <Icon icon={ShieldCheck} size={14} />
        Los archivos se procesan en este equipo y no se suben a ningún sitio.
      </p>
    </div>
  );
}
