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
  emotional_intelligence: {
    id: 'D',
    name: 'Emotional Intelligence & Presence',
    framework: 'Emotional Intelligence + Polyvagal Theory + Interpersonal Neurobiology',
    lens: 'What is the emotional subtext? What does the nervous system need to feel safe enough to connect?',
    researchers: [
      'Goleman (1995)',
      'Porges (2011)',
      'Siegel (2012)',
      'van der Kolk (2014)',
    ],
    stageStrength: {
      initial_contact: 0.6,
      getting_to_know: 0.75,
      building_connection: 0.95,
      conflict_challenge: 1.0,
      commitment: 0.85,
    },
  },
  cultural_intelligence: {
    id: 'E',
    name: 'Cultural Intelligence',
    framework: 'Cross-Cultural Psychology + Cultural Intelligence (CQ) + Face Negotiation Theory',
    lens: 'What cultural frames shape this dynamic? How do collectivist, high-context, or face-saving norms alter the optimal approach?',
    researchers: [
      'Hofstede (2001)',
      'Ting-Toomey (1988)',
      'Earley & Ang (2003)',
      'Hall (1976)',
    ],
    stageStrength: {
      initial_contact: 0.9,
      getting_to_know: 0.85,
      building_connection: 0.75,
      conflict_challenge: 1.0,
      commitment: 0.85,
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
      {
        principle: 'Attachment anxiety in dating app users predicts lower perceived success and worse affective well-being after use; however, perceiving higher anonymity affordance on the platform attenuates this association — anonymity partially shields anxious users from rejection cues during early contact',
        researcher: 'Métellus et al., Journal of Marital and Family Therapy, 2025',
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
    emotional_intelligence: [
      {
        principle: 'Emotional self-awareness — accurately recognizing one\'s own feelings in real time — is the foundational EI skill: people with low self-awareness either flood others with unregulated emotion or appear flat and unreadable, both of which undermine early connection',
        researcher: 'Goleman, Emotional Intelligence, 1995',
      },
      {
        principle: 'Neuroception of safety: the autonomic nervous system scans for threat cues before conscious thought; warm word choice, considered pacing, and genuine curiosity activate the ventral vagal social engagement system — the neurobiological prerequisite for willingness to connect',
        researcher: 'Porges, The Polyvagal Theory, 2011',
      },
      {
        principle: 'Emotional intelligence predicts more accurate encoding and decoding of emotional cues in text-based digital communication; high-EI individuals infer emotional tone from punctuation, response latency, and word choice — reading the subtext under the message',
        researcher: 'Schutte et al., Cognition & Emotion, 2001; extended by Mayer et al., 2016',
      },
      {
        principle: 'Trait EI uniquely predicts relationship satisfaction above and beyond Big Five personality dimensions; the self-regulation and empathy facets are the strongest individual predictors — people who can name and manage their own emotions create safer emotional climates from the first exchange',
        researcher: 'Malouff et al., Journal of Family Psychology, 2014',
      },
    ],
    cultural_intelligence: [
      {
        principle: 'Cultural Intelligence (CQ) is a four-factor learnable skill — cognitive (cultural knowledge), metacognitive (cultural awareness), motivational (drive to adapt), behavioral (adapting communication style) — high CQ individuals adjust opener tone, directness, and formality to match the recipient\'s cultural register',
        researcher: 'Earley & Ang, Cultural Intelligence, 2003',
      },
      {
        principle: 'In high-context cultures (AR, JA, ZH, KO), indirect openers that signal cultural respect (formality, shared group membership, respectful framing) outperform direct self-promotion; the message is in the implied meaning, not the explicit words',
        researcher: 'Hall, Beyond Culture, 1976',
      },
      {
        principle: 'Individualist cultures (US, AU, Western EU) expect self-focused openers highlighting uniqueness; collectivist cultures expect group-referenced or contextually embedded openings — mismatching the cultural script reads as socially unintelligent',
        researcher: 'Hofstede, Culture\'s Consequences, 2001; Triandis, 1995',
      },
      {
        principle: 'Meta-analysis of 98 cross-cultural communication studies confirms high-context vs low-context communication style divergence is the single largest predictor of miscommunication in intercultural digital first contact — explicitly flagging one\'s communication style is a high-CQ repair strategy',
        researcher: 'Zakaria & Cogburn, Journal of International Management, 2010; replicated Kim et al., 2022',
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
    emotional_intelligence: [
      {
        principle: 'Empathy — the second pillar of EI — develops in this stage as the ability to accurately feel what the other person is feeling, not just understand it cognitively; empathic accuracy in conversation predicts relationship satisfaction 6 months later',
        researcher: 'Ickes, Empathic Accuracy, 1993; Goleman, Social Intelligence, 2006',
      },
      {
        principle: 'The "window of tolerance" (Siegel/Ogden) describes the optimal zone of emotional arousal for authentic connection — staying regulated enables curiosity; hyperarousal triggers defensiveness, hypoarousal triggers flatness. Pacing self-disclosure to stay within this window deepens rather than overwhelms early intimacy',
        researcher: 'Siegel, The Developing Mind, 2012; Ogden et al., 2006',
      },
      {
        principle: 'Alexithymia (difficulty identifying and describing feelings) is negatively associated with relationship satisfaction and intimacy depth; prompting a partner with emotionally specific questions ("What felt meaningful about that?") scaffolds emotional self-awareness in those who struggle to access it',
        researcher: 'Vanheule et al., British Journal of Medical Psychology, 2007; meta-analysis Frías-Ibáñez et al., 2022',
      },
      {
        principle: 'Co-regulation of affect — each person\'s nervous system influencing the other\'s through prosodic mirroring, synchronized response timing, and attunement signals — is measurable in chat via response latency matching and mirroring of emotional intensity; disruptions in co-regulation predict early dropout in digital relationships',
        researcher: 'Porges, 2011; Feldman, Biological Psychiatry, 2007',
      },
    ],
    cultural_intelligence: [
      {
        principle: 'Polychronic time cultures (MENA, Latin America, Southern EU) experience relationship development as fluid and relationship-paced; monochronic cultures (Northern EU, US) expect punctual, linear disclosure milestones — intercultural partners misread the other\'s pace as disinterest or pressure',
        researcher: 'Hall, The Dance of Life, 1983; Hofstede, 2001',
      },
      {
        principle: 'Long-term orientation cultures (EA, SE Asia) signal getting-to-know interest through future-oriented references (family, career, shared plans) much earlier than short-term orientation cultures where this reads as premature pressure',
        researcher: 'Hofstede et al., Cultures and Organizations, 2010',
      },
      {
        principle: 'Self-disclosure rates in cross-cultural online dating vary systematically: high-context cultures disclose personal information later but signal trust through consistent presence and responsiveness; low-context cultures disclose more but interpret slow disclosure as concealment',
        researcher: 'Chen, Computer-Mediated Communication, 2014; replicated Rains et al., 2022',
      },
      {
        principle: 'Cultural humility — remaining genuinely curious about a specific person\'s cultural experience rather than applying group-level stereotypes — is a more effective CQ strategy than cultural competence (claiming to "know" another\'s culture); it invites the partner to teach rather than be categorized',
        researcher: 'Hook et al., Journal of Counseling Psychology, 2013; Tervalon & Murray-García, 1998',
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
      {
        principle: 'Online dating expedites Knapp\'s relational escalation stages and prioritizes minimal-effort interactions — users fulfill relational needs with less behavioral investment, producing rapid but potentially shallow closeness that requires conscious depth calibration',
        researcher: 'Hu, Zhu & Zhang, Cyberpsychology, Behavior, and Social Networking, 2024',
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
      {
        principle: 'Less than half of people have an identifiable primary love language; relationship quality is more strongly linked to satisfaction across a range of loving behaviors — especially verbal affirmations, encouragement for individual pursuits, and support during difficult times — than to speaking one dominant love language',
        researcher: 'Flicker & Sancier-Barbosa, Journal of Marital and Family Therapy, 2025',
      },
      {
        principle: 'Listening quality is the primary behavioral driver of perceived partner responsiveness: partners who listen with attention, understanding, and non-judgment generate the felt experience of being understood, validated, and cared for that is the bedrock of intimacy',
        researcher: 'Itzchakov & Reis, Current Opinion in Psychology, 2023',
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
    emotional_intelligence: [
      {
        principle: 'Somatic markers of safety: the body signals relational quality before the mind articulates it — tension, openness, energy level, and gut response are data, not noise. High-EI individuals listen to these signals and name them, which accelerates authentic intimacy',
        researcher: 'van der Kolk, The Body Keeps the Score, 2014; Damasio, 1994',
      },
      {
        principle: 'Interpersonal neurobiology: deep connection requires "integration" — two distinct minds remaining themselves while creating genuine resonance; the felt sense of being "seen" (not merged with) is the neural signature of secure human bonding',
        researcher: 'Siegel, Mindsight, 2010; The Developing Mind, 2012',
      },
      {
        principle: '"Name it to tame it": labeling an emotion with a specific word (not just "bad" or "fine") reduces amygdala activation and enables prefrontal regulation; partners who invite emotional labeling ("That sounds like it felt lonely?") actively co-regulate each other\'s nervous systems',
        researcher: 'Lieberman et al., Psychological Science, 2007; Hariri et al., 2000',
      },
      {
        principle: 'Emotional granularity — the ability to differentiate nuanced emotional states (disappointed vs rejected vs embarrassed) — predicts greater psychological and physical wellbeing and more adaptive social behavior; building emotional vocabulary with a partner deepens the felt quality of connection',
        researcher: 'Barrett, How Emotions Are Made, 2017; Tugade et al., Journal of Personality, 2004',
      },
    ],
    cultural_intelligence: [
      {
        principle: 'Behavioral adaptation CQ: adjusting touch proximity, eye contact, and directness to match the other\'s cultural comfort zone prevents the most common early misreadings (interpreted aggression, coldness, or disrespect) without requiring explicit negotiation',
        researcher: 'Earley & Ang, 2003; Ang et al., Management and Organization Review, 2007',
      },
      {
        principle: 'Physical proximity norms vary dramatically: Southern European and MENA cultures interpret close physical distance and brief touch as warmth and inclusion; Northern European and East Asian cultures experience the same as intrusive — calibrating spatial behavior signals cultural intelligence',
        researcher: 'Hall, The Hidden Dimension, 1966; Watson & Graves, 1966',
      },
      {
        principle: 'Gift-giving as relational investment (Mauss, 1925): in collectivist cultures, offering material care (food, shared resources, thoughtful gifts) is a primary language of connection, not superficiality — rejecting or ignoring these gestures communicates relational disrespect',
        researcher: 'Mauss, The Gift, 1925; extended by Carrier, 1995',
      },
      {
        principle: 'Intercultural couples who develop shared "third culture" communication norms — deliberately negotiating which cultural practices from each partner to retain and which to adapt — show significantly higher relationship satisfaction than couples who default to one partner\'s cultural frame',
        researcher: 'Cottrell, Marriage & Family Review, 1990; Piller, 2017; replicated Sun & Starosta, 2023',
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
      {
        principle: 'Human-AI pseudo-intimacy research shows that self-disclosure to AI companions triggers perceived responsiveness cues without genuine reciprocal understanding — authentic vulnerability requires a partner capable of truly being changed by what they hear, which remains the defining threshold between real and simulated connection',
        researcher: 'Lin et al., Emotional AI and Pseudo-Intimacy, PMC, 2025',
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
      {
        principle: 'Attachment anxiety in online versus offline conflict scenarios mirrors in cognitive and emotional responses but is transformed in behavioral responses — digitally mediated conflict amplifies anxious surveillance behaviors while reducing direct repair attempts, requiring explicit channel-switching to break the cycle',
        researcher: 'Randall et al., International Journal of Human-Computer Interaction, 2024',
      },
      {
        principle: 'First comprehensive meta-analysis of EFT across 20 RCTs and quasi-experimental studies (N = 332 couples) found large pre-post effect sizes (d = .93) and 70% symptom-free rates at treatment end — emotional accessibility and responsiveness are the measurable active ingredients',
        researcher: 'Spengler, Lee, Wiebe & Wittenborn, Couple and Family Psychology, 2024',
      },
    ],
    emotional_intelligence: [
      {
        principle: 'Emotional flooding (Gottman) is physiologically driven — heart rate above 100 bpm causes cognitive lockdown and makes productive conflict impossible; the high-EI move is to call a genuine 20-minute self-soothing break before re-engaging, not to push through',
        researcher: 'Gottman, Why Marriages Succeed or Fail, 1994; Goleman, 1995',
      },
      {
        principle: '"Name it to tame it" in conflict: labeling one\'s own escalating emotional state aloud ("I notice I\'m feeling defensive right now") reduces limbic activation and creates the micro-pause needed for prefrontal re-engagement — the most accessible somatic regulation skill for digital conflict',
        researcher: 'Siegel, Mindsight, 2010; Lieberman et al., 2007',
      },
      {
        principle: 'Emotional intelligence specifically predicts constructive conflict behavior (compromise, collaboration, emotional validation) over destructive behavior (contempt, stonewalling) — the regulation and empathy facets are the strongest predictors of repair initiation rather than escalation',
        researcher: 'Smith et al., Personality and Individual Differences, 2008; meta-analysis Malouff et al., 2014',
      },
      {
        principle: 'Trauma-informed conflict: unresolved somatic trauma activates fight-flight-freeze responses during conflict that are disproportionate to the current trigger — recognizing the "body taking over" is an EI skill that de-personalizes the other\'s intensity and opens space for curiosity rather than counter-attack',
        researcher: 'van der Kolk, The Body Keeps the Score, 2014; Levine, Waking the Tiger, 1997',
      },
    ],
    cultural_intelligence: [
      {
        principle: 'Indirect conflict styles (obliging, avoiding, compromising) are not conflict avoidance in collectivist cultures — they are relationship-preserving strategies that protect face for both parties; labeling them as "passive" or "avoidant" from a Western frame misreads competent cultural behavior as dysfunction',
        researcher: 'Ting-Toomey & Oetzel, Managing Intercultural Conflict, 2001; extended Oetzel et al., 2008',
      },
      {
        principle: 'Face threats in conflict (AN Arabic: حفظ الوجه, ZH: 面子 miànzi, JA: 体裁 taisai) operate on two dimensions: self-face (own dignity) and other-face (partner\'s dignity); successful intercultural conflict repair addresses both simultaneously, never sacrificing other-face to "win"',
        researcher: 'Ting-Toomey, Facework Theory, 1988; cross-cultural replication Merkin, 2018',
      },
      {
        principle: 'Online disinhibition effect amplifies cultural communication style differences in conflict: low-context directness becomes bluntness, high-context indirectness becomes silence — intercultural couples need explicit meta-communication agreements before conflicts occur, not during',
        researcher: 'Suler, CyberPsychology & Behavior, 2004; applied Yum & Hara, 2005',
      },
      {
        principle: 'Cultural humility in conflict: replacing "I understand your culture" (competence claim) with "Help me understand how you\'re experiencing this" (curiosity stance) consistently produces faster de-escalation in intercultural conflicts — the inquiry itself signals respect for the other\'s unique perspective',
        researcher: 'Hook et al., Journal of Counseling Psychology, 2013; Mosher et al., 2017',
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
      {
        principle: 'Gottman\'s Seven Principles program is equally effective when delivered online versus in-person (N = 490 couples, propensity-score matched) — digital delivery does not dilute relationship skill gains, making app-mediated relationship education a valid complement to face-to-face therapy',
        researcher: 'Zahl-Olsen, Thuen & Bertelsen, Journal of Marital and Family Therapy, 2024',
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
      {
        principle: 'Attachment orientations regulate interpersonal emotion co-regulation strategies: secure attachment enables both passive (comfort-seeking) and active (reappraisal) co-regulation; insecure attachment restricts the repertoire, making committed partners\' emotional availability a direct determinant of dyadic regulation capacity',
        researcher: 'Mikulincer & Shaver, Current Opinion in Psychology / Frontiers in Psychology, 2024',
      },
      {
        principle: 'Partner sexual autonomy support — the perception that one\'s partner respects and encourages genuine autonomous sexual motivation — uniquely predicts sexual satisfaction and relational well-being above and beyond general interpersonal autonomy support, validating SDT\'s need-differentiation at the commitment stage',
        researcher: 'Lenger et al., PMC / Archives of Sexual Behavior, 2025',
      },
    ],
    emotional_intelligence: [
      {
        principle: 'Emotional intelligence is the strongest non-ability predictor of relationship satisfaction in long-term committed dyads — it outperforms agreeableness, conscientiousness, and attachment security as a predictor precisely because it operates dynamically (moment-to-moment regulation) rather than as a static trait',
        researcher: 'Bracket et al., Psychological Inquiry, 2011; Malouff et al., Journal of Family Psychology, 2014',
      },
      {
        principle: 'Earned secure attachment (Siegel): adults with insecure early attachment histories who develop a coherent narrative of their experience show neural and relational outcomes equivalent to those with originally secure attachment — commitment to a high-EI partner accelerates this earned security',
        researcher: 'Siegel, The Developing Mind, 2012; Main & Goldwyn, 1984',
      },
      {
        principle: 'Polyvagal-informed commitment: genuine "I choose this" requires ventral vagal safety — commitment made from a state of chronic sympathetic activation (fear of abandonment, fawn response) is compliance, not authentic choice; helping a partner feel safe is the precondition for receiving authentic, lasting commitment',
        researcher: 'Porges, The Polyvagal Theory, 2011; Dana, Polyvagal Theory in Therapy, 2018',
      },
      {
        principle: 'Couples with higher average trait EI show significantly lower physiological stress responses to relationship conflict and faster return to baseline after disagreements — emotional intelligence functions as a biological buffer against the cumulative physiological wear of committed relationships',
        researcher: 'Fitness, Personal Relationships, 2001; review Brackett, Rivers & Salovey, 2011',
      },
    ],
    cultural_intelligence: [
      {
        principle: 'Family approval as a relational milestone: in collectivist cultures, introducing a partner to family is not a pressure move — it is a commitment signal that carries more weight than verbal declaration; withholding this introduction reads as the partner\'s shame or lack of seriousness, not appropriate pacing',
        researcher: 'Triandis, Individualism and Collectivism, 1995; Kalmijn, 1998',
      },
      {
        principle: 'Cultural scripts for "defining the relationship" (DTR conversation) are absent or indirect in many high-context cultures — in JA, KO, AR, and ZH contexts, commitment emerges through behavioral consistency and public acknowledgment rather than explicit verbal agreement, requiring patience from low-context partners',
        researcher: 'Gudykunst & Ting-Toomey, 1988; Knapp & Vangelisti, 2000',
      },
      {
        principle: 'Intercultural couples face unique stressors (family disapproval, communication code-switching, cultural fatigue) but demonstrate specific protective factors: high CQ, explicit meta-communication about cultural differences, and "third culture" construction significantly predict relationship longevity',
        researcher: 'Piller, Bilingual Couples Talk, 2002; Zhang & Kline, 2009; Sun & Starosta, 2023',
      },
      {
        principle: 'Digital commitment signals vary culturally: "official" social media pairing (relationship status, couple profile photos) is a meaningful commitment marker in individualist Western cultures; in collectivist cultures, being introduced within family messaging groups (LINE, KakaoTalk, WhatsApp family) carries equivalent or greater weight',
        researcher: 'Emery et al., 2014; Lim & Choi, 1996; extended by Toma & Hancock, 2016',
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
