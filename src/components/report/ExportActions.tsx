import { FileDown, FileJson, Printer } from 'lucide-react';

import { Button, ButtonGroup, Icon, toast } from '@/components/ui';
import { downloadCurrentReport, type ReportFormat } from '@/lib/store';
import { cx } from '@/lib/utils/cx';

import styles from './Preflight.module.css';

export interface ExportActionsProps {
  disabled?: boolean;
  layout?: 'row' | 'stack';
  className?: string | undefined;
}

function download(format: ReportFormat): void {
  try {
    const fileName = downloadCurrentReport(format);
    toast({ title: `Reporte descargado: ${fileName}`, tone: 'success', id: 'report-download' });
  } catch (error) {
    console.error('No se pudo generar el reporte de pre-vuelo.', error);
    toast({
      title: 'No se pudo generar el reporte',
      description: error instanceof Error && error.message ? error.message : 'Vuelve a intentarlo; si persiste, recarga la página.',
      tone: 'error',
    });
  }
}

export function ExportActions({ disabled = false, layout = 'row', className }: ExportActionsProps) {
  const reason = disabled ? 'Carga páginas para generar el reporte' : undefined;
  const common = { disabled, title: reason } as const;
  return (
    <div className={cx(styles.export, layout === 'stack' && styles.exportStack, className)}>
      <Button variant="secondary" iconStart={<Icon icon={FileDown} />} onClick={() => download('markdown')} block={layout === 'stack'} {...common}>
        Descargar reporte
      </Button>
      <ButtonGroup attached aria-label="Otros formatos" className={styles.exportMore}>
        <Button variant="secondary" iconStart={<Icon icon={FileJson} />} onClick={() => download('json')} aria-label="Descargar reporte en JSON" {...common}>
          JSON
        </Button>
        <Button variant="secondary" iconStart={<Icon icon={Printer} />} onClick={() => window.print()} {...common}>
          Imprimir / PDF
        </Button>
      </ButtonGroup>
    </div>
  );
}
