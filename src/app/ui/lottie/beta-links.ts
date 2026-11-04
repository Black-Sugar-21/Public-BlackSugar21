import BETA from '../../../beta-links.json';

/** Order of the cards in «Prueba la beta». */
export const BETA_CHANNELS = ['testflight', 'appDistribution', 'googlePlay', 'appStore'] as const;
export type BetaChannel = (typeof BETA_CHANNELS)[number];
export interface BetaCard { key: BetaChannel; href: string | null; }

/** Only a plain https URL counts as a link; anything else (null, empty, http, a guess with spaces) hides the button. */
export function safeLink(value: unknown): string | null {
  return typeof value === 'string' && /^https:\/\/[^\s"<>]+$/.test(value) ? value : null;
}

/** TestFlight: solo https y solo el host testflight.apple.com (cualquier otro enlace no se muestra). */
export function safeTestflight(value: unknown): string | null {
  const href = safeLink(value);
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && u.hostname === 'testflight.apple.com' ? href : null;
  } catch {
    return null;
  }
}

/** Firebase App Distribution: solo https y solo el host appdistribution.firebase.dev. */
export function safeAppDistribution(value: unknown): string | null {
  const href = safeLink(value);
  if (!href) return null;
  try {
    const u = new URL(href);
    return u.protocol === 'https:' && u.hostname === 'appdistribution.firebase.dev' ? href : null;
  } catch {
    return null;
  }
}

/** Cards built from src/beta-links.json (or any object with the same keys, for tests). */
export function betaCards(source: Partial<Record<BetaChannel, unknown>> = BETA as Partial<Record<BetaChannel, unknown>>): BetaCard[] {
  return BETA_CHANNELS.map((key) => ({ key, href: key === 'testflight' ? safeTestflight(source[key]) : key === 'appDistribution' ? safeAppDistribution(source[key]) : safeLink(source[key]) }));
}
