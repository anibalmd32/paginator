import type { ReactNode } from 'react';

const STROKE = 1.25;

interface GlyphProps {
  className?: string | undefined;
}

function Svg({ width, height, className, children }: { width: number; height: number; className?: string | undefined; children: ReactNode }) {
  return (
    <svg
      className={className}
      width={width * 1.2}
      height={height * 1.2}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function PageGlyph({ className }: GlyphProps) {
  return (
    <Svg width={40} height={30} className={className}>
      <rect x={13.5} y={4.5} width={13} height={21} rx={0.5} fill="var(--page-paper)" />
    </Svg>
  );
}

export function SpreadGlyph({ className }: GlyphProps) {
  return (
    <Svg width={40} height={30} className={className}>
      <rect x={6.5} y={4.5} width={27} height={21} rx={0.5} fill="var(--page-paper)" />
      <line x1={20} y1={2} x2={20} y2={28} strokeDasharray="2 1.5" />
    </Svg>
  );
}

export function ImposedGlyph({ className }: GlyphProps) {
  return (
    <Svg width={40} height={30} className={className}>
      <rect x={6.5} y={4.5} width={27} height={21} rx={0.5} fill="var(--page-paper)" />
      <line x1={20} y1={4.5} x2={20} y2={25.5} />
      <text x={13.25} y={18} fontSize={7} textAnchor="middle" stroke="none" fill="currentColor" fontWeight={600}>
        24
      </text>
      <text x={26.75} y={18} fontSize={7} textAnchor="middle" stroke="none" fill="currentColor" fontWeight={600}>
        1
      </text>
    </Svg>
  );
}

const CORNERS = [
  { right: false, bottom: false },
  { right: true, bottom: false },
  { right: false, bottom: true },
  { right: true, bottom: true },
] as const;

export function MarksGlyph({ className }: GlyphProps) {
  const x0 = 14.5;
  const y0 = 6.5;
  const x1 = 25.5;
  const y1 = 23.5;
  const mark = 3;
  return (
    <Svg width={40} height={30} className={className}>
      <rect x={x0 - 1.5} y={y0 - 1.5} width={x1 - x0 + 3} height={y1 - y0 + 3} fill="var(--page-paper)" strokeDasharray="1.5 1.25" />
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
      {CORNERS.map(({ right, bottom }) => {
        const x = right ? x1 : x0;
        const y = bottom ? y1 : y0;
        const dx = right ? 1 : -1;
        const dy = bottom ? 1 : -1;
        return (
          <g key={`${String(right)}-${String(bottom)}`}>
            <line x1={x + dx * 3} y1={y} x2={x + dx * (3 + mark)} y2={y} />
            <line x1={x} y1={y + dy * 3} x2={x} y2={y + dy * (3 + mark)} />
          </g>
        );
      })}
    </Svg>
  );
}

export function IntakeDiagram({ className }: GlyphProps) {
  return (
    <svg className={className} width={132} height={64} viewBox="0 0 132 64" fill="none" stroke="currentColor" strokeWidth={STROKE} aria-hidden="true" focusable="false">
      <rect x={8.5} y={8.5} width={34} height={48} rx={1} fill="var(--page-paper)" />
      <rect x={58.5} y={8.5} width={68} height={48} rx={1} fill="var(--page-paper)" />
      <line x1={92.5} y1={3} x2={92.5} y2={62} strokeDasharray="3 2.5" />
    </svg>
  );
}
