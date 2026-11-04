import { betaCards, safeAppDistribution, safeTestflight } from './beta-links';

describe('beta-links: TestFlight', () => {
  it('acepta solo https en testflight.apple.com', () => {
    expect(safeTestflight('https://testflight.apple.com/join/abc123')).toBe('https://testflight.apple.com/join/abc123');
  });

  it('rechaza null, http, otros hosts y hosts que solo lo imitan', () => {
    expect(safeTestflight(null)).toBeNull();
    expect(safeTestflight('')).toBeNull();
    expect(safeTestflight('http://testflight.apple.com/join/abc')).toBeNull();
    expect(safeTestflight('https://example.com/join/abc')).toBeNull();
    expect(safeTestflight('https://testflight.apple.com.evil.test/join/abc')).toBeNull();
    expect(safeTestflight('https://evil.test/?u=testflight.apple.com')).toBeNull();
  });

  it('betaCards deja href nulo si el enlace de TestFlight no es válido', () => {
    expect(betaCards({ testflight: 'https://evil.test/x' }).find((c) => c.key === 'testflight')?.href).toBeNull();
    expect(betaCards({ testflight: 'https://testflight.apple.com/join/x' }).find((c) => c.key === 'testflight')?.href).toContain('testflight.apple.com');
  });

  it('App Distribution acepta solo https en appdistribution.firebase.dev', () => {
    expect(safeAppDistribution('https://appdistribution.firebase.dev/i/abc')).toBe('https://appdistribution.firebase.dev/i/abc');
    expect(safeAppDistribution(null)).toBeNull();
    expect(safeAppDistribution('http://appdistribution.firebase.dev/i/abc')).toBeNull();
    expect(safeAppDistribution('https://appdistribution.firebase.dev.evil.test/i/abc')).toBeNull();
    expect(safeAppDistribution('https://testflight.apple.com/join/x')).toBeNull();
  });
});
