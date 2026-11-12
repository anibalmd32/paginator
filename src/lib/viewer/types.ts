import type {
  BindingType,
  CameraPreset,
  RasterTier,
  ReadingDirection,
  SheetFace,
  SheetImposition,
  TrimSize,
} from '@/lib/types';

export type PageTextureProvider = (
  pageNumber: number,
  tier: RasterTier,
  signal: AbortSignal,
) => Promise<ImageBitmap | null>;

export interface MagazineModel {
  pageCount: number;
  trim: TrimSize;
  binding: BindingType;
  readingDirection: ReadingDirection;
  interiorCaliperMm: number;
  coverCaliperMm: number;
  coverLeavesPerSide: 0 | 1;
  sheets: SheetImposition[];
  safeMarginMm: number;
  bleedMm: number;
  getPageTexture: PageTextureProvider;
}

export interface EngineTheme {
  paper: string;
  paperEdge: string;
  shadow: number;
  guideTrim: string;
  guideBleed: string;
  guideSafe: string;
}

export interface PageAnchor {
  pageNumber: number;
  x: number;
  y: number;
  visible: boolean;
}

export interface ViewerAnchors {
  left: PageAnchor | null;
  right: PageAnchor | null;
}

export interface EngineEvents {
  onSpreadChange?: (spreadIndex: number, settled: boolean) => void;
  onPosition?: (position: number) => void;
  onAnchors?: (anchors: ViewerAnchors) => void;
  onSheetChange?: (sheetIndex: number, face: SheetFace) => void;
  onCameraPresetChange?: (preset: CameraPreset | 'free') => void;
  onError?: (message: string) => void;
}

export const DEFAULT_ENGINE_THEME: EngineTheme = {
  paper: '#fbfaf7',
  paperEdge: '#e9e6df',
  shadow: 0.28,
  guideTrim: '#0aa5c2',
  guideBleed: '#d6336c',
  guideSafe: '#2f9e44',
};
