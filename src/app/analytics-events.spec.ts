import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';
import { validateEvent } from './analytics/web-analytics';

const BANNED = /mail|phone|tel|text|message|msg|nombre|content|body|query|address|zone|timezone|user|domain|id$/i;

describe('tabla analytics-events de blacksugar21.com', () => {
  it('snake_case y sin parámetros de texto libre, ids ni datos personales', () => {
    for (const [ev, params] of Object.entries(ANALYTICS_EVENTS)) {
      expect(ev).toMatch(/^[a-z][a-z0-9_]*$/);
      for (const [k, spec] of Object.entries(params)) {
        expect(k).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(BANNED.test(k), `${ev}.${k}`).toBe(false);
        expect(['enum', 'path', 'bool', 'int']).toContain((spec as { type: string }).type);
      }
    }
  });
  it('lista cerrada: visitor_info y email_domain ya no existen', () => {
    expect(validateEvent(ANALYTICS_EVENTS, 'visitor_info', { timezone: 'America/Santiago', browser_language: 'es-CL' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'tester_signup', { email_domain: 'gmail.com' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'tester_signup').ok).toBe(true);
    expect(validateEvent(ANALYTICS_EVENTS, 'screen_view', { page_title: 'Home' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'discovery_swipe', { action: 'like' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'onboarding_complete', { userType: 'SUGAR_DADDY' }).ok).toBe(false);
  });
  it('rechaza correos, teléfonos y texto libre en parámetros permitidos', () => {
    expect(validateEvent(ANALYTICS_EVENTS, 'click_beta_link', { channel: 'a@b.cl', section: 'hero' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'click_beta_link', { channel: '+56 9 1234 5678', section: 'hero' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'coach_demo_message', { intent: 'hola, soy Ana' }).ok).toBe(false);
    expect(validateEvent(ANALYTICS_EVENTS, 'click_beta_link', { channel: 'testflight', section: 'beta' }).ok).toBe(true);
    expect(validateEvent(ANALYTICS_EVENTS, 'coach_demo_place_click', { rank: 3 }).ok).toBe(true);
    expect(validateEvent(ANALYTICS_EVENTS, 'coach_demo_place_click', { rank: 300 }).ok).toBe(false);
  });
});
