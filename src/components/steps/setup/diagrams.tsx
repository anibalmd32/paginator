import styles from './diagrams.module.css';

const VIEW = '0 0 104 52';

export function PagesDiagram() {
  const pages = [0, 1, 2];
  return (
    <svg className={styles.diagram} viewBox={VIEW} width={104} height={52} aria-hidden="true" focusable="false">
      {pages.map((index) => {
        const x = 17 + index * 25;
        return (
          <g key={index}>
            <rect x={x} y={8} width={20} height={28} rx={1} className={styles.sheet} />
            <text x={x + 10} y={46} className={styles.label}>
              {index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SpreadsDiagram() {
  const spreads = [
    [2, 3],
    [4, 5],
  ] as const;
  return (
    <svg className={styles.diagram} viewBox={VIEW} width={104} height={52} aria-hidden="true" focusable="false">
      {spreads.map(([left, right], index) => {
        const x = 8 + index * 46;
        return (
          <g key={left}>
            <rect x={x} y={12} width={40} height={24} rx={1} className={styles.sheet} />
            <line x1={x + 20} y1={9} x2={x + 20} y2={39} className={styles.fold} />
            <text x={x + 10} y={46} className={styles.label}>
              {left}
            </text>
            <text x={x + 30} y={46} className={styles.label}>
              {right}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SaddleDiagram() {
  const sheets = [0, 1, 2, 3];
  const apexY = 26;
  return (
    <svg className={styles.diagram} viewBox={VIEW} width={104} height={52} aria-hidden="true" focusable="false">
      {sheets.map((index) => {
        const apexX = 16 + index * 2.5;
        const spread = 19 - index * 4.5;
        return (
          <path
            key={index}
            d={`M 92 ${apexY - spread} L ${apexX} ${apexY} L 92 ${apexY + spread}`}
            className={index === 0 ? styles.cover : styles.leaf}
          />
        );
      })}
      <path d={`M 9 ${apexY - 3} L 9 ${apexY + 3}`} className={styles.staple} />
      <path d={`M 9 ${apexY - 3} L 27 ${apexY - 3} M 9 ${apexY + 3} L 27 ${apexY + 3}`} className={styles.stapleLegs} />
    </svg>
  );
}

export function PerfectDiagram() {
  const signatures = [0, 1, 2];
  return (
    <svg className={styles.diagram} viewBox={VIEW} width={104} height={52} aria-hidden="true" focusable="false">
      <path d="M 94 4 L 10 4 L 10 48 L 94 48" className={styles.cover} />
      <line x1={14} y1={7} x2={14} y2={45} className={styles.spine} />
      {signatures.map((index) => {
        const center = 12.5 + index * 13.5;
        return (
          <g key={index}>
            <path d={`M 92 ${center - 5} L 16 ${center} L 92 ${center + 5}`} className={styles.leaf} />
            <path d={`M 92 ${center - 2.5} L 20 ${center} L 92 ${center + 2.5}`} className={styles.leaf} />
          </g>
        );
      })}
    </svg>
  );
}
