import { Canto } from '@/components/canto';
import { useDerived, useProjectStore } from '@/lib/store';

import styles from './LiveSummary.module.css';
import { formatSpine, plural } from './setupModel';

export function LiveSummary() {
  const hover = useProjectStore((state) => state.hover);
  const setHover = useProjectStore((state) => state.setHover);
  const { imposition, spine, pageCount } = useDerived();
  const perfect = imposition.binding === 'perfect-bound';
  const signatures = perfect ? imposition.signatures.filter((signature) => signature.role === 'interior').length : 1;
  const sheets = imposition.sheets.length;

  return (
    <section className={styles.summary} aria-label="Resumen de la maqueta">
      <p className={styles.readings} aria-live="polite">
        <span>
          <strong>{pageCount}</strong> págs.
        </span>
        <span>
          <strong>{sheets}</strong> {plural(sheets, 'pliego', 'pliegos')}
        </span>
        <span>
          <strong>{signatures}</strong> {plural(signatures, 'cuadernillo', 'cuadernillos')}
        </span>
        <span>
          lomo <strong>{formatSpine(spine.widthMm)}</strong> mm
        </span>
      </p>
      <Canto
        className={styles.canto}
        imposition={imposition}
        unit="leaf"
        orientation="horizontal"
        size="sm"
        highlightedSheet={hover.sheet}
        onHoverSheet={(sheet) => setHover({ sheet, page: null })}
      />
    </section>
  );
}
