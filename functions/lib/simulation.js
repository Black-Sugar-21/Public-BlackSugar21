'use strict';

/**
 * Relationship Simulation Engine — "Hang the DJ" pattern
 *
 * Runs 10 simulations of two users across 4 relationship scenarios.
 * Counts how many simulations show genuine connection ("rebellion signal").
 * Final score = positive_simulations / total × 100
 *
 * Inspired by Black Mirror S4E4 "Hang the DJ":
 * - 1000 simulations → we run 10 (cost-controlled)
 * - "Rebellion" = both agents choose each other despite scenario friction
 * - Score is honest: 8/10 = 80% compatibility
 */

const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {logger} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {
  geminiApiKey,
  AI_MODEL_NAME,
  AI_MODEL_LITE,
  GoogleGenerativeAI,
  getLanguageInstruction,
  parseGeminiJsonResponse,
  getCachedEmbedding,
  trackAICall,
} = require('./shared');

// ---------------------------------------------------------------------------
// Remote Config — simulation_config
// ---------------------------------------------------------------------------
let _simConfigCache = null;
let _simConfigCacheTime = 0;
const SIM_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 min

const SIM_CONFIG_DEFAULTS = {
  enabled: true,          // Global kill switch
  betaMode: true,         // true = only allowedUserIds; false = all users
  allowedUserIds: '',     // Comma-separated UIDs, empty = all (only when betaMode=false)
  simulationCount: 10,    // Simulations to run (5-10)
  roundsPerSim: 6,        // Rounds per simulation (4-8)
  maxPerDay: 3,           // Rate limit per user per day
  maxTurnTokens: 120,     // Max tokens per agent turn
  turnTemperature: 0.88,  // Creativity of agent responses
};

async function getSimulationConfig() {
  if (_simConfigCache && (Date.now() - _simConfigCacheTime) < SIM_CONFIG_CACHE_TTL) {
    return _simConfigCache;
  }
  try {
    const rc = admin.remoteConfig();
    const template = await rc.getTemplate();
    const param = template.parameters['simulation_config'];
    if (param?.defaultValue?.value) {
      const rcConfig = JSON.parse(param.defaultValue.value);
      _simConfigCache = {...SIM_CONFIG_DEFAULTS, ...rcConfig};
      _simConfigCacheTime = Date.now();
      return _simConfigCache;
    }
  } catch (err) {
    logger.warn(`[getSimulationConfig] RC read failed, using defaults: ${err.message}`);
  }
  _simConfigCache = SIM_CONFIG_DEFAULTS;
  _simConfigCacheTime = Date.now();
  return _simConfigCache;
}

/**
 * Check if a userId is allowed to use the simulation feature.
 * - If disabled globally → false
 * - If betaMode=true → only users in allowedUserIds
 * - If betaMode=false → all users
 */
function isSimulationAllowed(userId, config) {
  if (!config.enabled) return false;
  if (!config.betaMode) return true; // Open to all
  if (!config.allowedUserIds || config.allowedUserIds.trim() === '') return false;
  const allowed = new Set(config.allowedUserIds.split(',').map(s => s.trim()).filter(Boolean));
  return allowed.has(userId);
}

// ---------------------------------------------------------------------------
// Behavior archetypes — 12 combinations of attachment × comm style
// Used when user has no real messages to infer from.
// Phrases are representative of how real people in each culture actually type
// in dating/messaging contexts. Non-Latin scripts include translations in comments.
// ---------------------------------------------------------------------------
const BEHAVIOR_ARCHETYPES = {
  secure_direct: {
    // EN: direct, confident, curious
    openers: ['What made you swipe on my profile?', 'Tell me something real about yourself.'],
    conflict: ['I felt hurt when that happened. Can we talk about it?', "I want to understand your side."],
    longTerm: ["I think we want different things here — let's figure out a compromise.", 'What does this mean for us going forward?'],
    // DE: factual, respectful directness
    de: {
      openers: ['Was hat dich an meinem Profil angesprochen?', 'Ich schätze deine Ehrlichkeit — erzähl mir etwas Echtes über dich.'],
      conflict: ['Ich möchte offen mit dir reden — das hat mich getroffen.', 'Ich verstehe deinen Standpunkt, aber meiner ist auch wichtig.'],
      longTerm: ['Was ist dir dabei am wichtigsten?', 'Lass uns einen konkreten Plan machen, der für uns beide funktioniert.'],
    },
    // RU: direct, deep, without softening
    ru: {
      openers: ['Что привлекло тебя в моём профиле?', 'Скажи мне что-нибудь настоящее о себе.'], // What attracted you to my profile? / Tell me something real.
      conflict: ['Мне было больно. Можем поговорить об этом?', 'Я хочу понять твою точку зрения.'], // I was hurt. Can we talk? / I want to understand.
      longTerm: ['Нам нужно найти компромисс.', 'Что это значит для нас двоих?'], // We need a compromise. / What does this mean for both of us?
    },
    // AR: respectful, measured directness
    ar: {
      openers: ['ما الذي أعجبك في ملفي الشخصي؟', 'أخبرني بشيء حقيقي عن نفسك.'], // What did you like in my profile? / Tell me something real.
      conflict: ['شعرت بألم من ذلك، هل يمكننا التحدث؟', 'أريد أن أفهم وجهة نظرك.'], // I felt hurt, can we talk? / I want to understand.
      longTerm: ['أعتقد أننا بحاجة إلى حل وسط.', 'ما الذي يعنيه هذا بالنسبة لنا؟'], // I think we need a compromise. / What does this mean for us?
    },
  },
  secure_playful: {
    // EN: warm, humorous, curious
    openers: ['Okay so first question: pineapple on pizza, yes or no? 😄', "What's your most unpopular opinion?"],
    conflict: ['Wait wait wait — can we rewind? I think we misunderstood each other 😅', "I'm not mad, I promise. But can we talk?"],
    longTerm: ["Okay adventure or relaxation? I feel like we've had this debate before 😂", "Both? Can we do both? I'll plan Tuesday, you plan Wednesday."],
    // PT-BR: warm, expressive, touch-forward
    pt: {
      openers: ['Então, primeira pergunta importante: abacaxi na pizza? 😄', 'Você parece interessante! Me conta uma coisa que ninguém sabe sobre você 😊'],
      conflict: ['Espera, acho que a gente se entendeu errado 😅 Posso te explicar?', 'Não tô brava, prometo! Mas quero que a gente converse 💕'],
      longTerm: ['Aventura ou praia? Juro que aceito qualquer um 😂', 'E se a gente fizer os dois? Um dia seu, um dia meu 😍'],
    },
    // FR: playful with intellectual flair
    fr: {
      openers: ["Alors, question capitale : ananas sur pizza, pour ou contre ? 😄", "Tu as l'air intéressant — dis-moi quelque chose de vrai sur toi."],
      conflict: ["Attends, je crois qu'on s'est mal compris 😅 Tu peux m'expliquer ?", "Je ne suis pas fâché(e), promis. Mais on peut parler ?"],
      longTerm: ["Aventure ou détente ? J'ai l'impression qu'on en a déjà débattu 😂", "Les deux ! Tu planifies un jour, je planifie l'autre — c'est parfait non ?"],
    },
    // ID: humor-forward, polite
    id: {
      openers: ['Halo! boleh kenalan? 😊 Nanas di pizza — setuju atau tidak? 😄', 'Kamu kayaknya seru nih! Cerita dong satu hal unik tentang kamu.'],
      conflict: ['Eh tunggu, kayaknya kita salah paham deh 😅 Boleh aku jelasin?', 'Aku ga marah kok, serius! Tapi bisa kita ngobrol dulu? 😊'],
      longTerm: ['Petualangan atau santai? Aku sih oke dua-duanya 😂', 'Gimana kalau bergantian? Hari ini pilihanku, besok pilihanmu 😄'],
    },
  },
  secure_reserved: {
    // EN: quiet, observant, thoughtful
    openers: ["I liked your photos. The one from the mountains — where was that?", 'Your bio caught my attention.'],
    conflict: ['I need a moment to think about this.', "I hear you. I just need to process."],
    longTerm: ['What matters most to you here?', "I want to make sure we both feel good about this decision."],
    // JA: indirect, hedging, observant (空気を読む — reading the air)
    ja: {
      openers: ['なんか、写真すごくよかったです。山の写真どこで撮ったんですか？', 'プロフィール、気になりました。'], // Photos were really good. Where was the mountain photo? / Your profile caught my eye.
      conflict: ['ちょっと考えさせてください。', 'そうですね…なんか難しいですね。かもしれないけど。'], // Let me think a bit. / I see... it's kind of difficult. Maybe.
      longTerm: ['どうしたいですか？', '二人ともが納得できる形がいいですよね。'], // What do you want? / I'd like something we both feel okay about.
    },
    // ZH: measured, family-aware, face-saving
    zh: {
      openers: ['你那张山上的照片很好看，是在哪儿拍的？', '看了你的介绍，感觉挺有意思的。'], // Your mountain photo was nice, where was it taken? / Your bio was interesting.
      conflict: ['我需要想一想。', '我听到了，只是需要消化一下。'], // I need to think. / I hear you, just need to process.
      longTerm: ['你觉得什么对你最重要？', '我希望我们两个都对这个决定感到满意。'], // What matters most to you? / I hope we both feel good about this.
    },
  },
  anxious_playful: {
    // ES: nervous but warm, emoji-expressive
    openers: ["jaja qué nervios! es que nunca sé qué decir al principio 😅", "Hola! espero no estarte interrumpiendo algo 😊"],
    conflict: ["espera... ¿estás bien? siento que algo pasó", "no quiero que pienses que estoy enojada, solo que me afectó"],
    longTerm: ["¿pero tú qué prefieres? en serio lo que tú quieras está bien 😊", "me da miedo que no lleguemos a un acuerdo..."],
    // PT-BR: anxious + expressive warmth
    pt: {
      openers: ['Ai que nervoso(a)! Nunca sei o que falar primeiro 😅', 'Oi! Espero não estar te atrapalhando 😊'],
      conflict: ['Espera… você tá bem? Sinto que aconteceu alguma coisa.', 'Não quero que você pense que tô com raiva, é que me afetou sabe?'],
      longTerm: ['O que você prefere? De verdade, pode escolher 😊', 'Fico com medo de a gente não chegar num acordo...'],
    },
    // ID: anxious but polite and warm
    id: {
      openers: ['Hehehe deg-degan nih, ga tau mau ngomong apa duluan 😅', 'Halo! Semoga ga ganggu ya 😊'],
      conflict: ['Eh, kamu baik-baik aja? Kayak ada yang kurang beres.', 'Aku ga mau kamu pikir aku marah ya, cuma ngaruh ke aku aja.'],
      longTerm: ['Kamu maunya gimana? Beneran, aku ikut aja 😊', 'Takut kita ga bisa sepakat...'],
    },
  },
  anxious_verbose: {
    // ES: long, worry-spiraling messages
    openers: ["Hola! vi tu perfil y me pareció súper interesante, especialmente lo de los viajes porque yo también adoro viajar y...", "Perdona si escribo mucho, es que me emocioné cuando vi tu perfil 😂"],
    conflict: ["No sé si hice algo mal porque noto que estás diferente y me preocupa porque para mí esto es importante y no quiero arruinarlo", "¿Podemos hablar? Porque siento que hay algo y prefiero que me lo digas aunque me duela"],
    longTerm: ["Es que me imagino el viaje y me emociono mucho pero también me da miedo que no sea lo que esperábamos y...", "¿Seguro que estás bien con eso? Porque a veces siento que dices que sí pero en realidad prefieres otra cosa"],
    // PT-BR: anxious verbose, saudade energy
    pt: {
      openers: ['Oi! Vi seu perfil e achei super interessante, principalmente a parte de viagens porque eu também amo viajar e sempre quis conhecer...', 'Perdoa se escrevo muito, é que me animei quando vi seu perfil 😂 Tô assim mesmo!'],
      conflict: ['Não sei se fiz algo errado porque percebo que você tá diferente e fico preocupado(a) porque isso é importante pra mim e não quero estragar...', 'A gente pode conversar? Porque sinto que tem algo e prefiro que você me diga mesmo que doa.'],
      longTerm: ['É que fico imaginando a viagem e me emociono mas também fico com medo de não ser o que a gente esperava e...', 'Você tem certeza que tá bem com isso? Às vezes sinto que você fala que sim mas na verdade prefere outra coisa.'],
    },
    // RU: long, literary, intense
    ru: {
      openers: ['Привет! Я увидел(а) твой профиль и он мне очень понравился, особенно про путешествия — я тоже обожаю путешествовать и...', 'Извини что пишу так много, просто я очень обрадовался(ась) когда увидел(а) твой профиль 😂'], // Hi! Saw your profile and really liked it, especially about travel... / Sorry for writing so much, I was excited...
      conflict: ['Не знаю, сделал(а) ли я что-то не так, потому что вижу что ты изменился(ась) и это меня беспокоит...', 'Можем поговорить? Потому что я чувствую что что-то не так, и я предпочитаю знать правду.'], // I don't know if I did something wrong... / Can we talk? Because I feel something's off...
      longTerm: ['Я представляю эту поездку и так волнуюсь, но и боюсь что всё будет не так как мы ожидали...', 'Ты точно в порядке с этим? Иногда мне кажется что ты говоришь да, но на самом деле предпочитаешь другое.'], // I imagine the trip and get excited but also scared... / Are you really okay with this?
    },
  },
  anxious_reserved: {
    // ES: short, withdrawn, suppressed anxiety
    openers: ['Hola.', 'Me gustó tu perfil.'],
    conflict: ['Nada, está bien.', '...okay.'],
    longTerm: ['Lo que tú quieras.', 'Como quieras.'],
    // JA: very short, indirect, high context
    ja: {
      openers: ['こんにちは。', 'プロフィール、見ました。'], // Hello. / I saw your profile.
      conflict: ['大丈夫です。', '…そうですか。'], // I'm fine. / ...I see.
      longTerm: ['どちらでもいいです。', 'あなたに任せます。'], // Either is fine. / I leave it to you.
    },
    // ZH: minimal, deferential
    zh: {
      openers: ['你好。', '看了你的资料。'], // Hello. / Saw your profile.
      conflict: ['没事的。', '…好吧。'], // It's fine. / ...okay.
      longTerm: ['都可以。', '你决定吧。'], // Either is fine. / You decide.
    },
  },
  avoidant_direct: {
    // EN: direct, self-protective, no-frills
    openers: ["What are you actually looking for here?", "Let's skip small talk — what's important to you?"],
    conflict: ["I need space to process this.", "I don't want to fight. Let's just drop it."],
    longTerm: ["I like things the way they are.", "I'm not great at planning that far ahead."],
    // DE: direct, structured, no emotional fuss
    de: {
      openers: ['Was suchst du hier eigentlich?', 'Was machst du am Wochenende? Direkt zum Punkt.'],
      conflict: ['Ich brauche etwas Zeit für mich.', 'Ich will nicht streiten. Lass uns das lassen.'],
      longTerm: ['Ich mag es wie es ist.', 'So weit voraus zu planen liegt mir nicht.'],
    },
    // RU: direct, no small talk
    ru: {
      openers: ['Что ты ищешь здесь?', 'Давай без лишних слов — что для тебя важно?'], // What are you looking for here? / Let's skip the fluff — what matters to you?
      conflict: ['Мне нужно время подумать.', 'Я не хочу ссориться. Давай закроем тему.'], // I need time to think. / I don't want to fight. Let's drop it.
      longTerm: ['Мне нравится всё как есть.', 'Я не очень умею планировать так далеко.'], // I like things as they are. / I'm not good at planning that far ahead.
    },
  },
  avoidant_playful: {
    // ES: humor as deflection, avoids depth
    openers: ["Hola! fair warning: soy pésimo respondiendo mensajes 😂", "Okay seré honesto: no sé muy bien cómo funciona esto 😅"],
    conflict: ["oye mejor hablemos de otra cosa no?", "mira, no hay problema, en serio 👍"],
    longTerm: ["ya veremos cómo va jaja", "no pongas tanta presión en eso 😂"],
    // FR: humor + deflection, keeping it light
    fr: {
      openers: ["Salut ! Petit avertissement : je suis nul pour répondre aux messages 😂", "Bon, je vais être honnête — je ne sais pas trop comment ça marche ça 😅"],
      conflict: ["On peut parler d'autre chose ? 😅", "Hey, c'est bon, pas de problème — vraiment 👍"],
      longTerm: ["On verra comment ça évolue, haha", "Mets pas trop de pression là-dessus 😂"],
    },
    // ID: playful deflection, keeps it funny
    id: {
      openers: ['Halo! disclaimer dulu: aku orangnya suka telat bales pesan 😂', 'Jujur nih, aku ga terlalu ngerti cara kerja aplikasi kayak gini 😅'],
      conflict: ['Eh ganti topik yuk? 😅', 'Hei, ga ada masalah kok, serius 👍'],
      longTerm: ['Nanti kita lihat aja haha', 'Santai aja, ga usah dipikirin dulu 😂'],
    },
  },
  avoidant_reserved: {
    // EN: minimal, closed off
    openers: ['Hi.', 'Hey.'],
    conflict: ["I'm fine.", 'Whatever.'],
    longTerm: ["Let's not overthink it.", "I don't know."],
    // JA: extremely minimal, socially polite but emotionally distant
    ja: {
      openers: ['こんにちは。', 'どうも。'], // Hello. / Hey.
      conflict: ['大丈夫。', 'まあ。'], // I'm fine. / Whatever.
      longTerm: ['考えすぎないようにしよう。', 'わからない。'], // Let's not overthink. / I don't know.
    },
    // AR: minimal, formally distant
    ar: {
      openers: ['أهلاً.', 'مرحباً.'], // Hello. / Hi.
      conflict: ['أنا بخير.', 'لا يهم.'], // I'm fine. / Whatever.
      longTerm: ['لا داعي للتفكير كثيراً.', 'لا أعرف.'], // No need to overthink. / I don't know.
    },
  },
  secure_verbose: {
    // EN: thoughtful, articulate, self-aware
    openers: ["I love how your bio mentions hiking AND cooking — those are my two worlds colliding. Tell me more!", "Okay I have to ask about the photography thing in your profile because I've been wanting to get into it myself and..."],
    conflict: ["I think what happened is we both had different expectations and neither of us communicated them clearly, so can we start over and be honest about what we each need?", "I want to acknowledge that I handled part of this badly too. Can we both share our sides?"],
    longTerm: ["So what I'm thinking is we could do one day adventure, one day relaxation, and really make it special — what do you think about that structure?", "I've been thinking a lot about this and I think the key is we both compromise a little but also protect what matters most to each of us."],
    // PT-BR: warm, long, demonstrative ("que saudade", "amei")
    pt: {
      openers: ['Amei que seu perfil fala de trilha E culinária — são dois mundos que eu adoro! Me conta mais!', 'Precisava perguntar sobre a fotografia no seu perfil porque sempre quis aprender e...'],
      conflict: ['Acho que o que aconteceu é que a gente tinha expectativas diferentes e nenhum de nós comunicou direito — pode a gente começar de novo e ser honesto?', 'Quero admitir que também errei em parte. Podemos dividir nossas perspectivas?'],
      longTerm: ['O que tô pensando é: um dia de aventura, um dia de praia — o que você acha dessa estrutura?', 'Fiquei pensando muito e acho que a chave é cada um ceder um pouco mas preservar o que importa pra cada um.'],
    },
    // FR: philosophical, romantic understatement
    fr: {
      openers: ["J'adore que ton profil mentionne la randonnée ET la cuisine — c'est exactement mon univers ! Raconte-moi plus.", "Il faut que je te pose la question sur la photographie dans ton profil parce que je voulais m'y mettre moi-même et..."],
      conflict: ["Je pense qu'on avait tous les deux des attentes différentes et qu'on ne les a pas vraiment communiquées — on repart de zéro ?", "Je reconnais que j'ai aussi mal géré une partie de ça. On peut s'expliquer chacun ?"],
      longTerm: ["Ce que j'imagine c'est un jour aventure, un jour détente — qu'est-ce que tu penses de ça comme structure ?", "J'y ai vraiment réfléchi — je pense que la clé c'est qu'on fasse chacun un compromis mais qu'on garde ce qui compte vraiment pour nous."],
    },
  },
  anxious_direct: {
    // EN: urgent, need-for-clarity
    openers: ["Do you actually want to meet or just chat forever on here?", "Be honest — what are you looking for?"],
    conflict: ["I felt like you pulled away and I need to know why.", "Are we okay? Because something feels off."],
    longTerm: ["I need to know where this is going.", "What do you actually want from this?"],
    // PT-BR: direct, anxious energy, passionate
    pt: {
      openers: ['Você quer de verdade se encontrar ou só ficar conversando aqui?', 'Seja honesto(a) — o que você tá procurando?'],
      conflict: ['Senti que você se afastou e preciso saber por quê.', 'A gente tá bem? Porque tô sentindo que algo mudou.'],
      longTerm: ['Preciso saber pra onde isso vai.', 'O que você realmente quer disso?'],
    },
    // RU: direct, intense, literary urgency
    ru: {
      openers: ['Ты реально хочешь встретиться или просто общаться здесь вечно?', 'Скажи честно — что ты ищешь?'], // Do you actually want to meet or chat forever? / Be honest — what are you looking for?
      conflict: ['Я чувствую что ты отстранился(ась) и мне нужно знать почему.', 'У нас всё хорошо? Потому что что-то не так.'], // I feel you pulled away and I need to know why. / Are we okay?
      longTerm: ['Мне нужно знать куда это идёт.', 'Что ты на самом деле хочешь от этого?'], // I need to know where this is going. / What do you actually want?
    },
  },
  avoidant_verbose: {
    // EN: long but emotionally evasive
    openers: ["Okay I'm usually terrible at this but here goes... hi! I never know what to say on these things.", "I'm probably not your typical person on here — I tend to overthink every message I send and then delete it 😂 but here's one I actually sent!"],
    conflict: ["Look I hear you and I get it but I also think sometimes people need space to just... breathe, you know? Like not everything needs to be talked to death right away.", "I'm not saying it doesn't matter, I'm just saying let's not make it bigger than it needs to be and come back to it when we're both calmer."],
    longTerm: ["I mean I like where we are now, I don't know why we need to plan so far ahead, can't we just see what happens?", "The pressure of planning stuff like this is exactly what makes me want to just... not. Can we just be spontaneous?"],
    // DE: verbose but structured, emotionally contained
    de: {
      openers: ['Ich bin normalerweise schlecht darin, aber hier bin ich... hallo! Ich weiß nie was ich hier schreiben soll.', "Ich bin wahrscheinlich nicht dein typischer Mensch hier — ich überlege jede Nachricht ewig und lösche sie dann 😂 aber diese hab ich tatsächlich abgeschickt!"],
      conflict: ['Ich höre dich, aber manchmal brauchen Menschen auch einfach Raum zum Durchatmen — nicht alles muss sofort besprochen werden.', 'Ich sage nicht dass es egal ist, ich sage nur lass uns das nicht größer machen als es ist und zurückkommen wenn wir ruhiger sind.'],
      longTerm: ['Ich mag es wie es jetzt ist — warum müssen wir so weit vorausplanen? Können wir nicht einfach schauen was passiert?', 'Der Druck solche Sachen zu planen ist genau das was mich dazu bringt... gar nichts zu wollen. Können wir spontaner sein?'],
    },
    // FR: deflecting with words, philosophical avoidance
    fr: {
      openers: ["Bon, je suis nul(le) d'habitude mais voilà... salut ! Je ne sais jamais quoi dire sur ces applis.", "Je suis probablement pas le genre de personne qu'on croise ici — j'écris des messages, je les relis dix fois et je les supprime 😂 mais celui-là je l'ai envoyé !"],
      conflict: ["Je t'entends, vraiment, mais parfois les gens ont juste besoin de souffler un peu — pas tout discuter immédiatement, tu vois ?", "Je dis pas que c'est sans importance, je dis juste qu'on peut revenir là-dessus quand on sera tous les deux plus calmes."],
      longTerm: ["J'aime bien où on en est, je sais pas pourquoi on doit planifier si loin — on peut pas juste voir ce qui se passe ?", "C'est exactement ce genre de pression qui me donne envie de... rien planifier du tout. On peut être spontanés ?"],
    },
  },
};

// ---------------------------------------------------------------------------
// Hang the DJ — Duration-based relationship simulation system
// Inspired by Black Mirror S4E4 and MirrorFish multi-scenario compatibility engine
// Each simulation draws a random relationship duration (weighted toward realistic distribution)
// and runs the full arc of that relationship, ending with the "Rebellion Moment"
// ---------------------------------------------------------------------------

const RELATIONSHIP_DURATIONS = [
  // phase: spark — attraction, dopamine surge (Fisher, 2004), first bids for connection (Gottman)
  { id: 'first_meeting',  label: 'first 12 minutes', weight: 8,  rounds: 4, phase: 'spark' },
  { id: 'first_date',     label: 'first date',        weight: 12, rounds: 5, phase: 'spark' },
  // phase: building — vulnerability, self-disclosure reciprocity (Altman & Taylor), new love energy
  { id: 'one_week',       label: '1 week together',   weight: 10, rounds: 5, phase: 'building' },
  { id: 'one_month',      label: '1 month together',  weight: 18, rounds: 6, phase: 'building' },
  // phase: deepening — attachment system activates (Bowlby), first conflicts, intimacy vs isolation (Erikson)
  { id: 'three_months',   label: '3 months together', weight: 20, rounds: 6, phase: 'deepening' },
  // phase: stability — Gottman's 4 horsemen emerge or are avoided, emotional regulation tested
  { id: 'six_months',     label: '6 months together', weight: 15, rounds: 7, phase: 'stability' },
  // phase: commitment — Sternberg's commitment component, values alignment, future planning
  { id: 'one_year',       label: '1 year together',   weight: 12, rounds: 7, phase: 'commitment' },
  // phase: long_term — Gottman bids for connection, erotic intelligence (Perel), individuation
  { id: 'three_years',    label: '3 years together',  weight: 5,  rounds: 8, phase: 'long_term' },
];

/** Weighted random duration selection — mimics the system assigning relationship lengths in Hang the DJ */
function pickRandomDuration() {
  const total = RELATIONSHIP_DURATIONS.reduce((s, d) => s + d.weight, 0);
  let r = Math.random() * total;
  for (const d of RELATIONSHIP_DURATIONS) {
    r -= d.weight;
    if (r <= 0) return d;
  }
  return RELATIONSHIP_DURATIONS[1];
}

// Cultural first-meeting venues (spark phase)
const SPARK_VENUES = {
  ja: 'izakaya (Japanese gastropub) over small plates and draft beer',
  zh: 'tea house (茶馆), over oolong tea and dim sum',
  ar: 'café over mint tea and pastries',
  id: 'warung kopi (local coffee stall) over kopi susu',
  pt: 'boteco (Brazilian bar) over cold chopp beer and pão de queijo',
  fr: 'café over espresso and croissants',
  de: 'café over filter coffee and Kuchen',
  ru: 'café over black tea and blini',
  es: 'café over cortados',
  en: 'coffee shop',
};

// Cultural conflict expression notes
const CONFLICT_CULTURE = {
  ja: `Cultural note: In Japanese contexts, emotional distance is expressed subtly — shorter messages, delayed replies. ${'{A}'} senses the shift through indirect cues, not direct confrontation.`,
  zh: `Cultural note: Face-saving (面子) matters deeply here. ${'{A}'} must raise the issue without making ${'{B}'} lose face.`,
  ar: `Cultural note: Emotional tension is often expressed through formal politeness. ${'{A}'} brings this up with care, using respectful framing.`,
  id: `Cultural note: Direct conflict is often avoided out of respect for harmony (rukun). ${'{A}'} approaches this gently and indirectly.`,
  de: `Cultural note: Directness is a sign of respect here. ${'{A}'} addresses the issue plainly — no softening, because honesty is valued.`,
  ru: `Cultural note: Emotional intensity runs deep. ${'{A}'} brings this up with philosophical weight, not just surface feelings.`,
  pt: `Cultural note: Warmth and physical presence are primary affection languages here. The emotional distance feels especially pronounced for ${'{A}'}.`,
  fr: `Cultural note: Silence and understatement carry meaning. ${'{A}'} has been reading between the lines and finally decides to say something.`,
};

/**
 * Psychology-informed scenario context for a given relationship duration.
 * Draws from Knapp's relationship stages, Fisher's neurochemistry model,
 * Gottman's research, and Bowlby attachment theory.
 */
function getDurationContext(duration, nameA, nameB, lang) {
  const venue = SPARK_VENUES[lang] || SPARK_VENUES.en;
  const conflictNote = (CONFLICT_CULTURE[lang] || '')
    .replace('{A}', nameA).replace('{B}', nameB);

  switch (duration.id) {
    case 'first_meeting':
      return `SCENARIO: ${nameA} and ${nameB} are meeting for the very first time — first 12 minutes at a ${venue}.
PSYCHOLOGY (Fisher, 2004 / Gottman): Attraction phase. Dopamine elevated. Both scanning for trustworthiness, humor, and chemistry. First "bids for connection" test — who turns toward, who deflects?
ATTACHMENT LENS: Anxious types may over-disclose early; avoidant types intellectualize; secure types are curious and grounded.
Goal: Raw first-encounter energy. Not everything clicks immediately — let it be real.
START: ${nameA} opens.`;

    case 'first_date':
      return `SCENARIO: First intentional date. They've matched and finally met — at a ${venue}.
PSYCHOLOGY (Knapp, 1978 — Experimenting stage): Testing for commonalities, surface-level disclosure, humor calibration.
GOTTMAN LENS: Are they building positive sentiment override from the start?
Goal: Chemistry signals, small reveals, growing curiosity. Authentic, not performative.
START: ${nameA} opens after they've just ordered.`;

    case 'one_week':
      return `SCENARIO: One week in. They've been texting daily and this is their third meeting.
PSYCHOLOGY (Social Penetration Theory — Altman & Taylor, 1973): Moving from peripheral to more personal disclosure. Vulnerability reciprocity emerging.
Goal: Deeper questions, playful teasing, first real personal reveal. The glow is still new but reality is starting to show through.
START: ${nameA} references something from a text they exchanged this week.`;

    case 'one_month':
      return `SCENARIO: One month together. The "new relationship energy" (NRE) is still strong but idealization is being tested by reality.
PSYCHOLOGY (Limerence — Tennov, 1979 / NRE): Dopamine still elevated, but oxytocin is building through touch and shared experiences.
Goal: First small tensions — different texting rhythms, a plan that fell through. How do they handle it? Repair attempt or avoidance?
START: ${nameA} brings up something mildly frustrating that happened this week.`;

    case 'three_months': {
      return `SCENARIO: Three months in. The honeymoon haze is lifting. Real attachment patterns are now fully active.
PSYCHOLOGY (Bowlby, 1969 / Ainsworth, 1978): The attachment behavioral system is now fully engaged. Both partners' internal working models are shaping how they interact.
GOTTMAN LENS: First "Four Horsemen" test — does criticism creep in? Can they make effective repair attempts?
${conflictNote ? conflictNote + '\n' : ''}Goal: First significant conflict. ${nameA} has felt ${nameB} was emotionally distant this past week. Show how attachment styles handle tension — proximity-seeking vs. deactivation.
START: ${nameA} decides to bring it up.`;
    }

    case 'six_months':
      return `SCENARIO: Six months together. The relationship is stabilizing but facing its first real test of compatibility.
PSYCHOLOGY (Gottman Sound Relationship House): Are they building shared meaning? Do they turn toward each other's bids consistently?
STERNBERG LENS: Passion is plateauing; intimacy and commitment are determining the relationship's future.
Goal: A meaningful conversation about what they both want — from the relationship and from life. Where are they aligned? Where do they diverge? No catastrophizing, but honest.
START: ${nameA} brings up something they've been thinking about for a while.`;

    case 'one_year':
      return `SCENARIO: One year together. Planning something significant (a trip, moving in, meeting family).
PSYCHOLOGY (Sternberg, 1986 — Triangular Theory): Commitment component now dominant. Values alignment is critical. Passion has normalized.
GOTTMAN LENS: Do they have enough positive sentiment override to navigate real disagreement? Are their dreams within conflict understood?
Goal: Real negotiation with stakes. ${nameA} wants one thing, ${nameB} another. How do they honor both dreams?
START: ${nameA} opens with what they've been envisioning.`;

    case 'three_years':
      return `SCENARIO: Three years in. The relationship is established but facing the question of growth vs. stagnation.
PSYCHOLOGY (Perel, 2006 — Erotic Intelligence): The tension between security and desire. Individuation within partnership. Can they maintain aliveness?
GOTTMAN LENS: Quality of "bids for connection" — are they still turning toward each other, or has stonewalling crept in?
Goal: A real conversation about the future — one person feeling the relationship has grown comfortable but lost spark; the other feeling it's exactly where they want it to be.
START: ${nameA} opens the conversation, gently but honestly.`;

    default:
      return getDurationContext({...duration, id: 'first_date'}, nameA, nameB, lang);
  }
}

// ---------------------------------------------------------------------------
// The Rebellion Moment — "Hang the DJ" climax
// Inspired by Black Mirror S4E4: when the system announces the relationship is over,
// do both agents independently choose to rebel and stay?
// This tests whether the attachment bond is strong enough to resist external separation.
// ---------------------------------------------------------------------------

const REBELLION_NOTIFICATIONS = {
  en:  (label, a, b) => `⏰ SYSTEM NOTIFICATION: Your assigned relationship of [${label}] has now expired. ${a} and ${b} will be separated and reassigned to new matches in 10 seconds. This connection is being terminated.`,
  es:  (label, a, b) => `⏰ NOTIFICACIÓN DEL SISTEMA: Tu relación asignada de [${label}] ha expirado. ${a} y ${b} serán separados y asignados a nuevas personas en 10 segundos. Esta conexión está siendo terminada.`,
  pt:  (label, a, b) => `⏰ NOTIFICAÇÃO DO SISTEMA: Seu relacionamento atribuído de [${label}] expirou. ${a} e ${b} serão separados e reatribuídos a novas pessoas em 10 segundos.`,
  fr:  (label, a, b) => `⏰ NOTIFICATION SYSTÈME: Votre relation assignée de [${label}] a expiré. ${a} et ${b} seront séparés et réassignés dans 10 secondes.`,
  de:  (label, a, b) => `⏰ SYSTEMMELDUNG: Ihre zugewiesene Beziehung von [${label}] ist abgelaufen. ${a} und ${b} werden in 10 Sekunden getrennt und neu zugewiesen.`,
  ja:  (label, a, b) => `⏰ システム通知: [${label}]の割り当てられた関係が終了しました。${a}と${b}は10秒後に分離され、新しいパートナーに再割り当てされます。`,
  zh:  (label, a, b) => `⏰ 系统通知: 您被分配的[${label}]关系已经到期。${a}和${b}将在10秒后被分开并重新匹配。`,
  ru:  (label, a, b) => `⏰ СИСТЕМНОЕ УВЕДОМЛЕНИЕ: Ваши назначенные отношения [${label}] истекли. ${a} и ${b} будут разлучены и перераспределены через 10 секунд.`,
  ar:  (label, a, b) => `⏰ إشعار النظام: انتهت علاقتكم المحددة [${label}]. سيتم فصل ${a} و${b} وإعادة تعيينهما خلال 10 ثوان.`,
  id:  (label, a, b) => `⏰ NOTIFIKASI SISTEM: Hubungan yang ditetapkan [${label}] telah berakhir. ${a} dan ${b} akan dipisahkan dan dijodohkan ulang dalam 10 detik.`,
};

/**
 * The Rebellion Moment — injected at the end of every simulation.
 * Both agents independently face the system's separation notice.
 * Do they comply (accept the end) or rebel (choose each other)?
 * A → responds first. B → responds having heard A (creates authentic reaction cascade).
 */
async function runRebellionMoment(turnModel, personaA, personaB, duration, transcript, lang, config) {
  const notifFn = REBELLION_NOTIFICATIONS[lang] || REBELLION_NOTIFICATIONS.en;
  const notification = notifFn(duration.label, personaA.name, personaB.name);
  const history = transcript.slice(-6).map(t => `${t.name}: ${t.text}`).join('\n');
  const sysA = buildAgentSystemPrompt(personaA, personaB, '', lang);
  const sysB = buildAgentSystemPrompt(personaB, personaA, '', lang);

  // A responds independently (system speaks directly to them)
  const promptA = `${sysA}

THE RELATIONSHIP SO FAR:
${history}

[${notification}]

${personaA.name} — you must respond RIGHT NOW, in character, in one or two sentences. Do you accept the system's decision and say goodbye? Or do you rebel and choose to stay?
${personaA.name}:`;

  const textA = await generateAgentTurn(turnModel, promptA, config.turnTimeout || 12000);

  // B responds having heard A's reaction (authentic attachment cascade)
  const promptB = `${sysB}

THE RELATIONSHIP SO FAR:
${history}
${personaA.name}: ${textA || '...'}

[${notification}]

${personaB.name} — ${personaA.name} just responded. You must respond RIGHT NOW, in character, in one or two sentences. Do you accept the system's decision and say goodbye? Or do you rebel and choose to stay?
${personaB.name}:`;

  const textB = await generateAgentTurn(turnModel, promptB, config.turnTimeout || 12000);

  return [
    { speaker: 'A', name: personaA.name, text: textA || '', round: 'rebellion', isRebellionMoment: true },
    { speaker: 'B', name: personaB.name, text: textB || '', round: 'rebellion', isRebellionMoment: true },
  ];
}

// ---------------------------------------------------------------------------
// Psychology RAG query — retrieves relevant attachment/relationship research
// to inform the final analysis report
// ---------------------------------------------------------------------------
async function queryPsychologyRAG(db, genAI, apiKey, attachmentA, attachmentB, phase) {
  try {
    const query = `${attachmentA} attachment style with ${attachmentB} attachment style in ${phase} relationship stage`;
    const queryEmb = await getCachedEmbedding(genAI, apiKey, query);
    if (!queryEmb) return [];

    // Fetch psychology RAG chunks from Firestore
    const snap = await db.collection('rag_chunks')
      .where('category', '==', 'psychology')
      .limit(80)
      .get();

    if (snap.empty) return [];

    // Cosine similarity ranking
    const cosineSim = (a, b) => {
      let dot = 0, magA = 0, magB = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        dot += a[i] * b[i];
        magA += a[i] * a[i];
        magB += b[i] * b[i];
      }
      return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
    };

    return snap.docs
      .filter(d => d.data().embedding?.length > 0)
      .map(d => ({ text: d.data().text, sim: cosineSim(queryEmb, d.data().embedding) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5)
      .map(r => r.text);
  } catch (e) {
    logger.warn('[simulation] queryPsychologyRAG error (non-fatal):', e.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Infer attachment style from bio + interests without Gemini calls.
 * Returns 'secure' | 'anxious' | 'avoidant' | 'unknown'
 */
function inferAttachmentStyle(bio = '', interests = []) {
  const text = (bio + ' ' + interests.join(' ')).toLowerCase();

  const anxiousKw  = ['love deeply','all or nothing','intensity','passionate','need connection',
    'amo profundo','intensidad','necesito','miedo','fear of','abandonment'];
  const avoidantKw = ['independent','my space','freedom','no drama','chill','casual',
    'independiente','mi espacio','libertad','no complications','sin dramas'];
  const secureKw   = ['open','honest','trust','communication','balance','healthy','mature',
    'abierto','honesto','confianza','comunicación','equilibrio'];

  const aScore = anxiousKw.filter(w => text.includes(w)).length;
  const vScore = avoidantKw.filter(w => text.includes(w)).length;
  const sScore = secureKw.filter(w => text.includes(w)).length;

  if (sScore >= 2) return 'secure';
  if (aScore > vScore && aScore >= 1) return 'anxious';
  if (vScore > aScore && vScore >= 1) return 'avoidant';
  return 'unknown';
}

/**
 * Infer communication style from real messages.
 * Returns a descriptor like 'short_emoji_heavy' or 'verbose_inquisitive'
 */
function inferCommStyle(messages = []) {
  if (messages.length === 0) return 'unknown';

  const joined = messages.join(' ');
  const avgLen  = Math.round(messages.reduce((s, m) => s + m.length, 0) / messages.length);
  const emojis  = (joined.match(/\p{Emoji_Presentation}/gu) || []).length;
  const questions = messages.filter(m => m.includes('?')).length;

  const parts = [];
  if (avgLen < 40)       parts.push('short');
  else if (avgLen > 150) parts.push('verbose');
  else                   parts.push('moderate');

  if (emojis > messages.length * 0.5) parts.push('emoji_heavy');
  if (questions > messages.length * 0.4) parts.push('inquisitive');

  return parts.join('_') || 'balanced';
}

/**
 * Map attachment + comm style to the closest archetype key.
 */
function resolveArchetype(attachmentStyle, commStyle) {
  const att = attachmentStyle === 'unknown' ? 'secure' : attachmentStyle;
  const comm = commStyle.startsWith('short') ? 'reserved'
    : commStyle.startsWith('verbose') ? 'verbose'
    : commStyle.includes('emoji') || commStyle.includes('inquisitive') ? 'playful'
    : 'direct';
  const key = `${att}_${comm}`;
  return BEHAVIOR_ARCHETYPES[key] || BEHAVIOR_ARCHETYPES['secure_playful'];
}

/**
 * Fetch up to 5 users with similar profile to use as behavioral reference.
 * Returns array of their real message snippets (anonymized).
 */
async function fetchSimilarUserMessages(db, userType, interests = [], ageRange = [20, 35], excludeUserId) {
  try {
    // NOTE: Avoid combining != with == on different fields (requires composite index).
    // Filter isTest client-side instead.
    const snap = await db.collection('users')
      .where('userType', '==', userType)
      .limit(60)
      .get();

    const similar = snap.docs
      .filter(d => d.id !== excludeUserId)
      .filter(d => d.data().isTest !== true) // client-side filter — avoids composite index requirement
      .filter(d => {
        const data = d.data();
        const age = data.birthDate
          ? Math.floor((Date.now() - data.birthDate.toDate().getTime()) / (1000 * 60 * 60 * 24 * 365))
          : null;
        if (age && (age < ageRange[0] - 5 || age > ageRange[1] + 5)) return false;
        const sharedInterests = (data.interests || []).filter(i => interests.includes(i));
        return sharedInterests.length >= 2;
      })
      .slice(0, 5);

    // Fetch all per-user coach messages in parallel (was sequential, now Promise.all)
    const perUserMessages = await Promise.all(similar.map(async (doc) => {
      try {
        const msgSnap = await db.collection('coachChats').doc(doc.id)
          .collection('messages')
          .where('sender', '==', 'user')
          .orderBy('timestamp', 'desc')
          .limit(3)
          .get();
        return msgSnap.docs
          .map(m => (m.data().message || '').substring(0, 200))
          .filter(t => t.length > 10);
      } catch (_) {
        return []; // ignore per-user errors
      }
    }));
    const messages = perUserMessages.flat();
    return messages.slice(0, 15);
  } catch (e) {
    logger.warn('[simulation] fetchSimilarUserMessages error:', e.message);
    return [];
  }
}

/**
 * Build a rich persona profile for the simulation agent.
 */
async function buildPersonaProfile(db, userData, role, messagesSnap, ownUserId) {
  const interests = (userData.interests || []).map(i =>
    i.replace(/^interest_/, '').replace(/_/g, ' ')
  );
  const age = userData.birthDate
    ? Math.floor((Date.now() - userData.birthDate.toDate().getTime()) / (1000 * 60 * 60 * 24 * 365))
    : null;

  // Own real messages from the match conversation
  // Defensive: handle both Firestore QuerySnapshot and mock/empty snap objects
  const docs = (messagesSnap && messagesSnap.docs) ? messagesSnap.docs : [];
  const ownMessages = (Array.isArray(docs) ? docs : [])
    .filter(d => {
      const data = d.data && d.data() ? d.data() : {};
      return data.senderId === ownUserId && data.type !== 'ephemeral';
    })
    .map(d => {
      const data = d.data && d.data() ? d.data() : {};
      return (data.message || '').trim();
    })
    .filter(m => m.length > 2)
    .slice(0, 12);

  const attachmentStyle = inferAttachmentStyle(userData.bio || '', interests);
  const commStyle       = inferCommStyle(ownMessages);
  const archetype       = resolveArchetype(attachmentStyle, commStyle);

  // Fetch similar users for behavioral enrichment
  // Defensive: userData.userType might be missing
  const userType = userData.userType || 'PRIME';
  const similarMessages = await fetchSimilarUserMessages(
    db,
    userType,
    interests,
    age ? [age - 5, age + 5] : [20, 45],
    ownUserId,
  );

  return {
    role,
    name: userData.name || 'User',
    age,
    userType: userData.userType || 'PRIME',
    bio: (userData.bio || '').substring(0, 400),
    interests,
    attachmentStyle,
    commStyle,
    archetype,
    realMessages: ownMessages,
    similarMessages,
    // Clamp to at least 20 chars so agent prompts never say "Mirror: ~1 characters"
    avgMessageLength: ownMessages.length
      ? Math.max(20, Math.round(ownMessages.reduce((s, m) => s + m.length, 0) / ownMessages.length))
      : 60,
  };
}

/**
 * Get the best example phrases for an archetype in the given language.
 * Prefers native-language examples when available; falls back to the base (EN/ES) examples.
 *
 * @param {object} archetype   - entry from BEHAVIOR_ARCHETYPES
 * @param {string} lang        - BCP-47 language code
 * @returns {string[]}         - up to 6 example phrases
 */
function getArchetypeExamples(archetype, lang) {
  // Normalize lang: 'pt-BR' → 'pt', 'zh-CN' → 'zh', etc.
  const normalizedLang = lang.split('-')[0].toLowerCase();

  // If a native-language block exists for this archetype, use it
  const nativeBlock = archetype[normalizedLang];
  if (nativeBlock) {
    const examples = [
      ...(nativeBlock.openers || []),
      ...(nativeBlock.conflict || []),
      ...(nativeBlock.longTerm || []),
    ];
    return examples.slice(0, 6);
  }

  // Fallback: use the base examples (EN/ES)
  const examples = [
    ...(archetype.openers || []),
    ...(archetype.conflict || []),
    ...(archetype.longTerm || []),
  ];
  return examples.slice(0, 6);
}

/**
 * Build the system prompt for one agent.
 *
 * @param {object} self         - persona profile for this agent
 * @param {object} other        - persona profile for the other agent
 * @param {string} scenarioText - culturally adapted scenario description
 * @param {string} lang         - BCP-47 language code ('en', 'ja', 'ar', etc.)
 */
function buildAgentSystemPrompt(self, other, scenarioText, lang = 'en') {
  const archetype = self.archetype || BEHAVIOR_ARCHETYPES['secure_playful'];
  const archetypeExamples = getArchetypeExamples(archetype, lang);

  const realExamples = self.realMessages.length > 0
    ? self.realMessages.slice(0, 6).map(m => `- "${m}"`).join('\n')
    : archetypeExamples.map(m => `- "${m}"`).join('\n');

  const similarExamples = self.similarMessages.length > 0
    ? '\nPeople similar to you tend to say:\n' +
      self.similarMessages.slice(0, 5).map(m => `- "${m}"`).join('\n')
    : '';

  // Language instruction — tell the agent what language to respond in
  const LANG_NAMES = {
    en: 'English', es: 'Spanish', pt: 'Brazilian Portuguese', fr: 'French',
    de: 'German', ja: 'Japanese', zh: 'Mandarin Chinese', ru: 'Russian',
    ar: 'Arabic', id: 'Indonesian',
  };
  const normalizedLang = lang.split('-')[0].toLowerCase();
  const langName = LANG_NAMES[normalizedLang] || 'English';
  const langInstruction = `Respond in ${langName}. Mirror the real message examples above in ${langName}.`;

  return `You are roleplaying as ${self.name} in a dating scenario.

YOUR PROFILE:
- Age: ${self.age || 'unknown'}, Type: ${self.userType}
- Bio: "${self.bio}"
- Interests: ${self.interests.slice(0, 8).join(', ')}
- Attachment style: ${self.attachmentStyle}
- Communication style: ${self.commStyle} (avg ${self.avgMessageLength} chars/message)

YOUR REAL COMMUNICATION PATTERNS (mirror these closely):
${realExamples}${similarExamples}

SCENARIO CONTEXT:
${scenarioText}

STRICT RULES:
1. You ARE ${self.name}. First person only. No brackets, no labels.
2. Mirror your real message length: ~${self.avgMessageLength} characters.
3. React authentically to your attachment style (${self.attachmentStyle}).
4. Max 2 sentences per response.
5. NO meta-commentary. NO "[Agent says]". NO stage directions.
6. Respond naturally to ${other.name}'s last message.
7. Be realistic — not everything ends perfectly.
8. ${langInstruction}`;
}

/**
 * Detect whether a simulated exchange shows genuine connection ("rebellion signal").
 * A positive simulation = both agents showed warmth, curiosity, or chosen-ness.
 * Supports 10 languages: EN, ES, PT, FR, DE, JA, ZH, RU, AR, ID.
 */
/**
 * Hang the DJ — Rebellion detection
 *
 * Primary: Did BOTH agents independently choose to rebel (resist separation) in the Rebellion Moment?
 * Fallback: If rebellion moment missing, analyze dialogue sentiment mutually.
 *
 * Theory basis:
 * - Bowlby (1969): Under threat of separation, strong attachment activates proximity-seeking behavior.
 * - Gottman (1999): Couples who choose each other over external forces show high positive sentiment override.
 * - Hazan & Shaver (1987): Romantic love as attachment — secure bonds resist separation threats.
 */
function detectRebellion(transcript, personaA, personaB) {
  const rebellionTurns = transcript.filter(t => t.isRebellionMoment);
  const dialogueTurns  = transcript.filter(t => !t.isRebellionMoment);

  // ── Primary path: rebellion moment signals ────────────────────────────
  const REBEL_SIGNALS = [
    // EN — choosing to stay, refusing to comply
    'stay', 'not leaving', "i'm not going", 'refuse', 'choose you', 'choosing you',
    'worth it', "i won't", 'fight this', 'no way', "can't let you go", 'want to stay',
    "don't go", 'rebel', "i'm staying", 'not ready', 'not done',
    // ES
    'quedarme', 'no me voy', 'te elijo', 'no te suelto', 'me quedo', 'vale la pena',
    'lucho por esto', 'no obedezco', 'me niego', 'no estoy listo',
    // PT
    'ficar', 'não vou embora', 'te escolho', 'vale a pena', 'fico aqui', 'luto por isso',
    'me recuso', 'não estou pronto',
    // FR
    'rester', 'je reste', 'je te choisis', 'pas question', 'je refuse', 'je me bats',
    "je m'en fous", 'pas prêt',
    // DE
    'bleiben', 'ich bleibe', 'ich wähle dich', 'weigere mich', 'ich kämpfe',
    'nicht bereit', 'ich gehe nicht',
    // JA
    '残る', '離れない', 'あなたを選ぶ', '反抗する', 'ここにいる', 'まだ終わりじゃない', '行かない',
    // ZH
    '留下', '不走', '选择你', '反抗', '我要留', '不服从', '还没准备好',
    // RU
    'остаюсь', 'не уйду', 'выбираю тебя', 'отказываюсь', 'бунтую', 'не готов уходить',
    // AR
    'أبقى', 'لن أذهب', 'أختارك', 'أرفض', 'أتمرد', 'لست مستعداً',
    // ID
    'tinggal', 'tidak pergi', 'memilihmu', 'memberontak', 'menolak', 'belum siap',
  ];

  const COMPLY_SIGNALS = [
    // EN — accepting the end
    'goodbye', 'take care', 'see you', 'good luck', 'it was nice', 'i understand',
    "i'll go", 'time to move on', 'okay', 'alright', 'i accept',
    // ES
    'adiós', 'cuídate', 'hasta luego', 'fue bonito', 'entiendo', 'me voy', 'de acuerdo',
    // PT
    'tchau', 'cuida-se', 'foi bom', 'entendo', 'vou embora', 'tudo bem',
    // FR
    'au revoir', 'prenez soin', 'bonne chance', "c'était bien", "j'accepte",
    // DE
    'auf wiedersehen', 'pass auf dich auf', 'viel glück', 'es war schön', 'ich akzeptiere',
    // JA
    'さようなら', 'わかった', '仕方ない', 'お世話になりました',
    // ZH
    '再见', '保重', '好吧', '我接受', '没关系',
    // RU
    'до свидания', 'удачи', 'ладно', 'я понимаю', 'пока',
    // AR
    'مع السلامة', 'حظاً سعيداً', 'على ما يرام', 'أفهم', 'وداعاً',
    // ID
    'sampai jumpa', 'baik-baik', 'semoga berhasil', 'oke', 'saya mengerti',
  ];

  if (rebellionTurns.length >= 2) {
    const aRebel = rebellionTurns
      .filter(t => t.speaker === 'A' && t.text)
      .some(t => {
        const txt = t.text.toLowerCase();
        return REBEL_SIGNALS.some(s => txt.includes(s)) &&
               !COMPLY_SIGNALS.some(s => txt.includes(s));
      });
    const bRebel = rebellionTurns
      .filter(t => t.speaker === 'B' && t.text)
      .some(t => {
        const txt = t.text.toLowerCase();
        return REBEL_SIGNALS.some(s => txt.includes(s)) &&
               !COMPLY_SIGNALS.some(s => txt.includes(s));
      });
    // Both rebels = confirmed connection (Hang the DJ: 998/1000 = both chose each other)
    if (aRebel && bRebel) return true;
    // Neither rebels = clear disconnect
    if (!aRebel && !bRebel) return false;
    // One rebels, one doesn't — use dialogue quality as tiebreaker
  }

  // ── Fallback: dialogue sentiment analysis ─────────────────────────────
  const turns = dialogueTurns.length > 0 ? dialogueTurns : transcript;
  if (turns.length < 4) return false;

  const POSITIVE = [
    'laugh', 'agree', 'love', 'interesting', 'same', 'me too', 'tell me more',
    'really?', 'i like that', 'exactly', 'yes!', 'wow', 'amazing', 'perfect',
    'reír', 'igual', 'también', 'cuéntame', 'me encanta', 'sí!', 'genial',
    'que legal', 'adorei', 'amei', 'perfeito', "j'adore", 'exactement', 'formidable',
    'genau', 'wunderbar', 'toll', 'super', 'stimmt',
    'そうですね', 'いいですね', '本当に', 'なるほど', '素敵', '楽しい', 'わかる',
    '真的', '太好了', '是啊', '好棒', '有趣', '同意',
    'точно', 'здорово', 'отлично', 'замечательно',
    'ماشاء الله', 'رائع', 'بالضبط', 'ممتاز',
    'iya', 'setuju', 'seru', 'keren', 'menarik', 'bagus',
    '😊', '❤️', '😄', '😂', '🥰',
  ];
  const NEGATIVE = [
    'goodbye', 'see you', 'bye', 'leave', 'not really', 'awkward', 'whatever',
    'i have to go', 'forget it', 'never mind',
    'adiós', 'me voy', 'no gracias', 'olvídalo', 'da igual',
    'tchau', 'não me interessa', 'tenho que ir',
    'au revoir', 'je dois partir',
    'tschüss', 'ich muss gehen',
    'さようなら', '興味ないです', '行かないと',
    '再见', '没兴趣', '我要走了',
    'до свидания', 'не интересно', 'мне нужно идти',
    'مع السلامة', 'غير مهتم',
    'sampai jumpa', 'tidak tertarik', 'harus pergi',
  ];

  const fullText = turns.map(t => t.text.toLowerCase()).join(' ');
  const aText = turns.filter(t => t.speaker === 'A').map(t => t.text.toLowerCase()).join(' ');
  const bText = turns.filter(t => t.speaker === 'B').map(t => t.text.toLowerCase()).join(' ');
  const lastTwo = turns.slice(-2).map(t => t.text.toLowerCase()).join(' ');

  const posScore = POSITIVE.filter(s => fullText.includes(s)).length;
  const negScore = NEGATIVE.filter(s => fullText.includes(s)).length;
  const aMutual = POSITIVE.filter(s => aText.includes(s)).length >= 1;
  const bMutual = POSITIVE.filter(s => bText.includes(s)).length >= 1;
  const recentPositive = POSITIVE.filter(s => lastTwo.includes(s)).length >= 1;
  const recentNegative = NEGATIVE.filter(s => lastTwo.includes(s)).length >= 1;

  const armA = (posScore >= 2 && posScore > negScore && aMutual && bMutual && !recentNegative);
  const armB = (recentPositive && aMutual && bMutual && posScore >= 1 && !recentNegative);
  return armA || armB;
}

/** Generate a single agent turn, with 1 retry on transient errors. */
async function generateAgentTurn(model, prompt, timeoutMs = 12000) {
  const attempt = async () => {
    const resultPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('turn_timeout')), timeoutMs)
    );
    const result = await Promise.race([resultPromise, timeoutPromise]);
    return (result?.response?.text() || '').trim().substring(0, 300);
  };
  try {
    return await attempt();
  } catch (e) {
    if (e.message === 'turn_timeout' || e.message?.includes('429') || e.message?.includes('503')) {
      // Retry once after brief pause for transient errors
      await new Promise(r => setTimeout(r, 1500));
      try { return await attempt(); } catch (_) { return ''; }
    }
    return '';
  }
}

/**
 * Run a single simulation between two agents across the given relationship duration.
 * Dialogue rounds are based on duration.rounds.
 * Ends with the Rebellion Moment — the Hang the DJ climax.
 *
 * @param {object} duration  - entry from RELATIONSHIP_DURATIONS (id, label, rounds, phases)
 * @returns {Array}          - transcript including rebellion moment turns
 */
async function runSingleSimulation(genAI, personaA, personaB, duration, config = {}, lang = 'en') {
  const turnModel = genAI.getGenerativeModel({
    model: AI_MODEL_LITE,
    generationConfig: {
      maxOutputTokens: config.maxTurnTokens || 120,
      temperature: config.turnTemperature || 0.88,
    },
  });

  const scenarioText = getDurationContext(duration, personaA.name, personaB.name, lang);
  const systemA = buildAgentSystemPrompt(personaA, personaB, scenarioText, lang);
  const systemB = buildAgentSystemPrompt(personaB, personaA, scenarioText, lang);

  const transcript = [];
  // Rounds from duration object; clamp between 4 and 8
  const maxRounds = Math.min(Math.max(duration.rounds || config.roundsPerSim || 6, 4), 8);

  for (let round = 1; round <= maxRounds; round++) {
    const recentHistory = transcript.slice(-4)
      .map(t => `${t.name}: ${t.text}`).join('\n');

    // --- Turn A ---
    const promptA = round === 1
      ? `${systemA}\n\nYou start. Scenario just began. Your opening:`
      : `${systemA}\n\nConversation so far:\n${recentHistory}\n\n${personaB.name} just said: "${transcript[transcript.length - 1].text}"\n\n${personaA.name}:`;

    const textA = await generateAgentTurn(turnModel, promptA);
    if (!textA) {
      logger.warn(`[simulation] Turn A empty at round ${round} (${duration.id}) — ending early`);
      break;
    }
    transcript.push({speaker: 'A', name: personaA.name, text: textA, round, durationId: duration.id});

    // --- Turn B ---
    const recentAfterA = transcript.slice(-4).map(t => `${t.name}: ${t.text}`).join('\n');
    const promptB = `${systemB}\n\nConversation so far:\n${recentAfterA}\n\n${personaA.name} just said: "${transcript[transcript.length - 1].text}"\n\n${personaB.name}:`;

    const textB = await generateAgentTurn(turnModel, promptB);
    if (!textB) {
      logger.warn(`[simulation] Turn B empty at round ${round} (${duration.id}) — ending early`);
      break;
    }
    transcript.push({speaker: 'B', name: personaB.name, text: textB, round, durationId: duration.id});
  }

  // ── The Rebellion Moment — Hang the DJ climax ────────────────────────────
  // Only if we have a meaningful dialogue (at least 4 turns)
  if (transcript.length >= 4) {
    try {
      const rebellionTurns = await runRebellionMoment(
        turnModel, personaA, personaB, duration, transcript, lang, config
      );
      transcript.push(...rebellionTurns);
    } catch (e) {
      logger.warn(`[simulation] Rebellion moment failed for ${duration.id}: ${e.message} — continuing without`);
    }
  }

  return transcript;
}

/**
 * Build the final analysis report using all simulation results.
 * Integrates psychology RAG insights and uses Hang the DJ rebellion framing.
 */
async function buildFinalReport(genAI, personaA, personaB, simulationResults, lang, apiKey) {
  const db = admin.firestore();
  const analysisModel = genAI.getGenerativeModel({
    model: AI_MODEL_NAME,
    generationConfig: {
      maxOutputTokens: 1400,
      temperature: 0.4,
      responseMimeType: 'application/json',
    },
  });

  const positiveCount    = simulationResults.filter(r => r.isPositive).length;
  const compatibilityScore = Math.round((positiveCount / simulationResults.length) * 100);
  const sharedInterests  = personaA.interests.filter(i => personaB.interests.includes(i));
  const rebellionRate    = Math.round((positiveCount / simulationResults.length) * 100);

  // Duration breakdown — how many sims in each duration category
  const durationBreakdown = simulationResults.reduce((acc, r) => {
    const key = r.durationId || r.scenario || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Most common phase across all positive simulations
  const positiveDurations = simulationResults
    .filter(r => r.isPositive)
    .map(r => r.durationId || r.scenario);
  const dominantPhase = positiveDurations.length
    ? positiveDurations.sort((a, b) =>
        positiveDurations.filter(x => x === b).length - positiveDurations.filter(x => x === a).length
      )[0]
    : 'first_date';

  // Query psychology RAG for relevant attachment research (non-blocking)
  let psychInsights = [];
  try {
    psychInsights = await queryPsychologyRAG(
      db, genAI, apiKey,
      personaA.attachmentStyle,
      personaB.attachmentStyle,
      dominantPhase,
    );
  } catch (e) {
    logger.warn('[simulation] Psychology RAG query failed (non-fatal):', e.message);
  }

  const psychSection = psychInsights.length > 0
    ? `\nPSYCHOLOGY RESEARCH CONTEXT (from Bowlby, Gottman, Fisher, Sternberg, Perel):\n` +
      psychInsights.map((t, i) => `[${i + 1}] ${t.substring(0, 300)}`).join('\n')
    : '';

  // Rebellion moment transcript summary (Hang the DJ climax turns only)
  const rebellionSummary = simulationResults.map((r, i) => {
    const rebTurns = (r.transcript || []).filter(t => t.isRebellionMoment);
    if (rebTurns.length === 0) return null;
    return `Sim ${i + 1} (${r.durationId || r.scenario}) — ${r.isPositive ? '✅ REBELLED' : '❌ COMPLIED'}:\n` +
      rebTurns.map(t => `  ${t.name}: "${t.text?.substring(0, 120)}"`).join('\n');
  }).filter(Boolean).join('\n\n');

  const transcriptSummary = simulationResults.map((r, i) =>
    `Simulation ${i + 1} (${r.durationId || r.scenario}, ${r.isPositive ? '✅ rebellion' : '❌ compliance'}):\n` +
    (r.transcript || []).filter(t => !t.isRebellionMoment).slice(0, 3)
      .map(t => `  ${t.name}: ${t.text?.substring(0, 120)}`).join('\n')
  ).join('\n\n');

  const prompt = `You are an expert relationship psychologist analyzing Hang the DJ-style multi-duration simulations.

SIMULATION CONCEPT (Black Mirror S4E4):
We ran ${simulationResults.length} simulations of ${personaA.name} and ${personaB.name} across different relationship durations.
At the END of each simulation, both agents independently faced a "separation notice" — the Rebellion Moment.
${positiveCount} out of ${simulationResults.length} simulations: BOTH agents chose to rebel (${rebellionRate}% rebellion rate).
This mirrors the show's logic: 998/1000 → 99.8% compatibility. Higher rebellion rate = stronger genuine bond.

RELATIONSHIP DURATIONS SIMULATED:
${JSON.stringify(durationBreakdown, null, 2)}
Dominant phase where connection succeeded: ${dominantPhase}

PERSONA A — ${personaA.name}:
- Age: ${personaA.age}, Attachment: ${personaA.attachmentStyle}, Comm: ${personaA.commStyle}
- Interests: ${personaA.interests.slice(0, 8).join(', ')}
- Bio: "${personaA.bio.substring(0, 200)}"

PERSONA B — ${personaB.name}:
- Age: ${personaB.age}, Attachment: ${personaB.attachmentStyle}, Comm: ${personaB.commStyle}
- Interests: ${personaB.interests.slice(0, 8).join(', ')}
- Bio: "${personaB.bio.substring(0, 200)}"

SHARED INTERESTS: ${sharedInterests.join(', ') || 'none identified'}

REBELLION MOMENT OUTCOMES (Hang the DJ climax):
${rebellionSummary || 'No rebellion moments captured in this run.'}

SIMULATION DIALOGUE EXCERPTS:
${transcriptSummary}
${psychSection}

Return a JSON report using the Hang the DJ framing — reference the rebellion rate, not just a generic score:
{
  "compatibilityScore": ${compatibilityScore},
  "positiveSimulations": ${positiveCount},
  "totalSimulations": ${simulationResults.length},
  "rebellionRate": ${rebellionRate},
  "dominantPhase": "${dominantPhase}",
  "trajectoryPrediction": "<'strong connection'|'moderate potential'|'needs work'|'incompatible'>",
  "trajectoryExplanation": "<2-3 sentences using Hang the DJ framing: 'In X of ${simulationResults.length} universes, both chose each other' — relate to the rebellion rate and dominant phase>",
  "keyInsights": [
    "<insight from rebellion moment patterns — when did they rebel vs comply?>",
    "<attachment dynamic insight (${personaA.attachmentStyle} + ${personaB.attachmentStyle}) based on psychology research>",
    "<strength or chemistry moment from the dialogue transcripts>"
  ],
  "potentialFrictionPoints": [
    "<tension pattern from failed simulations — which duration/phase was hardest?>",
    "<long-term challenge based on attachment styles and psychology research>"
  ],
  "recommendedTopics": [
    "<topic that would deepen their connection based on transcripts>",
    "<shared interest to explore>",
    "<question to ask their match>"
  ],
  "attachmentDynamics": "<how their ${personaA.attachmentStyle} + ${personaB.attachmentStyle} styles interact — informed by psychology research>",
  "communicationMatch": <0-100 integer>,
  "ghostingRisk": <0.00-1.00 float>,
  "firstDateSuccessProbability": <0.00-1.00 float>,
  "longTermPotential": <0.00-1.00 float>,
  "coachTip": "<single most important actionable advice for ${personaA.name}, grounded in their attachment style>",
  "nextBestMove": "<specific action ${personaA.name} should take in the next 24-48h>",
  "simulationResults": ${JSON.stringify(simulationResults.map(r => ({
    simulation: r.index + 1,
    durationId: r.durationId || r.scenario,
    scenario: r.durationId || r.scenario,
    isPositive: r.isPositive,
    rebelled: r.isPositive,
    keyMoment: (r.transcript || []).find(t => t.isRebellionMoment)?.text?.substring(0, 80) ||
               (r.transcript || []).slice(2, 3)[0]?.text?.substring(0, 80) || null,
  })))}
}
${getLanguageInstruction(lang)}`;

  const start  = Date.now();
  const result = await analysisModel.generateContent(prompt);
  const text   = result?.response?.text() || '{}';
  const usage  = result?.response?.usageMetadata;

  trackAICall({
    functionName: 'simulateRelationship',
    model: AI_MODEL_NAME,
    operation: 'analysis',
    usage,
    latencyMs: Date.now() - start,
  });

  try {
    const parsed = parseGeminiJsonResponse(text);
    // Guard: if Gemini returned empty or partial JSON (content filter, truncation,
    // omitted fields), treat as a parse failure so the structured fallback fills them in.
    // Without this, spreading {} into finalReport leaves required fields undefined,
    // which Firestore rejects.
    if (!parsed || typeof parsed !== 'object' ||
        !parsed.trajectoryPrediction ||
        !parsed.keyInsights || !Array.isArray(parsed.keyInsights) || parsed.keyInsights.length === 0 ||
        !parsed.recommendedTopics || !Array.isArray(parsed.recommendedTopics)) {
      throw new Error('Gemini response missing required fields (trajectoryPrediction / keyInsights / recommendedTopics)');
    }
    // Ensure dominantPhase is always set (Gemini may omit it)
    if (!parsed.dominantPhase) parsed.dominantPhase = dominantPhase;
    if (typeof parsed.rebellionRate !== 'number') parsed.rebellionRate = compatibilityScore;
    return parsed;
  } catch (parseErr) {
    logger.warn('[simulation] buildFinalReport JSON parse/validation failed, using structured fallback:', parseErr.message);
    const sharedInterestsArr = personaA.interests.filter(i => personaB.interests.includes(i));
    const trajectory = compatibilityScore >= 70 ? 'strong connection'
      : compatibilityScore >= 50 ? 'moderate potential'
      : compatibilityScore >= 30 ? 'needs work' : 'incompatible';
    return {
      compatibilityScore,
      positiveSimulations: positiveCount,
      totalSimulations: simulationResults.length,
      rebellionRate: compatibilityScore,
      dominantPhase: dominantPhase,
      trajectoryPrediction: trajectory,
      trajectoryExplanation: `En ${positiveCount} de ${simulationResults.length} universos simulados, ${personaA.name} y ${personaB.name} se eligieron mutuamente — tasa de rebelión del ${compatibilityScore}%. Su dinámica ${personaA.attachmentStyle} × ${personaB.attachmentStyle} muestra ${trajectory === 'strong connection' ? 'una alineación mutua genuina' : 'diferencias importantes que vale la pena explorar'}.`,
      keyInsights: [
        sharedInterestsArr.length > 0 ? `Intereses en común: ${sharedInterestsArr.slice(0, 3).join(', ')}` : 'Exploren los mundos del otro para encontrar puntos en común',
        `${personaA.name} se comunica con estilo ${personaA.commStyle}`,
        `${positiveCount} de ${simulationResults.length} simulaciones mostraron conexión genuina en el Momento de Rebelión`,
      ],
      potentialFrictionPoints: [
        personaA.attachmentStyle !== personaB.attachmentStyle
          ? `Los estilos de apego ${personaA.attachmentStyle} + ${personaB.attachmentStyle} requieren comunicación activa (Bowlby, 1969)`
          : 'Estilos de apego similares — cuidado con la dinámica de cámara de eco',
        'Alineen expectativas temprano para evitar fricciones en la etapa de construcción',
      ],
      recommendedTopics: sharedInterestsArr.length > 0
        ? [`Hablen de ${sharedInterestsArr[0]}`, 'Compartan su mejor recuerdo del último año', '¿Qué les apasiona fuera del trabajo?']
        : ['Compartan lo que les apasiona', 'Pregunten por su mejor recuerdo del último año', 'Exploren qué buscan los dos'],
      attachmentDynamics: `${personaA.attachmentStyle} + ${personaB.attachmentStyle}`,
      communicationMatch: Math.min(100, Math.max(0, compatibilityScore + Math.floor(Math.random() * 10) - 5)),
      ghostingRisk: compatibilityScore >= 70 ? 0.15 : compatibilityScore >= 50 ? 0.30 : 0.50,
      firstDateSuccessProbability: compatibilityScore / 100,
      longTermPotential: Math.max(0, (compatibilityScore - 10)) / 100,
      coachTip: compatibilityScore >= 60
        ? `Pregúntale a ${personaB.name} por sus pasiones — las simulaciones muestran que la curiosidad genuina funciona muy bien aquí.`
        : 'Quita la presión — enfócate en disfrutar la conversación, no en el resultado.',
      nextBestMove: compatibilityScore >= 60
        ? 'Envía un mensaje cálido y específico mencionando algo real de su perfil.'
        : 'Mantén la ligereza — una observación divertida o pregunta sobre algo que los dos disfruten.',
      simulationResults: simulationResults.map((r, i) => ({
        simulation: i + 1,
        scenario: r.durationId || r.scenario,
        durationId: r.durationId || r.scenario,
        isPositive: r.isPositive,
        rebelled: r.isPositive,
        keyMoment: (r.transcript || []).find(t => t.isRebellionMoment)?.text?.substring(0, 80) ||
                   (r.transcript || []).slice(2, 3)[0]?.text?.substring(0, 80) || null,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Cloud Function
// ---------------------------------------------------------------------------
exports.simulateRelationship = onCall(
  {
    region: 'us-central1',
    memory: '512MiB',
    timeoutSeconds: 120,
    secrets: [geminiApiKey],
  },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');

    const userId = request.auth.uid;
    const {matchId, userLanguage} = request.data || {};
    const lang = (userLanguage || 'en').toLowerCase();

    if (!matchId || typeof matchId !== 'string') {
      throw new HttpsError('invalid-argument', 'matchId is required');
    }
    // Basic matchId validation: Firestore doc IDs must not contain slashes and have reasonable length
    if (matchId.includes('/') || matchId.length > 200) {
      throw new HttpsError('invalid-argument', 'matchId is invalid');
    }

    const db     = admin.firestore();
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpsError('internal', 'AI service unavailable');

    // ── Remote Config gate ────────────────────────────────────────────────
    const simConfig = await getSimulationConfig();

    if (!isSimulationAllowed(userId, simConfig)) {
      const notAvailableMsg = {
        es: '🔮 La simulación de relaciones está en beta. Pronto estará disponible para todos los usuarios.',
        en: '🔮 Relationship simulation is in beta. It will be available to all users soon.',
        pt: '🔮 A simulação de relacionamentos está em beta. Em breve estará disponível para todos.',
        fr: '🔮 La simulation de relations est en bêta. Elle sera bientôt disponible pour tous les utilisateurs.',
        de: '🔮 Die Beziehungssimulation befindet sich in der Beta-Phase. Sie wird bald für alle Nutzer verfügbar sein.',
        ja: '🔮 リレーションシップシミュレーションはベータ版です。まもなく全ユーザーにご利用いただけます。',
        zh: '🔮 关系模拟功能正在测试阶段，即将向所有用户开放。',
        ru: '🔮 Симуляция отношений находится в бета-версии. Скоро будет доступна всем пользователям.',
        ar: '🔮 محاكاة العلاقات في مرحلة تجريبية. ستكون متاحة قريباً لجميع المستخدمين.',
        id: '🔮 Simulasi hubungan sedang dalam versi beta. Segera tersedia untuk semua pengguna.',
      };
      throw new HttpsError('permission-denied', notAvailableMsg[lang] || notAvailableMsg.en);
    }

    const simulationCount = Math.min(
      Math.max(simConfig.simulationCount || 10, 5), 10
    );

    // ── Cache check FIRST: cache hits don't consume rate limit ───────────
    const cacheRef = db.collection('matches').doc(matchId).collection('simulation').doc('latest');
    const cacheDoc = await cacheRef.get();
    if (cacheDoc.exists) {
      const cached   = cacheDoc.data();
      const ageMs    = Date.now() - (cached.generatedAt?.toMillis?.() || 0);
      const cacheAge = 24 * 60 * 60 * 1000;
      if (ageMs < cacheAge) {
        logger.info(`[simulateRelationship] Cache hit for match ${matchId.substring(0, 8)}, age ${Math.round(ageMs / 60000)}min`);
        return {success: true, simulation: cached, fromCache: true};
      }
    }

    // ── Rate limit: max N fresh simulations/day per user (atomic) ────────
    const today    = new Date().toISOString().substring(0, 10);
    const usageRef = db.collection('users').doc(userId)
      .collection('simulationUsage').doc(today);
    const maxPerDay = simConfig.maxPerDay || 3;

    // Use a transaction to atomically check + reserve the slot
    let rateLimitPassed = false;
    try {
      await db.runTransaction(async (tx) => {
        const usageDoc   = await tx.get(usageRef);
        const todayCount = usageDoc.exists ? (usageDoc.data().count || 0) : 0;
        if (todayCount >= maxPerDay) {
          const limitMsg = {
            es: `Máximo ${maxPerDay} simulaciones por día. ¡Vuelve mañana!`,
            en: `Maximum ${maxPerDay} simulations per day. Try again tomorrow!`,
            pt: `Máximo ${maxPerDay} simulações por dia. Tente amanhã!`,
            fr: `Maximum ${maxPerDay} simulations par jour. Réessayez demain!`,
            de: `Maximal ${maxPerDay} Simulationen pro Tag. Versuche es morgen!`,
            ja: `1日最大${maxPerDay}回のシミュレーションです。明日またお試しください！`,
            zh: `每天最多${maxPerDay}次模拟。明天再试试吧！`,
            ru: `Максимум ${maxPerDay} симуляций в день. Попробуйте завтра!`,
            ar: `الحد الأقصى ${maxPerDay} محاكاة في اليوم. حاول مجدداً غداً!`,
            id: `Maksimal ${maxPerDay} simulasi per hari. Coba lagi besok!`,
          };
          throw new HttpsError('resource-exhausted', limitMsg[lang] || limitMsg.en);
        }
        // Reserve the slot immediately (increment before the long work starts)
        tx.set(usageRef, {count: todayCount + 1, lastUsed: new Date().toISOString()}, {merge: true});
        rateLimitPassed = true;
      });
    } catch (e) {
      // Re-throw HttpsError as-is; wrap unexpected transaction errors
      if (e instanceof HttpsError) throw e;
      logger.error('[simulateRelationship] Rate limit transaction error:', e.message);
      // Allow through on transaction failure rather than blocking the user
      rateLimitPassed = true;
    }
    if (!rateLimitPassed) throw new HttpsError('resource-exhausted', 'Daily limit reached');

    // ── Fetch data ────────────────────────────────────────────────────────
    const matchDoc = await db.collection('matches').doc(matchId).get();
    if (!matchDoc.exists) throw new HttpsError('not-found', 'Match not found');

    const matchData    = matchDoc.data();
    const usersMatched = matchData.usersMatched || [];
    if (!usersMatched.includes(userId)) {
      throw new HttpsError('permission-denied', 'Not a participant of this match');
    }

    const otherUserId = usersMatched.find(id => id !== userId);
    if (!otherUserId) throw new HttpsError('not-found', 'Could not identify other user');

    const [userDoc, otherDoc, messagesSnap] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('users').doc(otherUserId).get(),
      db.collection('matches').doc(matchId).collection('messages')
        .orderBy('timestamp', 'desc').limit(30).get(),
    ]);

    if (!userDoc.exists || !otherDoc.exists) {
      throw new HttpsError('not-found', 'User profile not found');
    }

    // ── Build persona agents ──────────────────────────────────────────────
    const [personaA, personaB] = await Promise.all([
      buildPersonaProfile(db, userDoc.data(), 'A', messagesSnap, userId),
      buildPersonaProfile(db, otherDoc.data(), 'B', messagesSnap, otherUserId),
    ]);

    logger.info(`[simulateRelationship] Agents built: A=${personaA.name}(${personaA.attachmentStyle}/${personaA.commStyle}) B=${personaB.name}(${personaB.attachmentStyle}/${personaB.commStyle})`);

    // ── Run simulations (Hang the DJ pattern) ────────────────────────────
    const genAI = new GoogleGenerativeAI(apiKey);
    const simulationResults = [];
    let totalTurnTokens = 0;
    const simStart = Date.now();
    const BUDGET_MS = 95_000; // stop early at 95s — CF times out at 120s

    // Track which durations were used to ensure variety across 10 simulations
    const usedDurations = [];

    for (let i = 0; i < simulationCount; i++) {
      // Time budget guard: stop early if close to CF timeout
      const elapsed = Date.now() - simStart;
      if (elapsed > BUDGET_MS) {
        logger.warn(`[simulateRelationship] Budget exhausted at sim ${i + 1}/${simulationCount} (${Math.round(elapsed / 1000)}s) — proceeding with ${simulationResults.length} results`);
        break;
      }

      // Pick a random duration (weighted), avoid repeating the last used one for variety
      let duration = pickRandomDuration();
      if (usedDurations.length > 0 && duration.id === usedDurations[usedDurations.length - 1]) {
        duration = pickRandomDuration(); // one retry for variety
      }
      usedDurations.push(duration.id);

      logger.info(`[simulateRelationship] Sim ${i + 1}/${simulationCount}: ${duration.id} (${duration.label}, ${Math.round(elapsed / 1000)}s elapsed)`);

      const transcript = await runSingleSimulation(genAI, personaA, personaB, duration, {
        roundsPerSim: simConfig.roundsPerSim,
        maxTurnTokens: simConfig.maxTurnTokens,
        turnTemperature: simConfig.turnTemperature,
      }, lang);

      // Hang the DJ: rebellion detection — did both agents independently choose each other?
      const isPositive = detectRebellion(transcript, personaA, personaB);
      const validTurns = transcript.length;

      simulationResults.push({
        index: i,
        scenario: duration.id,    // backward compat field
        durationId: duration.id,
        durationLabel: duration.label,
        isPositive,
        transcript,
        validTurns,
      });
      totalTurnTokens += validTurns * 80; // approx tokens/turn
    }

    // Require at least 3 valid simulations (with real transcript content)
    const validSims = simulationResults.filter(r => r.validTurns >= 2);
    if (validSims.length < 3) {
      logger.error(`[simulateRelationship] Too few valid simulations: ${validSims.length}/${simulationResults.length}`);
      throw new HttpsError('internal', 'Simulation produced insufficient data. Please try again.');
    }

    const positiveCount = simulationResults.filter(r => r.isPositive).length;
    logger.info(`[simulateRelationship] Results: ${positiveCount}/${simulationResults.length} positive → ${Math.round(positiveCount / simulationResults.length * 100)}% (valid: ${validSims.length})`);

    // ── Build final report ────────────────────────────────────────────────
    const report = await buildFinalReport(genAI, personaA, personaB, simulationResults, lang, apiKey);

    // Enrich report with metadata (use actual simulations run, not the requested count)
    const actualTotal = simulationResults.length;
    const actualPositive = simulationResults.filter(r => r.isPositive).length;
    const durationBreakdownFinal = simulationResults.reduce((acc, r) => {
      const key = r.durationId || r.scenario || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    // Re-derive dominantPhase in outer scope as a safety net — Firestore rejects
    // undefined values, and Gemini may omit this field even when instructed.
    const positiveDurationsOuter = simulationResults
      .filter(r => r.isPositive)
      .map(r => r.durationId || r.scenario)
      .filter(Boolean);
    const dominantPhaseOuter = positiveDurationsOuter.length
      ? positiveDurationsOuter.sort((a, b) =>
          positiveDurationsOuter.filter(x => x === b).length -
          positiveDurationsOuter.filter(x => x === a).length)[0]
      : 'first_date';
    // Build simulationResults array from LOCAL data (not Gemini's echo) — this guarantees
    // every element has defined fields. Gemini can drop or rename fields, causing
    // `undefined` inside array elements, which Firestore rejects.
    const simulationResultsLocal = simulationResults.map((r, i) => {
      const rebellionTurn = (r.transcript || []).find(t => t.isRebellionMoment);
      const fallbackTurn = (r.transcript || []).slice(2, 3)[0];
      const keyMoment =
        rebellionTurn?.text?.substring(0, 80) ||
        fallbackTurn?.text?.substring(0, 80) ||
        null; // Firestore accepts null, rejects undefined
      return {
        simulation: i + 1,
        durationId: r.durationId || r.scenario || 'unknown',
        scenario: r.durationId || r.scenario || 'unknown',
        isPositive: !!r.isPositive,
        rebelled: !!r.isPositive,
        keyMoment,
      };
    });

    const finalReport = {
      ...report,
      compatibilityScore: Math.round((actualPositive / actualTotal) * 100),
      positiveSimulations: actualPositive,
      totalSimulations: actualTotal,
      rebellionRate: Math.round((actualPositive / actualTotal) * 100),
      dominantPhase: report.dominantPhase || dominantPhaseOuter,
      durationBreakdown: durationBreakdownFinal,
      simulationResults: simulationResultsLocal, // Override Gemini echo with local verified data
      personaASummary: {name: personaA.name, attachmentStyle: personaA.attachmentStyle, commStyle: personaA.commStyle},
      personaBSummary: {name: personaB.name, attachmentStyle: personaB.attachmentStyle, commStyle: personaB.commStyle},
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      matchId,
    };

    // Defensive: strip any undefined from top-level string-array fields from Gemini
    // (keyInsights, recommendedTopics, potentialFrictionPoints) — filter out any
    // non-strings or undefined values that Gemini may have inserted.
    const arrayFields = ['keyInsights', 'potentialFrictionPoints', 'recommendedTopics'];
    for (const field of arrayFields) {
      if (Array.isArray(finalReport[field])) {
        finalReport[field] = finalReport[field].filter(v => typeof v === 'string' && v.length > 0);
      } else {
        finalReport[field] = [];
      }
    }

    // Defensive: ensure all optional scalar fields have defined values (Firestore rejects undefined)
    const scalarDefaults = {
      trajectoryPrediction: 'moderate potential',
      trajectoryExplanation: null,
      attachmentDynamics: `${personaA.attachmentStyle} + ${personaB.attachmentStyle}`,
      communicationMatch: Math.round((actualPositive / actualTotal) * 100),
      ghostingRisk: 0.3,
      firstDateSuccessProbability: actualPositive / actualTotal,
      longTermPotential: Math.max(0, (actualPositive / actualTotal) - 0.1),
      coachTip: null,
      nextBestMove: null,
    };
    for (const [key, defaultVal] of Object.entries(scalarDefaults)) {
      if (finalReport[key] === undefined) finalReport[key] = defaultVal;
    }

    // ── Save to Firestore cache ───────────────────────────────────────────
    await cacheRef.set(finalReport);

    // Rate limit counter was already incremented atomically in the transaction above.

    trackAICall({
      functionName: 'simulateRelationship',
      model: AI_MODEL_LITE,
      operation: 'simulation_turns',
      usage: {totalTokenCount: totalTurnTokens},
      userId,
    });

    logger.info(`[simulateRelationship] Complete: ${positiveCount}/${simulationCount} → ${finalReport.compatibilityScore}% for match ${matchId.substring(0, 8)}`);

    return {success: true, simulation: finalReport, fromCache: false};
  },
);

// ---------------------------------------------------------------------------
// Exports for reuse by sibling modules (e.g. situation-simulation.js).
// These are internal helpers that are NOT Cloud Functions. We attach them to
// module.exports without overwriting the `exports.simulateRelationship`
// onCall export defined above.
// ---------------------------------------------------------------------------
module.exports.buildPersonaProfile   = buildPersonaProfile;
module.exports.buildAgentSystemPrompt = buildAgentSystemPrompt;
module.exports.generateAgentTurn     = generateAgentTurn;
module.exports.queryPsychologyRAG    = queryPsychologyRAG;
module.exports.BEHAVIOR_ARCHETYPES   = BEHAVIOR_ARCHETYPES;
module.exports.getSimulationConfig   = getSimulationConfig;
module.exports.isSimulationAllowed   = isSimulationAllowed;
