import { CircleCheck } from 'lucide-react';

import { ExportActions, IssueList, Verdict } from '@/components/report';
import { countText } from '@/components/report/labels';
import { Icon } from '@/components/ui';
import type { Derived } from '@/lib/store';

import styles from './SidePanel.module.css';
import { SlotDetail } from './SlotDetail';

const CHECKS = [
  'Total de páginas en múltiplos de 4 y cortesías',
  'Total declarado frente al aportado',
  'Orden y repetición de folios',
  'Tamaño y orientación de cada página',
  'Lado del lomo en pliegos dobles',
  'Caras completas en pliegos de imprenta',
  'Resolución para imprimir',
  'Grosor, lomo y desplazamiento del grapado',
];

export interface SidePanelProps {
  derived: Derived;
  selectedPage: number | null;
  onClose: () => void;
  onSelectPage: (page: number) => void;
  onLocatePage: (page: number) => void;
}

export function SidePanel({ derived, selectedPage, onClose, onSelectPage, onLocatePage }: SidePanelProps) {
  const { verdict, counts, issues, hasPages, pageCount, imposition } = derived;
  const note = `${countText(pageCount, 'página comprobada', 'páginas comprobadas')} en ${countText(imposition.sheets.length, 'pliego', 'pliegos')}`;

  return (
    <aside className={styles.side} aria-label="Pre-vuelo y detalle de la casilla">
      <div className={styles.scroll}>
        <Verdict verdict={verdict} counts={counts} hasPages={hasPages} note={note} />

        {selectedPage !== null && <SlotDetail key={selectedPage} page={selectedPage} onClose={onClose} onSelectPage={onSelectPage} />}

        <section className={styles.section} aria-labelledby="prevuelo-incidencias">
          <h2 id="prevuelo-incidencias" className={styles.sectionTitle}>
            Incidencias
            {issues.length > 0 && <span className={styles.sectionCount}>{issues.length}</span>}
          </h2>
          {issues.length > 0 ? (
            <IssueList issues={issues} onLocatePage={onLocatePage} />
          ) : (
            <div className={styles.clean}>
              <p className={styles.cleanTitle}>
                <Icon icon={CircleCheck} size={16} className={styles.cleanIcon} />
                Nada que corregir. Se ha comprobado:
              </p>
              <ul className={styles.checks}>
                {CHECKS.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <footer className={styles.foot}>
        <h2 className="visually-hidden">Exportar el reporte</h2>
        <ExportActions layout="stack" disabled={!hasPages} />
      </footer>
    </aside>
  );
}
