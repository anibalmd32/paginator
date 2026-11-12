import { cloudMode, fingerprintFile } from '@/lib/cloud';

export function fingerprintsEnabled(): boolean {
  return cloudMode() !== 'disabled';
}

export function hashFile(file: File): Promise<string> {
  return fingerprintFile(file);
}
