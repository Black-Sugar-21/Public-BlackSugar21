'use strict';

/**
 * Multi-Agent Debate System — Psychology Data Layer
 *
 * Pure data: agent definitions, per-stage principles split by perspective,
 * and debate configuration defaults. No Gemini calls here.
 */

const PERSPECTIVE_AGENTS = {
  attachment_safety: {
    id: 'A',
    name: 'Attachment & Safety',
    framework: 'Attachment Theory + Emotionally Focused Therapy',
    lens: 'What does the user need to feel safe? What attachment need is being expressed?',
    researchers: [
      'Bowlby (1969)',
      'Ainsworth (1978)',
      'Johnson (2008)',
      'Mikulincer & Shaver (2007)',
    ],
    stageStrength: {
      initial_contact: 0.7,
      getting_to_know: 0.8,
      building_connection: 1.0,
      conflict_challenge: 0.9,
      commitment: 0.8,
    },
  },
  social_dynamics: {
    id: 'B',
    name: 'Social Dynamics & Persuasion',
    framework: 'Social Psychology + Attraction Science + Self-Expansion',
    lens: 'What social dynamics are at play? What creates genuine interest and attraction?',
    researchers: [
      'Cialdini (2006)',
      'Fisher (2004)',
      'Aron (1997)',
      'Ambady (1993)',
      'Reis & Shaver (1988)',
    ],
    stageStrength: {
      initial_contact: 1.0,
      getting_to_know: 0.9,
      building_connection: 0.7,
      conflict_challenge: 0.6,
      commitment: 0.7,
    },
  },
  communication_repair: {
    id: 'C',
    name: 'Communication & Repair',
    framework: 'Evidence-Based Communication + Vulnerability Research',
    lens: 'What is the healthiest, most effective way to say this?',
    researchers: [
      'Gottman (1994)',
      'Rosenberg (2003)',
      'Brown (2012)',
      'Chapman (1992)',
      'Deci & Ryan (2000)',
    ],
    stageStrength: {
      initial_contact: 0.6,
      getting_to_know: 0.7,
      building_connection: 0.8,
      conflict_challenge: 1.0,
      commitment: 1.0,
    },
  },
};

/**
 * Principles split by agent × stage. Each agent receives ONLY its subset,
 * forcing genuinely different perspectives rather than generic overlap.
 */
const STAGE_PERSPECTIVE_PRINCIPLES = {
  initial_contact: {
    attachment_safety: [
      {
        principle: 'Self-expansion theory: people are drawn to those who offer new perspectives, experiences, or knowledge',
        researcher: 'Aron & Aron, 1986',
      },
      {
        principle: 'Reciprocal self-disclosure builds trust faster than one-sided sharing — matched vulnerability depth signals safety',
        researcher: 'Aron et al., 36 Questions, 1997',
      },
    ],
    social_dynamics: [
      {
        principle: 'First impressions form in 7 seconds and are disproportionately sticky (thin-slice judgments)',
        researcher: 'Ambady & Rosenthal, 1993',
      },
      {
        principle: 'Dopamine-driven novelty-seeking peaks at initial contact — messages that trigger curiosity activate reward circuits',
        researcher: 'Fisher, Why We Love, 2004',
      },
      {
        principle: 'Reciprocity principle: people feel compelled to respond in kind when they receive something personal or thoughtful',
        researcher: 'Cialdini, Influence, 2006',
      },
    ],
    communication_repair: [
      {
        principle: 'Relationships progress through predictable initiating stages — skipping stages creates discomfort',
        researcher: 'Knapp, Social Intercourse, 1978',
      },
      {
        principle: 'Effective initial messages are specific, non-generic, and show genuine attention to the other person',
        researcher: 'Reis & Shaver, Interpersonal Process Model, 1988',
      },
    ],
  },
  getting_to_know: {
    attachment_safety: [
      {
        principle: 'Reciprocity norm: matched vulnerability depth builds trust; too-deep too-fast triggers avoidance responses',
        researcher: 'Derlega et al., 1993',
      },
      {
        principle: 'Secure attachment develops when exploration is encouraged alongside emotional availability',
        researcher: 'Ainsworth, Patterns of Attachment, 1978',
      },
    ],
    social_dynamics: [
      {
        principle: 'The 36 Questions protocol accelerates closeness through escalating mutual vulnerability in structured conversation',
        researcher: 'Aron et al., 1997',
      },
      {
        principle: 'Intimacy grows through self-disclosure, warmth, and connectedness — separate from passion and commitment',
        researcher: 'Sternberg, Triangular Theory of Love, 1986',
      },
    ],
    communication_repair: [
      {
        principle: 'Love Maps: couples who know each other\'s inner world (fears, dreams, values) have stronger foundations',
        researcher: 'Gottman, The Seven Principles, 1999',
      },
      {
        principle: 'Early conversations reveal love language preferences: words of affirmation, quality time, acts of service, gifts, or physical touch',
        researcher: 'Chapman, The 5 Love Languages, 1992',
      },
    ],
  },
  building_connection: {
    attachment_safety: [
      {
        principle: 'Secure attachment forms when one person becomes a "safe haven" (comfort in distress) and "secure base" (encouragement to explore)',
        researcher: 'Bowlby, Attachment and Loss, 1969/1988',
      },
      {
        principle: 'Deep connection AND maintained mystery sustain desire long-term; too much merging kills attraction',
        researcher: 'Perel, Mating in Captivity, 2006',
      },
    ],
    social_dynamics: [
      {
        principle: 'Shared experiences of mild vulnerability (not trauma-dumping) release oxytocin bonding hormones',
        researcher: 'Zak, The Moral Molecule, 2012',
      },
      {
        principle: 'Social proof and shared identity markers deepen perceived connection beyond surface-level attraction',
        researcher: 'Cialdini, Influence, 2006',
      },
    ],
    communication_repair: [
      {
        principle: 'Connection requires letting yourself be truly seen; shame resilience is built through empathic witnessing',
        researcher: 'Brown, Daring Greatly, 2012',
      },
      {
        principle: 'Vulnerability should feel like an invitation, not a demand — it deepens when met with empathic response',
        researcher: 'Brown, The Gifts of Imperfection, 2010',
      },
    ],
  },
  conflict_challenge: {
    attachment_safety: [
      {
        principle: 'Beneath anger or withdrawal lies attachment needs — "I push you away because I\'m terrified you\'ll leave"',
        researcher: 'Johnson, Hold Me Tight, 2008',
      },
      {
        principle: 'Pursue-withdraw cycles in conflict reflect attachment anxiety vs avoidance — breaking the cycle requires naming the pattern',
        researcher: 'Johnson, Emotionally Focused Therapy, 2004',
      },
    ],
    social_dynamics: [
      {
        principle: 'Stable relationships maintain 5 positive interactions for every negative one — even during conflict',
        researcher: 'Gottman, Why Marriages Succeed or Fail, 1994',
      },
      {
        principle: 'Repair attempts (humor, affection, de-escalation) during conflict predict relationship survival more than conflict frequency',
        researcher: 'Gottman, The Relationship Cure, 2001',
      },
    ],
    communication_repair: [
      {
        principle: 'Nonviolent Communication: observe without evaluating, state feelings, express needs, make requests — not demands',
        researcher: 'Rosenberg, NVC, 2003',
      },
      {
        principle: 'Four Horsemen predict failure: criticism, contempt, defensiveness, stonewalling. Antidotes: gentle startup, appreciation, responsibility, self-soothing',
        researcher: 'Gottman, The Four Horsemen, 1994',
      },
      {
        principle: 'Use "I feel... when... because I need..." structure to express conflict without triggering defensiveness',
        researcher: 'Rosenberg, NVC, 2003',
      },
    ],
  },
  commitment: {
    attachment_safety: [
      {
        principle: 'Commitment works when it offers both a safe haven AND a secure base — never possessive control',
        researcher: 'Bowlby, A Secure Base, 1988',
      },
      {
        principle: 'Earned secure attachment: even those with insecure histories can develop secure patterns through consistent responsive interactions',
        researcher: 'Mikulincer & Shaver, 2007',
      },
    ],
    social_dynamics: [
      {
        principle: 'The decision to love and maintain that love is separate from intimacy and passion — and the most stable over time',
        researcher: 'Sternberg, Triangular Theory, 1986',
      },
      {
        principle: 'Commitment deepens through shared rituals and symbols that create meaning beyond individual identities',
        researcher: 'Reis & Shaver, 1988',
      },
    ],
    communication_repair: [
      {
        principle: 'Lasting relationships create shared meaning: rituals, roles, goals, and symbols that transcend the individual',
        researcher: 'Gottman, The Seven Principles, 1999',
      },
      {
        principle: 'Autonomous commitment ("I choose this") sustains motivation; controlled commitment ("I have to") erodes it',
        researcher: 'Deci & Ryan, Self-Determination Theory, 2000',
      },
    ],
  },
};

const DEBATE_CONFIG_DEFAULTS = {
  enabled: false,
  minPerspectives: 2,
  perspectiveModel: 'gemini-2.5-flash-lite',
  perspectiveMaxTokens: 800,
  perspectiveTemperature: 0.9,
  perspectiveTimeoutMs: 8000,
  synthesisModel: 'gemini-2.5-flash',
  synthesisMaxTokens: 2400,
  synthesisTemperature: 0.7,
  synthesisTimeoutMs: 25000,
  parallelStages: true,
};

const STAGE_IDS = [
  'initial_contact',
  'getting_to_know',
  'building_connection',
  'conflict_challenge',
  'commitment',
];

module.exports = {
  PERSPECTIVE_AGENTS,
  STAGE_PERSPECTIVE_PRINCIPLES,
  DEBATE_CONFIG_DEFAULTS,
  STAGE_IDS,
};
