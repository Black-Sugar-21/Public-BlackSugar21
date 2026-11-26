// Tabla ÚNICA de eventos de analítica de blacksugar21.com (snake_case). Lo que no está aquí NO se envía.
// Sin zona horaria, correos, tipo de perfil ni conducta dentro de la app (swipes, matches, mensajes): solo el uso del sitio.
import { COMMON_EVENTS, type EventTable } from './analytics/web-analytics';

const HERO_COACH_BETA = { type: 'enum', values: ['hero', 'coach', 'beta'] } as const;

export const ANALYTICS_EVENTS = {
  ...COMMON_EVENTS,
  age_verified: {},
  click_try_coach: { section: { type: 'enum', values: ['hero'] } },
  click_beta_link: {
    channel: { type: 'enum', values: ['testflight', 'android_request', 'android', 'appDistribution', 'googlePlay', 'appStore'] },
    section: HERO_COACH_BETA,
  },
  tester_signup: {},
  // Demo pública del Coach IA (sin texto de la conversación ni ids).
  coach_demo_open: { source: { type: 'enum', values: ['hero_cta'] } },
  coach_demo_cta_dismiss: {},
  coach_demo_new_conversation: {},
  coach_demo_history_open: {},
  coach_demo_mv_open: {},
  coach_demo_sim_open: {},
  coach_demo_feedback: { rating: { type: 'enum', values: ['up', 'down'] }, intent: { type: 'enum', values: ['multiverse', 'simulate', 'place', 'phrase', 'general'] } },
  coach_demo_place_click: { rank: { type: 'int', max: 50 } },
  coach_demo_place_chip: { cat: { type: 'enum', values: ['category', 'general'] } },
  coach_demo_simulate: {},
  coach_demo_multiverse: {},
  coach_demo_message: { intent: { type: 'enum', values: ['place', 'phrase', 'place_need_loc', 'general'] } },
  coach_demo_limited: {},
  coach_demo_share: {},
  coach_demo_download: { store: { type: 'enum', values: ['android', 'ios'] } },
  // Web app (/app): solo hitos de uso, sin conducta íntima.
  app_section: { section: { type: 'enum', values: ['coach', 'discovery', 'chats', 'profile'] } },
  location_enabled: {},
  location_denied: {},
  daily_question_answered: {},
  second_opinion_link_created: {},
  profile_saved: {},
  onboarding_complete: {},
} as const satisfies EventTable;
