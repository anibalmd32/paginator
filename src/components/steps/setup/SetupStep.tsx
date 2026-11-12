import { ArrowRight, RotateCcw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { StepLayout } from '@/components/shell';
import { Button, Icon, toast } from '@/components/ui';
import { DEFAULT_CONFIG } from '@/lib/imposition';
import { PREVIEW_PAGE_COUNT, useDerived, useProjectStore } from '@/lib/store';

import { LiveSummary } from './LiveSummary';
import { Maqueta } from './Maqueta';
import { SetupForm } from './SetupForm';
import styles from './SetupStep.module.css';
import { capacityOf, formatSpine, isDefaultConfig, plural } from './setupModel';

export function SetupStep() {
  const config = useProjectStore((state) => state.config);
  const resetConfig = useProjectStore((state) => state.resetConfig);
  const updateConfig = useProjectStore((state) => state.updateConfig);
  const goToStep = useProjectStore((state) => state.goToStep);
  const derived = useDerived();
  const { pageCount, imposition, spine, hasPages } = derived;
  const sheets = imposition.sheets.length;

  const capacity = capacityOf({ hasPages, supplied: derived.suppliedPageCount, declared: config.declaredPageCount, preview: PREVIEW_PAGE_COUNT });
  const printer = config.inputMode === 'spreads' && config.spreadKind === 'printer';
  const openSheet = capacity.missing > 0 && !config.autoPadBlanks && !printer;
  const atDefaults = isDefaultConfig(config, DEFAULT_CONFIG);
  const [formEpoch, setFormEpoch] = useState(0);

  const onReset = (): void => {
    const previous = config;
    resetConfig();
    setFormEpoch((epoch) => epoch + 1);
    toast({
      id: 'setup-reset',
      title: 'Configuración restablecida',
      description: 'Vuelve a la de partida; el nombre del trabajo se conserva.',
      action: {
        label: 'Deshacer',
        onClick: () => {
          updateConfig(previous);
          setFormEpoch((epoch) => epoch + 1);
        },
      },
    });
  };

  return (
    <StepLayout
      title="Configuración del trabajo"
      guide={[
        `${String(pageCount)} ${plural(pageCount, 'página', 'páginas')}`,
        `${String(sheets)} ${plural(sheets, 'pliego', 'pliegos')}`,
        `lomo ${formatSpine(spine.widthMm)} mm`,
      ]}
      flush
      backAction={
        <Button iconStart={<Icon icon={RotateCcw} />} onClick={onReset} disabled={atDefaults} title={atDefaults ? 'La configuración ya es la de partida' : undefined}>
          Restablecer
        </Button>
      }
      footerNote={
        openSheet ? (
          <span className={styles.footWarning}>
            <Icon icon={TriangleAlert} size={14} />
            {`Faltan ${String(capacity.missing)} ${plural(capacity.missing, 'página', 'páginas')} para cerrar el último pliego`}
          </span>
        ) : (
          'Los cambios se guardan solos en este navegador.'
        )
      }
      primaryAction={
        <Button variant="primary" iconEnd={<Icon icon={ArrowRight} />} onClick={() => goToStep(2)}>
          Continuar a carga
        </Button>
      }
    >
      <div className={styles.columns}>
        <LiveSummary />
        <div className={styles.formColumn}>
          <SetupForm key={formEpoch} />
        </div>
        <div className={styles.maquetaColumn}>
          <Maqueta />
        </div>
      </div>
    </StepLayout>
  );
}
