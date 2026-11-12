import { ArrowLeft, BookOpen, Box, Columns2, Crop, Hash, Keyboard, Maximize, Minimize, RotateCcw, Square, ZoomIn, ZoomOut } from 'lucide-react';
import { Fragment } from 'react';

import { Button, Checkbox, formatDecimal, Icon, IconButton, Kbd, Popover, SegmentedControl, Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/ui';
import type { CameraPreset, GuideVisibility, ViewerMode } from '@/lib/types';
import { cx } from '@/lib/utils/cx';

import { SHORTCUTS } from './shortcuts';
import styles from './ViewerStep.module.css';

const MODE_OPTIONS = [
  { value: 'reading', label: 'Lectura', icon: <Icon icon={BookOpen} size={14} />, hint: 'Hojear el ejemplar encuadernado (D)' },
  { value: 'sheet', label: 'Despiece', icon: <Icon icon={Columns2} size={14} />, hint: 'Cada pliego extendido, tal como va a plancha (D)' },
] as const;

export interface LeftToolbarProps {
  mode: ViewerMode;
  disabled: boolean;
  onBack: () => void;
  onModeChange: (mode: ViewerMode) => void;
}

export function LeftToolbar({ mode, disabled, onBack, onModeChange }: LeftToolbarProps) {
  return (
    <Toolbar aria-label="Navegación del visor" surface="plain" className={cx(styles.float, styles.toolbar)}>
      <Button variant="ghost" size="sm" iconStart={<Icon icon={ArrowLeft} />} onClick={onBack}>
        Atrás a pliegos
      </Button>
      <ToolbarSeparator />
      <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onModeChange} size="sm" aria-label="Modo del visor" disabled={disabled} />
    </Toolbar>
  );
}

export interface RightToolbarProps {
  mode: ViewerMode;
  preset: CameraPreset | 'free';
  guides: GuideVisibility;
  labels: boolean;
  fullscreen: boolean;
  disabled: boolean;
  safeMarginMm: number;
  bleedMm: number;
  shortcutsOpen: boolean;
  onShortcutsOpenChange: (open: boolean) => void;
  onPreset: (preset: CameraPreset) => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onGuides: (patch: Partial<GuideVisibility>) => void;
  onLabels: (labels: boolean) => void;
  onFullscreen: () => void;
}

function Swatch({ tone }: { tone: 'trim' | 'safe' | 'bleed' }) {
  return <span className={cx(styles.swatch, styles[`swatch-${tone}`])} aria-hidden="true" />;
}

export function RightToolbar(props: RightToolbarProps) {
  const { mode, preset, guides, labels, fullscreen, disabled, safeMarginMm, bleedMm } = props;
  const sheetMode = mode === 'sheet';
  const bleedAvailable = sheetMode && bleedMm > 0;
  const anyGuide = guides.trim || guides.safe || (bleedAvailable && guides.bleed);
  const bleedNote =
    bleedMm <= 0
      ? 'El archivo llega a corte: no hay sangrado.'
      : sheetMode
        ? `${formatDecimal(bleedMm)} mm por fuera del corte.`
        : 'Solo en despiece: en lectura la hoja ya está cortada.';

  return (
    <Toolbar aria-label="Vista y capas" surface="plain" className={cx(styles.float, styles.toolbar)}>
      <ToolbarGroup aria-label="Cámara">
        <IconButton
          size="sm"
          label="Vista 3/4"
          icon={<Icon icon={Box} />}
          tooltipExtra={<Kbd inverse>C</Kbd>}
          pressed={preset === 'reading'}
          onClick={() => props.onPreset('reading')}
          disabled={disabled}
        />
        <IconButton
          size="sm"
          label="Cenital"
          icon={<Icon icon={Square} />}
          tooltipExtra={<Kbd inverse>C</Kbd>}
          pressed={preset === 'top'}
          onClick={() => props.onPreset('top')}
          disabled={disabled}
        />
        <IconButton size="sm" label="Alejar" icon={<Icon icon={ZoomOut} />} tooltipExtra={<Kbd inverse>−</Kbd>} onClick={() => props.onZoom(0.8)} disabled={disabled} />
        <IconButton size="sm" label="Acercar" icon={<Icon icon={ZoomIn} />} tooltipExtra={<Kbd inverse>+</Kbd>} onClick={() => props.onZoom(1.25)} disabled={disabled} />
        <IconButton size="sm" label="Restablecer vista" icon={<Icon icon={RotateCcw} />} tooltipExtra={<Kbd inverse>0</Kbd>} onClick={props.onReset} disabled={disabled} />
      </ToolbarGroup>
      <ToolbarSeparator />
      <ToolbarGroup aria-label="Capas">
        <Popover
          title="Guías"
          placement="bottom"
          align="end"
          className={styles.panel}
          trigger={(trigger) => (
            <IconButton {...trigger} size="sm" label="Guías" icon={<Icon icon={Crop} />} tooltipExtra={<Kbd inverse>G</Kbd>} pressed={anyGuide} disabled={disabled} />
          )}
        >
          <div className={styles.guideOptions}>
            <Checkbox
              checked={guides.trim}
              onChange={(trim) => props.onGuides({ trim })}
              label={
                <>
                  <Swatch tone="trim" />
                  Corte
                </>
              }
              description="Línea de guillotina: el formato final."
            />
            <Checkbox
              checked={guides.safe}
              onChange={(safe) => props.onGuides({ safe })}
              label={
                <>
                  <Swatch tone="safe" />
                  Zona segura
                </>
              }
              description={`${formatDecimal(safeMarginMm)} mm hacia dentro del corte.`}
            />
            <Checkbox
              checked={bleedAvailable && guides.bleed}
              onChange={(bleed) => props.onGuides({ bleed })}
              disabled={!bleedAvailable}
              label={
                <>
                  <Swatch tone="bleed" />
                  Sangrado
                </>
              }
              description={bleedNote}
            />
          </div>
        </Popover>
        <IconButton
          size="sm"
          label={sheetMode ? 'Etiquetas (solo en lectura)' : 'Etiquetas'}
          icon={<Icon icon={Hash} />}
          tooltipExtra={<Kbd inverse>E</Kbd>}
          pressed={labels && !sheetMode}
          onClick={() => props.onLabels(!labels)}
          disabled={disabled || sheetMode}
        />
      </ToolbarGroup>
      <ToolbarSeparator />
      <IconButton
        size="sm"
        label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        icon={<Icon icon={fullscreen ? Minimize : Maximize} />}
        tooltipExtra={<Kbd inverse>F</Kbd>}
        pressed={fullscreen}
        onClick={props.onFullscreen}
      />
      <Popover
        title="Atajos de teclado"
        placement="bottom"
        align="end"
        open={props.shortcutsOpen}
        onOpenChange={props.onShortcutsOpenChange}
        className={cx(styles.panel, styles.shortcutsPanel)}
        trigger={(trigger) => <IconButton {...trigger} size="sm" label="Atajos" icon={<Icon icon={Keyboard} />} tooltipExtra={<Kbd inverse>?</Kbd>} />}
      >
        <ShortcutsTable />
      </Popover>
    </Toolbar>
  );
}

function ShortcutsTable() {
  return (
    <table className={styles.shortcuts}>
      <tbody>
        {SHORTCUTS.map((shortcut) => (
          <tr key={shortcut.action}>
            <th scope="row" className={styles.shortcutKeys}>
              {shortcut.keys.map((combo, index) => (
                <Fragment key={combo.join('+')}>
                  {index > 0 && <span className={styles.shortcutOr}>/</span>}
                  <Kbd keys={combo} />
                </Fragment>
              ))}
            </th>
            <td className={styles.shortcutAction}>{shortcut.action}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
