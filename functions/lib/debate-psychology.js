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
      {
        principle: 'Anxious and avoidant attachment styles predict distinct digital communication patterns — anxious users send more follow-up messages when unanswered, avoidant users prefer low-synchronicity media (text over FaceTime)',
        researcher: 'Drouin & Landgraff, Computers in Human Behavior, 2012',
      },
      {
        principle: 'Meta-analysis of 224 studies (N = 79,722) confirms adult attachment anxiety predicts loneliness and rejection sensitivity in digital contact; avoidance predicts emotional suppression and withdrawal — both patterns manifest in early messaging behavior',
        researcher: 'Zhang et al., Journal of Personality and Social Psychology, 2022',
      },
    ],
    social_dynamics: [
      {
        principle: 'First impressions form in 7 seconds and are disproportionately sticky (thin-slice judgments)',
        researcher: 'Ambady & Rosenthal, 1993',
      },
      {
        principle: 'Meta-analysis of 21 fMRI romantic love studies confirms initial contact activates ventromedial prefrontal cortex and anterior cingulate reward circuits; curiosity-triggering messages leverage this neural architecture, with VMPFC activation indicating self-expansion rather than mere reward-seeking',
        researcher: 'Yang et al., Neuropsychologia, 2024',
        source: 'https://pubmed.ncbi.nlm.nih.gov/39293637/',
      },
      {
        principle: 'Reciprocity principle: people feel compelled to respond in kind when they receive something personal or thoughtful',
        researcher: 'Cialdini, Influence, 2006',
      },
      {
        principle: 'On dating apps, opening messages referencing a specific profile detail (not generic "hey") receive 3× higher response rates; curiosity-gap openers outperform compliments',
        researcher: 'Tyson et al., Dating App Messaging, 2016',
      },
      {
        principle: 'In East Asian (JA/ZH/KO) contexts, initial contact succeeds through demonstrated cultural literacy and shared group identity (in-group signals) rather than individual novelty — Hofstede\'s collectivism dimension predicts this divergence from Western approach patterns',
        researcher: 'Hofstede, Culture\'s Consequences, 1980/2001',
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
      {
        principle: 'Self-disclosure via text follows a compressed timeline compared to FtF: people share personal information 3× faster in text-based chat, but intimacy development without synchronous cues requires explicit reciprocal acknowledgment',
        researcher: 'Bazarova & Choi, Selective Self-Disclosure Online, 2014',
      },
      {
        principle: 'First impressions via video call are as accurate and normative as in-person for most personality traits — screen-based initial contact preserves the fundamental social judgment dynamics of face-to-face meeting',
        researcher: 'Mignault et al., Personality and Social Psychology Bulletin, 2024',
      },
      {
        principle: "Knapp's relational escalation stages persist in digital dating but are compressed and multimodal — social media and app-based cues accelerate identity presentation across all commitment stages, with enduring technological influence throughout the path toward commitment",
        researcher: 'Sharabi, Communication Research, 2024',
        source: 'https://doi.org/10.1177/00936502221127498',
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
      {
        principle: 'App-mediated disclosure follows hyperpersonal theory: text-based channels produce idealized impressions faster than FtF, requiring conscious "calibration" moments to prevent expectation crash',
        researcher: 'Walther & Whitty, Journal of Language and Social Psychology, 2021',
      },
      {
        principle: 'Japanese amae (甘え) — the expectation of indulgent acceptance from another — is a culturally-specific attachment mechanism where trust is built through presumed benevolence of the group, not dyadic secure-base declarations',
        researcher: 'Doi, The Anatomy of Dependence, 1973',
      },
      {
        principle: 'Insecure attachment patterns acquired through early adversity predict reduced relationship satisfaction and elevated conflict in adult romantic dyads, independent of mating effort; attachment style detection during early conversations enables targeted secure-base communication',
        researcher: 'Kwiek et al., Evolutionary Psychology, 2025',
        source: 'https://doi.org/10.1177/14747049251355861',
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
      {
        principle: 'Paradox of choice in matching apps: users who swipe through 50+ profiles before messaging show lower satisfaction with chosen match — pre-commitment reduces idealization',
        researcher: "D'Angelo & Toma, Choice Overload in Dating Apps, 2017",
      },
      {
        principle: 'The Fast Friends (36 Questions) escalating-disclosure protocol produces equivalent closeness via video call or text chat as face-to-face — mode of communication does not moderate intimacy outcomes',
        researcher: 'Sprecher, Journal of Social and Personal Relationships, 2021',
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
      {
        principle: 'Love language preferences manifest differently in digital contexts: Words of Affirmation are most digitally accessible; Acts of Service via coordination apps; Quality Time as synchronous video calls',
        researcher: 'Groom & Pennebaker, Love Language Digital Adaptation, 2022',
      },
      {
        principle: 'No evidence that matching a partner\'s primary love language has special benefits — all five expression channels predict satisfaction equally; expressing care frequently across multiple channels matters more than congruence',
        researcher: 'Impett, Park & Muise, Current Directions in Psychological Science, 2024',
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
      {
        principle: 'Video calls produce equivalent intimacy to in-person contact for established pairs; however, for new matches, audio-only outperforms video due to reduced appearance anxiety',
        researcher: 'Sherman et al., Zoom Intimacy, 2018',
      },
      {
        principle: 'In collectivist cultures (JA/ZH/KO), relational harmony (和, wa / 和谐, héxié) is the primary connection indicator — being included in someone\'s trusted inner circle (uchi/soto in Japanese) matters more than explicit mutual vulnerability',
        researcher: 'Markus & Kitayama, Culture and the Self, 1991',
      },
      {
        principle: 'Lower attachment avoidance (secure base/safe haven functioning) buffers the impact of past adversity on relationship satisfaction; partners who offer genuine emotional availability and comfort during distress strengthen dyadic resilience over time',
        researcher: 'Baumann et al., Family Process, 2024',
        source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11951461/',
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
      {
        principle: 'Social media surveillance of a romantic partner activates the same reward circuits as direct interaction; however, passive scrolling (vs active messaging) correlates with jealousy and relationship anxiety',
        researcher: 'Fox & Moreland, Social Media in Romantic Relationships, 2015',
      },
      {
        principle: 'Social Baseline Theory: the brain expects co-regulation as its default state — shared presence (physical or digital) with an attachment figure measurably reduces neural threat-processing costs, making genuine connection feel literally calming',
        researcher: 'Beckes & Sbarra, Current Opinion in Psychology, 2022',
      },
      {
        principle: 'Self-expansion experiences with a partner predict higher closeness and perceived "otherness" (partner distinctiveness), which in turn predicts sexual desire — novel shared experiences during connection-building simultaneously deepen intimacy and sustain attraction',
        researcher: 'Goss et al., Journal of Social and Personal Relationships, 2022',
        source: 'https://doi.org/10.1177/02654075221081137',
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
      {
        principle: 'Vulnerability via text is experienced as more controlled and less risky than vulnerability FtF, enabling deeper initial disclosure — but this "digital courage" can create asymmetry if one partner uses it strategically',
        researcher: 'Bazarova, Public Intimacy, 2012; Rains & Wright, 2016',
      },
      {
        principle: 'Cross-cultural validation across 25 countries confirms passion, intimacy, and commitment as universal love dimensions — commitment shows the greatest cross-cultural and temporal stability, making it the most reliable anchor for deepening connection',
        researcher: 'Sorokowski et al., Journal of Sex Research, 2021',
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
      {
        principle: 'Digital conflict escalation: absence of nonverbal cues increases hostile attribution bias — the same neutral text reads as more aggressive than the same words spoken aloud',
        researcher: 'Byron, Email Negativity Bias, 2008; replicated Kruger et al., 2005',
      },
      {
        principle: 'EFT maintains "well-established" treatment status across 37 RCTs — strongest outcomes when partners achieve emotional accessibility and responsiveness, confirming that attachment-based vulnerability is the active ingredient in conflict repair',
        researcher: 'Doss, Roddy, Wiebe & Johnson, Journal of Marital and Family Therapy, 2022',
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
      {
        principle: 'Ghosting (sudden unilateral cessation of contact) is experienced as more distressing than explicit rejection because it violates closure norms and triggers rumination about ambiguous attribution',
        researcher: 'LeFebvre, Ghosting as Rejection, 2018',
      },
      {
        principle: 'Positive interaction exchanges buffer the impact of negative ones on relationship satisfaction — confirmed in 886 couples; the buffering effect operates independently of conflict frequency, validating the positive-ratio mechanism',
        researcher: 'Cazzell et al., Journal of Family Psychology, 2022',
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
        principle: 'NVC training (7-week structured program) produces significant improvements in problem-solving confidence and personal control over control conditions; the observe-feel-need-request protocol delivers measurable conflict-management gains in couples',
        researcher: 'Rahmani & Ulu, BMC Psychology, 2025',
        source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12729115/',
      },
      {
        principle: 'Repair attempts via text after digital conflict are less effective than voice calls due to absence of prosodic cues (tone, pace, warmth) — switching to voice or video significantly accelerates de-escalation',
        researcher: 'Coyne et al., Technology & Relationship Conflict, 2019',
      },
      {
        principle: 'In Arabic-speaking and many Asian cultures, face-saving (حفظ ماء الوجه / 面子, miànzi) is paramount in conflict — direct confrontation causes irreparable relational damage; repair requires indirect acknowledgment that preserves dignity for both parties',
        researcher: 'Ting-Toomey, Facework Theory, 1988',
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
      {
        principle: 'Partners who met online report higher marital satisfaction and lower divorce rates after 7 years compared to offline-met couples, attributed to intentionality of matching criteria',
        researcher: 'Cacioppo et al., Marital Satisfaction Online vs Offline, PNAS 2013',
      },
      {
        principle: 'Secure attachment predicts greater adherence to shared relational agreements; avoidant attachment predicts unilateral rule defiance — real-world confirmation that secure attachment enables genuine commitment beyond verbal declaration',
        researcher: 'Gruneau Brulin, Shaver & Mikulincer, Journal of Social and Personal Relationships, 2022',
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
      {
        principle: 'Public commitment declarations on social media (couple posts, relationship status) function as self-presentation consistency anchors — they increase felt commitment more than private verbal promises',
        researcher: 'Emery et al., Social Media Commitment, 2014',
      },
      {
        principle: 'Autonomous motivation for romantic pursuit (genuine desire for connection, not fear of being alone) predicts forming lasting partnerships — individuals with autonomous motivation are significantly more likely to be partnered 6 months later',
        researcher: 'MacDonald et al., Personality and Social Psychology Bulletin, 2025',
      },
      {
        principle: "Sternberg's RELIC extension of triangular theory adds personal love narratives and five nested environmental systems (micro to chrono) — commitment resonates more deeply when partners recognize how their shared story fits each person's life narrative",
        researcher: 'Sternberg & Sternberg, Theory & Psychology, 2024',
        source: 'https://doi.org/10.1177/09593543241270922',
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
      {
        principle: 'Autonomous commitment (SDT) erodes when external platform metrics (match count, likes, profile views) remain visible — app notification off-boarding is a concrete commitment signal',
        researcher: 'Orben & Przybylski, Social Media & Wellbeing, 2019',
      },
      {
        principle: 'Korean 눈치 (nunchi) — the subtle art of reading unspoken social cues — enables commitment communication without explicit declaration; partners signal readiness through consistent attentiveness and action rather than verbal proclamations',
        researcher: 'Lim & Choi, Korean Communication Patterns, 1996',
      },
      {
        principle: 'Fulfilling SDT needs (autonomy, competence, relatedness) in sexual motivation predicts both sexual satisfaction and relational well-being; autonomous rather than obligated intimacy sustains long-term desire alongside commitment',
        researcher: 'Price, Busby & Leavitt, Journal of Sex & Marital Therapy, 2023',
        source: 'https://doi.org/10.1080/0092623X.2022.2094304',
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
  perspectiveTimeoutMs: 12000,
  synthesisModel: 'gemini-2.5-flash',
  synthesisMaxTokens: 6000,
  synthesisTemperature: 0.7,
  synthesisTimeoutMs: 45000,
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
