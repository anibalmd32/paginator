export type CloudErrorCode = 'not-configured' | 'not-signed-in' | 'not-found' | 'conflict' | 'quota' | 'network' | 'unknown';

export const PROJECTS_PER_USER_MAX = 200;
export const QUOTA_ERROR_MARK = 'paginator_projects_quota';

const DEFAULT_MESSAGES: Record<CloudErrorCode, string> = {
  'not-configured': 'Las cuentas no están disponibles en esta instalación de Paginator.',
  'not-signed-in': 'Entra con Google para ver y guardar tus revistas.',
  'not-found': 'Esa revista ya no existe o no es de tu cuenta.',
  conflict: 'Esta revista se cambió en tu cuenta desde otra ventana o equipo después de abrirla aquí.',
  quota: `Has llegado al máximo de ${String(PROJECTS_PER_USER_MAX)} revistas guardadas. Borra alguna en «Mis revistas» para guardar esta.`,
  network: 'No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.',
  unknown: 'Algo falló al hablar con el servidor. Vuelve a intentarlo en un momento.',
};

export class CloudError extends Error {
  readonly code: CloudErrorCode;

  constructor(code: CloudErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? DEFAULT_MESSAGES[code], options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CloudError';
    this.code = code;
  }
}

export function isCloudError(error: unknown): error is CloudError {
  return error instanceof CloudError;
}

export interface ApiFailure {
  status?: number | undefined;
  code?: string | undefined;
  message?: string | undefined;
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function cloudErrorFromApi(failure: ApiFailure): CloudError {
  const { status, code = '', message = '' } = failure;
  if (status === 0 || /fetcherror|failed to fetch|networkerror|load failed/i.test(message) || offline()) {
    return new CloudError('network', undefined, { cause: failure });
  }
  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) {
    return new CloudError('not-signed-in', undefined, { cause: failure });
  }
  if (code === 'PGRST116' || code === '22P02' || status === 404) {
    return new CloudError('not-found', undefined, { cause: failure });
  }
  if (code === 'P0001' && message.includes(QUOTA_ERROR_MARK)) {
    return new CloudError('quota', undefined, { cause: failure });
  }
  if (code === '23514' || status === 413) {
    return new CloudError('unknown', 'La revista no cabe: el servidor rechazó los datos por tamaño o formato.', { cause: failure });
  }
  if (code === '42501' || status === 403) {
    return new CloudError('unknown', 'El servidor no permite esta operación. Revisa que la migración de Supabase esté aplicada.', {
      cause: failure,
    });
  }
  if (code === '42P01' || code === 'PGRST205' || status === 503) {
    return new CloudError('unknown', 'Falta la tabla de revistas en Supabase: aplica la migración de la base de datos.', {
      cause: failure,
    });
  }
  return new CloudError('unknown', undefined, { cause: failure });
}

export function apiErrorCode(error: CloudError): string | undefined {
  const cause: unknown = error.cause;
  if (typeof cause !== 'object' || cause === null) return undefined;
  const code: unknown = (cause as ApiFailure).code;
  return typeof code === 'string' ? code : undefined;
}

export function toCloudError(error: unknown): CloudError {
  if (error instanceof CloudError) return error;
  if (error instanceof TypeError || offline()) return new CloudError('network', undefined, { cause: error });
  return new CloudError('unknown', undefined, { cause: error });
}
