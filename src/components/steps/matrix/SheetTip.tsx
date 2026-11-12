import { PageThumb } from '@/components/page/PageThumb';
import { SEVERITY_LABEL } from '@/components/report/labels';
import type { ImpositionResult, IssueSeverity } from '@/lib/types';

import styles from './SheetTip.module.css';

export function SheetTip({ imposition, sheetIndex, worst }: { imposition: ImpositionResult; sheetIndex: number; worst: IssueSeverity | undefined }) {
  const sheet = imposition.sheets[sheetIndex];
  if (!sheet) return null;
  const faces = [
    { name: 'Cara', side: sheet.front },
    { name: 'Retiro', side: sheet.back },
  ];
  return (
    <span className={styles.tip}>
      <span className={styles.head}>
        <strong>Pliego {sheet.number}</strong>
        {sheet.role === 'cover' ? ' · cubierta' : ''}
        {worst ? ` · con ${SEVERITY_LABEL[worst].many}` : ''}
      </span>
      <span className={styles.faces}>
        {faces.map(({ name, side }) => (
          <span key={name} className={styles.face}>
            <span className={styles.pair}>
              <PageThumb pageNumber={side.left} lazy={false} className={styles.thumb ?? ''} />
              <PageThumb pageNumber={side.right} lazy={false} className={styles.thumb ?? ''} />
            </span>
            <span className={styles.caption}>
              {name} · {side.left} | {side.right}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}
