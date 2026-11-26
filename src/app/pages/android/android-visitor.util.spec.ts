import { androidTooOld, chromeIntentUrl, isComputer, readVisitor } from './android-visitor.util';

const UA = {
  android13: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
  android7: 'Mozilla/5.0 (Linux; Android 7.1.1; Nexus 5X) AppleWebKit/537.36 Chrome/80.0 Mobile Safari/537.36',
  androidNoVersion: 'Mozilla/5.0 (Linux; Android; K) Chrome/120 Mobile',
  facebook: 'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/420.0]',
  webview: 'Mozilla/5.0 (Linux; Android 12; SM-G991B; wv) AppleWebKit/537.36 Version/4.0 Chrome/110 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/120',
  googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  tv: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36',
  kaios: 'Mozilla/5.0 (Mobile; Nokia 2720 Flip; rv:48.0) Gecko/48.0 Firefox/48.0 KAIOS/3.0',
  weird: 'SomethingElse/1.0',
};

describe('readVisitor', () => {
  it('Android: versión y navegador normal', () => {
    expect(readVisitor({ userAgent: UA.android13 })).toEqual({ platform: 'android', androidVersion: 13, inAppBrowser: false });
    expect(readVisitor({ userAgent: UA.android7 }).androidVersion).toBe(7);
    expect(readVisitor({ userAgent: UA.androidNoVersion }).androidVersion).toBeNull();
  });
  it('Android dentro de otra app', () => {
    expect(readVisitor({ userAgent: UA.facebook }).inAppBrowser).toBe(true);
    expect(readVisitor({ userAgent: UA.webview }).inAppBrowser).toBe(true);
  });
  it('iPhone, iPad como Mac táctil, Mac y computadores', () => {
    expect(readVisitor({ userAgent: UA.iphone }).platform).toBe('ios');
    expect(readVisitor({ userAgent: UA.mac, maxTouchPoints: 5 }).platform).toBe('ios');
    expect(readVisitor({ userAgent: UA.mac, maxTouchPoints: 0 }).platform).toBe('mac');
    expect(readVisitor({ userAgent: UA.mac }).platform).toBe('mac');
    expect(readVisitor({ userAgent: UA.windows }).platform).toBe('computer');
    expect(readVisitor({ userAgent: UA.linux }).platform).toBe('computer');
  });
  it('robots, TV y desconocidos van a vista neutral', () => {
    expect(readVisitor({ userAgent: UA.googlebot }).platform).toBe('bot');
    expect(readVisitor({ userAgent: '' }).platform).toBe('bot');
    expect(readVisitor({ userAgent: UA.tv }).platform).toBe('other');
    expect(readVisitor({ userAgent: UA.kaios }).platform).toBe('other');
    expect(readVisitor({ userAgent: UA.weird }).platform).toBe('other');
    expect(readVisitor({ userAgent: undefined as unknown as string }).platform).toBe('bot');
  });
});

describe('helpers', () => {
  it('isComputer', () => {
    expect(isComputer('mac')).toBe(true); expect(isComputer('computer')).toBe(true);
    expect(isComputer('android')).toBe(false); expect(isComputer('ios')).toBe(false);
  });
  it('androidTooOld solo con versión conocida', () => {
    expect(androidTooOld(7, 8)).toBe(true); expect(androidTooOld(8, 8)).toBe(false); expect(androidTooOld(null, 8)).toBe(false);
  });
  it('chromeIntentUrl', () => {
    expect(chromeIntentUrl('https://render.bimbask.com/android?x=1')).toBe('intent://render.bimbask.com/android?x=1#Intent;scheme=https;package=com.android.chrome;end');
    expect(chromeIntentUrl('http://x.com/a')).toBeNull();
    expect(chromeIntentUrl('no es url')).toBeNull();
  });
});
