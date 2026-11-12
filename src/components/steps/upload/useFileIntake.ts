import { useEffect, useRef, useState } from 'react';

export interface FileIntake {
  dragging: boolean;
  count: number;
}

const STALE_MS = 400;

function carriesFiles(event: DragEvent): boolean {
  const types = event.dataTransfer?.types;
  return types ? Array.from(types).includes('Files') : false;
}

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== 'file');
}

export function useFileIntake(onFiles: (files: File[]) => void, enabled = true): FileIntake {
  const [state, setState] = useState<FileIntake>({ dragging: false, count: 0 });
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    let staleTimer: number | null = null;

    const reset = (): void => {
      depth = 0;
      if (staleTimer !== null) window.clearTimeout(staleTimer);
      staleTimer = null;
      setState((current) => (current.dragging ? { dragging: false, count: 0 } : current));
    };
    const keepAlive = (): void => {
      if (staleTimer !== null) window.clearTimeout(staleTimer);
      staleTimer = window.setTimeout(reset, STALE_MS);
    };

    const onDragEnter = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth += 1;
      keepAlive();
      const count = event.dataTransfer?.items.length ?? 0;
      setState((current) => (current.dragging && current.count === count ? current : { dragging: true, count }));
    };
    const onDragOver = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      keepAlive();
    };
    const onDragLeave = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) reset();
    };
    const onDrop = (event: DragEvent): void => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      reset();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFilesRef.current(files);
    };
    const onPaste = (event: ClipboardEvent): void => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      if (isTextTarget(event.target) && (event.clipboardData?.getData('text/plain') ?? '') !== '') return;
      event.preventDefault();
      onFilesRef.current(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('blur', reset);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('blur', reset);
      window.removeEventListener('paste', onPaste);
      if (staleTimer !== null) window.clearTimeout(staleTimer);
    };
  }, [enabled]);

  return state;
}
