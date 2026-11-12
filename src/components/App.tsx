import { useEffect, useMemo, useState } from 'react';

import { AccountMenu } from '@/components/account/AccountMenu';
import { CloudBoot } from '@/components/account/CloudBoot';
import { SaveControl } from '@/components/account/SaveControl';
import { PreflightSummary, PrintableReport } from '@/components/report';
import { AppHeader, AppShell, PreflightChip } from '@/components/shell';
import type { StepTabItem } from '@/components/shell/StepTabs';
import { MatrixStep } from '@/components/steps/matrix';
import { SetupStep } from '@/components/steps/setup';
import { UploadStep } from '@/components/steps/upload';
import { ViewerStep } from '@/components/steps/viewer';
import { Popover } from '@/components/ui';
import { cloudMode } from '@/lib/cloud';
import { useDerived, useProjectStore } from '@/lib/store';
import type { StepId } from '@/lib/store';

import styles from './App.module.css';

declare global {
  interface Window {
    __paginator?: typeof useProjectStore;
  }
}

const NEED_PAGES = 'Primero carga las páginas de la revista';
const ACCOUNTS = cloudMode() !== 'disabled';

export function App() {
  const step = useProjectStore((state) => state.step);
  const title = useProjectStore((state) => state.config.title);
  const hasPages = useProjectStore((state) => state.pages.length > 0);
  const goToStep = useProjectStore((state) => state.goToStep);
  const updateConfig = useProjectStore((state) => state.updateConfig);
  const { counts, hasPages: derivedHasPages } = useDerived();
  const [viewerVisited, setViewerVisited] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) window.__paginator = useProjectStore;
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ejemplo')) return;
    url.searchParams.delete('ejemplo');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    const { loadDemo, goToStep: go } = useProjectStore.getState();
    void loadDemo({ pageCount: 24 }).then(() => {
      if (useProjectStore.getState().pages.length > 0) go(4);
    });
  }, []);

  useEffect(() => {
    if (step === 4) setViewerVisited(true);
  }, [step]);

  useEffect(() => {
    if (!hasPages) setViewerVisited(false);
  }, [hasPages]);

  const steps = useMemo<StepTabItem[]>(
    () => [
      { id: 1, label: 'Configuración', done: step > 1 },
      { id: 2, label: 'Carga', done: hasPages && step > 2 },
      { id: 3, label: 'Pliegos', done: hasPages && step > 3, disabled: !hasPages, disabledReason: NEED_PAGES },
      { id: 4, label: 'Visor 3D', disabled: !hasPages, disabledReason: NEED_PAGES },
    ],
    [step, hasPages],
  );

  const header = (
    <AppHeader
      title={title}
      onTitleChange={(value) => updateConfig({ title: value })}
      steps={steps}
      currentStep={step}
      onSelectStep={(id) => goToStep(id as StepId)}
      statusSlot={
        <>
          {ACCOUNTS && <SaveControl />}
          <Popover
            title="Pre-vuelo"
            placement="bottom"
            align="end"
            trigger={(props) => (
              <PreflightChip
                {...props}
                errors={counts.errors}
                warnings={counts.warnings}
                infos={counts.infos}
                ok={derivedHasPages && counts.errors === 0 && counts.warnings === 0}
              />
            )}
          >
            <PreflightSummary />
          </Popover>
          {ACCOUNTS && (
            <span className={styles.account}>
              <AccountMenu
                signInWarning={
                  hasPages
                    ? 'Al entrar, la página se recarga y los archivos cargados se quitan (nunca salieron de tu equipo). Para no perder el orden ni la configuración, usa «Guardar»: te lleva a entrar y guarda la revista.'
                    : null
                }
                signedOutNote={hasPages ? 'Lo que tienes abierto sigue aquí; para guardarlo tendrás que volver a entrar.' : null}
              />
            </span>
          )}
        </>
      }
    />
  );

  return (
    <>
      <AppShell header={header}>
        <div className={styles.steps}>
          <CloudBoot />
          {step === 1 ? <SetupStep /> : null}
          {step === 2 ? <UploadStep /> : null}
          {step === 3 ? <MatrixStep /> : null}
          {viewerVisited && hasPages ? (
            <div className={styles.viewer} hidden={step !== 4}>
              <ViewerStep />
            </div>
          ) : null}
        </div>
      </AppShell>
      <PrintableReport />
    </>
  );
}
