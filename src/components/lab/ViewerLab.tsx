import { useEffect, useMemo, useRef, useState } from 'react';

import { computeImposition } from '@/lib/imposition';
import type { BindingType, CameraPreset, ReadingDirection, SheetFace, ViewerMode } from '@/lib/types';
import { DEFAULT_ENGINE_THEME, MagazineEngine } from '@/lib/viewer';
import type { MagazineModel, PageTextureProvider, ViewerAnchors } from '@/lib/viewer';

declare global {
  interface Window {
    __engine?: MagazineEngine;
  }
}

const PALETTE = ['#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#c1666b', '#4b3f72', '#119da4'];

function readParams() {
  const query = new URLSearchParams(window.location.search);
  const pages = Math.max(4, Math.round(Number(query.get('pages') ?? 32) / 4) * 4);
  const binding: BindingType = query.get('binding') === 'perfect' ? 'perfect-bound' : 'saddle-stitch';
  const dir: ReadingDirection = query.get('dir') === 'rtl' ? 'rtl' : 'ltr';
  const cover = query.get('cover') !== '0';
  const dark = query.get('theme') === 'dark';
  return { pages, binding, dir, cover, dark };
}

function drawTestPage(n: number, total: number, dir: ReadingDirection, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = PALETTE[n % PALETTE.length] ?? '#888';
  ctx.fillRect(width * 0.06, height * 0.06, width * 0.88, height * 0.88);
  ctx.fillStyle = '#111';
  for (let i = 0; i <= 20; i += 1) {
    const long = i % 5 === 0;
    ctx.fillRect((width * i) / 20 - 1, 0, 2, height * (long ? 0.04 : 0.02));
    ctx.fillRect(0, (height * i) / 20 - 1, width * (long ? 0.04 : 0.02), 2);
  }
  const odd = n % 2 === 1;
  const right = dir === 'ltr' ? odd : !odd;
  const isSpreadPage = n > 1 && n < total;
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(height * 0.3)}px system-ui, sans-serif`;
  ctx.fillText(String(n), width / 2, height * 0.45);
  ctx.font = `700 ${Math.round(height * 0.07)}px system-ui, sans-serif`;
  ctx.fillText(isSpreadPage ? (right ? 'DER' : 'IZQ') : n === 1 ? 'PORTADA' : 'CONTRA', width / 2, height * 0.7);
  ctx.beginPath();
  ctx.moveTo(width * 0.7, height * 0.2);
  ctx.lineTo(width * 0.85, height * 0.12);
  ctx.lineTo(width * 0.82, height * 0.27);
  ctx.closePath();
  ctx.fill();
  if (isSpreadPage) {
    const spread = Math.floor(n / 2);
    ctx.fillStyle = PALETTE[(spread * 3) % PALETTE.length] ?? '#000';
    const y = height * (0.82 + (spread % 3) * 0.03);
    const spineAtRight = !right;
    ctx.fillRect(spineAtRight ? width * 0.5 : 0, y, width * 0.5, height * 0.035);
  }
  return canvas;
}

export function ViewerLab() {
  const config = useMemo(readParams, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MagazineEngine | null>(null);
  const [spread, setSpread] = useState(0);
  const [position, setPosition] = useState(0);
  const [anchors, setAnchors] = useState<ViewerAnchors>({ left: null, right: null });
  const [preset, setPreset] = useState<CameraPreset | 'free'>('reading');
  const [mode, setMode] = useState<ViewerMode>('reading');
  const [sheet, setSheet] = useState<{ index: number; face: SheetFace }>({ index: 0, face: 'front' });
  const [guides, setGuides] = useState({ trim: false, bleed: false, safe: false });
  const [stats, setStats] = useState('');
  const [error, setError] = useState<string | null>(null);

  const imposition = useMemo(
    () =>
      computeImposition(config.pages, {
        binding: config.binding,
        signaturePages: 16,
        separateCover: config.cover,
        readingDirection: config.dir,
      }),
    [config],
  );

  useEffect(() => {
    if (config.dark) document.body.classList.add('dark');
    const container = containerRef.current;
    if (!container) return;
    const engine = new MagazineEngine(container, {
      onSpreadChange: (index) => setSpread(index),
      onPosition: (value) => setPosition(value),
      onAnchors: setAnchors,
      onCameraPresetChange: setPreset,
      onSheetChange: (index, face) => setSheet({ index, face }),
      onError: setError,
    });
    engineRef.current = engine;
    window.__engine = engine;

    const provider: PageTextureProvider = async (n, tier, signal) => {
      if (n === 6) return null;
      const height = tier === 'thumb' ? 320 : tier === 'mid' ? 1100 : 2000;
      const width = Math.round((height * 210) / 297);
      await new Promise((resolve) => setTimeout(resolve, tier === 'thumb' ? 10 : 60));
      if (signal.aborted) throw new DOMException('cancelado', 'AbortError');
      return createImageBitmap(drawTestPage(n, config.pages, config.dir, width, height));
    };
    const model: MagazineModel = {
      pageCount: config.pages,
      trim: { widthMm: 210, heightMm: 297 },
      binding: config.binding,
      readingDirection: config.dir,
      interiorCaliperMm: 0.09,
      coverCaliperMm: 0.22,
      coverLeavesPerSide: config.binding === 'saddle-stitch' || config.cover ? 1 : 0,
      sheets: imposition.sheets,
      safeMarginMm: 8,
      bleedMm: 3,
      getPageTexture: provider,
    };
    engine.setModel(model, { spreadIndex: 0 });
    engine.setTheme(
      config.dark ? { ...DEFAULT_ENGINE_THEME, paper: '#f4f2ee', paperEdge: '#d9d5cc', shadow: 0.5 } : DEFAULT_ENGINE_THEME,
    );
    const timer = setInterval(() => {
      const s = engine.debugStats();
      setStats(
        `cuadros ${s.frames} · tacos ${s.groups} · texturas ${s.textures} (${s.textureMB} MB, ${s.pending} pend.) · geom ${s.geometries} · tex GPU ${s.gpuTextures}`,
      );
    }, 500);
    return () => {
      clearInterval(timer);
      engine.dispose();
      engineRef.current = null;
      delete window.__engine;
    };
  }, [config, imposition]);

  const engine = () => engineRef.current;
  const toggleGuide = (key: keyof typeof guides) => {
    const next = { ...guides, [key]: !guides[key] };
    setGuides(next);
    engine()?.setGuides(next);
  };
  const toggleMode = () => {
    const next: ViewerMode = mode === 'reading' ? 'sheet' : 'reading';
    setMode(next);
    engine()?.setMode(next);
  };

  const anchorStyle = (x: number, y: number) => ({
    position: 'absolute' as const,
    left: x,
    top: y + 8,
    transform: 'translateX(-50%)',
    background: '#111',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: 4,
    pointerEvents: 'none' as const,
    fontWeight: 700,
  });

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} data-testid="stage" />
      {anchors.left?.visible ? <div style={anchorStyle(anchors.left.x, anchors.left.y)}>{anchors.left.pageNumber}</div> : null}
      {anchors.right?.visible ? <div style={anchorStyle(anchors.right.x, anchors.right.y)}>{anchors.right.pageNumber}</div> : null}
      <div style={{ position: 'absolute', top: 8, left: 8, right: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <button onClick={() => engine()?.prev()}>anterior</button>
        <button onClick={() => engine()?.next()}>siguiente</button>
        <button onClick={() => engine()?.goToSpread(0)}>portada</button>
        <button onClick={() => engine()?.goToSpread(config.pages / 4)}>centro</button>
        <button onClick={() => engine()?.goToSpread(config.pages / 2)}>contra</button>
        <button onClick={() => engine()?.goToSpread(spread + 7)}>+7</button>
        <button onClick={() => engine()?.goToSpread(3, { animate: false })}>salto 3</button>
        <button onClick={() => engine()?.setCameraPreset('reading')}>3/4</button>
        <button onClick={() => engine()?.setCameraPreset('top')}>cenital</button>
        <button onClick={() => engine()?.zoomBy(1.25)}>acercar</button>
        <button onClick={() => engine()?.zoomBy(0.8)}>alejar</button>
        <button onClick={() => engine()?.resetView()}>restablecer</button>
        <button onClick={toggleMode}>modo: {mode}</button>
        <button onClick={() => engine()?.showSheet(sheet.index, sheet.face === 'front' ? 'back' : 'front')}>cara/retiro</button>
        <button onClick={() => engine()?.showSheet(sheet.index + 1, sheet.face)}>pliego +1</button>
        <button onClick={() => toggleGuide('trim')}>corte {guides.trim ? 'sí' : 'no'}</button>
        <button onClick={() => toggleGuide('safe')}>segura {guides.safe ? 'sí' : 'no'}</button>
        <button onClick={() => toggleGuide('bleed')}>sangrado {guides.bleed ? 'sí' : 'no'}</button>
        <button onClick={() => engine()?.debugFreezeFlip(0.5)}>congelar 0,5</button>
        <button onClick={() => engine()?.debugRelease()}>soltar</button>
      </div>
      <div
        id="lab-status"
        style={{ position: 'absolute', bottom: 8, left: 8, background: 'rgba(255,255,255,.85)', color: '#111', padding: '4px 8px', borderRadius: 4 }}
      >
        pliego {spread}/{config.pages / 2} · pos {position.toFixed(2)} · cámara {preset} · despiece {sheet.index + 1} {sheet.face} · {stats}
        {error ? ` · ERROR: ${error}` : ''}
      </div>
    </div>
  );
}
