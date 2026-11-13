import { BookOpenText, FileDown, FileJson, Printer, Scissors } from 'lucide-react';
import { useState } from 'react';

import { Button, ButtonGroup, Icon, toast } from '@/components/ui';
import { downloadCurrentReport, downloadPrintPdf, selectDerived, useProjectStore, type ReportFormat } from '@/lib/store';
import type { PrintLayout } from '@/lib/export';
import { cx } from '@/lib/utils/cx';

import styles from './Preflight.module.css';

export interface ExportActionsProps {
  disabled?: boolean;
  layout?: 'row' | 'stack';
  className?: string | undefined;
}

const PDF_HINT: Record<PrintLayout, string> = {
  sheets: 'Cada cara de cada pliego en una hoja, en orden de imprenta, con sangrado, marcas de corte y de plegado',
  reading: 'Una página por hoja en orden de lectura, con sangrado y cajas de corte',
};

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

async function exportPdf(layout: PrintLayout): Promise<void> {
  try {
    const fileName = await downloadPrintPdf(layout);
    const errors = selectDerived(useProjectStore.getState()).counts.errors;
    toast(
      errors > 0
        ? {
            title: `PDF descargado: ${fileName}`,
            description: `El pre-vuelo tiene ${String(errors)} ${errors === 1 ? 'error' : 'errores'} sin resolver: revísalo antes de mandarlo a imprenta.`,
            tone: 'warning',
            id: 'pdf-download',
          }
        : { title: `PDF descargado: ${fileName}`, tone: 'success', id: 'pdf-download' },
    );
  } catch (error) {
    console.error('No se pudo generar el PDF.', error);
    toast({
      title: 'No se pudo generar el PDF',
      description: error instanceof Error && error.message ? error.message : 'Vuelve a intentarlo; si persiste, recarga la página.',
      tone: 'error',
    });
  }
}

export function ExportActions({ disabled = false, layout = 'row', className }: ExportActionsProps) {
  const [busy, setBusy] = useState<PrintLayout | null>(null);
  const reason = disabled ? 'Carga páginas para generar el reporte' : undefined;
  const common = { disabled, title: reason } as const;
  const block = layout === 'stack';

  const runPdf = (target: PrintLayout): void => {
    if (busy) return;
    setBusy(target);
    void exportPdf(target).finally(() => setBusy(null));
  };

  const pdfButton = (target: PrintLayout, label: string, icon: typeof Scissors) => (
    <Button
      variant="secondary"
      iconStart={<Icon icon={icon} />}
      onClick={() => runPdf(target)}
      loading={busy === target}
      aria-disabled={(busy !== null && busy !== target) || undefined}
      block={block}
      disabled={disabled}
      title={disabled ? 'Carga páginas para generar el PDF' : PDF_HINT[target]}
    >
      {busy === target ? 'Montando PDF…' : label}
    </Button>
  );

  return (
    <div className={cx(styles.export, block && styles.exportStack, className)}>
      {pdfButton('sheets', 'PDF para imprenta', Scissors)}
      {pdfButton('reading', 'PDF por páginas', BookOpenText)}
      <Button variant="secondary" iconStart={<Icon icon={FileDown} />} onClick={() => download('markdown')} block={block} {...common}>
        Descargar reporte
      </Button>
      <ButtonGroup attached aria-label="Otros formatos del reporte" className={styles.exportMore}>
        <Button variant="secondary" iconStart={<Icon icon={FileJson} />} onClick={() => download('json')} aria-label="Descargar reporte en JSON" {...common}>
          JSON
        </Button>
        <Button variant="secondary" iconStart={<Icon icon={Printer} />} onClick={() => window.print()} {...common}>
          Imprimir reporte
        </Button>
      </ButtonGroup>
    </div>
  );
}
