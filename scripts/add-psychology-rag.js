#!/usr/bin/env node
'use strict';

/**
 * add-psychology-rag.js — Relationship Psychology RAG chunks for BlackSugar21 Coach IA
 *
 * Adds 120+ high-quality, research-grounded chunks covering:
 *   - Attachment Theory (Bowlby, Ainsworth, Main, Levine)
 *   - Gottman Research (4 Horsemen, Sound Relationship House)
 *   - Love Languages (Chapman)
 *   - Sternberg Triangular Theory
 *   - Relationship Stages (Knapp, Fisher, Perel)
 *   - Communication in Couples
 *   - Compatibility Science
 *
 * Usage:
 *   node scripts/add-psychology-rag.js               # Full run — embed + upload all chunks
 *   node scripts/add-psychology-rag.js --dry-run     # List chunks without embedding or saving
 *   node scripts/add-psychology-rag.js --skip-existing  # Skip categories already in Firestore
 */

// Resolve modules from functions/node_modules (same as generate-rag-chunks.js)
const path = require('path');
const functionsDir = path.join(__dirname, '..', 'functions');
const admin = require(path.join(functionsDir, 'node_modules', 'firebase-admin'));
const { GoogleGenerativeAI } = require(path.join(functionsDir, 'node_modules', '@google/generative-ai'));

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// ── Config ──
const COLLECTION = 'coachKnowledge';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMS = 768;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500; // Rate limit between embedding calls

// ── Psychology RAG Chunks ──────────────────────────────────────────────────
const PSYCHOLOGY_CHUNKS = [

  // ══════════════════════════════════════════════════════════════════
  // 1. ATTACHMENT THEORY — 20 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'attachment_secure',
    source: 'Bowlby (1969) Attachment and Loss; Ainsworth (1978) Patterns of Attachment',
    text: 'Secure attachment (Bowlby, 1969) is built on a "safe haven / secure base" dynamic: the caregiver is consistently available, responsive, and soothing when the child is distressed, and that same child confidently explores when calm. In adult relationships (Hazan & Shaver, 1987), this translates to comfort with both intimacy and independence. Securely attached adults neither cling nor avoid closeness — they reach toward a partner when stressed and return to autonomy when safe. They form about 55% of the general population and show the healthiest relationship outcomes across cultures.',
  },
  {
    subcategory: 'attachment_anxious',
    source: 'Ainsworth (1978) Patterns of Attachment; Levine & Heller (2010) Attached',
    text: 'Anxious-ambivalent (preoccupied) attachment develops when caregiving is inconsistent — sometimes warm, sometimes cold — leaving the child hypervigilant to signs of abandonment. As adults, anxiously attached individuals experience what Levine & Heller call "hyperactivation": they amplify proximity-seeking behaviors, worry about a partner\'s love, and constantly scan for signs of rejection. Protest behaviors — frequent texting, testing the partner, jealousy — are their system\'s attempt to restore felt security. About 20% of adults show this pattern.',
  },
  {
    subcategory: 'attachment_anxious_protest',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016) Attachment in Adulthood',
    text: 'Protest behaviors in anxious attachment (Levine & Heller, 2010) are actions designed to force a partner back into proximity: sending multiple unanswered texts, making the partner jealous, threatening to leave (without meaning it), or becoming clingy after conflict. They escalate as the perceived distance increases. The irony is that these behaviors often push partners further away — especially avoidant partners, who respond to pressure with withdrawal. Recognizing protest behaviors as attachment system activation — not manipulation — is the first step toward managing them.',
  },
  {
    subcategory: 'attachment_avoidant',
    source: 'Ainsworth (1978); Bowlby (1980); Main & Goldwyn (1984)',
    text: 'Avoidant (dismissing) attachment develops when emotional bids are consistently rebuffed — the child learns that expressing need brings no comfort, so the best strategy is self-reliance. Adults with this pattern use deactivating strategies: suppressing awareness of attachment needs, focusing on partners\' flaws, idealized memories of past relationships (the "phantom ex"), and keeping conversations surface-level. They are not unfeeling — their attachment system activates just as strongly — but they have learned to turn it off. About 25% of adults show avoidant attachment.',
  },
  {
    subcategory: 'attachment_avoidant_deactivation',
    source: 'Mikulincer & Shaver (2016) Attachment in Adulthood',
    text: 'Deactivating strategies (Mikulincer & Shaver, 2016) in avoidant attachment include: dismissing the importance of close relationships ("I\'m a lone wolf"), idealization of independence, cognitive suppression of attachment-related thoughts, and distancing when a relationship deepens. These strategies evolved as protection from the pain of unresponsive caregiving. In dating, they look like: pulling away after a great date, going quiet after intimacy, valuing "freedom" above all, or fixating on a partner\'s minor flaws to justify emotional exit.',
  },
  {
    subcategory: 'attachment_disorganized',
    source: 'Main & Hesse (1990); Liotti (2004) Trauma, Dissociation, and Disorganized Attachment',
    text: 'Disorganized attachment (Main & Hesse, 1990) arises when the caregiver is both the source of fear and the source of comfort — as in trauma, abuse, or neglect. The child faces an irresolvable paradox: approach the very person causing danger. In adults, this creates contradictory behavior: desperately wanting intimacy while simultaneously fearing it. Disorganized adults may oscillate between clinging and pushing partners away, struggle with emotional regulation during conflict, and show high rates of trauma symptoms. They represent about 15-20% of clinical populations and benefit most from trauma-informed therapy.',
  },
  {
    subcategory: 'attachment_behavioral_system',
    source: 'Bowlby (1982) Attachment and Loss Vol. 1; Cassidy (1999)',
    text: 'The attachment behavioral system (Bowlby, 1982) is a biologically wired motivation system that activates under threat — physical danger, illness, separation, or perceived rejection. When activated, it drives proximity-seeking toward an attachment figure (partner, parent, close friend). The system deactivates when the person feels safe and connected. In adult dating, this explains why conflict triggers disproportionate reactions: a cold text doesn\'t just feel bad — it activates a survival-level alarm system calibrated in early childhood.',
  },
  {
    subcategory: 'attachment_safe_haven',
    source: 'Bowlby (1988) A Secure Base; Johnson (2008) Hold Me Tight',
    text: 'The "safe haven" function of attachment (Bowlby, 1988) means turning to a partner for comfort when distressed. In Sue Johnson\'s Emotionally Focused Therapy, the central question of every couple\'s conflict is: "Are you there for me? Will you respond when I need you?" The safe haven experience — feeling genuinely soothed by a partner\'s response — directly regulates the nervous system and reduces cortisol. Couples who function as each other\'s safe haven show faster physiological recovery after conflict and greater long-term relationship satisfaction.',
  },
  {
    subcategory: 'attachment_secure_base',
    source: 'Bowlby (1988) A Secure Base; Feeney & Collins (2015)',
    text: 'The "secure base" effect (Bowlby, 1988) describes how felt security in a relationship enables exploration — career risk-taking, creative pursuits, social expansion. Feeney & Collins (2015) found that partners who actively support each other\'s goals (rather than merely not obstructing them) build relationships with greater vitality and lower resentment. In dating, this appears early: someone who encourages your ambitions, remembers your goals, and celebrates your wins is signaling secure attachment capacity — a critical compatibility indicator.',
  },
  {
    subcategory: 'attachment_earned_security',
    source: 'Siegel (1999) The Developing Mind; Main & Goldwyn (1984)',
    text: 'Earned secure attachment (Main & Goldwyn, 1984) refers to adults who had insecure or difficult childhoods but developed a secure attachment orientation through therapy, a highly responsive relationship, or reflective self-understanding. They represent roughly one-third of adults classified as secure. The key marker is "narrative coherence" — the ability to describe early experiences, including painful ones, with clarity and without minimizing or being overwhelmed. Meeting someone with earned security can be transformative: they bring both deep empathy (from experience) and genuine stability.',
  },
  {
    subcategory: 'attachment_first_dates',
    source: 'Levine & Heller (2010) Attached; Hazan & Shaver (1987)',
    text: 'Attachment style is visible on first dates, even without realizing it. Secure individuals: make comfortable eye contact, ask meaningful questions, and tolerate silence without filling it anxiously. Anxious individuals: over-share, check for approval signals, and may feel an intense "high" connection that later feels unstable. Avoidant individuals: keep topics safe and general, become slightly guarded if conversation deepens emotionally, and may end the date before chemistry peaks to maintain control. Recognizing these patterns early allows for more realistic compatibility assessment.',
  },
  {
    subcategory: 'attachment_anxious_avoidant_trap',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'The anxious-avoidant trap (Levine & Heller, 2010): anxious and avoidant partners often feel intense initial chemistry — the avoidant\'s emotional unavailability mimics the inconsistency anxiously attached people grew up with, creating familiarity. As the relationship progresses, the anxious partner amplifies proximity-seeking (more texts, more reassurance) while the avoidant partner\'s deactivating strategies intensify (more withdrawal, more coldness). This creates a painful, self-reinforcing cycle. The anxious partner pursues harder; the avoidant retreats further. Breaking this pattern requires both partners to understand their own system — and the courage to interrupt their habitual response.',
  },
  {
    subcategory: 'attachment_communication_conflict',
    source: 'Johnson (2008) Hold Me Tight; Gottman (2011) The Science of Trust',
    text: 'During conflict, attachment systems activate — which is why arguments about dishes are rarely about dishes. Sue Johnson (2008) identifies the "demon dialogue" patterns: find-the-bad-guy (mutual blame), protest polka (pursue-withdraw cycle), and freeze-and-flee (both shut down). The underlying emotional message is always an attachment cry: "Do I matter to you? Will you be there?" Couples who can name this dynamic — "I think my attachment system just activated" — de-escalate faster and reach genuine repair rather than surface-level truce.',
  },
  {
    subcategory: 'attachment_proximity_seeking',
    source: 'Bowlby (1982); Mikulincer & Shaver (2016)',
    text: 'Proximity seeking under stress (Bowlby, 1982) is the evolutionary core of attachment. When threat is perceived — a partner\'s cold tone, an unanswered message, physical distance — the attachment system drives approach toward the attachment figure. This explains why breakups are physically painful (threat detection activates pain pathways in the brain), why people return to toxic relationships, and why being alone during illness or fear is harder than normal. Helping someone understand their proximity-seeking as a biological drive — not weakness — is foundational to compassionate self-awareness.',
  },
  {
    subcategory: 'attachment_styles_compatibility',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Attachment compatibility research shows: Secure + Secure pairings have the strongest outcomes. Secure + Anxious can work well because the secure partner\'s consistent responsiveness gradually expands the anxious partner\'s window of tolerance. Secure + Avoidant works if the avoidant partner has insight and motivation — the secure partner doesn\'t take distance personally. Anxious + Avoidant is the highest-risk pairing — each partner\'s natural response escalates the other\'s worst tendencies. Anxious + Anxious is volatile but sometimes intensely loving; Avoidant + Avoidant is low-conflict but emotionally empty.',
  },
  {
    subcategory: 'attachment_bowlby_internal_working_model',
    source: 'Bowlby (1973) Attachment and Loss Vol. 2; Collins & Read (1994)',
    text: 'Internal working models (Bowlby, 1973) are cognitive-emotional schemas built from early attachment experiences — mental maps of whether the self is worthy of love and whether others are reliably available. These models operate automatically, filtering perception and guiding behavior in new relationships. Someone with an avoidant internal working model may interpret a partner\'s reasonable need for closeness as "clingy" and threatening. Someone with an anxious model may experience a partner\'s healthy independence as abandonment. Updating internal working models requires not just insight, but lived corrective emotional experience.',
  },
  {
    subcategory: 'attachment_adult_patterns',
    source: 'Hazan & Shaver (1987); Fraley (2002)',
    text: 'Adult romantic love functions as an attachment bond (Hazan & Shaver, 1987): partners become preferred attachment figures, proximity-seeking occurs under stress, separation causes distress, and reunion brings relief. This means adult romantic relationships are not just about companionship or attraction — they carry the full biological weight of survival-level bonding. Fraley\'s (2002) research shows attachment patterns in adulthood correlate strongly (but not deterministically) with early patterns — they can be modified by experience, therapy, and conscious relationship work.',
  },
  {
    subcategory: 'attachment_window_of_tolerance',
    source: 'Siegel (1999) The Developing Mind; Ogden et al. (2006)',
    text: 'The window of tolerance (Siegel, 1999) describes the zone of arousal in which a person can function effectively — calm enough to think, activated enough to engage. Anxious-attached individuals have a narrow window biased toward hyperarousal (anxiety, panic, hypervigilance). Avoidant individuals bias toward hypoarousal (numbing, shutdown, emotional flatness). Securely attached people have the widest window. In relationships, flooding during conflict (racing heart, tunnel vision) is a sign someone has left their window. The Gottman protocol — physiological self-soothing break of 20+ minutes — is a direct intervention for this.',
  },
  {
    subcategory: 'attachment_secure_dating_behaviors',
    source: 'Levine & Heller (2010) Attached; Gottman (1999) The Seven Principles',
    text: 'Secure daters show specific behavioral signatures: they are straightforward about intentions without game-playing, they communicate discomfort directly rather than withdrawing or escalating, they feel comfortable making plans without anxiety about "coming on too strong," and they express genuine interest without fear of rejection destabilizing them. On a first date: they ask about your life with real curiosity. After a great date: they say "I had a great time, I\'d love to do this again" — without performing nonchalance or over-engineering a text. This directness often feels disarmingly refreshing to anxiously attached daters.',
  },
  {
    subcategory: 'attachment_therapy_growth',
    source: 'Johnson (2008) Hold Me Tight; Wallin (2007) Attachment in Psychotherapy',
    text: 'Attachment styles are not destiny (Wallin, 2007). Research consistently shows that insecure attachment can shift toward security through: (1) a long-term relationship with a securely attached partner who provides consistent responsiveness; (2) Emotionally Focused Therapy (EFT), the most research-backed couples therapy, which directly restructures attachment bonds; (3) individual therapy focused on narrative integration. The mechanism is the same in all three: accumulated corrective emotional experience — the repeated experience of reaching out and being met — gradually updates the internal working model.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. GOTTMAN RESEARCH — 25 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'gottman_criticism_vs_complaint',
    source: 'Gottman & Silver (1999) The Seven Principles for Making Marriage Work',
    text: 'Criticism vs. complaint (Gottman, 1999): a complaint targets a specific behavior ("You didn\'t call when you were late — I was worried"). Criticism attacks the person\'s character ("You\'re always so inconsiderate and thoughtless"). The linguistic difference is small; the relational damage is enormous. Complaints are solvable. Criticism triggers defensiveness and contempt. The fix is simple but hard: lead with how you feel and what you need ("When X happened, I felt Y — I need Z") rather than what\'s wrong with your partner. Gottman calls this a "soft startup" and it\'s one of the highest-leverage relationship skills.',
  },
  {
    subcategory: 'gottman_contempt',
    source: 'Gottman (1994) Why Marriages Succeed or Fail; Gottman & Levenson (1992)',
    text: 'Contempt is the single strongest predictor of relationship dissolution (Gottman, 1994) — more powerful than fighting frequency, sex life, or finances. It involves communicating superiority over a partner: eye-rolling, sneering, mocking, sarcasm delivered with disgust. Unlike criticism (which says "you did something wrong"), contempt says "you are fundamentally inferior." It floods the partner with shame and triggers the immune system — couples with high contempt have more frequent infectious illness. Contempt builds from unresolved negative sentiment and the feeling that problems are never acknowledged. Addressing it requires rebuilding fondness and admiration.',
  },
  {
    subcategory: 'gottman_defensiveness',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Defensiveness (Gottman, 1999) is the third horseman — the natural response to perceived attack. It takes two forms: (1) counter-attack ("Well, you always do that too"); (2) innocent victim stance ("I can\'t believe you think that about me — I try so hard"). Both block the partner\'s complaint from landing. The antidote is to accept even partial responsibility — find the grain of truth in the complaint, acknowledge it, then address it. Even "You\'re right that I\'ve been distracted lately — I\'m sorry, let\'s talk about it" disarms the escalation cycle more effectively than the most articulate self-defense.',
  },
  {
    subcategory: 'gottman_stonewalling',
    source: 'Gottman (1994) Why Marriages Succeed or Fail; Gottman & Levenson (1988)',
    text: 'Stonewalling (Gottman, 1994) — shutting down, going monosyllabic, leaving the room, or simply tuning out — looks like indifference but is physiologically the opposite. Gottman & Levenson (1988) found that stonewallers show extremely high heart rates (above 100 bpm) during conflict — they are flooded, not cold. They withdraw to prevent escalation, but the withdrawing partner perceives abandonment, which escalates the pursuing partner further. The solution is a time-out: explicitly agree to pause ("I need 30 minutes to calm down — I\'m coming back to this"), soothe the nervous system, and return. Without the explicit return commitment, time-outs breed resentment.',
  },
  {
    subcategory: 'gottman_four_horsemen',
    source: 'Gottman (1994) Why Marriages Succeed or Fail',
    text: 'Gottman\'s Four Horsemen — Criticism, Contempt, Defensiveness, Stonewalling — form a cascade (Gottman, 1994): criticism triggers defensiveness, defensiveness escalates to contempt, contempt triggers stonewalling. Each horseman has an antidote: criticism → gentle/soft startup; contempt → culture of appreciation; defensiveness → take responsibility; stonewalling → physiological self-soothing. Importantly, these patterns appear in early dating too — not just long-term relationships. Harsh startup on a second date, eye-rolling during a disagreement, or shutting down mid-conversation are early-stage signals of horseman patterns.',
  },
  {
    subcategory: 'gottman_repair_attempts',
    source: 'Gottman (1999) The Seven Principles; Gottman & DeClaire (2001)',
    text: 'Repair attempts (Gottman, 1999) are any action — verbal or nonverbal — that prevents conflict from escalating. They can be: humor ("We\'re being ridiculous right now"), vulnerability ("I feel attacked and I\'m scared"), meta-communication ("Let\'s restart this conversation"), physical touch, or explicit de-escalation ("I love you even when we fight"). Couples in stable relationships make and accept repair attempts constantly. The failure isn\'t usually in the attempt — it\'s in the receiving: when negative sentiment overflow is high, partners can\'t hear repair attempts as such, even when they\'re clearly offered.',
  },
  {
    subcategory: 'gottman_positive_sentiment_override',
    source: 'Gottman (1999) The Seven Principles; Weiss (1980)',
    text: 'Positive Sentiment Override (PSO) — originally coined by Weiss (1980), validated by Gottman — describes how couples with a strong positive baseline interpret ambiguous events charitably. A partner\'s neutral face is read as "they\'re tired" not "they\'re angry at me." A delayed text is "they\'re busy" not "they\'re pulling away." PSO acts as a filter: it takes significant negativity before it registers as a problem. Couples in distress show Negative Sentiment Override — even positive acts are interpreted with suspicion. Building PSO requires consistent, genuine positive interactions — and is the target of much of Gottman\'s prescriptive work.',
  },
  {
    subcategory: 'gottman_bids_turning_toward',
    source: 'Gottman & DeClaire (2001) The Relationship Cure',
    text: 'Bids for connection (Gottman & DeClaire, 2001) are the basic unit of emotional communication — any signal that seeks attention, affirmation, or affection from a partner. They can be: a comment about the news, pointing at something funny, a touch on the arm, a sigh. Partners respond by "turning toward" (acknowledging, engaging), "turning away" (ignoring, missing), or "turning against" (dismissing, snapping). Gottman\'s research found that couples who eventually divorce turn toward each other\'s bids only 33% of the time; stable couples turn toward 87% of the time. Most bids are quiet — the skill is learning to notice them.',
  },
  {
    subcategory: 'gottman_5to1_ratio',
    source: 'Gottman (1994) Why Marriages Succeed or Fail; Gottman & Levenson (1992)',
    text: 'The 5:1 "Magic Ratio" (Gottman, 1994): stable, happy couples maintain at least 5 positive interactions for every 1 negative interaction during conflict. The ratio drops to around 0.8:1 in couples heading toward divorce. "Positive interaction" includes humor, affection, interest, agreement, validation — not just grand gestures. "Negative interaction" includes criticism, contempt, defensiveness, and stonewalling. The ratio is especially important in conflict — not just in easy times. Couples who maintain 5:1 even during arguments can discuss anything without the relationship feeling endangered.',
  },
  {
    subcategory: 'gottman_love_maps',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Love maps (Gottman, 1999) — knowledge of a partner\'s inner psychological world: their dreams, fears, hopes, favorite music, current stresses, life goals, pet peeves, and childhood memories. Couples with rich love maps weather life transitions (job loss, having children, illness) without losing connection because they understand each other\'s inner world well enough to interpret behavior accurately. Building love maps requires ongoing curiosity — not just a deep conversation on date three, but continual updating as partners grow and change. The Love Map exercises in Gottman\'s work are simply: consistently asking about your partner\'s inner world.',
  },
  {
    subcategory: 'gottman_fondness_admiration',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'The Fondness and Admiration System (Gottman, 1999) is the antidote to contempt: the habit of scanning for and expressing what you genuinely appreciate, admire, and respect about your partner. It doesn\'t require grand declarations — "I noticed how patient you were in that conversation" or "You\'re genuinely one of the funniest people I know" are examples. Couples in distress focus on deficits; couples in stable relationships have internalized a genuine positive view of each other. This positive regard filters perception: securely admired people have more resilience to occasional conflict because they don\'t interpret criticism as evidence they\'re fundamentally unloved.',
  },
  {
    subcategory: 'gottman_early_vs_longterm_horsemen',
    source: 'Gottman (1994); Gottman & Gottman (2015) 8 Dates',
    text: 'The Four Horsemen in early dating are often subtle — and frequently mistaken for passion or honesty. Early contempt looks like: dismissing a date\'s career choice, joking about their cultural background with an edge of superiority, or eye-rolling at their music taste. Early stonewalling looks like: "going cold" after disagreement, leaving a conversation unresolved and never returning. Early criticism looks like: "You\'re always late" on the third date. Seeing these patterns early is more predictive than waiting for late-stage relationship deterioration — they don\'t appear from nowhere.',
  },
  {
    subcategory: 'gottman_physiological_soothing',
    source: 'Gottman & Levenson (1988); Gottman (1999) The Seven Principles',
    text: 'Physiological flooding (Gottman, 1999) occurs when heart rate exceeds 100 bpm during conflict — at this point, the brain\'s capacity for empathy, flexible thinking, and nuanced listening is physiologically impaired. Arguing while flooded rarely resolves anything and frequently increases damage. The prescription: a minimum 20-minute break (shorter breaks don\'t allow cortisol to clear), during which both partners do genuinely calming activities — not brooding on the argument. Returning to the conversation after self-soothing produces dramatically different outcomes: the same topic, the same people, but now with access to their prefrontal cortex.',
  },
  {
    subcategory: 'gottman_perpetual_vs_solvable',
    source: 'Gottman (1999) The Seven Principles; Gottman & Gottman (2017)',
    text: 'Gottman\'s research found that 69% of relationship conflicts are perpetual — they never get "solved" because they reflect fundamental personality differences (one partner loves quiet evenings, the other wants social activity; one wants more sex, the other less). The goal with perpetual problems is not resolution but dialogue — moving from gridlock to a position where the same difference can be discussed with humor, acceptance, or curiosity rather than pain. Couples who conflate perpetual problems with solvable problems burn enormous energy trying to change each other — which produces contempt, not solutions.',
  },
  {
    subcategory: 'gottman_gridlock',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Gridlock (Gottman, 1999) happens when a perpetual problem becomes an entrenched standoff — every discussion of the topic produces the same argument, nobody feels heard, both partners feel hopeless about it. The difference between dialogue and gridlock is not the topic — it\'s whether underlying dreams have been exposed. Gridlock always hides a core dream: the person who needs to spend Christmas with family isn\'t just stubborn — they have a deep vision of family legacy. Understanding the dream behind the position doesn\'t mean agreeing with it; it means the conversation can finally be real.',
  },
  {
    subcategory: 'gottman_dreams_within_conflict',
    source: 'Gottman & Silver (1999) The Seven Principles; Gottman & Gottman (2015) 8 Dates',
    text: 'Dreams within conflict (Gottman, 1999): beneath every entrenched position in a relationship argument is a personal narrative — a hope, value, or life vision. The partner who "refuses to compromise" on where to live isn\'t being selfish; they have a vision of home that connects to identity and safety. Gottman\'s intervention: one partner takes the role of Speaker (shares the dream, as if the other will never agree but needs to be understood), the other takes the role of Listener (asks only: "Help me understand why this is so important to you"). Revealing the dream changes the entire negotiation.',
  },
  {
    subcategory: 'gottman_shared_meaning',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Shared meaning systems (Gottman, 1999) — rituals, symbols, roles, and goals that create a culture unique to a couple — are the highest floor of the Sound Relationship House. These include: how you greet each other at the end of the day, what movies you watch together, anniversaries you mark, metaphors for your relationship, shared stories about how you met. Couples with rich shared meaning systems have a reservoir of "us-ness" that sustains the relationship through hard periods. Couples who never develop this live parallel lives without real overlap — a common path to resentment in long-term relationships.',
  },
  {
    subcategory: 'gottman_soft_startup',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Soft startup (Gottman, 1999) is how a conversation about a problem begins: without criticism, blame, or contempt. Formula: describe the situation without judgment, express how you feel using "I" (not "you"), state a positive need (what you want, not what you don\'t want). Example: "Last night when I came home and you were on your phone, I felt disconnected and a little lonely. I miss feeling close to you at the end of the day — could we have the first 20 minutes phone-free?" This is the same complaint as "You\'re always on your phone — you never care about connecting" but it produces an entirely different response.',
  },
  {
    subcategory: 'gottman_trust',
    source: 'Gottman (2011) The Science of Trust',
    text: 'Trust in relationships (Gottman, 2011) is not binary — it\'s built incrementally through what Gottman calls "attunement" moments: turning toward bids, choosing the partner\'s needs in small daily decisions, and being honest even when it\'s inconvenient. Each positive attunement moment deposits into a trust bank; each betrayal — small or large — withdraws from it. Trust is most rapidly built not in grand gestures but in the texture of ordinary daily interaction: does this person notice me? Do they take my perspective? Do they do what they say? These micro-moments compound across months into either deep trust or quiet corrosion.',
  },
  {
    subcategory: 'gottman_flooding_symptoms',
    source: 'Gottman & Levenson (1988); Gottman (1999)',
    text: 'Recognizing flooding (Gottman, 1988) in yourself or a partner during conflict: heart rate above 100 bpm (measurable with a smartwatch), tunnel vision, difficulty accessing vocabulary, feeling "stupid" or unable to articulate, hearing only the worst interpretation of everything said, impulse to escape. At this state, the conversation cannot produce understanding — it can only produce more damage. The correct response is not to argue through the flooding but to name it: "I\'m too activated right now to hear you fairly. Can we take 30 minutes and come back?" This is strength, not avoidance.',
  },
  {
    subcategory: 'gottman_sound_relationship_house',
    source: 'Gottman & Silver (1999) The Seven Principles; Gottman (2011)',
    text: 'The Sound Relationship House (Gottman, 1999) has seven floors: (1) Love Maps — knowing your partner\'s inner world. (2) Fondness & Admiration — genuine positive regard. (3) Turning Toward — responding to bids. (4) Positive Perspective — charitable interpretation. (5) Managing Conflict — using soft startup, repair, self-soothing. (6) Making Dreams Come True — supporting each other\'s visions. (7) Shared Meaning — rituals and culture of the relationship. The walls are Trust and Commitment. Strength in higher floors cannot compensate for weakness in foundation floors — couples often try to solve conflict (Floor 5) without first building love maps (Floor 1).',
  },
  {
    subcategory: 'gottman_turning_away',
    source: 'Gottman & DeClaire (2001) The Relationship Cure',
    text: 'Turning away from bids (Gottman, 2001) — missing or ignoring a partner\'s attempt for connection — is more damaging to relationships than direct conflict. The partner making the bid feels invisible, which produces resentment more powerfully than a sharp argument that at least shows the other person is engaged. Turning away is often not malicious — it\'s distraction, exhaustion, or simply not recognizing a quiet bid. The partner who says "look at that bird outside" while making dinner is making a bid; the partner who grunts without looking up is turning away. The accumulation of missed bids, over years, becomes a quiet relationship ending.',
  },
  {
    subcategory: 'gottman_rituals_of_connection',
    source: 'Gottman & Silver (1999) The Seven Principles; Gottman & Gottman (2015) 8 Dates',
    text: 'Rituals of connection (Gottman, 1999) are regular, intentional behaviors that signal "this relationship matters": the 6-second kiss when parting, the 6-minute reunion conversation (not about logistics), a weekly date night, a morning check-in, a specific way of saying goodbye. Research shows couples with strong connection rituals maintain felt closeness through periods of high stress when spontaneous connection becomes difficult. In early dating, establishing micro-rituals (a specific way of saying goodnight, a shared joke, a recurring date spot) accelerates bonding by creating the shared meaning system earlier.',
  },
  {
    subcategory: 'gottman_gottman_method',
    source: 'Gottman & Gottman (2017) The Gottman Method; Gottman (1999)',
    text: 'The Gottman Method of couples therapy (Gottman & Gottman, 2017) has the most robust outcome research of any couples intervention — two meta-analyses show significant improvement in relationship satisfaction, maintained at 1-year follow-up. Core interventions: building love maps, increasing turning-toward behavior, replacing the Four Horsemen with their antidotes, and helping couples navigate perpetual problems through dream-sharing. The method is now also applied preventively — couples who begin it before major conflict develops show significantly stronger long-term outcomes.',
  },
  {
    subcategory: 'gottman_breakup_predictors',
    source: 'Gottman & Levenson (1992); Gottman (1994) Why Marriages Succeed or Fail',
    text: 'Gottman\'s observational research achieved 93.6% accuracy in predicting which couples would divorce within 4-6 years by analyzing just 15 minutes of conflict discussion (Gottman, 1994). The predictors: presence of contempt (strongest single predictor), harsh startup in conflict discussions, failure of repair attempts, and physiological flooding with no recovery. Critically, the research found that fighting frequency is NOT a predictor — some couples fight intensely and thrive; others rarely fight and quietly disconnect. It\'s the manner and recovery of conflict, not the amount, that determines outcome.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. LOVE LANGUAGES — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'love_language_words_affirmation',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Words of Affirmation (Chapman, 1992): for people whose primary love language is verbal, the most meaningful expression of love is what is said — and what isn\'t said matters enormously. Verbal praise, encouragement, gratitude, and direct declarations of love ("I\'m so grateful you\'re in my life," "You handled that so well") fill the emotional tank. Conversely, critical, dismissive, or withheld words drain it proportionally faster than they would for other love language types. In early dating: texting genuine appreciation after a date, verbally acknowledging something specific about the person ("I love how curious you are") lands with disproportionate impact.',
  },
  {
    subcategory: 'love_language_acts_of_service',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Acts of Service (Chapman, 1992): for this love language, actions speak louder than words — tangibly. Doing something to reduce a partner\'s burden (cooking when they\'re exhausted, handling a task they\'ve been dreading, researching something so they don\'t have to) communicates love more powerfully than verbal declarations. The key is doing these things freely, not as a transaction or with resentment — "Do this or else" destroys the message. In early dating, small service acts (booking the restaurant, picking them up, solving a small problem they mentioned) register as genuine attentiveness and care.',
  },
  {
    subcategory: 'love_language_receiving_gifts',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Receiving Gifts (Chapman, 1992): for this love language, a gift is a visible symbol of thought — proof that "you were in my mind when you weren\'t in front of me." The monetary value is largely irrelevant; a postcard from a city they mentioned loving, a book because they cited an author in passing, a specific coffee order remembered — these register as deeply loving. The absence of gifts (forgetting birthdays, arriving empty-handed when a thoughtful gesture was called for) registers as emotional absence. In dating: noticing what someone mentions and producing a small, specific gift from it is one of the most attractive and differentiating behaviors possible.',
  },
  {
    subcategory: 'love_language_quality_time',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Quality Time (Chapman, 1992): for this love language, love is communicated through focused, undivided attention — not proximity, but presence. Being physically together while one partner scrolls their phone actively depletes their emotional tank. They need eye contact, active listening, and shared activities where both people are genuinely present. Quality conversation (sharing thoughts, feelings, and desires) and quality activities (doing something together with full engagement) are the two primary dialects. In dating: a simple walk with phones away communicates more love than an elaborate dinner where one person is distracted.',
  },
  {
    subcategory: 'love_language_physical_touch',
    source: 'Chapman (1992) The Five Love Languages; Field (2001) Touch',
    text: 'Physical Touch (Chapman, 1992): for this love language, physical connection is the primary emotional communication channel. Crucially, this is not primarily sexual — the love language encompasses all touch: a hand on the shoulder, sitting close, a hug when arriving, playing with hair, a hand held during a film. Research on touch (Field, 2001) confirms that appropriate non-sexual touch reduces cortisol, increases oxytocin, and activates the vagus nerve\'s calming effect. For touch-primary people, physical absence during stress or conflict feels like emotional withdrawal — their partner\'s physical presence is their regulatory system.',
  },
  {
    subcategory: 'love_language_mismatch',
    source: 'Chapman (1992) The Five Love Languages; Egbert & Polk (2006)',
    text: 'Love language mismatch (Chapman, 1992) is one of the most common sources of unspoken relationship resentment: both partners love each other, but each expresses it in their own primary language — which the other doesn\'t receive. The Words of Affirmation person says "I love you" daily but never initiates physical touch; their touch-primary partner feels unloved. The Acts of Service person handles everything practical but never verbally appreciates their partner\'s efforts; their words-primary partner feels invisible. The solution: discover your partner\'s language (by observing what they request and what they complain about) and express love in their language, not yours.',
  },
  {
    subcategory: 'love_language_discovery',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Discovering your partner\'s love language (Chapman, 1992): three reliable behavioral cues. (1) What do they complain about most? ("You never say how you feel about me" = Words; "We never just sit together" = Quality Time; "You forgot our anniversary" = Gifts.) (2) What do they request most often? ("Can you just hold me?" = Touch; "Can you take care of the car thing?" = Acts of Service.) (3) How do they naturally show love to others? People instinctively express love in the way they most want to receive it. All three methods typically converge on the same answer.',
  },
  {
    subcategory: 'love_language_early_vs_longterm',
    source: 'Chapman (1992) The Five Love Languages; Gottman & Gottman (2015) 8 Dates',
    text: 'Love language needs shift across relationship stages (Chapman, 1992): in early dating, the neurochemical high of new attraction (dopamine, norepinephrine, serotonin suppression) masks unmet love language needs — everything feels exciting. After 12-18 months, as neurochemical infatuation fades, the love language tank becomes the primary barometer of relationship satisfaction. Couples who feel inexplicably hollow after the "honeymoon phase" are often still loving each other — but now in the wrong language. Intentionally identifying and speaking each other\'s love language before the infatuation fades prevents this common transition crisis.',
  },
  {
    subcategory: 'love_language_attachment_intersection',
    source: 'Chapman (1992); Levine & Heller (2010); Wallin (2007)',
    text: 'Love languages and attachment styles interact in important ways (Wallin, 2007): anxiously attached people often have Words of Affirmation or Physical Touch as primary languages — their hyperactivated need for reassurance is most directly soothed by explicit verbal or physical closeness signals. Avoidant individuals often have Acts of Service as their primary language — they express and receive love through doing, which maintains independence while still participating in the relationship. Understanding both the love language and attachment style of a partner provides a more complete map for effective emotional communication.',
  },
  {
    subcategory: 'love_language_secondary',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Most people have a primary love language and a secondary one (Chapman, 1992) — the secondary becomes especially important during periods of stress or transition. A person whose primary language is Quality Time may need Acts of Service when overwhelmed by work (reduce their burden so they can be present). The secondary language often emerges when the primary need is temporarily met. In long-term relationships, speaking to a partner\'s secondary language during their hardest periods is often what sustains the felt sense of love through difficulty.',
  },
  {
    subcategory: 'love_language_five_dialects',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'Each love language has dialects — specific expressions within the category that resonate most. Words of Affirmation dialects: verbal compliments, written notes, public appreciation, encouragement during difficulty. Quality Time dialects: quality conversation vs. quality shared activities. Physical Touch dialects: sexual touch, holding hands, massage, sitting close, a hand on the back. Acts of Service dialects: household tasks, planning logistics, research and problem-solving. Receiving Gifts dialects: spontaneous gifts, remembering symbolic dates, thoughtful small items vs. meaningful large ones. Knowing which dialect matters to your partner multiplies the impact.',
  },
  {
    subcategory: 'love_language_tank_empty',
    source: 'Chapman (1992) The Five Love Languages',
    text: 'The "emotional tank" metaphor (Chapman, 1992): people need their primary love language to maintain a felt sense of being loved — when the tank is full, they engage from security, generosity, and warmth; when empty, they become irritable, distant, or resentful in ways that seem disconnected from specific events. Partners often interpret tank-empty behavior as personality problems rather than unmet love language needs. This reframe is transformative: "My partner is being withdrawn and critical" becomes "My partner\'s emotional tank is empty — what do they need from me?" Action from this reframe changes outcomes.',
  },
  {
    subcategory: 'love_language_cultural_context',
    source: 'Chapman (1992); Matsumoto (1994) People: Psychology from a Cultural Perspective',
    text: 'Love language expression is shaped by culture (Matsumoto, 1994): in many East Asian and Latin American cultures, Acts of Service is the predominant cultural love language — family members show love by providing for each other practically, not verbally. Expecting verbal expressions of love from a partner whose cultural template is Acts of Service creates misread signals. Similarly, Physical Touch norms vary enormously by culture — public touch is natural in Mediterranean cultures and uncomfortable in many Northern European and East Asian contexts. Reading love language through cultural context prevents misattributing cultural norms to individual emotional deficits.',
  },
  {
    subcategory: 'love_language_self_love',
    source: 'Chapman (2011) The Five Love Languages of Children; Neff (2011) Self-Compassion',
    text: 'Self-love through love languages (Chapman, 2011): you can apply love language principles to yourself. If your primary language is Words of Affirmation, practice deliberate self-encouragement and journaling appreciation for yourself. If Acts of Service, deliberately reduce your own burden (delegate, simplify). If Quality Time, schedule genuine alone time that is fully present, not distraction. People who understand their own love language and meet those needs partially from within are less dependent on a partner to feel worthy — which paradoxically makes them more attractive and more capable of healthy partnership.',
  },
  {
    subcategory: 'love_language_compatibility_matrix',
    source: 'Chapman (1992) The Five Love Languages; research across compatibility studies',
    text: 'Love language compatibility: same-language pairings (Words + Words, Touch + Touch) have the easiest time naturally meeting each other\'s needs but may lack complementarity. Cross-language pairings require intentional learning but can create beautiful reciprocity. Most challenging combinations: one partner\'s primary is Physical Touch, the other is Words of Affirmation (different channels entirely — one needs body, other needs voice). Most compatible cross-pairings: Acts of Service + Quality Time (both appreciate the other\'s investment of time and effort, just in different forms). No pairing is incompatible — awareness and willingness to stretch determine the outcome.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. STERNBERG TRIANGULAR THEORY — 10 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'sternberg_intimacy',
    source: 'Sternberg (1986) A Triangular Theory of Love; Sternberg (1997)',
    text: 'Intimacy (Sternberg, 1986) is the first vertex of the love triangle: the feeling of closeness, connectedness, and bondedness — the experience of being truly known and accepted. Sternberg identified 10 components: desire to promote the partner\'s wellbeing, happiness with the partner, high regard, being able to count on the partner in need, mutual understanding, sharing of self and possessions, emotional support, intimate communication, and valuing the partner in life. Intimacy grows slowly — it requires accumulated shared experience, vulnerability, and consistent responsiveness. It\'s the component most responsible for feelings of warmth and friendship in a relationship.',
  },
  {
    subcategory: 'sternberg_passion',
    source: 'Sternberg (1986) A Triangular Theory of Love',
    text: 'Passion (Sternberg, 1986) is the second vertex: the drives that lead to romance, physical attraction, and sexual consummation — what Sternberg calls the "hot" component of love. It activates fastest — present on a first meeting — and declines fastest. The passion curve follows a dopamine-driven pattern: peak early, then habituation. Crucially, Sternberg found that passion is addictive: withdrawal from a passionate relationship produces genuine withdrawal symptoms. After a break-up, the person is not missed so much as the passion state they induced. Understanding passion\'s trajectory prevents its decline from being misinterpreted as loss of love.',
  },
  {
    subcategory: 'sternberg_commitment',
    source: 'Sternberg (1986) A Triangular Theory of Love',
    text: 'Commitment (Sternberg, 1986) is the cognitive component of love — the decision to love someone (short-term) and the commitment to maintain that love (long-term). It builds slowly, peaks later than passion, and in stable relationships becomes the most stable component. Commitment without intimacy or passion is empty love — the couple stays together from obligation. Commitment with passion but without intimacy is fatuous love — the whirlwind romance that leads to quick marriage and high divorce. Commitment combined with intimacy (companionate love) is what sustains most long-term successful relationships after passion has habituated.',
  },
  {
    subcategory: 'sternberg_seven_types',
    source: 'Sternberg (1986, 1997) A Triangular Theory of Love',
    text: 'Sternberg\'s seven types of love emerge from the presence/absence of each vertex: (1) Liking = Intimacy only; (2) Infatuated Love = Passion only; (3) Empty Love = Commitment only; (4) Romantic Love = Intimacy + Passion; (5) Companionate Love = Intimacy + Commitment; (6) Fatuous Love = Passion + Commitment; (7) Consummate Love = all three. Most relationships don\'t fit neatly into one type — they shift between types as each component waxes and wanes. Many "breakups" are actually transitions between types: Romantic Love → Companionate Love is often experienced as "falling out of love" but is actually a deepening into sustained commitment.',
  },
  {
    subcategory: 'sternberg_passion_decay',
    source: 'Sternberg (1986); Fisher (2004) Why We Love; Aron et al. (2005)',
    text: 'Passion decay curve (Sternberg, 1986; Fisher, 2004): passionate love peaks in the first 12-18 months, then declines as the brain habituates to the partner and dopamine normalization occurs. This is not failure — it is biology. The decline of passion is often the most painful and confusing transition in long-term relationships: couples who equate the passionate high with "true love" interpret its fading as evidence the relationship has died. Understanding that companionate love (intimacy + commitment) is a different, more stable form of love — not a lesser one — is one of the most important reframes in relationship education.',
  },
  {
    subcategory: 'sternberg_intimacy_growth',
    source: 'Sternberg (1986); Reis & Shaver (1988)',
    text: 'Intimacy\'s growth curve (Sternberg, 1986) is the inverse of passion: slow to build, requires consistent mutual vulnerability and responsiveness, but once established is highly stable. Reis & Shaver (1988) found that intimacy requires a specific process: Person A discloses something meaningful → Person B responds with understanding, validation, and care → Person A feels understood → repeat. Each cycle deepens intimacy slightly. This process cannot be rushed — attempts to accelerate intimacy (too much too fast) often trigger withdrawal rather than closeness. In dating, the willingness to disclose progressively more vulnerable content — and the partner\'s responsive handling of each disclosure — is the engine of real intimacy.',
  },
  {
    subcategory: 'sternberg_consummate_love',
    source: 'Sternberg (1986, 1997)',
    text: 'Consummate love (Sternberg, 1986) — the complete triangle of intimacy, passion, and commitment — is the ideal but not the common long-term reality. Sternberg notes that maintaining consummate love requires ongoing active investment: intimacy needs continued sharing and responsiveness; passion requires novelty, creativity, and prioritizing the erotic; commitment needs conscious choice and renewal. Couples who achieve consummate love long-term are not those who "got lucky" — they are those who consistently invest in all three vertices as separate domains requiring separate attention, not a unified "relationship" resource pool.',
  },
  {
    subcategory: 'sternberg_relationship_stages_mapping',
    source: 'Sternberg (1986); Fisher (2004); Gottman (1999)',
    text: 'Mapping Sternberg\'s triangle to relationship stages: Weeks 1-6 (Lust/Infatuation): passion dominant, intimacy building, commitment absent. Months 2-12 (Romantic Love): passion still high, intimacy growing through shared experience, early commitment signals. Year 1-3 (Maturation): passion habituating, intimacy deepening, commitment crystallizing — this period is when most relationships end or stabilize. Year 3+ (Companionate or Consummate): passion present but cyclical (not constant), intimacy rich, commitment firm. Couples who only value passionate intensity will not survive the Year 1-3 transition without active effort.',
  },
  {
    subcategory: 'sternberg_imbalance',
    source: 'Sternberg (1986, 1997) A Triangular Theory of Love',
    text: 'Triangle imbalance (Sternberg, 1997): when two partners experience different levels of each component, the imbalance creates specific relationship distress. Partner A has high passion, low commitment; Partner B has high commitment, low passion → one partner feels trapped, the other feels used. Partner A has high intimacy, low passion; Partner B has high passion, low intimacy → one partner feels like roommates, the other feels unheard. Making imbalances explicit — "I think we\'re at different places in what we want from this" — is more honest and useful than hoping the other person\'s triangle will shift to match.',
  },
  {
    subcategory: 'sternberg_love_as_story',
    source: 'Sternberg (1998) Love Is a Story',
    text: 'Sternberg\'s later work — Love Is a Story (1998) — proposes that each person holds an unconscious love story (template): Prince/Princess, Business Partnership, War, Garden, Addiction, Travel, Science, etc. These templates determine who we find attractive, how we interpret relationship events, and what "good relationship" means. Two people can be highly compatible on the triangle (similar levels of intimacy, passion, commitment needs) but incompatible on their love story (one needs a rescue narrative, the other needs equality). Understanding your own love story template — and a partner\'s — reveals compatibility at a deeper level than surface preferences.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 5. RELATIONSHIP STAGES — 20 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'stages_knapp_initiating',
    source: 'Knapp (1978) Social Intercourse: From Greeting to Goodbye',
    text: 'Initiating stage (Knapp, 1978): the first step in relationship formation — making first contact and creating a favorable impression. Communication is formulaic: greetings, small talk, safe topics. The goal is to signal friendliness and openness while gathering initial information. In dating apps, the initiating stage is the opening message exchange: profile review, icebreaker, initial response. Failure here — poor opening message, slow response, low-effort profile — prevents access to the richer stages. Research shows the first 30 seconds of any interaction carry disproportionate weight in first impression formation.',
  },
  {
    subcategory: 'stages_knapp_experimenting',
    source: 'Knapp (1978) Social Intercourse; Knapp & Vangelisti (2009)',
    text: 'Experimenting stage (Knapp, 1978): partners explore each other through small talk and careful disclosure — testing compatibility by exchanging demographic and biographical information, looking for commonalities. Most relationships never leave this stage (acquaintances). Those that progress develop a sense of ease — the conversation doesn\'t require effort. In dating, the experimenting stage spans the first few dates: discovering shared interests, backgrounds, values. The willingness to leave safety topics (hobbies, work) for more revealing territory (family dynamics, fears, aspirations) signals readiness for the next stage.',
  },
  {
    subcategory: 'stages_knapp_intensifying',
    source: 'Knapp (1978) Social Intercourse',
    text: 'Intensifying stage (Knapp, 1978): the relationship deepens. Markers: increased disclosure frequency and depth, terms of endearment, "we" language, physical touch increases, couple activities, gentle testing of deeper commitment ("This would be fun to do together again someday..."). Uncertainty is high — both partners are investing more without explicit confirmation of reciprocity. In modern dating, this is the most anxiety-producing stage: the ambiguity between "seeing each other" and "exclusive" creates attachment system activation in both anxious and avoidant individuals, for different reasons.',
  },
  {
    subcategory: 'stages_knapp_integrating',
    source: 'Knapp (1978) Social Intercourse; Knapp & Vangelisti (2009)',
    text: 'Integrating stage (Knapp, 1978): partners develop a relational identity — they are seen as a couple by others, social networks begin to overlap, possessions and spaces may be shared. Each partner\'s identity starts to incorporate the other. In dating: being introduced to friends and family, having a "spot" together, being referenced in each other\'s social media. Psychologically, this requires both partners to have enough identity security to integrate without losing themselves — couples who skip this stage (going from experimenting to bonding) often face integration crises later when individuation conflicts emerge.',
  },
  {
    subcategory: 'stages_knapp_bonding',
    source: 'Knapp (1978); Perel (2006) Mating in Captivity',
    text: 'Bonding stage (Knapp, 1978): formal, public commitment — engagement, marriage, domestic partnership, or explicit cohabitation. Communication becomes ritualized; roles are established; shared meaning systems are fully operational. This stage is stable but requires active maintenance. Perel (2006) notes that bonding creates the security paradox: the very safety created by commitment can reduce the erotic tension that sustained earlier stages. The challenge of bonding is maintaining desire within security — aliveness within familiarity.',
  },
  {
    subcategory: 'stages_knapp_differentiating',
    source: 'Knapp (1978) Social Intercourse',
    text: 'Differentiating stage (Knapp, 1978): the first of the five coming-apart stages. Partners begin reasserting individual identity after integration: "I need my own space," "We\'re different in this way," increased emphasis on the self within the couple. This is not necessarily destructive — in fact, healthy differentiation (Perel, 2006) is necessary for sustained desire and autonomy. It becomes problematic when partners frame differences as incompatibilities rather than sources of richness, or when differentiation is driven by contempt rather than healthy self-assertion.',
  },
  {
    subcategory: 'stages_knapp_circumscribing',
    source: 'Knapp (1978) Social Intercourse; Knapp & Vangelisti (2009)',
    text: 'Circumscribing stage (Knapp, 1978): topics become restricted — certain conversations are avoided to prevent conflict. Communication decreases in quality and quantity. Partners develop "safe zones" of conversation while entire domains become off-limits. This stage is insidious because it feels like peacekeeping: avoiding fights = avoiding the relationship ending. But circumscribing steadily reduces real communication until partners are sharing space but not lives. Many couples in long-term relationships become circumscribed without recognizing it — they stop having certain conversations not from resolution but from resignation.',
  },
  {
    subcategory: 'stages_knapp_stagnating',
    source: 'Knapp (1978) Social Intercourse',
    text: 'Stagnating stage (Knapp, 1978): the relationship is marking time without movement. Partners know what the other will say before they speak; interactions feel scripted and hollow; each person privately questions whether the relationship serves them. Communication is flat, frequent silences are not comfortable but resigned. Many couples live in this stage for years — especially when children, finances, or social norms create exit barriers. The stagnation is often experienced as a "mystery" (nothing specific is wrong) but results from accumulated unaddressed circumscribing.',
  },
  {
    subcategory: 'stages_fisher_lust',
    source: 'Fisher (2004) Why We Love; Fisher et al. (2005)',
    text: 'Lust stage (Fisher, 2004): the sex drive, driven primarily by testosterone and estrogen, motivates the search for any suitable partner. It is non-specific and can coexist with other romantic or attachment systems. In early dating, lust-driven attraction creates the initial motivation to approach, initiate contact, and invest energy. Fisher\'s fMRI research found that thinking about a person in the lust stage activates the hypothalamus and limbic system — regions associated with basic drive states. Lust does not require specific attraction or emotional resonance; it is the broad-spectrum motivator that gets people into dating spaces.',
  },
  {
    subcategory: 'stages_fisher_attraction',
    source: 'Fisher (2004) Why We Love; Fisher et al. (2005)',
    text: 'Attraction stage (Fisher, 2004): focused, motivated pursuit of a specific individual. Neurologically driven by elevated dopamine (reward, craving, motivation) and norepinephrine (elevated energy, reduced appetite, focused attention) — and suppressed serotonin (obsessive thinking). fMRI imaging shows activation of the ventral tegmental area (VTA) and caudate nucleus — the same reward circuits activated by cocaine. This explains the intrusive thoughts, sleeplessness, and loss of appetite of early love: the person is experiencing genuine dopaminergic reward-circuit activation. The attraction stage typically lasts 1-3 years before neurochemistry shifts.',
  },
  {
    subcategory: 'stages_fisher_attachment_phase',
    source: 'Fisher (2004) Why We Love; Carter (1998)',
    text: 'Long-term attachment stage (Fisher, 2004): the third neuroscience stage of love, driven by oxytocin (bonding, trust, calm) and vasopressin (pair-bonding, mate guarding). These systems activate through extended physical contact, shared experiences, and emotional responsiveness. The attachment stage produces feelings of calm, security, and comfort — less intense than attraction but more stable. Carter\'s (1998) research on prairie voles (pair-bonding mammals) shows that vasopressin blockade prevents long-term pair bonding even when attraction is present — the attachment system is neurochemically distinct from the attraction system.',
  },
  {
    subcategory: 'stages_dopamine_novelty',
    source: 'Fisher (2004) Why We Love; Bardo et al. (1996)',
    text: 'Dopamine and novelty in early attraction (Bardo et al., 1996): the dopamine system is a novelty-and-reward detection system — it fires maximally to unpredictable rewards. This is why early relationships feel euphoric (unpredictability keeps dopamine high) and why the "honeymoon phase" fades (predictability = habituation = lower dopamine). Practically: the intense feelings of early attraction are a neurochemical state, not a reliable guide to long-term compatibility. Decisions made during peak attraction-stage dopamine activation (moving in together after 6 weeks, getting engaged after 3 months) often regret the high-state decisions when neurochemistry normalizes.',
  },
  {
    subcategory: 'stages_oxytocin_bonding',
    source: 'Fisher (2004) Why We Love; Uvnas-Moberg (2003) The Oxytocin Factor',
    text: 'Oxytocin bonding (Uvnas-Moberg, 2003): released during extended physical touch, eye contact, synchronized activity, and shared positive experience. In dating, oxytocin builds through: sustained physical closeness (walking side by side, sitting close, brief touch), making eye contact during conversation, and sharing novel or mildly stressful experiences together (a rollercoaster, a challenging hike) — which the brain associates with the person present. This is why activities that create mild arousal accelerate bonding: the brain labels the physiological activation as attraction to the companion. The Aron et al. (1997) bridge study found that men were more attracted to a woman after crossing a rickety bridge with her than a stable one.',
  },
  {
    subcategory: 'stages_nre_idealization',
    source: 'Fisher (2004) Why We Love; Murray et al. (1996)',
    text: 'New Relationship Energy (NRE) and idealization: during the attraction stage, partners perceive each other through a bias of positive attributes — literally noticing and encoding positive information more readily than negative. Murray et al. (1996) found that partners in early relationships hold more idealized views of each other than partners themselves hold of themselves. This idealization is functional: it motivates investment and bond formation. But it creates a reality gap: the partner being idealized will inevitably show their actual complexity, and the "disillusionment" phase (3-6 months) is not the relationship breaking — it\'s the relationship becoming real.',
  },
  {
    subcategory: 'stages_reality_testing',
    source: 'Fisher (2004); Gottman (1999); Murray et al. (1996)',
    text: 'Reality testing phase (3-6 months): as serotonin normalizes (reducing obsessive idealization), couples begin to see each other more accurately. Partners notice habits that were invisible before, have first real conflicts, encounter disappointments. Many relationships end here — not because they were incompatible, but because the transition from NRE to real relationship is misread as love dying. Couples who understand this phase as a maturation (from fantasy to genuine intimacy) are more likely to continue and deepen the relationship. Gottman\'s research confirms: how couples navigate their first real conflict is more predictive of future success than how they feel in early idealization.',
  },
  {
    subcategory: 'stages_perel_individuation',
    source: 'Perel (2006) Mating in Captivity; Perel (2017) The State of Affairs',
    text: 'Individuation in long-term relationships (Perel, 2006): maintaining a distinct self — with separate friendships, interests, interior life, and sources of meaning — is not a threat to partnership but a prerequisite for sustained desire. Perel\'s paradox: we are most attracted to partners who have a life we don\'t fully control or possess. Total merger (enmeshment) creates safety but eliminates mystery; total separateness eliminates intimacy. The erotic thrives in the space between familiarity and mystery, between belonging and yearning. Couples who cultivate independent lives and come together with genuine stories to tell sustain desire longer.',
  },
  {
    subcategory: 'stages_perel_erotic_intelligence',
    source: 'Perel (2006) Mating in Captivity',
    text: 'Erotic intelligence (Perel, 2006): the capacity to maintain aliveness and playfulness in a long-term relationship — to hold the lover\'s gaze while also being seen. Perel identifies that desire is not triggered by domestic closeness but by distance, mystery, and seeing the partner in their element — confident, engaged, competent, fully themselves. Practical cultivation: allowing the partner to have experiences without you, being genuinely interested in their inner life (not possessively controlling it), creating contexts where they can surprise you. Fire needs air — smothering a relationship with total togetherness extinguishes the erotic.',
  },
  {
    subcategory: 'stages_mystery_security',
    source: 'Perel (2006) Mating in Captivity; Sternberg (1986)',
    text: 'The mystery vs. security tension (Perel, 2006): romantic love evolved to secure a bond (security) but erotic desire evolved to energize pursuit (mystery). These two drives are fundamentally in tension. Security says: "I know you. I trust you. You\'re mine." Desire says: "I want to discover you. You surprise me. I\'m drawn toward you." Long-term couples who maintain desire have developed the capacity to hold both simultaneously — to be each other\'s safe haven and also to remain, in some essential way, unknown. This requires accepting a level of uncertainty about the partner that is uncomfortable but erotically alive.',
  },
  {
    subcategory: 'stages_fisher_personality_types',
    source: 'Fisher (2009) Why Him? Why Her?',
    text: 'Fisher\'s four personality types (2009) — driven by dominant neurotransmitter systems: Explorer (dopamine-dominant): curious, novelty-seeking, creative, risk-taking. Builder (serotonin-dominant): calm, loyal, concrete, community-oriented. Director (testosterone-dominant): analytical, direct, competitive, decisive. Negotiator (estrogen-dominant): empathetic, imaginative, linguistically skilled, consensus-seeking. Fisher\'s research found Explorers attract Explorers; Builders attract Builders; but Directors and Negotiators are mutually attracted (complementarity). Each type communicates differently, expresses love differently, and handles conflict differently — knowing your type and your partner\'s provides a practical compatibility language.',
  },
  {
    subcategory: 'stages_commitment_decision',
    source: 'Knapp (1978); Arriaga & Agnew (2001); Rusbult (1980)',
    text: 'Commitment as active decision (Rusbult, 1980): Rusbult\'s Investment Model shows commitment is predicted by: (1) satisfaction level (how rewarding is the relationship?); (2) quality of alternatives (what else is available?); (3) investment size (how much have I put in?). High commitment results from high satisfaction + poor alternatives + significant investment — not from love alone. This explains why unhappy couples stay (high investment, few alternatives) and happy couples leave (strong alternatives, lower investment). Understanding commitment as a tripartite decision — not just a feeling — allows for more conscious relationship navigation.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. COMMUNICATION IN COUPLES — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'communication_active_listening',
    source: 'Rogers (1961) On Becoming a Person; Gottman & DeClaire (2001)',
    text: 'Active listening (Rogers, 1961) is not passive hearing — it is a deliberate practice: full attention on the speaker, suspension of preparing a response while the other talks, reflection of content and emotion ("It sounds like you felt dismissed when that happened"), and validation of the emotional experience as understandable (not necessarily agreeable). Gottman & DeClaire (2001) found that in healthy couples, "turning toward" bids involves brief active listening responses — even a "mm-hm, really?" delivered with genuine attention strengthens connection. The absence of active listening — appearing physically present but cognitively absent — is one of the most common relationship complaints.',
  },
  {
    subcategory: 'communication_i_statements',
    source: 'Gordon (1970) Parent Effectiveness Training; Gottman (1999)',
    text: '"I" statements vs. "You" accusations (Gordon, 1970): "You never listen to me" triggers defensiveness — it\'s a character accusation that demands the partner defend themselves. "I feel unheard when I\'m talking and you\'re on your phone" is the same observation delivered as personal experience — harder to counter, easier to respond to with empathy. The formula: "I feel [emotion] when [specific behavior] because [personal impact]." The critical element is specificity of behavior (not "you always" or "you never") and emotion ownership (not "I feel that you\'re being selfish" which is a disguised "you" statement).',
  },
  {
    subcategory: 'communication_nvc',
    source: 'Rosenberg (2003) Nonviolent Communication',
    text: 'Nonviolent Communication (Rosenberg, 2003) — the OFNR model: Observation (what I see/hear, without evaluation), Feeling (what I feel, without diagnosis), Need (the universal need behind the feeling), Request (specific, positive, present-tense action). Example: "When I saw three dishes left in the sink this morning [O], I felt frustrated [F] because I need us to share the workload so neither of us is carrying it alone [N]. Would you be willing to handle the dishes tonight? [R]" NVC research shows that framing needs explicitly — rather than implying them through complaints — reduces defensive responding by 40-60%.',
  },
  {
    subcategory: 'communication_meta_communication',
    source: 'Watzlawick et al. (1967) Pragmatics of Human Communication; Gottman (1999)',
    text: 'Meta-communication — talking about how you communicate — is one of the most powerful relationship skills and one of the least practiced. Examples: "I notice we always get stuck in the same loop when we talk about money — can we talk about why that happens?"; "When you go quiet after a disagreement, I don\'t know how to read it — what does that usually mean for you?"; "I want to bring something up but I\'m not sure it\'ll land well — can I try?" Meta-communication requires a pause from the first-order conversation and a shift to observer perspective. Couples who can meta-communicate are never truly stuck.',
  },
  {
    subcategory: 'communication_emotional_flooding',
    source: 'Gottman & Levenson (1988); van der Kolk (2014) The Body Keeps the Score',
    text: 'Emotional flooding in arguments (Gottman & Levenson, 1988): when heart rate exceeds 100 bpm, the prefrontal cortex\'s regulatory capacity is overwhelmed by the limbic system\'s threat response. At this point, the person literally cannot access empathy, nuanced thinking, or creative problem-solving. The body is in fight-or-flight mode — optimized for threat response, not relational repair. Arguments that continue past the flooding threshold produce only damage, never resolution. The physiological marker (elevated heart rate) is more reliable than the subjective sense of "I\'m fine" — flooding often feels like anger or determination, not panic.',
  },
  {
    subcategory: 'communication_20_minute_rule',
    source: 'Gottman (1999) The Seven Principles; Sapolsky (2004) Why Zebras Don\'t Get Ulcers',
    text: 'The 20-minute self-soothing rule (Gottman, 1999): cortisol and adrenaline released during emotional flooding take a minimum of 20 minutes to clear from the bloodstream (Sapolsky, 2004). Taking a break shorter than 20 minutes — or using break time to rehearse arguments — does not produce genuine physiological recovery. Effective self-soothing: slow diaphragmatic breathing, physical movement (a walk), music, distraction that genuinely engages the mind. The break must be explicitly agreed to with a commitment to return ("I need 30 minutes — I\'m not done with this conversation, I just need to calm down") to prevent the time-out from being experienced as stonewalling.',
  },
  {
    subcategory: 'communication_synchronous_async',
    source: 'Turkle (2015) Reclaiming Conversation; Gottman (1999)',
    text: 'Synchronous vs. asynchronous communication in relationships (Turkle, 2015): synchronous (voice, video, in-person) allows real-time emotional attunement — tone, pace, non-verbal cues, and immediate repair. Asynchronous (text, messaging) allows time for reflection but loses emotional bandwidth. Heavy reliance on text for emotional conversations removes 93% of communication signal (tone, facial expression, body language). Difficult conversations — conflict, needs, emotional vulnerability — should be asynchronous only as a scheduling tool ("Can we talk tonight?"), not as the venue. The discomfort of voice or in-person conversation is the productive discomfort of real intimacy.',
  },
  {
    subcategory: 'communication_disclosure_reciprocity',
    source: 'Derlega et al. (1993) Self-Disclosure; Jourard (1971)',
    text: 'Disclosure reciprocity (Jourard, 1971): vulnerability invites vulnerability — when one person discloses something meaningful, the other is psychologically primed to match the depth. This is the engine of intimacy building. In dating, this creates a practical protocol: disclose slightly more than feels comfortable, then pause — this invites the partner to reciprocate. Disclosure is most effective when it\'s calibrated to relationship stage (over-sharing on date one can overwhelm; under-sharing at month three signals avoidance). The goal is a gradual, mutually paced deepening where each disclosure is met with interest and reciprocation.',
  },
  {
    subcategory: 'communication_yes_and',
    source: 'Johnstone (1979) Impro; Gottman (1999)',
    text: 'The "Yes, and" technique from improv theatre (Johnstone, 1979) applied to romantic conversation: instead of blocking a partner\'s conversational offering ("I was thinking we could try that new restaurant" → "I don\'t really like that cuisine"), accept and build ("Yes, and we could also check out that rooftop bar nearby"). "Yes, and" keeps conversational energy flowing and signals genuine engagement. In conflict: "Yes, I can see your point, and I also need you to understand..." is more connective than "But..." or "However..." Accepting the partner\'s frame as a valid starting point — even when disagreeing — dramatically reduces defensive escalation.',
  },
  {
    subcategory: 'communication_aron_36_questions',
    source: 'Aron et al. (1997) The Experimental Generation of Interpersonal Closeness',
    text: 'Aron\'s 36 Questions (1997): a structured self-disclosure protocol where two people answer increasingly intimate questions. Research found that pairs who completed all 36 questions reported feeling closer to a stranger than they did to any of their existing acquaintances after the 45-minute exercise. The mechanism is the disclosure reciprocity loop — each question invites both parties to share progressively more vulnerable content. The 36 questions are structured in three escalating sets (small bets → medium vulnerability → deep values/fears/gratitude). They work in dating because they fast-track the intimacy-building process that normally requires months of unstructured interaction.',
  },
  {
    subcategory: 'communication_repair_strategies',
    source: 'Gottman (1999) The Seven Principles; Gottman & DeClaire (2001)',
    text: 'Conversation repair strategies (Gottman, 1999): specific phrases that de-escalate conflict and signal a desire to repair rather than win: "I\'m sorry, let me try again." / "I know this isn\'t your fault." / "Let me try to say that differently." / "I\'m getting overwhelmed — can we slow down?" / "I love you even in this moment." / "I think I started this in the wrong way." / "I\'m feeling attacked. Can we try another approach?" Research found that these phrases are not magic — their effectiveness depends on the positive sentiment baseline of the relationship. In high-contempt relationships, even excellent repair attempts are rejected.',
  },
  {
    subcategory: 'communication_timing',
    source: 'Gottman & Silver (1999) The Seven Principles',
    text: 'Timing of difficult conversations (Gottman, 1999): the worst times to bring up a difficult topic: immediately after one partner walks in the door (cortisol still elevated from work), during or after a large family event, when either partner is hungry or tired, immediately before sleep, and when either person is emotionally flooded from something unrelated. The best times: a scheduled conversation (both consented), when both partners are physiologically calm, have adequate time, and are not in mid-task. The advance scheduling ("I\'d like to talk about something tonight — is 8pm ok?") removes the ambush element, allowing the other person to prepare emotionally rather than react defensively.',
  },
  {
    subcategory: 'communication_digital_dating',
    source: 'Turkle (2015) Reclaiming Conversation; Hertlein & Stevenson (2010)',
    text: 'Digital communication in modern dating (Turkle, 2015; Hertlein & Stevenson, 2010): texting has become the primary relationship medium of early dating — but it strips out the emotional bandwidth (tone, timing, face, body) that humans evolved to read. Expectations: response time under 1 hour signals high interest; over 4 hours signals low interest or anxiety management. Length signals engagement: short responses to long messages can indicate disinterest. Read receipts + no response = high anxiety trigger. The practical advice: escalate to voice call as soon as possible (ideally by date 2-3) and establish in-person meeting within 7-10 days — before text chemistry either inflates or deflates realistic connection.',
  },
  {
    subcategory: 'communication_validation',
    source: 'Linehan (1993) Cognitive-Behavioral Treatment of Borderline Personality; Gottman (1999)',
    text: 'Validation in communication (Linehan, 1993) means communicating that a partner\'s emotional experience makes sense — given their history, perspective, and situation — without necessarily agreeing that their interpretation is correct. Levels of validation: (1) listening attentively; (2) accurate reflection; (3) "that makes sense given what you\'ve been through"; (4) sharing a similar feeling; (5) acknowledging the current validity of the reaction. Validation does not mean agreement. "I can see why you\'d feel that way" is not "You\'re right." Couples who confuse disagreement with invalidation escalate conflicts unnecessarily; those who validate before problem-solving de-escalate consistently.',
  },
  {
    subcategory: 'communication_listening_to_respond',
    source: 'Covey (1989) The 7 Habits of Highly Effective People; Gottman (1999)',
    text: 'Listening to respond vs. listening to understand (Covey, 1989): most people, while their partner is speaking, are internally preparing their next argument, defense, or rebuttal. This makes them unable to genuinely hear the partner\'s actual emotional message. The shift: train yourself to stay fully with the speaker until they are completely done, then pause before formulating a response. Even 3 seconds of genuine reflection changes the quality of the response. Partners who feel genuinely heard — even if the response eventually disagrees — experience significantly less resentment than those who feel spoken at. Being understood is a deeper human need than being agreed with.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 7. COMPATIBILITY SCIENCE — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'compatibility_similarity_attraction',
    source: 'Byrne (1971) The Attraction Paradigm; Montoya & Horton (2013)',
    text: 'Similarity-attraction effect (Byrne, 1971): across cultures, people are more attracted to those who share their attitudes, values, and interests. The effect is strongest for: (1) values (political, moral, life-philosophy); (2) activity preferences; (3) personality traits (especially introversion/extroversion). Montoya & Horton\'s (2013) meta-analysis of 313 studies confirms the effect is robust but strongest in early-stage relationships — similarity in values predicts long-term satisfaction; similarity in activities predicts short-term attraction. The mechanism: agreement with our worldview confirms that we perceive reality correctly, which is intrinsically rewarding.',
  },
  {
    subcategory: 'compatibility_complementarity',
    source: 'Winch (1958) Mate Selection; Murstein (1976) Who Will Marry Whom?',
    text: 'The complementarity hypothesis — "opposites attract" (Winch, 1958): the idea that people seek partners whose traits complement rather than mirror their own (dominant + submissive, extrovert + introvert). Research is mixed: Winch\'s original work was not replicated by subsequent large-scale studies. The current scientific consensus (Murstein, 1976; Luo & Klohnen, 2005): similarity is a stronger predictor of attraction and long-term satisfaction than complementarity. However, functional complementarity in specific domains (one partner handles finances, other handles social planning) is associated with relationship satisfaction — not because they are opposite, but because they create a complementary team.',
  },
  {
    subcategory: 'compatibility_values_alignment',
    source: 'Luo & Klohnen (2005); Gottman & Gottman (2015) 8 Dates',
    text: 'Values alignment vs. personality similarity in compatibility (Luo & Klohnen, 2005): couples who share core values (family, religion, financial philosophy, political worldview, relationship structure) have better long-term outcomes than those who share personality traits or activity preferences. Personality similarity predicts initial attraction; values alignment predicts long-term satisfaction and reduced conflict. Gottman & Gottman (2015) emphasize that misaligned core values produce the perpetual problems most likely to result in gridlock and relationship termination — specifically: money, sex, family-of-origin expectations, and philosophy of life.',
  },
  {
    subcategory: 'compatibility_attachment_secure_secure',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Secure + Secure pairing (Levine & Heller, 2010): the gold-standard attachment compatibility. Both partners can express needs directly without escalating to protest behavior or deactivating strategies. Conflict is handled with soft startup, active listening, and genuine repair. Each person functions as a safe haven and secure base for the other. Secure individuals are more likely to be satisfied with a wider range of partners — their regulatory capacity allows them to navigate partner imperfections without fundamental destabilization. If both partners are securely attached, relationship problems are real and solvable, not amplified by attachment-system interference.',
  },
  {
    subcategory: 'compatibility_attachment_secure_anxious',
    source: 'Levine & Heller (2010) Attached; Johnson (2008) Hold Me Tight',
    text: 'Secure + Anxious pairing (Levine & Heller, 2010): can work well when both partners have insight. The secure partner\'s consistent responsiveness — turning toward bids even when tired, not playing games with availability, expressing care explicitly — gradually expands the anxious partner\'s window of tolerance. The anxious partner gradually learns that this person will be there, which reduces hyperactivation. Key requirement: the secure partner must not take protest behaviors personally (and avoid the trap of withdrawing in response to clinginess) and the anxious partner must work on self-soothing to reduce demand on the secure partner\'s emotional resources.',
  },
  {
    subcategory: 'compatibility_attachment_secure_avoidant',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Secure + Avoidant pairing (Levine & Heller, 2010): viable when the secure partner has high self-awareness and doesn\'t interpret avoidant withdrawal as personal rejection. The secure partner can give space without feeling abandoned and can gently name the pattern without shaming. The avoidant partner needs to develop awareness of their deactivating strategies and make explicit effort to turn toward when proximity-seeking bids are made. The risk: if the secure partner repeatedly accommodates avoidance without reciprocal growth from the avoidant partner, they begin to accumulate resentment and may gradually shift toward pursuing behaviors that push the avoidant further away.',
  },
  {
    subcategory: 'compatibility_attachment_anxious_avoidant',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Anxious + Avoidant pairing — the highest-risk combination (Levine & Heller, 2010): mutual neurochemical addiction (the push-pull creates dopamine cycles similar to intermittent reinforcement), maximum activation of each partner\'s worst tendencies, and a self-reinforcing loop with no natural exit point. The anxious partner\'s hyperactivation triggers the avoidant\'s deactivation; the avoidant\'s withdrawal triggers the anxious partner\'s escalating protest behaviors. Occasional breakthrough moments of genuine closeness produce intense relief (reinforcing the cycle). Long-term: high conflict, chronic dissatisfaction, difficulty separating despite mutual unhappiness. Breaking the trap requires simultaneous work by both partners — usually with therapeutic support.',
  },
  {
    subcategory: 'compatibility_attachment_anxious_anxious',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Anxious + Anxious pairing (Levine & Heller, 2010): intense initial bonding, volatile conflict dynamics, mutual high emotional reactivity. Neither partner functions as a reliable safe haven (both are activated simultaneously during stress), so the couple amplifies rather than regulates each other\'s nervous systems during conflict. The relationship has "high highs" and difficult lows. Viability improves significantly when both partners have self-awareness, therapeutic support, and a shared commitment to interrupting mutual activation — learning to self-soothe before turning to each other, rather than co-escalating.',
  },
  {
    subcategory: 'compatibility_attachment_avoidant_avoidant',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Avoidant + Avoidant pairing (Levine & Heller, 2010): low external conflict but emotional desert. Both partners are comfortable with independence; neither pushes the other toward intimacy. The relationship can appear highly functional (low drama, high cooperation) while being essentially emotionally disconnected. Neither partner is getting their attachment needs met — but both have suppressed awareness of those needs. The long-term risk: parallel lives with minimal genuine intimacy, which may be tolerable or may erupt in a late-life crisis when the suppressed need for real connection surfaces.',
  },
  {
    subcategory: 'compatibility_big5',
    source: 'McCrae & Costa (1987); Malouff et al. (2010)',
    text: 'Big Five personality compatibility research (Malouff et al., 2010): meta-analysis of 19 studies found that Emotional Stability (low Neuroticism) was the strongest Big Five predictor of relationship satisfaction for both self and partner. High Agreeableness also predicted relationship quality. Openness to Experience predicted flexibility during conflict. Conscientiousness correlated with reliability and follow-through on commitments. Extraversion mattered less in long-term satisfaction than in initial attraction. The most important implication: looking for a partner who is emotionally stable (not reactive under pressure) and agreeable (not chronically adversarial) predicts relationship outcomes better than most surface-level compatibility criteria.',
  },
  {
    subcategory: 'compatibility_self_expansion',
    source: 'Aron & Aron (1986) Love and the Expansion of Self; Aron et al. (2013)',
    text: 'Self-expansion theory (Aron & Aron, 1986): people are motivated to enter relationships partly because relationships expand the self — offering access to new resources, perspectives, identities, and experiences. The theory predicts that relationships feel most exciting when they produce felt self-expansion: learning from the partner, gaining access to their social world, developing through their influence. Research (Aron et al., 2013) found that couples who engage in novel, challenging activities together (not just pleasant ones) maintain higher relationship quality — the novelty reactivates the self-expansion experience that characterized early attraction.',
  },
  {
    subcategory: 'compatibility_relationship_readiness',
    source: 'Stanley et al. (2006); Rhoades et al. (2009)',
    text: 'Relationship readiness vs. compatibility (Stanley et al., 2006): two people can be genuinely compatible but poorly matched because one (or both) are not ready for the relationship they\'re entering — unprocessed grief from a past relationship, unresolved attachment trauma, life-stage misalignment, or ambivalence about partnership itself. Rhoades et al. (2009) found that "sliding" into relationship escalation (moving in together by default, not by choice) is associated with lower relationship quality and higher breakup/divorce rates than "deciding" through explicit, conscious choice. Readiness is a precondition for compatibility to express itself.',
  },
  {
    subcategory: 'compatibility_need_for_cognition',
    source: 'Cacioppo & Petty (1982); Jarnecke & South (2013)',
    text: 'Intellectual compatibility and need for cognition (Cacioppo & Petty, 1982): "need for cognition" — the intrinsic motivation to think deeply, engage with complex ideas, and find intellectual challenge enjoyable — predicts relationship compatibility beyond IQ or education level. Jarnecke & South (2013) found that matched levels of intellectual engagement predicted relationship satisfaction better than matched intelligence scores. Practically: someone who finds conversation stimulating, asks meaningful questions, reads widely, and engages with ideas for their own sake is signaling high intellectual compatibility — regardless of formal education credentials.',
  },
  {
    subcategory: 'compatibility_values_money_sex',
    source: 'Gottman & Gottman (2015) 8 Dates; Kline et al. (2004)',
    text: 'Money and sex as compatibility flash-points (Gottman & Gottman, 2015): these two domains are the most common sources of perpetual conflict in long-term relationships and the least discussed in early dating. Kline et al. (2004) found that couples who discussed financial values and expectations before cohabiting reported significantly better financial compatibility satisfaction. Gottman\'s "8 Dates" framework suggests asking: "What does financial security mean to you?", "What was money like in your childhood home?", "What does sex mean to you in a relationship — is it primarily connection, pleasure, comfort?" These questions surface misalignments before they become entrenched conflicts.',
  },
  {
    subcategory: 'compatibility_growth_mindset',
    source: 'Dweck (2006) Mindset; Knee et al. (2001)',
    text: 'Growth mindset in compatibility (Dweck, 2006; Knee et al., 2001): Knee\'s research distinguishes between "destiny beliefs" (compatibility is fixed — either you\'re meant to be or you\'re not) and "growth beliefs" (relationships are built through sustained effort). People with destiny beliefs give up on relationships faster when difficulties emerge — interpreting early conflict as evidence of fundamental incompatibility. People with growth beliefs interpret early conflict as solvable through mutual effort. The research finding: growth-oriented belief systems predict relationship satisfaction and longevity better than initial compatibility — because they sustain the effort needed to actually develop compatibility over time.',
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function generateEmbedding(genAI, text) {
  const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
  const result = await model.embedContent({
    content: { parts: [{ text: text.substring(0, 2048) }] },
    taskType: 'RETRIEVAL_DOCUMENT',
    outputDimensionality: EMBEDDING_DIMS,
  });
  return result.embedding.values;
}

async function chunkExists(subcategory) {
  const snap = await db.collection(COLLECTION)
    .where('category', '==', 'psychology')
    .where('subcategory', '==', subcategory)
    .limit(1)
    .get();
  return !snap.empty;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipExisting = args.includes('--skip-existing');

  // Resolve Gemini API key (same as generate-rag-chunks.js)
  let apiKey;
  try {
    const { execSync } = require('child_process');
    apiKey = execSync(
      'npx firebase functions:secrets:access GEMINI_API_KEY 2>/dev/null',
      { cwd: functionsDir }
    ).toString().trim();
  } catch (_) {
    apiKey = process.env.GEMINI_API_KEY;
  }

  if (!apiKey && !dryRun) {
    console.error('❌  No GEMINI_API_KEY found. Set it via Firebase secrets or GEMINI_API_KEY env var.');
    process.exit(1);
  }

  const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Psychology RAG Chunk Uploader — BlackSugar21 Coach IA     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Total chunks : ${PSYCHOLOGY_CHUNKS.length}`);
  console.log(`  Collection   : ${COLLECTION}`);
  console.log(`  Category     : psychology`);
  console.log(`  Dry run      : ${dryRun}`);
  console.log(`  Skip existing: ${skipExisting}`);
  console.log('');

  if (dryRun) {
    // ── DRY RUN: list all chunks without embedding or saving ──
    const subcategoryGroups = {};
    for (const chunk of PSYCHOLOGY_CHUNKS) {
      if (!subcategoryGroups[chunk.subcategory]) subcategoryGroups[chunk.subcategory] = [];
      subcategoryGroups[chunk.subcategory].push(chunk);
    }

    for (const [sub, chunks] of Object.entries(subcategoryGroups)) {
      console.log(`\n[${sub}]  (${chunks.length} chunk${chunks.length > 1 ? 's' : ''})`);
      for (const c of chunks) {
        const preview = c.text.substring(0, 120).replace(/\n/g, ' ');
        console.log(`  • ${preview}...`);
        console.log(`    source: ${c.source}`);
      }
    }

    console.log('\n─────────────────────────────────────────────────────────────');
    console.log(`DRY RUN complete. ${PSYCHOLOGY_CHUNKS.length} chunks would be embedded and uploaded.`);
    console.log('Remove --dry-run to execute.');
    return;
  }

  // ── LIVE RUN: embed + upload in batches ──
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of BATCH_SIZE
  for (let batchStart = 0; batchStart < PSYCHOLOGY_CHUNKS.length; batchStart += BATCH_SIZE) {
    const batch = PSYCHOLOGY_CHUNKS.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(PSYCHOLOGY_CHUNKS.length / BATCH_SIZE);
    console.log(`\n── Batch ${batchNum}/${totalBatches} ──────────────────────────────`);

    for (const chunk of batch) {
      try {
        // Optional: skip if already exists in Firestore
        if (skipExisting) {
          const exists = await chunkExists(chunk.subcategory);
          if (exists) {
            console.log(`  ⏭️  [skip] ${chunk.subcategory}`);
            skipped++;
            continue;
          }
        }

        // Generate embedding
        const embedding = await generateEmbedding(genAI, chunk.text);

        // Save to Firestore (same structure as generate-rag-chunks.js)
        const docId = `psych_${chunk.subcategory}_${Date.now()}_${uploaded}`;
        await db.collection(COLLECTION).doc(docId).set({
          text: chunk.text,
          content: chunk.text,           // backwards compat
          category: 'psychology',
          subcategory: chunk.subcategory,
          language: 'en',
          source: chunk.source,
          quality: 'high',
          embedding: admin.firestore.FieldValue.vector(embedding),
          indexedAt: admin.firestore.FieldValue.serverTimestamp(),
          autoGenerated: false,
          searchGrounded: false,
        });

        uploaded++;
        console.log(`  ✅ [${uploaded}] ${chunk.subcategory} (${embedding.length}d)`);

        // Rate limit between embedding calls
        await sleep(BATCH_DELAY_MS);

      } catch (e) {
        errors++;
        console.error(`  ❌ ${chunk.subcategory}: ${e.message}`);
      }
    }

    // Extra pause between batches
    if (batchStart + BATCH_SIZE < PSYCHOLOGY_CHUNKS.length) {
      console.log(`  ⏳ Batch pause (${BATCH_DELAY_MS * 2}ms)...`);
      await sleep(BATCH_DELAY_MS * 2);
    }
  }

  // ── Summary ──
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  DONE: ${uploaded} uploaded | ${skipped} skipped | ${errors} errors`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (uploaded > 0) {
    try {
      const totalSnap = await db.collection(COLLECTION).count().get();
      console.log(`  Total ${COLLECTION} docs now: ${totalSnap.data().count}`);
    } catch (_) { /* count() may not be available in all SDK versions */ }
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error('FATAL:', e.message); process.exit(1); });
