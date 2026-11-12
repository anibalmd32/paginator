import { ArrowRight } from 'lucide-react';

import { useMatrixUi } from '@/components/steps/matrix/matrixUi';
import { Button, Icon } from '@/components/ui';
import { useDerived, useProjectStore } from '@/lib/store';

import { ExportActions } from './ExportActions';
import { IssueList } from './IssueList';
import { countText } from './labels';
import styles from './PreflightSummary.module.css';
import { Verdict } from './Verdict';

const TOP_ISSUES = 4;

export function PreflightSummary() {
  const derived = useDerived();
  const step = useProjectStore((state) => state.step);
  const goToStep = useProjectStore((state) => state.goToStep);
  const { hasPages, verdict, counts, issues, pageCount, imposition } = derived;

  const locatePage = (page: number): void => {
    goToStep(3);
    useMatrixUi.getState().locatePage(page, imposition.placements[page - 1]?.sheetIndex ?? null, true);
  };

  if (!hasPages) {
    return (
      <div className={styles.summary}>
        <Verdict verdict={verdict} counts={counts} hasPages={false} size="sm" level={3} />
        <p className={styles.hint}>
          El pre-vuelo comprueba la imposición en cuanto cargas las páginas: múltiplos de 4, orden de folios, tamaños, lados del lomo y grosor.
        </p>
        {step !== 2 && (
          <Button size="sm" variant="secondary" iconEnd={<Icon icon={ArrowRight} size={14} />} onClick={() => goToStep(2)}>
            Ir a carga
          </Button>
        )}
      </div>
    );
  }

  const serious = issues.filter((issue) => issue.severity !== 'info');
  const top = (serious.length > 0 ? serious : issues).slice(0, TOP_ISSUES);
  const rest = issues.length - top.length;
  const note = `${pageCount} páginas · ${countText(imposition.sheets.length, 'pliego', 'pliegos')}`;

  return (
    <div className={styles.summary}>
      <Verdict verdict={verdict} counts={counts} hasPages note={note} size="sm" level={3} />
      {top.length > 0 && <IssueList issues={top} onLocatePage={locatePage} compact grouped={false} />}
      {(rest > 0 || step !== 3) && (
        <div className={styles.more}>
          {rest > 0 && <span className={styles.moreText}>{countText(rest, 'incidencia más', 'incidencias más')}</span>}
          {step !== 3 && (
            <Button size="sm" variant="ghost" iconEnd={<Icon icon={ArrowRight} size={14} />} onClick={() => goToStep(3)}>
              Ver la matriz de pliegos
            </Button>
          )}
        </div>
      )}
      <div className={styles.exportBlock}>
        <ExportActions layout="stack" />
      </div>
    </div>
  );
}
