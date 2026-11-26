import { ANDROID_PAGE_PATH, androidApkUrl, androidLatestUrl, formatApkSize, formatPublished, parseAndroidRelease } from './android-release.util';

const SHA = 'a'.repeat(64);
const SIGNER = Array(32).fill('AB').join(':');
const base = () => ({ versionName: '1.4.0', versionCode: 2026112501, build: '2026112501', file: 'render-1.4.0.apk', sizeBytes: 102_345_678, sha256: SHA, signerSha256: SIGNER, publishedAt: '2026-11-25T12:00:00Z', minAndroid: 8 });

describe('parseAndroidRelease', () => {
  it('lee un latest.json completo', () => {
    expect(parseAndroidRelease(base())).toEqual({ ...base(), build: '2026112501' });
  });
  it('acepta solo los campos obligatorios y deja el resto en null', () => {
    const r = parseAndroidRelease({ versionName: ' 2 ', file: 'x.apk', sizeBytes: 5, sha256: SHA.toUpperCase() });
    expect(r).toEqual({ versionName: '2', versionCode: null, build: null, file: 'x.apk', sizeBytes: 5, sha256: SHA, signerSha256: null, publishedAt: null, minAndroid: null });
  });
  it('rechaza lo que no es un objeto', () => {
    for (const raw of [null, undefined, 'x', 5, [], true]) expect(parseAndroidRelease(raw)).toBeNull();
  });
  it('rechaza campos obligatorios faltantes o malos', () => {
    for (const patch of [{ versionName: '' }, { versionName: 3 }, { file: undefined }, { file: '../x.apk' }, { file: 'a/b.apk' }, { file: 'x.zip' }, { file: 'a..b.apk' }, { sha256: 'zz' }, { sha256: 'a'.repeat(63) }, { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: '9' }, { sizeBytes: NaN }, { sizeBytes: Infinity }]) {
      expect(parseAndroidRelease({ ...base(), ...patch }), JSON.stringify(patch)).toBeNull();
    }
  });
  it('los opcionales malos se descartan sin invalidar el resto', () => {
    const r = parseAndroidRelease({ ...base(), versionCode: 1.5, signerSha256: 'AB:CD', publishedAt: 'ayer', minAndroid: -2, build: 7 })!;
    expect(r.versionCode).toBeNull(); expect(r.signerSha256).toBeNull(); expect(r.publishedAt).toBeNull(); expect(r.minAndroid).toBeNull(); expect(r.build).toBe('7');
    expect(parseAndroidRelease({ ...base(), versionCode: 0 })!.versionCode).toBeNull();
    expect(parseAndroidRelease({ ...base(), minAndroid: 9.7 })!.minAndroid).toBe(9);
    expect(parseAndroidRelease({ ...base(), signerSha256: SIGNER.toLowerCase() })!.signerSha256).toBe(SIGNER);
  });
  it('redondea el tamaño', () => {
    expect(parseAndroidRelease({ ...base(), sizeBytes: 10.6 })!.sizeBytes).toBe(11);
  });
});

describe('urls', () => {
  it('arma las rutas con la carpeta por omisión o la del producto', () => {
    expect(androidApkUrl({ file: 'a b.apk' })).toBe('/descargas/android/a%20b.apk');
    expect(androidApkUrl({ file: 'x.apk' }, '/dl/')).toBe('/dl/x.apk');
    expect(androidLatestUrl()).toBe('/descargas/android/latest.json');
    expect(androidLatestUrl('/dl/')).toBe('/dl/latest.json');
    expect(ANDROID_PAGE_PATH).toBe('/android');
  });
});

describe('formatApkSize', () => {
  it('un decimal bajo 10 MB y ninguno desde 10 MB', () => {
    expect(formatApkSize(9_500_000, 'en')).toContain('9.5');
    expect(formatApkSize(102_345_678, 'en')).toContain('102');
    expect(formatApkSize(102_345_678, 'en')).not.toContain('.');
  });
  it('respeta el idioma', () => {
    expect(formatApkSize(9_500_000, 'es')).toContain('9,5');
  });
  it('sin formato de unidades cae a MB', () => {
    const spy = vi.spyOn(Intl, 'NumberFormat').mockImplementation(() => { throw new RangeError('x'); });
    expect(formatApkSize(9_500_000, 'en')).toBe('9.5 MB');
    expect(formatApkSize(50_000_000, 'en')).toBe('50 MB');
    spy.mockRestore();
  });
});

describe('formatPublished', () => {
  it('formatea en el idioma y devuelve vacío sin fecha válida', () => {
    expect(formatPublished('2026-11-25T12:00:00Z', 'en')).toContain('2026');
    expect(formatPublished(null, 'en')).toBe('');
    expect(formatPublished('ayer', 'en')).toBe('');
  });
  it('con un idioma inválido cae a la fecha ISO', () => {
    expect(formatPublished('2026-11-25T12:00:00Z', 'xx-@@')).toBe('2026-11-25');
  });
});
