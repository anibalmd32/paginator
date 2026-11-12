import { CircleAlert } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import { Icon, Spinner, TextField, Tooltip } from '@/components/ui';
import type { ImpositionResult, SheetFace, ViewerMode } from '@/lib/types';

import { liveSheetText, openingOf, parsePageInput, sheetSideText } from './labels';
import styles from './ViewerStep.module.css';

export interface GuideWordsProps {
  imposition: ImpositionResult;
  mode: ViewerMode;
  spreadIndex: number;
  sheetIndex: number;
  face: SheetFace;
  loading: boolean;
  disabled?: boolean;
  onJump: (pageNumber: number) => void;
}

export function GuideWords({ imposition, mode, spreadIndex, sheetIndex, face, loading, disabled = false, onJump }: GuideWordsProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocus = useRef(false);
  const errorId = useId();
  const pageCount = imposition.pageCount;
  const opening = openingOf(imposition, spreadIndex);
  const sheet = imposition.sheets[sheetIndex];

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (restoreFocus.current) {
      restoreFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [editing]);

  const currentPage = (): number => {
    if (mode === 'sheet' && sheet) {
      const side = face === 'front' ? sheet.front : sheet.back;
      return Math.min(side.left, side.right);
    }
    return opening.kind === 'spread' ? opening.first : opening.page;
  };

  const open = (): void => {
    if (disabled) return;
    setText(String(currentPage()));
    setInvalid(false);
    setEditing(true);
  };

  const close = (focusButton: boolean): void => {
    restoreFocus.current = focusButton;
    setEditing(false);
    setInvalid(false);
  };

  const commit = (): void => {
    const page = parsePageInput(text, pageCount);
    if (page === null) {
      setInvalid(true);
      return;
    }
    onJump(page);
    close(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
  };

  let words;
  if (mode === 'sheet' && sheet) {
    words = (
      <>
        <span className={styles.guideWord}>Pliego</span>
        <span className={styles.guideNumeral}>{sheet.number}</span>
        <span className={styles.guideWord}>de {imposition.sheets.length}</span>
        <span className={styles.guideDot} aria-hidden="true">
          ·
        </span>
        <span className={styles.guideFace}>{face === 'front' ? 'Cara' : 'Retiro'}</span>
        <span className={styles.guideDot} aria-hidden="true">
          ·
        </span>
        <span className={styles.guideWord}>págs.</span>
        <span className={styles.guidePages}>{sheetSideText(imposition, sheetIndex, face)}</span>
      </>
    );
  } else if (opening.kind === 'spread') {
    words = (
      <>
        <span className={styles.guideWord}>Págs.</span>
        <span className={styles.guidePages}>
          {opening.first} – {opening.last}
        </span>
        <span className={styles.guideWord}>de {pageCount}</span>
      </>
    );
  } else {
    words = (
      <>
        <span className={styles.guidePages}>{opening.kind === 'cover' ? 'Portada' : 'Contraportada'}</span>
        <span className={styles.guideDot} aria-hidden="true">
          ·
        </span>
        <span className={styles.guideWord}>{pageCount} págs.</span>
      </>
    );
  }

  const spoken =
    mode === 'sheet' && sheet
      ? liveSheetText(imposition, sheetIndex, face)
      : opening.kind === 'spread'
        ? `Páginas ${opening.first} a ${opening.last} de ${pageCount}`
        : `${opening.kind === 'cover' ? 'Portada' : 'Contraportada'}, ${pageCount} páginas`;

  return (
    <div className={styles.guide} data-editing={editing ? '' : undefined}>
      {editing ? (
        <div className={styles.guideEdit}>
          <TextField
            ref={inputRef}
            size="sm"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Ir a la página"
            aria-describedby={invalid ? errorId : undefined}
            invalid={invalid}
            prefix="Pág."
            suffix={`de ${pageCount}`}
            value={text}
            onValueChange={(value) => {
              setText(value);
              setInvalid(false);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => close(false)}
            boxClassName={styles.guideField}
          />
          {invalid && (
            <span id={errorId} className={styles.guideError} role="alert">
              <Icon icon={CircleAlert} size={14} className={styles.guideErrorIcon} />
              Escribe una página entre 1 y {pageCount}
            </span>
          )}
        </div>
      ) : (
        <Tooltip content="Pulsa para teclear una página y saltar a ella" placement="bottom" semantics="label">
          <button
            ref={buttonRef}
            type="button"
            className={styles.guideButton}
            onClick={open}
            disabled={disabled}
            aria-label={`${spoken}. Ir a otra página`}
          >
            {words}
          </button>
        </Tooltip>
      )}
      {loading && !editing && <Spinner size={14} label="Cargando páginas" className={styles.guideSpinner} />}
    </div>
  );
}
