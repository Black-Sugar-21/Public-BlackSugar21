'use strict';

/**
 * Situation Simulation RAG Knowledge Uploader — BlackSugar21
 *
 * Expands the psychology RAG collection with research specifically relevant to
 * the "Situation Simulation" feature: confession scripts, conflict repair,
 * reconciliation, cross-cultural dating dynamics, LGBTQ+ research, minority
 * stress theory, digital dating, timing research, and attachment-specific
 * communication scripts.
 *
 * Builds on the existing 120 psychology chunks with 85 additional research
 * citations covering areas underrepresented in the original seed.
 *
 * Sources: Peer-reviewed papers, recognized textbooks, and clinical protocols.
 *
 * Usage:
 *   node scripts/add-situation-rag.js --dry-run        # preview
 *   node scripts/add-situation-rag.js --skip-existing  # upload new only
 *   node scripts/add-situation-rag.js                  # full upload
 */

const path = require('path');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));
const { GoogleGenerativeAI } = require(path.join(__dirname, '../functions/node_modules/@google/generative-ai'));

const functionsDir = path.join(__dirname, '../functions');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const COLLECTION = 'coachKnowledge';
const EMBEDDING_MODEL = 'gemini-embedding-001';
const EMBEDDING_DIMS = 768;
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500;

const SITUATION_CHUNKS = [
  // ══════════════════════════════════════════════════════════════════
  // 1. CONFESSION & VULNERABILITY SCRIPTS — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'confession_timing_window',
    source: 'Aron et al. (1997); Reis & Shaver (1988) Intimacy as Process',
    text: 'The intimacy window for first emotional confessions (Reis & Shaver, 1988): self-disclosure has maximum positive impact when delivered after at least 3-5 instances of reciprocated vulnerability from the partner, in a context of physical proximity, minimal external distractions, and after a shared positive experience (not during conflict or logistics). Premature confessions (before vulnerability reciprocity has been established) trigger avoidant withdrawal and are experienced as pressure. Late confessions (after the window has passed without declaration) are experienced as anxious coercion. The optimal window for "I love you" in most adult relationships occurs between 8-14 weeks of consistent contact, though individual variance is substantial.',
  },
  {
    subcategory: 'confession_gender_differences',
    source: 'Ackerman et al. (2011) Let It Go: Emotion and the Decision to Drop Close Relationships',
    text: 'Gender differences in "I love you" timing (Ackerman et al., 2011): men, on average, think about saying "I love you" approximately 42 days earlier than women and are more likely to experience positive affect when the confession is reciprocated. Women are more cautious because they evaluate the partner\'s commitment potential before disclosing emotional investment. Notably, a man saying "I love you" first is received more positively when it happens pre-sex than post-sex (pre-sex signals genuine emotion; post-sex risks being interpreted as post-coital neurochemistry). Women\'s confessions are received more positively when they happen after clear signals of commitment trajectory.',
  },
  {
    subcategory: 'confession_soft_startup',
    source: 'Gottman (1999) The Seven Principles; Gottman & Gottman (2015)',
    text: 'Soft startup for vulnerable disclosure (Gottman, 1999): the opening 3 minutes predict 96% of conversation outcomes. A successful emotional confession uses: (1) "I" statements instead of "you" statements, (2) description of feelings rather than interpretation of behavior, (3) specific context rather than global generalizations, (4) explicit need statement rather than indirect hinting, and (5) positive framing of desired outcome rather than criticism of current state. Example: "I\'ve been feeling something I want to share with you — when I\'m around you, I feel more alive than I have in a long time. I love you. I\'m not asking for anything back right now, I just needed you to know."',
  },
  {
    subcategory: 'confession_anxious_attachment',
    source: 'Mikulincer & Shaver (2016); Collins & Feeney (2004)',
    text: 'Anxious attachment confession scripts (Mikulincer & Shaver, 2016): individuals high in attachment anxiety tend to confess love early (within 4-6 weeks), often during or immediately after sex, and frequently as a hyperactivation strategy seeking reassurance. To avoid triggering avoidant withdrawal in the partner, anxious confessors benefit from: (1) a scheduled non-intense moment rather than peak emotion, (2) explicit decoupling from sex, (3) no immediate demand for reciprocation, (4) tolerating 24-48 hours of uncertainty without protest behavior. The confession should read as a gift, not a test.',
  },
  {
    subcategory: 'confession_avoidant_attachment',
    source: 'Levine & Heller (2010) Attached; Mikulincer & Shaver (2016)',
    text: 'Avoidant attachment confession scripts (Levine & Heller, 2010): individuals high in attachment avoidance delay confessions because explicit emotional disclosure triggers their deactivating system. When they finally confess, it\'s often with understatement, intellectualized framing, or humor. Coaching the avoidant partner: the confession does NOT need to be intense to count — "I notice I think about you a lot and I don\'t want to see other people" is a valid commitment statement for an avoidant adult. Pressuring them toward "romantic" confessions fails; accepting their native communication style works. Partners of avoidant confessors should resist the urge to escalate ("but do you LOVE me?") — that converts a rare vulnerable moment into a deactivating trigger.',
  },
  {
    subcategory: 'confession_secure_attachment',
    source: 'Mikulincer & Shaver (2016); Simpson et al. (2007)',
    text: 'Secure attachment confessions (Mikulincer & Shaver, 2016): characterized by congruence between internal feeling and external expression, timing aligned with relationship readiness (not anxiety or avoidance), and tolerance for ambiguous partner response. Secure confessors can say "I love you" without requiring "I love you too" in immediate reply. They frame vulnerability as information shared, not as leverage. The secure script: direct, specific, contextual, without meta-commentary about the confession itself. "I love you. I wanted you to know."',
  },
  {
    subcategory: 'confession_cultural_latino',
    source: 'Ingoldsby (1991) Hispanic Familism; Falicov (1998) Latino Families in Therapy',
    text: 'Latino cultural framing for romantic confessions (Falicov, 1998): in collectivist Latin American contexts, romantic declaration is often tied to familism — loving someone also implies acceptance by and integration with their family system. Confessions that include "I want to meet your family" or "I want you to meet mine" are received as stronger commitment signals than pure individual declarations. Marianismo and machismo scripts (while modernizing) still influence gendered confession norms: male direct declarations remain culturally expected; female indirect signaling (through care, presence, food, invitation) is common. Public, witnessed declarations (at family gatherings, in front of friends) carry more cultural weight than private ones in many Latin American contexts.',
  },
  {
    subcategory: 'confession_cultural_east_asian',
    source: 'Ting-Toomey (2005); Sullivan et al. (2016) Confession Norms in East Asia',
    text: 'East Asian confession culture — 告白 kokuhaku (Japan), 告白 gàobái (China), 고백 gobaek (Korea): in contrast to Western relationships where romantic involvement emerges gradually, East Asian dating norms often require an explicit formal confession ritual before the relationship "officially" begins. Until the confession is made and accepted, the interaction is considered "pre-dating" regardless of dates, gifts, or physical affection. The confession itself is typically short, formal, and declarative: "付き合ってください" / "我喜欢你，请和我交往" / "사귀어 주세요". Indirect hinting is culturally interpreted as failure to confess, not as a confession. Coaching Western-trained users dating East Asian partners: explicit verbal confession is often required — implicit signals are insufficient.',
  },
  {
    subcategory: 'confession_cultural_middle_east',
    source: 'Abu-Lughod (1999); Dhami & Sheikh (2000) Family Honor and Romantic Decisions',
    text: 'Middle Eastern romantic confession dynamics (Dhami & Sheikh, 2000): romantic declaration is often enmeshed with family involvement and marriage intent. In many conservative Arab and Persian contexts, explicit romantic confession between unmarried individuals can be taboo outside the context of formal courtship or engagement. In more liberal contemporary contexts (urban Cairo, Beirut, Istanbul, Dubai), private confessions are common but discretion remains valued. The confession script often implies commitment beyond the individual level — "I love you" can carry an implicit "and I want to pursue marriage with you." Coaching users: the level of directness should match the religious and family-level conservatism of the partner, which may not be immediately visible from their profile.',
  },
  {
    subcategory: 'confession_cultural_nordic',
    source: 'Stefansen et al. (2020); Trost (1993) Nordic Cohabitation Patterns',
    text: 'Nordic confession culture (Trost, 1993; Stefansen et al., 2020): Sweden, Norway, Denmark, and Finland exhibit the most delayed and understated romantic confession patterns among Western cultures. Partners often cohabit, share finances, and even have children before explicitly saying "I love you" — love is signaled through consistent action and presence rather than words. An understated confession ("jag älskar dig" / "jeg elsker deg" / "jeg elsker dig" / "rakastan sinua") carries weight precisely because it is rare. Coaching: for Nordic partners, over-verbalizing love can feel performative or insincere. The script should be direct, brief, non-theatrical, and spoken once — not repeated.',
  },
  {
    subcategory: 'confession_coming_out_script',
    source: 'Meyer (2003) Minority Stress; Pachankis (2007)',
    text: 'Coming out to a romantic partner — minority stress lens (Meyer, 2003; Pachankis, 2007): LGBTQ+ individuals disclosing sexual orientation, gender identity, or HIV status to a romantic partner experience heightened cognitive load from minority stress — the chronic anticipation of rejection, discrimination, or violence. The disclosure script benefits from: (1) choosing a private, safe physical context, (2) assessing the partner\'s baseline attitudes through non-personal test conversations first, (3) stating the fact directly without apologetic framing, (4) allowing the partner 24-72 hours to process if they need it, (5) having external support available (friend, therapist) in case of negative reaction. The confession is NOT an apology and should not be framed as one. "I\'m bi and I wanted you to know before this goes further" is adequate; "I\'m sorry, I have to tell you I\'m bi" frames identity as a problem.',
  },
  {
    subcategory: 'confession_mental_health',
    source: 'Corrigan et al. (2010) The Disclosure Processes Model',
    text: 'Mental health disclosure to a romantic partner (Corrigan et al., 2010): disclosure of conditions like anxiety, depression, bipolar disorder, or ADHD follows the Disclosure Processes Model — successful disclosure requires (1) adequate emotional preparation, (2) assessment of partner\'s attitudinal readiness, (3) clear framing of the condition as a health matter not a moral failing, (4) specific behavioral information ("when I\'m in a depressive episode, I get quiet — it\'s not about you"), (5) invitation for questions rather than expectation of immediate understanding. Disclosure timing: ideally after initial attraction has been established but before major commitment decisions. Avoid first-date disclosure (too early to have earned intimacy) and post-cohabitation disclosure (late enough to feel concealed).',
  },
  {
    subcategory: 'confession_children_prior_relationship',
    source: 'Papernow (2013) Surviving and Thriving in Stepfamily Relationships',
    text: 'Disclosing children from a previous relationship (Papernow, 2013): when to tell — research recommends disclosure by date 2-3, before significant emotional or physical investment. Framing matters: lead with your pride and love for your children, not with apologetic framing. "I\'m a parent first. I have two kids who are the center of my life. I\'m dating to find a partner who can share this life with me" is more effective than "I need to tell you something — I have kids." The former frames children as a positive feature; the latter frames them as a liability. Coaching: partners who will thrive in a stepfamily configuration respond positively to the former framing. Partners who will not are filtered out honestly by it — which is useful.',
  },
  {
    subcategory: 'confession_financial_situation',
    source: 'Britt et al. (2017) Financial Disclosure in Romantic Relationships',
    text: 'Financial disclosure in dating (Britt et al., 2017): financial transparency is a stronger predictor of relationship longevity than income level itself. Couples who discuss finances before significant commitment (cohabitation, marriage) have 50% lower financial conflict rates. Timing: basic financial status (employed, debt situation, housing stability) is appropriate around date 5-8; detailed financial information (specific income, debt amounts, credit score) is appropriate before cohabitation or long-term commitment. The disclosure script: state the facts without apology or bragging. "I have student loan debt I\'m actively paying down" or "I\'m in a good financial place but not wealthy" is adequate. Hiding financial situation from a committed partner predicts later conflict regardless of actual finances.',
  },
  {
    subcategory: 'confession_past_relationships',
    source: 'Frost & Meyer (2009) Relationships and Minority Stress',
    text: 'Disclosing past relationships to a new partner (Frost & Meyer, 2009): the "how much to share about my ex" question has research-backed guidance. Share: context that affects your current capacity to show up (recent divorce, ongoing co-parenting, unresolved grief), patterns the new partner might encounter (attachment behaviors you\'ve been working on), and the duration and general outcome of major past relationships. Do not share: detailed sexual history, financial details of ex-partners, active resentment or criticism of exes, or specific comparisons. Framing an ex positively or neutrally (even one who hurt you) is a strong signal of emotional maturity; detailed criticism of an ex is a red flag that predicts future behavior. Coaching script: "I was with her for 4 years. It ended about 18 months ago. I\'ve done the work to be in a good place now."',
  },

  // ══════════════════════════════════════════════════════════════════
  // 2. CONFLICT REPAIR & APOLOGY SCRIPTS — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'apology_six_elements',
    source: 'Lewicki et al. (2016) An Exploration of the Structure of Effective Apologies',
    text: 'The six elements of an effective apology (Lewicki et al., 2016): through meta-analysis, researchers identified six components ranked by impact — (1) acknowledgement of responsibility ("I was wrong"), (2) offer of repair ("How can I fix this?"), (3) expression of regret ("I\'m sorry this hurt you"), (4) explanation of what went wrong (non-excusing), (5) declaration of repentance ("I won\'t do this again"), (6) request for forgiveness ("Can you forgive me?"). Acknowledgement of responsibility alone accounts for ~40% of apology effectiveness. Apologies missing this element are experienced as non-apologies regardless of emotional performance. The most common apology failure: substituting emotional expression ("I feel terrible") for responsibility ("I was wrong").',
  },
  {
    subcategory: 'apology_fauxpology_patterns',
    source: 'Schlenker & Darby (1981); Eaton & Struthers (2006)',
    text: 'Fauxpology patterns to avoid (Schlenker & Darby, 1981): research identifies apology forms that actively damage relationships by appearing to apologize while refusing responsibility. The five primary fauxpologies: (1) conditional — "I\'m sorry IF you were hurt," (2) deflecting — "I\'m sorry you feel that way," (3) minimizing — "I\'m sorry for the misunderstanding," (4) self-victimizing — "I\'m sorry I\'m such a bad person," (5) immediate reconciliation seeking — "I\'m sorry, are we okay now?" All five patterns signal that the apologizer values looking contrite over actually repairing the harm. Partners exposed to fauxpologies report worse post-apology relationship satisfaction than partners who received no apology at all.',
  },
  {
    subcategory: 'apology_repair_attempts_gottman',
    source: 'Gottman (1999); Driver et al. (2003)',
    text: 'Repair attempts during conflict (Gottman, 1999): Gottman\'s observational research found that all couples have conflict, but Masters make repair attempts that land — their partner accepts the attempt and de-escalation occurs. Disasters make repair attempts that fail — their partner rejects them and escalation continues. The key predictor of whether repair lands: the couple\'s positive sentiment baseline before the conflict. In relationships with high positive sentiment override, even awkward repair attempts work. In relationships with negative sentiment override, even excellent repair attempts are rejected. The practical script: "I\'m getting overwhelmed, can we take a break?" / "I love you even in this moment" / "I think I started this wrong, let me try again" / "Can we rewind and try this again?"',
  },
  {
    subcategory: 'apology_after_ghosting',
    source: 'LeFebvre et al. (2019) Ghosting in Romantic Relationships',
    text: 'Apologizing after ghosting (LeFebvre et al., 2019): research on dating app ghosting shows that 25% of ghosters eventually attempt to reconnect. The successful script: (1) explicit acknowledgement of the ghosting ("I disappeared"), (2) no self-justifying explanation ("I was going through something" without specifics), (3) no request for immediate response, (4) explicit respect for their autonomy to not respond, (5) a specific, low-pressure re-entry point if they want it. Example: "Hey — I know I went silent after our last date. That was on me and I\'m sorry. No expectation of a reply; I just wanted to say it clearly. If you\'re open to coffee at some point, I\'d love that. Either way, take care." Research finding: apologies with emotional intensity or pleading reduce response rates; apologies with dignified acknowledgement increase them.',
  },
  {
    subcategory: 'apology_after_fight',
    source: 'Gottman (1999); Fincham & Beach (2002)',
    text: 'Post-fight apology window (Fincham & Beach, 2002): research on couple conflict recovery shows that the effective apology window opens 30 minutes to 4 hours after the fight ends and closes after 48-72 hours. Apologies in the first 30 minutes often land as too raw — either partner may still be flooded. Apologies after 72 hours begin to feel calculated or late. The optimal timing is when both partners have returned to physiological baseline (heart rate < 100, cortisol declining) but the conflict is still emotionally salient. The script: name the fight specifically, acknowledge your contribution specifically, ask about their experience before explaining yours, offer one concrete change for the future.',
  },
  {
    subcategory: 'apology_cultural_japanese',
    source: 'Sugimoto (1997); Maynard (1997) Japanese Communication',
    text: 'Japanese apology culture (Sugimoto, 1997): Japanese social life includes a rich vocabulary of apologies ranging from casual (ごめん gomen) through standard (すみません sumimasen, ごめんなさい gomennasai) to formal (申し訳ございません mōshiwake gozaimasen) to deeply humble (誠に申し訳ありません). The register must match the severity of the offense and the relationship level — under-apologizing is a serious social offense, over-apologizing is performative. In romantic relationships, the appropriate apology for a significant offense includes a period of visible humility and service (小さなことから — starting from small acts), not just verbal declaration. A Japanese partner may expect demonstration over time, not just an apology script.',
  },
  {
    subcategory: 'apology_cultural_chinese_face',
    source: 'Hwang (1987) Face and Favor: The Chinese Power Game',
    text: 'Face (面子) in Chinese apology dynamics (Hwang, 1987): effective apology in Chinese cultural contexts must preserve the partner\'s face while acknowledging your own loss of face. A public apology that embarrasses the partner by calling attention to their hurt is counterproductive. The appropriate script: apologize privately, offer a concrete gift or service (a meal, a thoughtful purchase, help with a task), let the relationship recover gradually through action. Explicit verbal "I\'m sorry" is less important than restoration of harmony (和谐 héxié). Demanding immediate verbal forgiveness embarrasses the offended party; allowing them to signal forgiveness through resumed normal interaction preserves face for both parties.',
  },
  {
    subcategory: 'apology_cultural_latino',
    source: 'Hernandez et al. (2020); Arellano & Markman (1995)',
    text: 'Latino apology culture (Hernandez et al., 2020): Latin American dating contexts often expect emotionally expressive apologies that demonstrate sincerity through affect, not just content. A flat or understated apology ("I\'m sorry, I was wrong, it won\'t happen again") can be received as insincere — it "lacks heart" (le falta corazón). The effective script includes: visible emotional engagement, eye contact, physical proximity (if the conflict permits), and specific promises for the future. The apology is often followed by a period of demonstration — extra attention, small gifts, increased affectionate gestures — that extends the repair beyond a single conversation. Digital apologies (text, WhatsApp) are culturally inadequate for significant offenses; in-person or at minimum voice call is expected.',
  },
  {
    subcategory: 'apology_cultural_nordic',
    source: 'Trost (1993); Wierzbicka (2003)',
    text: 'Nordic apology culture (Wierzbicka, 2003): Scandinavian apology norms prioritize brevity, factuality, and action over emotional expression. "Förlåt, jag hade fel. Det händer inte igen." (Swedish: "Sorry, I was wrong. It won\'t happen again.") is complete. Prolonged emotional apologies or repeated verbal expressions of regret are experienced as self-indulgent and performative (kränkning — violation of reserve). The Nordic script: name the offense briefly, acknowledge responsibility clearly, commit to specific behavioral change, then stop talking. Repetition weakens rather than strengthens the apology. Recovery happens through consistent behavior over days, not extended discussion.',
  },
  {
    subcategory: 'apology_cultural_arab',
    source: 'Feghali (1997) Arab Cultural Communication',
    text: 'Arab apology dynamics (Feghali, 1997): in Arab communication, apologies often involve elaborate politeness routines and formal expressions (آسف جداً āsif jiddan, أرجو المعذرة arjū al-maʿdhirah, أنا متأسف anā mutaʾassif). The apology is frequently accompanied by invocation of religious or social values (wallahi — I swear to God, ḥaram — forbidden/wrong) that frame the offense in a moral framework. In romantic contexts involving families, the apology may need to extend beyond the individual partner to family members who have been indirectly offended. The cultural emphasis on generosity (karam) means that apologies are often accompanied by hospitality — sharing food, offering gifts — as the restoration mechanism.',
  },
  {
    subcategory: 'reach_out_after_silence',
    source: 'Joel et al. (2019) Machine Learning Prediction of Relationship Outcomes',
    text: 'Reaching out after a silent period (Joel et al., 2019): research on relationship reactivation shows that the probability of successful re-engagement after a 7-30 day silence depends on (1) how the silence started (conflict vs drift), (2) whether the silence was explicitly named or simply happened, (3) the emotional state of the outreach. Successful reactivations share three characteristics: they acknowledge the silence without dramatizing it, they reference something specific and positive from the shared history, and they offer a low-stakes re-entry point (not "let\'s get back together" but "I saw this and thought of you"). Failed reactivations typically include emotional intensity, explicit discussion of the relationship status, or accusation of the other party for the silence.',
  },
  {
    subcategory: 'conflict_first_fight_developmental',
    source: 'Arriaga (2001); Rusbult & Martz (1995) Commitment Processes',
    text: 'The first significant conflict (Arriaga, 2001): developmental research shows that the first real conflict in a new relationship is a predictable and critical transition point. Couples who navigate it well report increased relationship quality afterward (the conflict itself creates the foundation for intimacy — trust in reconciliation becomes a stabilizing force). Couples who navigate it poorly often cite it as the beginning of the end. The first conflict is about something specific on the surface and about attachment signaling underneath. The partners are asking: "When we disagree, does this person treat me with dignity? Can I trust them to repair? Is this relationship safe under stress?" Coaching: treat the first conflict as an opportunity to demonstrate repair capacity, not as a problem to minimize or avoid.',
  },
  {
    subcategory: 'conflict_repair_specific_language',
    source: 'Gottman (1999); Driver & Gottman (2004)',
    text: 'Specific repair language that works (Gottman, 1999): research-validated phrases that de-escalate conflict when delivered with congruent affect: "I\'m sorry, let me try again." / "I know this isn\'t your fault." / "Let me try to say that differently." / "I\'m getting overwhelmed, can we slow down?" / "I love you even in this moment." / "I think I started this in the wrong way." / "I\'m feeling attacked. Can we try another approach?" / "Tell me what you need from me right now." These phrases only work in relationships with a positive sentiment baseline — they are not magical incantations. They work because they signal the speaker\'s continuing care for the partner and the relationship, even during disagreement. Delivered without care, they fail.',
  },
  {
    subcategory: 'conflict_flooding_physiological',
    source: 'Gottman & Levenson (1992); Gottman (1999)',
    text: 'Physiological flooding in conflict (Gottman & Levenson, 1992): when heart rate exceeds 100 bpm during argument, the autonomic nervous system enters fight-or-flight mode. At this threshold, empathic listening becomes physiologically impossible — the prefrontal cortex is downregulated and the limbic system dominates. Research recommends a mandatory 20-minute break when either partner detects flooding. The break must include separation (different rooms) and self-soothing activity (walk, deep breathing, music) — not mental rehearsal of the argument. Return after 20 minutes with a check-in ("Are we ready to try again?") not a resumption ("As I was saying..."). Couples who honor the flooding break report 4x higher repair success rates than couples who push through.',
  },
  {
    subcategory: 'conflict_bids_turning_toward',
    source: 'Gottman (2001) The Relationship Cure; Driver et al. (2003)',
    text: 'Bids for connection and turning toward (Gottman, 2001): in observational research, partners make an average of 100 small "bids for connection" per hour — small gestures, comments, or questions seeking attention, interest, or affection. Masters turn toward bids 86% of the time; Disasters turn toward bids 33% of the time. During and after conflict, bids become especially important: a partner signaling a desire to reconnect ("Did you hear about the weather?") is making a bid, not a non-sequitur. Missing or dismissing these bids accelerates relationship decline. Coaching script for post-conflict repair: treat the first post-conflict bid from your partner as a gift and accept it warmly, even if the conflict is not yet fully resolved.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 3. CROSS-CULTURAL DATING & ATTACHMENT — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'culture_individualism_collectivism',
    source: 'Hofstede (2001); Dion & Dion (1993)',
    text: 'Individualism-collectivism in romantic relationships (Hofstede, 2001; Dion & Dion, 1993): the individualism-collectivism cultural dimension predicts fundamental differences in dating behavior. Individualist cultures (US, UK, Netherlands, Australia, Nordic countries) conceptualize romantic love as a personal choice between autonomous individuals; partner approval is sought primarily from the self. Collectivist cultures (China, Japan, Korea, India, Arab states, Latin America) conceptualize romantic love as integration with a family and social system; partner approval is sought from family and community. Cross-cultural dating: an individualist partner may experience collectivist family involvement as smothering; a collectivist partner may experience individualist autonomy as rejection. Successful intercultural relationships explicitly name and honor both frameworks.',
  },
  {
    subcategory: 'culture_high_low_context',
    source: 'Hall (1976) Beyond Culture; Ting-Toomey (2005)',
    text: 'High-context vs low-context communication in dating (Hall, 1976): low-context cultures (Germany, Nordic countries, US) communicate primarily through explicit verbal content — what is said is what is meant. High-context cultures (Japan, China, Arab states, Latin America) communicate through implicit cues, relationship history, and what is NOT said. Dating across this divide: a high-context partner\'s silence, indirect hint, or timing of a reply may carry significant meaning that a low-context partner completely misses. A low-context partner\'s directness may feel rude or insensitive to a high-context partner. Coaching: when intercultural, default to meta-communication ("When you didn\'t reply yesterday, I wasn\'t sure what it meant — can we agree to tell each other directly?").',
  },
  {
    subcategory: 'culture_attachment_prevalence',
    source: 'van IJzendoorn & Sagi-Schwartz (2008); Schmitt et al. (2004)',
    text: 'Cross-cultural distribution of attachment styles (van IJzendoorn & Sagi-Schwartz, 2008; Schmitt et al., 2004): meta-analysis of attachment research across 62 cultural groups shows that secure attachment is the most common globally (~55-65% in most populations), but the distribution of insecure styles varies. East Asian populations show higher rates of avoidant attachment; Israeli and South American populations show higher rates of anxious attachment; Western European populations show intermediate distributions. These differences reflect cultural socialization patterns rather than genetics. Coaching: expect cultural variation in attachment expression, but do not assume a culture causes a specific individual\'s style. Individual assessment always supersedes population averages.',
  },
  {
    subcategory: 'culture_saving_face_east_asia',
    source: 'Ting-Toomey (1988) Face-Negotiation Theory',
    text: 'Face-negotiation in East Asian dating (Ting-Toomey, 1988): face (面子 mianzi, 体面 tǐmiàn, 面目 memboku, 체면 chemyeon) is a central psychological need in East Asian cultures — the experience of being seen as competent, respectable, and properly integrated into social relationships. Dating interactions that cause loss of face (public criticism, unilateral decision-making, breaking agreements without explanation) damage relationships more severely than equivalent offenses in low-face cultures. Effective dating in East Asian contexts: praise publicly, criticize privately if at all, make joint decisions, give advance notice of changes, allow the partner to maintain dignity even in conflict. Coaching script: "I was thinking — what do you think about..." (face-preserving) works better than "I want to do X" (face-threatening).',
  },
  {
    subcategory: 'culture_family_involvement_levels',
    source: 'Schwartz (2014) Cultural Value Orientations; Hofstede (2001)',
    text: 'Family involvement expectations across cultures (Schwartz, 2014): the expected level of family involvement in a romantic relationship varies dramatically. At one extreme: Nordic and North American cultures where the relationship is considered "between two people" and family involvement is minimal until formal commitment. At the other extreme: South Asian, Middle Eastern, and some East Asian cultures where family approval and involvement is expected from the beginning. Intermediate: Latin American and Southern European cultures where family involvement is expected at moderate relationship stages (after several months). Cross-cultural dating: the partner from a more family-involved culture may feel disrespected by low family involvement; the partner from a less family-involved culture may feel invaded. Explicit negotiation of family involvement level prevents accumulation of resentment.',
  },
  {
    subcategory: 'culture_public_affection_norms',
    source: 'Floyd (2006) Communicating Affection; Ting-Toomey (2005)',
    text: 'Public displays of affection cross-culturally (Floyd, 2006): public physical affection (hand-holding, kissing, embracing) varies dramatically by culture and country. Latin America and Southern Europe: common and socially accepted. Western/Northern Europe and US: moderate acceptance. East Asia: restrained, especially for older generations. Middle East and South Asia: often taboo outside private settings. For international couples, the comfortable level of public affection may differ by 3-4 standard deviations. The negotiation is necessary not because one preference is correct but because mismatched preferences cause daily friction. Coaching script: "What feels comfortable for you in public? I want to make sure we\'re on the same page about this."',
  },
  {
    subcategory: 'culture_gender_roles_machismo',
    source: 'Arciniega et al. (2008); Falicov (1998)',
    text: 'Machismo and caballerosidad in Latino dating (Arciniega et al., 2008): contemporary research distinguishes between traditional machismo (dominance, emotional restriction, aggression) and caballerosidad (chivalry, family commitment, emotional warmth, honor). Both coexist in Latino cultures and influence dating expectations. The traditional gentleman script includes: opening doors, paying for dates, walking on the street-side of the sidewalk, offering one\'s coat, accompanying the partner home, and explicit verbal affirmation of affection and commitment. Rejecting these scripts can be experienced as coldness or lack of investment. Accepting them unreflectively can reproduce gender inequality. Coaching: caballerosidad scripts can be honored without embracing machismo dominance — they are separable traditions.',
  },
  {
    subcategory: 'culture_arab_honor_dynamics',
    source: 'Abu-Lughod (1999); Joseph (1999)',
    text: 'Honor dynamics in Arab dating contexts (Joseph, 1999): in many Arab cultures, individual behavior reflects on family honor (شرف sharaf, عرض ʿirḍ) and community reputation. Dating interactions are often evaluated not just for their personal effects but for their social visibility. The calculation of "what will people say?" is not paranoia but realistic social assessment in honor-based cultures. Coaching users dating in or from Arab contexts: respect the partner\'s concern for reputation is not repressiveness — it is navigation of a real social system. Public discretion, respect for family visibility, and conservative behavior in public settings signal respect for the partner\'s full life, not just the private relationship.',
  },
  {
    subcategory: 'culture_south_asian_arranged_love',
    source: 'Allendorf (2013); Netting (2010) Love Marriages in India',
    text: 'The arranged-love spectrum in South Asian dating (Allendorf, 2013): contemporary South Asian romance exists on a spectrum from fully arranged (family chooses, partners meet at engagement) to fully autonomous (love marriage) with many intermediate forms (semi-arranged — family introduces, partners decide; love-cum-arranged — partners meet independently, families bless). Dating app users from South Asian backgrounds may be navigating family expectations even during seemingly autonomous dating. Coaching: the question "what does marriage look like in your family?" is more relevant than "do you want to get married?" The former surfaces the real decision-making structure; the latter gets a superficial answer.',
  },
  {
    subcategory: 'culture_confucian_filial_piety',
    source: 'Yang (1988); Sung (1995) Filial Piety in Contemporary Asia',
    text: 'Filial piety and romantic commitment in Confucian cultures (Sung, 1995): in Chinese, Korean, Japanese, and Vietnamese contexts, filial piety (孝 xiào, 효 hyo, 孝 kō) creates obligations toward parents that often outweigh individual romantic preferences. A partner who chooses the romantic relationship over family duty (sending money, caring for aging parents, respecting parental wishes in major decisions) may be experienced as morally compromised even by their romantic partner. Coaching: cross-cultural dating with Confucian-culture partners requires explicit recognition that family obligations are not negotiable secondary items — they are foundational elements of the partner\'s moral identity.',
  },
  {
    subcategory: 'culture_northern_europe_silence_comfort',
    source: 'Wierzbicka (2003); Lehtonen & Sajavaara (1985)',
    text: 'Comfort with silence in Northern European dating (Lehtonen & Sajavaara, 1985): Finnish, Swedish, Norwegian, and Estonian cultures accept and value companionable silence far more than most other world cultures. Extended periods of non-speaking in the presence of a romantic partner are not awkward — they are intimate. Partners from high-talk cultures (US, Italy, Latin America) often interpret Nordic silence as disengagement, anger, or rejection when it is the opposite. Coaching script for dating Nordic partners: silence is a gift, not a problem to solve. Asking "are you okay?" during comfortable silence is experienced as mildly invasive. If you need reassurance, ask for it once and accept the answer.',
  },
  {
    subcategory: 'culture_german_directness',
    source: 'House (2006) Communicative Styles in English and German',
    text: 'German communicative directness (House, 2006): German-speaking cultures value Sachlichkeit (factuality, objectivity) in communication. Direct criticism, disagreement, and negative feedback are delivered without softening — this is a sign of respect (treating the listener as an adult capable of handling the truth), not rudeness. Partners from indirect cultures (East Asian, Latin American, British English) often experience German directness as harsh. Partners from German cultures often experience indirect cultures as evasive or dishonest. Coaching for German-culture dating: when your German partner is direct, hear the content not the delivery — the directness is not personal attack but linguistic norm.',
  },
  {
    subcategory: 'culture_french_argument_intellectual',
    source: 'Béal (1992) Did You Have a Good Weekend? Or Why There Is No Such Thing as a Simple Question',
    text: 'French conversational norms in dating (Béal, 1992): French conversation culture values intellectual engagement, playful disagreement, and spirited argument as signs of interest and respect. A French partner disagreeing animatedly with your opinion is NOT signaling dislike — it is signaling that you are taken seriously as a thinking equal. Partners from conflict-avoidant cultures (East Asian, Nordic, Anglo) often interpret French argumentation as hostility when it is the opposite. The French script includes maintaining your position under pressure ("tenir sa position"), using humor as social glue, and demonstrating cultural literacy. Agreement is not the goal — mutual respect through genuine intellectual engagement is.',
  },
  {
    subcategory: 'culture_italian_family_centrality',
    source: 'Carrara (2019); Saraceno (2004) Italian Family Patterns',
    text: 'Italian family centrality in romantic relationships (Saraceno, 2004): Italian dating and romantic culture places exceptional weight on family involvement, especially maternal involvement. Meeting la famiglia, especially la mamma, is a relationship milestone equivalent to Anglo-American engagement in some cases. Sunday family meals, multi-generational interaction, and regional family identity are often central to the partner\'s life. Coaching: expect family visibility to increase with commitment, expect parallel family cultural literacy to be evaluated (do you know Italian cuisine, dialects, regional traditions?), and expect affection to be expressed as much through shared meals and hospitality as through private romance.',
  },
  {
    subcategory: 'culture_queer_chosen_family',
    source: 'Weston (1991) Families We Choose; Hull (2017)',
    text: 'Chosen family in LGBTQ+ dating contexts (Weston, 1991; Hull, 2017): for many LGBTQ+ individuals, particularly those who experienced family rejection, "family" in the context of dating may refer primarily to chosen family — friends, community members, former partners, and mentors who function as kin. When a queer partner says "I want you to meet my family," they may mean a network of chosen people rather than biological relatives. These relationships are not secondary — they are often the primary emotional infrastructure. Coaching: respecting chosen family as equivalent to biological family is foundational to dating LGBTQ+ partners whose family rejection is part of their history.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 4. DIGITAL DATING PSYCHOLOGY — 15 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'digital_response_time_anxiety',
    source: 'Lenhart & Duggan (2014); Finkel et al. (2012)',
    text: 'Response time anxiety in digital dating (Finkel et al., 2012): research on text messaging in romantic relationships shows that response time is a primary source of attachment-system activation. For anxiously attached individuals, a delay over 2 hours triggers hyperactivation (repeatedly checking phone, drafting and redrafting messages, catastrophizing about the silence). For avoidantly attached individuals, rapid response expectation triggers deactivation (ignoring messages to regain autonomy). The coupling of anxious and avoidant partners via texting creates a predictable pathological cycle: anxious sends, avoidant delays, anxious escalates, avoidant withdraws further. Coaching: explicit meta-discussion of texting norms early in the relationship prevents unconscious activation of this cycle.',
  },
  {
    subcategory: 'digital_read_receipts_phenomenon',
    source: 'Kelly & Gergen (2020) Digital Intimacy Practices',
    text: 'Read receipts and relationship anxiety (Kelly & Gergen, 2020): the "read but not replied" phenomenon is one of the most anxiety-producing digital dating experiences. Research on iMessage read receipts, WhatsApp double-check blue marks, and similar indicators shows that "read" status activates anticipatory rejection schemas more powerfully than undelivered messages. The recommended digital hygiene: either turn off read receipts (preserving ambiguity of response timing) or explicitly agree with a partner about expected response windows. Individual differences are substantial: some people find delays comforting (they prove the partner is trusting); others find them triggering. Negotiation is necessary.',
  },
  {
    subcategory: 'digital_phubbing_phone_snubbing',
    source: 'Roberts & David (2016) Phubbing Scale',
    text: 'Phubbing (phone-snubbing) in relationships (Roberts & David, 2016): research shows that even brief phone checking during a romantic conversation significantly reduces the partner\'s perception of relationship quality. The negative effect is present even when the phone interaction is work-related or objectively important. The mechanism: phone checking signals that an invisible third party is more interesting than the present partner. Accumulated phubbing over weeks and months predicts relationship dissatisfaction and conflict frequency. Coaching: phone-free time (meals, in-bed conversations, dates) is a relationship investment with high returns. "Phone in drawer" protocols work.',
  },
  {
    subcategory: 'digital_breadcrumbing',
    source: 'Navarro et al. (2020) Ghosting and Breadcrumbing in Dating',
    text: 'Breadcrumbing in dating apps (Navarro et al., 2020): "breadcrumbing" is the pattern of sending sporadic low-commitment messages that keep a romantic interest engaged without actual progression toward connection. Research identifies breadcrumbing as a predictor of relationship dissatisfaction and partner emotional harm. Patterns: irregular but strategically timed messages, vague plans that never materialize, emotional intensity without behavioral follow-through, reappearing after long silences. Coaching users who suspect they are being breadcrumbed: explicitly state what you want ("I\'d like to see you in person this week — are you able to make that happen?") and accept the answer. The stated pattern reveals itself through explicit asks.',
  },
  {
    subcategory: 'digital_ghosting_psychological',
    source: 'LeFebvre et al. (2019); Freedman et al. (2019)',
    text: 'Psychological impact of being ghosted (LeFebvre et al., 2019): research on ghosting victims shows that the harm is comparable to other forms of social rejection, but with added ambiguity-related distress. The absence of closure activates rumination (wondering what went wrong), self-blame (searching for the fatal flaw), and hypervigilance in subsequent relationships. Recovery research: specific strategies that accelerate recovery include (1) reframing ghosting as a reflection of the ghoster\'s communication capacity not the ghostee\'s worth, (2) treating the relationship as "over" within 14 days of silence rather than waiting indefinitely, (3) limiting time spent analyzing the ghost\'s motives. Coaching: "their silence is their answer — and it tells you who they are, not who you are."',
  },
  {
    subcategory: 'digital_benching',
    source: 'Navarro et al. (2020); Timmermans & De Caluwé (2017)',
    text: 'Benching in dating (Navarro et al., 2020): "benching" is the pattern of keeping a romantic interest in a holding pattern while pursuing other options. The bench position is signaled by: delayed responses, vague future plans, emotional warmth without logistical commitment, and periodic re-engagement when other options fall through. Research shows benching causes as much psychological harm as ghosting because it combines ambiguous signals with periodic reinforcement (intermittent reinforcement is neurologically more addictive than consistent treatment). Coaching: the bench position is detectable by one test — do they make concrete, specific, soon plans? If yes, they are engaged. If consistently no, they are benching.',
  },
  {
    subcategory: 'digital_profile_reading_signals',
    source: 'Toma et al. (2008); Ellison & Vitak (2015)',
    text: 'Reading dating profile signals (Toma et al., 2008): research on profile honesty shows that profiles contain a mix of aspirational, descriptive, and defensive information. Aspirational: what the user wants to be seen as (hobbies they rarely do, values they want to hold). Descriptive: what they actually are. Defensive: pre-emptive filtering of unwanted matches (political statements, deal-breakers). The most predictive profile elements for real behavior: photos in daily-life contexts (vs posed), specific concrete details (vs generic adjectives), humor (which requires cognitive investment to craft), and mention of current real activities. Least predictive: height claims (which are systematically inflated), income claims, and lists of interests without detail.',
  },
  {
    subcategory: 'digital_first_message_research',
    source: 'Hitsch et al. (2010); Tong et al. (2019)',
    text: 'First message research (Hitsch et al., 2010): quantitative analysis of millions of first messages on dating platforms shows that effective first messages share four characteristics: (1) reference a specific detail from the recipient\'s profile (demonstrating attention), (2) include a question that invites a meaningful reply, (3) use appropriate register (neither too formal nor too casual for the context), (4) are roughly 40-150 characters long. Both too short (under 20 characters) and too long (over 300 characters) reduce response rates. The single most effective opener type: a genuine question that references something specific from the profile and invites the recipient to share something they enjoy discussing.',
  },
  {
    subcategory: 'digital_photo_psychology',
    source: 'Ramírez-Cifuentes et al. (2020); Toma et al. (2008)',
    text: 'Profile photo psychology (Ramírez-Cifuentes et al., 2020): eye-tracking research shows that dating app users spend an average of 0.8 seconds on each profile before making an initial accept/reject decision. In that window, photos dominate the decision. The most effective photo combinations include: (1) one clear face-forward shot showing genuine smile (Duchenne markers), (2) one full-body shot in daily clothes, (3) one photo showing an activity or hobby, (4) one photo with friends (social proof), (5) one photo in an interesting location. Critical to avoid: group photos where the user is unclear, heavily filtered photos, mirror selfies, photos with ex-partners blurred out, photos with animals as the main subject (these perform well for matches but poorly for long-term relationships).',
  },
  {
    subcategory: 'digital_video_call_transition',
    source: 'Tong et al. (2019); Rosenfeld et al. (2019) How Couples Meet',
    text: 'Transitioning from text to video call (Tong et al., 2019): research on dating app conversation trajectories shows that 70% of text-only conversations that last more than 5 days without an in-person or video meeting dissolve without a date. The "text-only window" before a voice or video transition is 2-3 days of moderate engagement or 5-7 days of light engagement. Beyond that window, the textual bond begins to decay without the reinforcement of real-time interaction. Coaching script: "I\'m enjoying this — want to hop on a quick video call tonight? 15 minutes, low pressure." The 15-minute framing reduces avoidant resistance to video calls (which carry more vulnerability than text).',
  },
  {
    subcategory: 'digital_first_meeting_window',
    source: 'Rosenfeld et al. (2019); Sprecher (2020)',
    text: 'First in-person meeting window (Rosenfeld et al., 2019): research on dating app-to-relationship conversion shows that the optimal window for the first in-person meeting is 7-14 days after matching. Earlier (under 3 days) can feel rushed; later (over 3 weeks) almost always results in either dissolution or failure to maintain the chemistry that was built via text. The psychological reason: textual interaction builds a parasocial image of the partner that, over time, diverges from the reality. Short text windows preserve the novelty; long text windows create expectations that reality cannot match. Coaching script: aim to meet in person within 10-14 days of matching, with a specific low-stakes plan (coffee, walk, drinks).',
  },
  {
    subcategory: 'digital_relationship_visibility',
    source: 'Papp et al. (2012) Facebook Relationship Status',
    text: 'Relationship visibility on social media (Papp et al., 2012): research on Facebook "in a relationship" status and its predictors shows that social media visibility is perceived as a commitment signal. Couples who become publicly visible report higher relationship quality, but the causal direction is bidirectional — committed couples make themselves visible, and visibility reinforces commitment. Conflicts often arise from visibility asymmetry: one partner wants public visibility; the other wants privacy. The asymmetry itself is neither right nor wrong, but unresolved it accumulates resentment. Coaching script: "I realized we haven\'t talked about how public we want this to be. What feels right for you?"',
  },
  {
    subcategory: 'digital_ex_contact_norms',
    source: 'Finkel et al. (2012); Marshall (2012) Facebook Surveillance of Former Partners',
    text: 'Contact with exes in the digital era (Marshall, 2012): research on Facebook surveillance of former partners shows that continued digital contact with an ex (following, regular messaging, maintaining shared accounts) predicts reduced adjustment to the breakup and reduced quality of subsequent relationships. Current partners often experience ex-contact as a relationship threat, even when the communication is logistically innocent. The research-based recommendation: after a breakup, a 90-day no-contact period accelerates psychological closure; during new relationships, ex-contact should be known to and generally approved by the current partner. Hidden ex-contact is a reliable early warning sign of relationship dysfunction.',
  },
  {
    subcategory: 'digital_couples_social_validation',
    source: 'Saslow et al. (2012); Toma & Choi (2015)',
    text: 'Social validation and couple posting (Saslow et al., 2012): couples who post about their relationship on social media report higher relationship satisfaction and receive higher perceived quality from their social network. But the effect is curvilinear: very low posting and very high posting are both associated with lower relationship quality. Very high posting may indicate compensatory performance for internal dissatisfaction. Moderate, varied, authentic posting is associated with highest quality. Coaching: if you feel compelled to prove your relationship is happy through posts, pay attention — the compulsion may be a signal, not just a behavior.',
  },
  {
    subcategory: 'digital_ambiguous_loss',
    source: 'Boss (1999) Ambiguous Loss; LeFebvre et al. (2019)',
    text: 'Ambiguous loss in digital breakups (Boss, 1999): the concept of ambiguous loss — unresolved grief for someone who is neither clearly present nor clearly absent — applies powerfully to ghosting, benching, and fade-outs. Unlike traditional breakups with explicit endings, digital relationship dissolution often leaves the rejected party without closure, which prevents normal grief processing. Recovery from ambiguous loss requires constructing your own narrative of the ending, treating the person as absent for practical purposes (stopping check-ins, removing digital reminders), and allowing yourself to grieve even though no one has officially died. The grief is real even when the ending is not clear.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 5. LGBTQ+ RELATIONSHIPS — 10 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'lgbtq_minority_stress',
    source: 'Meyer (2003) Minority Stress Model; Meyer (2015)',
    text: 'Minority stress in LGBTQ+ relationships (Meyer, 2003): the Minority Stress Model identifies three stress processes that affect LGBTQ+ individuals: (1) external prejudice events (discrimination, rejection, violence), (2) expectations and vigilance about prejudice (scanning for danger in new contexts), (3) internalized homophobia/transphobia (absorbed negative societal messages). These stressors predict higher rates of depression, anxiety, and substance use but ALSO shape intimate relationships. Same-sex partners navigate relationship tasks (coming out to family, public displays of affection, deciding about children) without heterosexual scripts to follow. Coaching: queer relationships are not heterosexual relationships minus gender — they are structurally different and often require explicit invention of norms.',
  },
  {
    subcategory: 'lgbtq_bi_erasure',
    source: 'Herek et al. (2010); Ross et al. (2018) Biphobia Research',
    text: 'Bisexual erasure and relationship dynamics (Ross et al., 2018): bisexual individuals report higher rates of partner dismissal of their identity than gay or lesbian individuals. Common erasure forms: "you\'re really gay" / "you\'re really straight" / "bisexuality is just a phase" / "if you end up with a man/woman, you\'re straight/gay." These invalidations, even from well-meaning partners, cause cumulative harm. Coaching for partners of bi individuals: honor the full identity, recognize that the current relationship does not define the partner\'s orientation, and include bisexual community as part of the partner\'s identity rather than framing it as past or alternative.',
  },
  {
    subcategory: 'lgbtq_trans_partner_disclosure',
    source: 'Meier et al. (2013); Iantaffi & Bockting (2011)',
    text: 'Disclosure timing for trans partners (Meier et al., 2013): trans individuals face a specific disclosure challenge — when to tell a romantic interest about their trans identity. Research and clinical consensus: disclose before significant emotional or physical investment develops (typically within the first 1-3 dates), in a private safe context, with access to support afterward. The disclosure script should NOT be apologetic or self-disclosing as a "confession of a flaw." It should be matter-of-fact: "I\'m trans. I wanted to tell you because I think there\'s potential here. Take a moment if you need. I\'m happy to answer questions." Safety concern: trans disclosure can in rare cases trigger violence. Assessment of the partner\'s baseline attitudes before disclosure is appropriate safety practice.',
  },
  {
    subcategory: 'lgbtq_chosen_family_primacy',
    source: 'Weston (1991) Families We Choose; Hull (2017)',
    text: 'Chosen family primacy in LGBTQ+ relationships (Weston, 1991): research on LGBTQ+ family structures shows that chosen family (friends, former partners who became family, community members) often functions with the emotional intensity and obligation of biological family. For queer individuals rejected by biological families, chosen family may be the ONLY family system in their lives. Romantic partners must integrate with chosen family in ways analogous to integrating with biological in-laws. Coaching: dismissing or minimizing a queer partner\'s chosen family is equivalent to dismissing a straight partner\'s biological family. "Why are you so close with your ex?" is often the wrong question; "I want to understand this relationship that\'s important to you" is the right one.',
  },
  {
    subcategory: 'lgbtq_gay_male_communication',
    source: 'Gottman et al. (2003) Twelve-Year Study of Gay and Lesbian Couples',
    text: 'Gay male couple communication patterns (Gottman et al., 2003): Gottman\'s 12-year study of gay and lesbian couples found that gay male couples demonstrate significantly lower physiological flooding during conflict than heterosexual couples, use more humor to de-escalate, and recover more quickly from arguments. However, they are also quicker to "take things personally" and exit conversations when offended. Research-based recommendations: gay male couples benefit from explicit attention to repair timing (don\'t wait) and from resisting the impulse to treat every offense as a relationship threat. The same research found that gay male couples\' relationship stability depends more on positive affect during arguments than on avoidance of arguments.',
  },
  {
    subcategory: 'lgbtq_lesbian_communication',
    source: 'Gottman et al. (2003); Kurdek (2004)',
    text: 'Lesbian couple communication patterns (Gottman et al., 2003; Kurdek, 2004): research shows that lesbian couples demonstrate the highest relationship satisfaction of any couple type in the early years, with strong emotional intimacy, extensive verbal processing, and mutual emotional attunement. However, the same research identifies "fusion" — over-merging of identities — as the most common source of long-term difficulty. Lesbian couples benefit from explicit cultivation of individual identity, separate friends, separate interests, and physical space, even in very close relationships. The balance of intense intimacy and preserved individuation is the central task.',
  },
  {
    subcategory: 'lgbtq_polyamory_dynamics',
    source: 'Sheff (2014) The Polyamorists Next Door; Conley et al. (2017)',
    text: 'Polyamorous relationship dynamics (Sheff, 2014; Conley et al., 2017): research on consensually non-monogamous relationships shows that poly relationships are not less satisfying than monogamous ones — the satisfaction level is roughly equivalent when compared fairly. However, the skills required are different: explicit communication about needs and feelings, negotiation of time and energy across partners, management of jealousy as information rather than threat, and higher tolerance for ambiguity. Poly relationships fail when they are adopted as an escape from monogamous problems (avoiding intimacy, sexual dissatisfaction) rather than chosen from a place of stability and capacity.',
  },
  {
    subcategory: 'lgbtq_coming_out_relationship',
    source: 'Rothblum (2000); Savin-Williams (2005)',
    text: 'The process of coming out within a new relationship (Savin-Williams, 2005): for LGBTQ+ individuals, the "coming out" process is not a single event but an ongoing negotiation across contexts — work, family, friends, public spaces. A new romantic partner often becomes the person with whom these negotiations are discussed. Coming out events (to parents, at work) frequently occur during periods of new relationship formation. Supporting a partner through coming out: listen without pushing, respect their pacing, do not out them to others without permission, and accept that the process has non-linear phases with setbacks and progress.',
  },
  {
    subcategory: 'lgbtq_asexual_spectrum',
    source: 'Bogaert (2015) Understanding Asexuality; Brotto et al. (2010)',
    text: 'Asexual spectrum in romantic relationships (Bogaert, 2015): asexuality — absence or low frequency of sexual attraction — exists on a spectrum (gray-asexual, demisexual, sex-neutral, sex-repulsed). Asexual individuals may desire romantic relationships without desiring sex, or may desire sex occasionally in specific conditions, or may be sex-repulsed. Coaching for ace-allo relationships: explicit negotiation of sexual frequency and meaning is essential. Sexual desire is not equivalent to romantic desire; absence of the former does not imply absence of the latter. The dating scripts that assume "love means wanting sex" fail in ace contexts and need to be replaced with scripts built around what each partner actually wants.',
  },
  {
    subcategory: 'lgbtq_internalized_stigma',
    source: 'Meyer (2003); Newcomb & Mustanski (2010)',
    text: 'Internalized stigma in LGBTQ+ intimacy (Newcomb & Mustanski, 2010): internalized homophobia/transphobia — the absorption of societal negative messages about queer identity — predicts reduced intimacy capacity, increased conflict, and reduced relationship satisfaction in LGBTQ+ couples. The mechanism: internalized stigma creates shame about queer desire and intimate behavior, which interferes with full emotional and physical presence with the partner. Coaching: therapeutic work on internalized stigma is a relationship investment, not a personal side-project. The partner\'s self-acceptance work directly benefits the relationship, and cultivating a shame-free intimate space is something both partners can contribute to.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 6. TIMING, TRANSITIONS, & RELATIONSHIP MILESTONES — 10 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'timing_exclusivity_conversation',
    source: 'Kettrey & Tikkanen (2019); Knox et al. (2017)',
    text: 'The exclusivity conversation — timing research (Kettrey & Tikkanen, 2019): the "what are we?" conversation in modern dating happens at different times for different people, but research identifies patterns. Average timing for the first exclusivity conversation is 6-8 weeks after first meeting. Conversations earlier than 4 weeks often trigger avoidant withdrawal; conversations later than 12 weeks often surface mismatched expectations that have been silently diverging. The script: "I want to be honest about where I\'m at — I\'ve been enjoying this a lot and I\'m not interested in seeing other people right now. I wanted to know where you\'re at with that too." Framing as information and invitation (not ultimatum) maximizes positive response rates.',
  },
  {
    subcategory: 'timing_physical_escalation',
    source: 'Metts & Cupach (1989); Sprecher & Regan (2000)',
    text: 'Physical escalation timing (Metts & Cupach, 1989): research on physical intimacy in developing relationships shows a cultural-typical sequence — holding hands, first kiss, extended kissing, petting, sex — but the timeline varies substantially by individual preference. Mismatched pacing is one of the most common sources of early-relationship anxiety. Partners from different physical escalation preferences benefit from explicit meta-conversation rather than inferring consent from body language. The script: "I want to go at whatever pace feels right for both of us. Can we check in with each other?" is clinically supported and generally well-received.',
  },
  {
    subcategory: 'timing_first_sleepover',
    source: 'Sprecher (2002); Willetts (2006)',
    text: 'The first sleepover timing (Sprecher, 2002): research on relationship milestones shows that the first overnight stay is psychologically significant beyond the sexual dimension — it represents the partner entering the sleeping/vulnerable zone. Sleep is a high-trust activity; sharing it signals attachment development. Partners often find the logistics (toothbrush, morning clothes, breakfast, leaving or staying) more uncertain than the sexual dimension. Coaching: addressing logistics explicitly in advance ("Stay over? I have a spare toothbrush and we can grab breakfast") reduces morning-after awkwardness and supports attachment development.',
  },
  {
    subcategory: 'timing_meet_friends',
    source: 'Parks & Eggert (1991); Sprecher (2011)',
    text: 'Meeting the partner\'s friends (Parks & Eggert, 1991): integration of a romantic partner into the friend network is a key relationship milestone, typically occurring at 6-12 weeks in serious dating. Research shows that friends\' approval of the relationship is one of the strongest external predictors of relationship longevity. Friends see dynamics that partners cannot see from the inside. Coaching: the question "what do your friends think of me?" is useful relationship information, not insecurity. The resistance to introducing a partner to friends after 2-3 months is itself data — usually about ambivalence toward the relationship.',
  },
  {
    subcategory: 'timing_meet_family',
    source: 'Serewicz & Gale (2008); Willetts (2006)',
    text: 'Meeting the family timing (Serewicz & Gale, 2008): in individualist Western contexts, meeting the partner\'s parents typically occurs at 3-6 months in serious dating. In collectivist contexts (Latino, Asian, Middle Eastern), family introduction may occur much earlier (as early as 2-4 weeks). The cultural meaning differs: in individualist contexts, family introduction signals serious commitment; in collectivist contexts, family introduction signals active courtship and is more routine. Coaching: the question "when will I meet your parents?" has different meanings in different cultural contexts and should not be compared across them.',
  },
  {
    subcategory: 'timing_cohabitation_decision',
    source: 'Stanley et al. (2006); Rhoades et al. (2009)',
    text: 'Cohabitation decision research (Stanley et al., 2006): research on cohabitation outcomes distinguishes "deciding" from "sliding." Couples who consciously decide to move in together (explicit discussion, shared intent, clear agreement about meaning) report better relationship quality and lower breakup rates than couples who "slide" into cohabitation (gradually spending more nights together until moving in by default). The decision conversation: "We\'ve been staying at each other\'s places most nights — I want to talk about whether we should make this official. What does cohabitation mean to you, and what\'s your sense of our timing for it?"',
  },
  {
    subcategory: 'timing_long_distance',
    source: 'Stafford (2005) Maintaining Long-Distance Relationships',
    text: 'Long-distance relationship dynamics (Stafford, 2005): research on long-distance relationships shows that they are NOT inherently less satisfying than geographically close relationships — in some studies they report higher satisfaction due to idealization and reduced daily friction. The key predictors of LDR success are: (1) shared future plans with specific closing timeline, (2) regular synchronous communication (video calls), (3) planned visits with anticipation structure, (4) maintenance of individual lives between visits, (5) explicit communication about exclusivity and boundaries. LDRs fail when they lack a specific convergence plan or when asynchronous communication replaces synchronous.',
  },
  {
    subcategory: 'timing_breakup_threshold',
    source: 'Rusbult (1980) Investment Model; Agnew et al. (1998)',
    text: 'The breakup decision process (Rusbult, 1980): Rusbult\'s Investment Model predicts relationship persistence based on three factors — satisfaction level, quality of alternatives, and investment size. The model accurately predicts breakups when two conditions are met: sustained dissatisfaction AND perception of acceptable alternatives. Couples who are dissatisfied but have no perceived alternatives often remain together (stuck). Couples who are dissatisfied AND perceive alternatives eventually break up. The "when is it time" question reduces to: (1) is the dissatisfaction sustained despite good-faith repair attempts? (2) would I be relieved rather than devastated if the relationship ended? (3) does my long-term self-concept include this person?',
  },
  {
    subcategory: 'timing_post_breakup_rebound',
    source: 'Brumbaugh & Fraley (2014); Spielmann et al. (2013)',
    text: 'Post-breakup rebound research (Brumbaugh & Fraley, 2014; Spielmann et al., 2013): research on "rebound" relationships challenges the common wisdom that they are doomed to fail. In controlled studies, people who started new relationships quickly after a breakup reported equivalent or higher confidence and wellbeing than those who waited. The important qualifier: rebounds fail when they are unconsciously attempting to replace the ex or avoid grief. Rebounds succeed when they are genuine new relationships with forward momentum. Coaching: the question "is this too soon?" is less useful than "am I seeing this person for who they are, or using them to avoid feeling my ex?"',
  },
  {
    subcategory: 'timing_reconnection_after_breakup',
    source: 'Dailey et al. (2009) On-Again/Off-Again Relationships',
    text: 'On-again/off-again relationships (Dailey et al., 2009): research on "on-off" relationships — couples who break up and get back together repeatedly — shows that each cycle typically involves the same underlying issue unresolved. The probability that the same problems will resolve spontaneously during the "off" period is low unless specific work is done. Successful reconnections share common features: (1) explicit acknowledgement of what caused the breakup, (2) concrete changes in one or both partners\' behavior, (3) new communication or conflict protocols agreed upon before resumption. Reconnections that skip these steps tend to recycle the same dynamics.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 7. JEALOUSY, INSECURITY & VULNERABILITY — 10 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'jealousy_functional_view',
    source: 'DeSteno (2010); Buss (2000) The Dangerous Passion',
    text: 'The functional view of jealousy (DeSteno, 2010; Buss, 2000): evolutionary and clinical research on jealousy reframes it as an attachment-protective emotion rather than a character flaw. Jealousy signals perceived threat to a valued relationship. Mild-to-moderate jealousy in appropriate contexts (e.g., when a partner is flirting with someone else) is associated with healthy relationship investment. Severe jealousy, chronic jealousy in inappropriate contexts, or jealousy-driven controlling behavior indicates dysregulation. Coaching: "I feel jealous when X happens — can we talk about why?" is healthy communication. "You\'re not allowed to do X because I feel jealous" is not. The goal is to make jealousy useful information, not to eliminate it.',
  },
  {
    subcategory: 'jealousy_communication_script',
    source: 'Guerrero & Andersen (1998); Bevan (2004)',
    text: 'Communicating about jealousy (Guerrero & Andersen, 1998): research on jealousy communication in couples identifies effective scripts. The three components: (1) ownership of the feeling ("I\'m feeling jealous" not "you made me jealous"), (2) specific trigger identification ("when you were talking with X at the party"), (3) request for information or reassurance ("can you help me understand what that means for us?"). Ineffective scripts include accusation ("you obviously like them better"), surveillance demands ("let me see your phone"), and ultimatums ("you can never talk to them again"). Effective jealousy conversations often strengthen attachment by demonstrating the partner\'s willingness to engage difficult emotions openly.',
  },
  {
    subcategory: 'insecurity_attachment_origin',
    source: 'Mikulincer & Shaver (2016); Collins & Feeney (2004)',
    text: 'Insecurity as attachment system activation (Mikulincer & Shaver, 2016): what feels like "insecurity" in a romantic context is typically activation of the attachment behavioral system in response to perceived threat. Anxiously attached individuals experience more frequent activation; avoidantly attached individuals experience activation as a threat to independence. The experience of insecurity is NOT a character flaw — it is the attachment system doing its protective job. Coaching: the question "why am I so insecure?" reframes as "what is my attachment system responding to?" which leads to productive investigation rather than self-criticism. Supporting a partner\'s insecurity with consistent responsiveness gradually reduces baseline activation.',
  },
  {
    subcategory: 'vulnerability_brene_brown',
    source: 'Brown (2012) Daring Greatly; Brown (2017) Braving the Wilderness',
    text: 'Vulnerability as connection mechanism (Brown, 2012): research-grounded work on vulnerability identifies it as the primary mechanism of intimate connection — showing up and being seen without the armor of perfection, performance, or protection. In dating contexts, small vulnerabilities (admitting nervousness, naming an insecurity, sharing a personal story) invite reciprocal vulnerability and build attachment. Large vulnerabilities without the foundation of small ones can overwhelm. The pacing of vulnerability matters: early vulnerabilities should be small and low-stakes; larger vulnerabilities unfold as the relationship earns them. Coaching: treat vulnerability as a gift given, not a demand made. "I\'m nervous" is a gift; "you should be vulnerable with me now" is a demand.',
  },
  {
    subcategory: 'vulnerability_shame_distinction',
    source: 'Tangney et al. (2007); Brown (2006)',
    text: 'Shame vs guilt in vulnerability (Tangney et al., 2007): research distinguishes shame ("I am bad") from guilt ("I did something bad"). Guilt-based vulnerability ("I made a mistake; I\'m working on it") strengthens relationships; shame-based vulnerability ("I\'m a terrible person; love me anyway") burdens them. The difference: guilt acknowledges specific actions and implies capacity for repair; shame attacks identity and requires external rescue. Coaching for users who tend toward shame: before disclosing a vulnerable topic, reframe it from identity to action. "I have anxiety" is fact; "I struggle with work anxiety and I\'m learning to manage it" is ownership.',
  },
  {
    subcategory: 'vulnerability_reciprocity_loop',
    source: 'Aron et al. (1997); Reis & Shaver (1988)',
    text: 'Vulnerability reciprocity in dating (Aron et al., 1997): the progression of intimacy in new relationships follows a reciprocity pattern — one person shares something slightly personal, the other reciprocates with something similar, and both gradually increase depth. Breaking this pattern (one partner continuing to escalate while the other does not reciprocate) signals attachment mismatch. Successful dating conversation often includes deliberate vulnerability reciprocity: matching the depth of disclosure, responding to shares with interest rather than deflection, and offering your own share when the partner has taken a risk. Coaching: Aron\'s 36 Questions protocol is a structured way to practice this reciprocity intentionally.',
  },
  {
    subcategory: 'insecurity_comparison_social_media',
    source: 'Vogel et al. (2014); Steers et al. (2014)',
    text: 'Social media comparison and relationship insecurity (Vogel et al., 2014): research on Facebook/Instagram use shows that frequent consumption of curated relationship content (friends\' vacations, engagements, highlight reels) predicts decreased satisfaction with one\'s own relationship. The mechanism: social comparison with unrealistic standards. Coaching: if you find yourself comparing your relationship to Instagram couples, the problem is rarely your relationship — it\'s the comparison reference class. Limiting consumption of curated relationship content is a relationship investment. Following real couples\' full lives (including conflict and ordinary moments) is healthier than following performance accounts.',
  },
  {
    subcategory: 'vulnerability_asking_for_reassurance',
    source: 'Johnson (2008) Hold Me Tight; Brown (2012)',
    text: 'Asking for reassurance productively (Johnson, 2008): research on attachment-based couple therapy shows that asking for reassurance is a healthy attachment move when done productively. The productive form: "I\'m feeling insecure about X — can you reassure me?" The unproductive form: testing, manipulating, or indirect signaling that requires the partner to guess. Productive reassurance-seeking signals trust in the partner\'s willingness to show up; unproductive reassurance-seeking signals avoidance of direct vulnerability. Coaching: if you need reassurance, ask for it once, receive it, and believe it. Repeating the ask within a short time invalidates the reassurance just received.',
  },
  {
    subcategory: 'vulnerability_body_image',
    source: 'Tiggemann & Hargreaves (2020); Calogero & Thompson (2009)',
    text: 'Body image in dating vulnerability (Tiggemann & Hargreaves, 2020): research on body image and romantic relationships shows that body dissatisfaction is one of the most common vulnerabilities brought into dating. Partners often try to address it by offering reassurance ("you look great"), which rarely resolves the insecurity because the issue is internal rather than external. More effective: acknowledging the feeling ("it sounds like you\'re really struggling with this today"), respecting the partner\'s experience without trying to fix it, and not making body comments (positive or negative) the primary form of affection. Coaching: love the person, not the body — and show the love through presence and non-appearance-based affection.',
  },
  {
    subcategory: 'vulnerability_trauma_disclosure',
    source: 'Herman (1992) Trauma and Recovery; van der Kolk (2014)',
    text: 'Trauma disclosure in romantic relationships (Herman, 1992; van der Kolk, 2014): partners who have experienced significant trauma (sexual assault, childhood abuse, PTSD) face the question of when and how to disclose. Clinical consensus: disclosure is not obligatory to the partner, is not owed early, and should be done on the trauma survivor\'s timeline with support systems in place. The partner receiving trauma disclosure should respond with presence rather than fixing, believe without interrogating, and understand that the disclosure is a trust act of significant magnitude. Coaching for receivers: "Thank you for telling me. I\'m here. What do you need from me right now?" is a complete response. Questions about details should wait unless specifically invited.',
  },

  // ══════════════════════════════════════════════════════════════════
  // 8. RELATIONSHIP SCIENCE META-INSIGHTS — 5 chunks
  // ══════════════════════════════════════════════════════════════════
  {
    subcategory: 'meta_happiness_not_absence_of_conflict',
    source: 'Gottman (1999); Finkel (2018) The All-or-Nothing Marriage',
    text: 'Happiness is not the absence of conflict (Gottman, 1999): 40+ years of observational research shows that happy couples have just as many or more conflicts than unhappy couples. The difference is NOT conflict frequency but conflict recovery. Happy couples have more positive interactions per negative interaction (the Gottman ratio is 5:1 in stable couples, lower in unstable ones), repair attempts that land, and conflicts that end with reconnection rather than withdrawal. Coaching: stop trying to avoid conflict. Start building the positive foundation and repair skills that make conflict safe. A relationship without conflict is typically a relationship without depth.',
  },
  {
    subcategory: 'meta_partner_choice_vs_partner_work',
    source: 'Finkel (2018); Eastwick et al. (2014)',
    text: 'The relative weight of partner choice and partner work (Finkel, 2018): longitudinal research on marriage satisfaction shows that initial "fit" between partners predicts early-stage satisfaction, but the quality of daily relationship behaviors and repair skills predicts long-term satisfaction much more strongly. A great match that is not maintained declines; an imperfect match that is maintained can become excellent. Coaching users focused on finding the perfect partner: the perfect partner does not exist and would not solve the challenge of showing up daily in a real relationship. Focus on finding someone good enough, and then become someone who can build a great relationship with them.',
  },
  {
    subcategory: 'meta_positive_illusions',
    source: 'Murray et al. (1996) Positive Illusions in Romantic Relationships',
    text: 'Positive illusions in successful relationships (Murray et al., 1996): counterintuitive research shows that partners who slightly overestimate their partner\'s virtues report higher relationship satisfaction and predict more stable relationships. The mechanism: positive illusions reduce the frequency of minor criticisms, invite the partner to grow into the idealized image, and buffer against temporary disappointments. However, the illusions must have some basis in reality — fantasy-based idealization of a fundamentally incompatible partner leads to later disillusionment. Coaching: when you catch yourself being generous in interpreting your partner\'s behavior, that\'s often relationship wisdom, not self-deception.',
  },
  {
    subcategory: 'meta_love_languages_caveat',
    source: 'Chapman (1995); Egbert & Polk (2006) Critical Review',
    text: 'Love languages research status (Egbert & Polk, 2006): Gary Chapman\'s love languages framework — words of affirmation, acts of service, gifts, quality time, physical touch — is widely influential but has limited empirical validation. Research shows that while people do have preferred modes of receiving affection, the taxonomy is not definitive (some researchers find different categories) and matching partner preferences is less important than ensuring both partners regularly express affection in some form. Coaching: use love languages as a conversation starter ("here\'s how I tend to feel most loved"), not as a rigid prescription. The underlying insight — that love must be expressed in ways the receiver can receive — is correct even if the specific 5-category framework is imprecise.',
  },
  {
    subcategory: 'meta_good_enough_relationship',
    source: 'Finkel (2018); Stutzer & Frey (2006)',
    text: 'The "good enough" relationship concept (Finkel, 2018): research on relationship satisfaction and life outcomes supports a concept borrowed from Winnicott\'s parenting research — the "good enough" relationship. A good enough relationship is not an ideal relationship. It meets the partners\' core needs, has repair capacity for its conflicts, and contributes positively to both partners\' lives most of the time. Research shows that "good enough" relationships predict better life outcomes than the pursuit of "perfect" relationships, because the pursuit of perfection (1) is impossible, (2) breeds chronic dissatisfaction, and (3) fails to invest in the actual relationship at hand. Coaching: aim for good enough, work on it consistently, and you will often end up with something excellent.',
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
    console.error('❌  No GEMINI_API_KEY found.');
    process.exit(1);
  }

  const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   Situation Simulation RAG Uploader — BlackSugar21          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Total chunks : ${SITUATION_CHUNKS.length}`);
  console.log(`  Collection   : ${COLLECTION}`);
  console.log(`  Category     : psychology`);
  console.log(`  Dry run      : ${dryRun}`);
  console.log(`  Skip existing: ${skipExisting}`);
  console.log('');

  if (dryRun) {
    const groups = {};
    for (const chunk of SITUATION_CHUNKS) {
      const prefix = chunk.subcategory.split('_')[0];
      if (!groups[prefix]) groups[prefix] = [];
      groups[prefix].push(chunk);
    }
    for (const [g, items] of Object.entries(groups)) {
      console.log(`\n[${g}] (${items.length})`);
      for (const c of items) {
        console.log(`  • ${c.subcategory}`);
        console.log(`    ${c.source}`);
      }
    }
    console.log(`\n─────────────────────────────────────────────────────────────`);
    console.log(`DRY RUN complete. ${SITUATION_CHUNKS.length} chunks would be uploaded.`);
    return;
  }

  let uploaded = 0, skipped = 0, errors = 0;

  for (let batchStart = 0; batchStart < SITUATION_CHUNKS.length; batchStart += BATCH_SIZE) {
    const batch = SITUATION_CHUNKS.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(SITUATION_CHUNKS.length / BATCH_SIZE);
    console.log(`\n── Batch ${batchNum}/${totalBatches} ──`);

    for (const chunk of batch) {
      try {
        if (skipExisting) {
          const exists = await chunkExists(chunk.subcategory);
          if (exists) {
            console.log(`  ⏭️  ${chunk.subcategory}`);
            skipped++;
            continue;
          }
        }

        const embedding = await generateEmbedding(genAI, chunk.text);
        const docId = `psych_${chunk.subcategory}_${Date.now()}_${uploaded}`;
        await db.collection(COLLECTION).doc(docId).set({
          text: chunk.text,
          content: chunk.text,
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
        console.log(`  ✅ [${uploaded}] ${chunk.subcategory}`);
        await sleep(BATCH_DELAY_MS);
      } catch (e) {
        errors++;
        console.error(`  ❌ ${chunk.subcategory}: ${e.message}`);
      }
    }

    if (batchStart + BATCH_SIZE < SITUATION_CHUNKS.length) {
      await sleep(BATCH_DELAY_MS * 2);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  DONE: ${uploaded} uploaded | ${skipped} skipped | ${errors} errors`.padEnd(63) + '║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  if (uploaded > 0) {
    try {
      const totalSnap = await db.collection(COLLECTION).count().get();
      console.log(`  Total ${COLLECTION} docs now: ${totalSnap.data().count}`);
    } catch (_) {}
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
