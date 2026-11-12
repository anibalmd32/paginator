export function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function imageOpenFailureReason(name: string): string {
  return `“${name}” no se pudo leer como imagen: está dañada o su contenido no es PNG, JPG ni WebP`;
}
