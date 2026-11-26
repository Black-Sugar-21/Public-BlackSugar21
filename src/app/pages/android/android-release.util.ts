/**
 * `latest.json` del APK público: lo escribe `tools/android-apk-publico.py` y lo sirve el mismo sitio desde
 * `/descargas/android/`. Aquí solo se LEE: lo ilegible nunca se vuelve un botón roto (la página dice «aún no está lista»).
 * Reutilizable tal cual en las páginas /android de los demás productos (solo cambia `downloadsPath`).
 */
export interface AndroidRelease {
  readonly versionName: string;
  readonly versionCode: number | null;
  readonly build: string | null;
  /** Nombre del archivo dentro de la carpeta de descargas (nunca una ruta). */
  readonly file: string;
  readonly sizeBytes: number;
  /** SHA-256 del APK, hex en minúsculas. */
  readonly sha256: string;
  /** SHA-256 del certificado de firma (`AA:BB:…`), si se publicó. */
  readonly signerSha256: string | null;
  /** Instante ISO; `null` si falta o no se entiende (la fecha entonces no se muestra). */
  readonly publishedAt: string | null;
  /** Android mínimo (versión mayor); `null` = el valor por omisión. */
  readonly minAndroid: number | null;
}

export const DEFAULT_DOWNLOADS_PATH = '/descargas/android/';
export const DEFAULT_MIN_ANDROID = 8;
/** Ruta pública de la página. */
export const ANDROID_PAGE_PATH = '/android';

const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.apk$/;
const SHA256_RE = /^[0-9a-f]{64}$/i;
const SIGNER_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/i;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Lee `latest.json`; `null` = inutilizable (falta un campo obligatorio o el archivo apunta fuera de la carpeta). */
export function parseAndroidRelease(raw: unknown): AndroidRelease | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const versionName = text(r['versionName']);
  const file = text(r['file']);
  const sha256 = text(r['sha256']).toLowerCase();
  const size = r['sizeBytes'];
  if (!versionName || !FILE_RE.test(file) || file.includes('..') || !SHA256_RE.test(sha256)) return null;
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null;
  const code = r['versionCode'];
  const signer = text(r['signerSha256']).toUpperCase();
  const published = text(r['publishedAt']);
  const min = r['minAndroid'];
  const build = r['build'];
  return {
    versionName,
    versionCode: typeof code === 'number' && Number.isInteger(code) && code > 0 ? code : null,
    build: typeof build === 'number' ? String(build) : text(build) || null,
    file,
    sizeBytes: Math.round(size),
    sha256,
    signerSha256: SIGNER_RE.test(signer) ? signer : null,
    publishedAt: published && !Number.isNaN(Date.parse(published)) ? published : null,
    minAndroid: typeof min === 'number' && Number.isFinite(min) && min > 0 ? Math.floor(min) : null,
  };
}

/** Dónde se sirve el APK (mismo origen). */
export function androidApkUrl(release: Pick<AndroidRelease, 'file'>, downloadsPath = DEFAULT_DOWNLOADS_PATH): string {
  return `${downloadsPath}${encodeURIComponent(release.file)}`;
}

export function androidLatestUrl(downloadsPath = DEFAULT_DOWNLOADS_PATH): string {
  return `${downloadsPath}latest.json`;
}

/** Tamaño en megabytes decimales (como el administrador de archivos de Android) en el idioma del visitante: «102 MB», «9,5 MB». */
export function formatApkSize(bytes: number, locale: string): string {
  const mb = bytes / 1_000_000;
  const digits = mb < 10 ? 1 : 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'megabyte', maximumFractionDigits: digits }).format(mb);
  } catch {
    return `${mb.toFixed(digits)} MB`;
  }
}

/** Fecha corta en el idioma del visitante; vacío si no hay fecha válida. */
export function formatPublished(iso: string | null, locale: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
