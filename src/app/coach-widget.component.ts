import { Component, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from './translation.service';
import { FirebaseService } from './firebase.service';

interface PlaceCard { name: string; address: string; rating: number | null; mapsUrl: string; why?: string | null; perspectives?: string[]; score?: number | null; tip?: string | null; }
interface SimApproach { toneKey?: string; tone: string; phrase: string; why: string; perspectives: string[]; confidence: number | null; }
interface SimResult { stage: string; approaches: SimApproach[]; perspectiveNames: string[]; perspectivesUsed: number; }
interface MvStage { stageId: string; emoji: string; label: string; narrative: string; bestPhrase: string; score: number | null; tip: string; }
interface MvResult { compatibilityScore: number | null; compatibilityStars: number | null; compatibilityLabel: string; stages: MvStage[]; keyInsights: string[]; }
type SimMode = '' | 'situation' | 'multiverse';
interface Msg {
  role: 'coach' | 'user'; text: string; typing?: boolean;
  places?: PlaceCard[]; phrases?: string[]; phraseMeta?: { perspective: string; why: string | null }[]; needLocation?: boolean; sim?: SimResult; mv?: MvResult;
  ask?: boolean; q?: string; fb?: 'up' | 'down'; // feedback affordance on coach answers
}

const ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoChat';
const SIM_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoSimulate';
const MV_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoMultiverse';
const FB_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoFeedback';
const PLACE_CLICK_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoPlaceClick';
// Languages CoachFish (getLanguageInstruction/normalizeLanguageCode) responds in — auto-detected.
const COACH_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'zh', 'ja', 'ko', 'ar', 'id', 'ru', 'tr'];
const FREE_TASTE = 2; // free coach replies shown as a "taste" before the (non-blocking) app CTA
const STORE_IOS = 'https://apps.apple.com/app/id6470783901';
const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.black.sugar21';
const SITE = 'https://blacksugar21.com';

const I18N: Record<string, any> = {
  es: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versión de prueba',
    greeting: 'Hola 👋 Soy tu Coach de inteligencia emocional para citas. Cuéntame qué situación tienes y te doy una idea concreta para tu próxima conversación.',
    chips: ['¿Cómo inicio una conversación?', 'Me dejaron en visto 😅', '¿Cómo propongo una cita?'],
    placeholder: 'Escribe tu situación…', send: 'Enviar',
    ctaTitle: '✦ Probaste el Coach IA', ctaText: 'En la app son 4 preguntas al día: te recuerda, conoce tus matches y simula tu relación.',
    taste2: '✦ 2 preguntas gratis para probar', taste1: '✦ Te queda 1 pregunta gratis',
    download: 'Descargar la app', share: 'Compartir', shared: '¡Copiado!',
    shareText: 'Probé el Coach IA de Black Sugar 21 y me dio este consejo 👀',
    footer: 'Generado por IA · versión de prueba',
    useLoc: '📍 Usar mi ubicación', cityPh: 'o escribe tu ciudad…', copy: 'Copiar', copied: '✓ Copiado', viewMap: 'Ver en mapa',
    simChip: '🔮 Simular una situación', simHint: 'Describe tu situación y mis 5 perspectivas la analizan',
    simAnalyzing: 'Analizando enfoques…', simThinking: '5 perspectivas pensando…', simBy: 'Analizado por', simStage: 'Etapa', simWhy: 'Por qué funciona', simBest: 'Recomendada',
    // two simulations + simple explanation of the difference
    simTitle: '🔮 Simular una situación', simDesc: 'Qué decir AHORA en un momento puntual · 5 perspectivas te dan frases listas.',
    mvTitle: '🌌 Simular la relación', mvDesc: 'Cómo evolucionaría la relación en 5 etapas + tu compatibilidad.',
    mvHint: 'Descríbeme a la persona o conexión y simulo las 5 etapas de la relación',
    mvAnalyzing: 'Simulando 5 universos…', mvCompat: 'Compatibilidad', mvInsights: 'Claves de esta conexión',
    fbAsk: '¿Te sirvió?', fbThanks: '¡Gracias por tu feedback! 💛',
    placeChip: '📍 Lugares para una cita', placeQuery: '¿Qué lugares me recomiendas para una primera cita cerca de mí?',
    thinking: 'El coach está pensando…', placesLoading: 'Buscando lugares para tu cita 📍…',
    locRequesting: 'Pidiendo permiso de ubicación 📍…',
    locBlocked: 'Tu navegador tiene la ubicación bloqueada 🔒 Habilítala en el candado de la barra de direcciones, o escribe tu ciudad y te recomiendo lugares 👇',
  },
  en: {
    fab: 'AI Coach', title: 'AI Coach', demo: 'Demo',
    greeting: "Hi 👋 I'm your emotional-intelligence dating coach. Tell me your situation and I'll give you one concrete idea for your next conversation.",
    chips: ['How do I start a conversation?', 'They left me on read 😅', 'How do I ask them out?'],
    placeholder: 'Describe your situation…', send: 'Send',
    ctaTitle: '✦ You tried the AI Coach', ctaText: 'In the app it\'s 4 questions a day: it remembers you, knows your matches, and simulates your relationship.',
    taste2: '✦ 2 free questions to try', taste1: '✦ 1 free question left',
    download: 'Download the app', share: 'Share', shared: 'Copied!',
    shareText: 'I tried Black Sugar 21’s AI Coach and it gave me this advice 👀',
    footer: 'AI-generated · demo version',
    useLoc: '📍 Use my location', cityPh: 'or type your city…', copy: 'Copy', copied: '✓ Copied', viewMap: 'View on map',
    simChip: '🔮 Simulate a situation', simHint: 'Describe your situation and my 5 perspectives analyze it',
    simAnalyzing: 'Analyzing approaches…', simThinking: '5 perspectives thinking…', simBy: 'Analyzed by', simStage: 'Stage', simWhy: 'Why it works', simBest: 'Recommended',
    simTitle: '🔮 Simulate a situation', simDesc: 'What to say RIGHT NOW in a specific moment · 5 perspectives give you ready phrases.',
    mvTitle: '🌌 Simulate the relationship', mvDesc: 'How the relationship would unfold across 5 stages + your compatibility.',
    mvHint: 'Describe the person or connection and I simulate the 5 relationship stages',
    mvAnalyzing: 'Simulating 5 universes…', mvCompat: 'Compatibility', mvInsights: 'Keys to this connection',
    fbAsk: 'Was this helpful?', fbThanks: 'Thanks for your feedback! 💛',
    placeChip: '📍 Date spots near me', placeQuery: 'What are some good places for a first date near me?',
    thinking: 'The coach is thinking…', placesLoading: 'Finding date spots near you 📍…',
    locRequesting: 'Requesting location permission 📍…',
    locBlocked: "Your browser has location blocked 🔒 Enable it from the lock icon in the address bar, or type your city and I'll suggest spots 👇",
  },
  pt: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versão de teste',
    greeting: 'Oi 👋 Sou seu Coach de inteligência emocional para encontros. Me conta sua situação e te dou uma ideia concreta para a sua próxima conversa.',
    chips: ['Como inicio uma conversa?', 'Me deixaram no vácuo 😅', 'Como chamo para um encontro?'],
    placeholder: 'Escreva sua situação…', send: 'Enviar',
    ctaTitle: '✦ Você testou o Coach IA', ctaText: 'No app são 4 perguntas por dia: ele lembra de você, conhece seus matches e simula sua relação.',
    taste2: '✦ 2 perguntas grátis para testar', taste1: '✦ Resta 1 pergunta grátis',
    download: 'Baixar o app', share: 'Compartilhar', shared: 'Copiado!',
    shareText: 'Testei o Coach IA do Black Sugar 21 e ele me deu este conselho 👀',
    footer: 'Gerado por IA · versão de teste',
    useLoc: '📍 Usar minha localização', cityPh: 'ou escreva sua cidade…', copy: 'Copiar', copied: '✓ Copiado', viewMap: 'Ver no mapa',
    simChip: '🔮 Simular uma situação', simHint: 'Descreva sua situação e minhas 5 perspectivas a analisam',
    simAnalyzing: 'Analisando abordagens…', simThinking: '5 perspectivas pensando…', simBy: 'Analisado por', simStage: 'Etapa', simWhy: 'Por que funciona', simBest: 'Recomendada',
    simTitle: '🔮 Simular uma situação', simDesc: 'O que dizer AGORA num momento específico · 5 perspectivas te dão frases prontas.',
    mvTitle: '🌌 Simular a relação', mvDesc: 'Como a relação evoluiria em 5 etapas + sua compatibilidade.',
    mvHint: 'Me descreva a pessoa ou conexão e eu simulo as 5 etapas da relação',
    mvAnalyzing: 'Simulando 5 universos…', mvCompat: 'Compatibilidade', mvInsights: 'Chaves desta conexão',
    fbAsk: 'Foi útil?', fbThanks: 'Obrigado pelo seu feedback! 💛',
    placeChip: '📍 Lugares para um encontro', placeQuery: 'Que lugares você recomenda para um primeiro encontro perto de mim?',
    thinking: 'O coach está pensando…', placesLoading: 'Buscando lugares para o seu encontro 📍…',
    locRequesting: 'Pedindo permissão de localização 📍…',
    locBlocked: 'Seu navegador está com a localização bloqueada 🔒 Habilite no cadeado da barra de endereço, ou escreva sua cidade e te recomendo lugares 👇',
  },
};

@Component({
  selector: 'app-coach-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
  @if (isBrowser) {
    @if (!open()) {
      <button class="cw-fab" (click)="toggle()" [attr.aria-label]="t().fab">
        <span class="cw-spark">✦</span><span class="cw-fab-label">{{ t().fab }}</span>
      </button>
    } @else {
      <section class="cw-panel" role="dialog" [attr.aria-label]="t().title">
        <header class="cw-head">
          <div class="cw-id"><span class="cw-spark">✦</span>
            <div><b>{{ t().title }}</b><span class="cw-demo">{{ t().demo }}</span></div></div>
          <button class="cw-x" (click)="toggle()" aria-label="Cerrar">✕</button>
        </header>

        <div class="cw-body" #body>
          @for (m of messages(); track mi; let mi = $index) {
            <div class="cw-msg" [class.user]="m.role==='user'">
              <div class="cw-bubble">
                <span>{{ m.text }}{{ m.typing ? ' ▌' : '' }}</span>

                @if (m.needLocation) {
                  <div class="cw-loc">
                    <button class="cw-chip" (click)="useLocation()">{{ t().useLoc }}</button>
                    <form class="cw-city" (submit)="$event.preventDefault(); sendCity()">
                      <input [(ngModel)]="cityDraft" name="city" [placeholder]="t().cityPh" autocomplete="off" />
                      <button type="submit" class="cw-snd sm">→</button>
                    </form>
                  </div>
                }

                @if (m.places?.length) {
                  <div class="cw-places">
                    @for (p of m.places!; track p.name; let pi = $index) {
                      <a class="cw-place" [class.best]="pi === 0 && p.score != null" [href]="p.mapsUrl" target="_blank" rel="noopener" (click)="placeClick(p, pi)">
                        <div class="cw-place-i"><b>{{ p.name }}</b>
                          @if (p.score != null) { <span class="cw-fit">{{ p.score }}% ✦</span> }
                          @else if (p.rating) { <span class="cw-rate">★ {{ p.rating }}</span> }</div>
                        <small>{{ p.address }}</small>
                        @if (p.why) { <p class="cw-place-why">{{ p.why }}</p> }
                        @if (p.perspectives?.length) {
                          <div class="cw-place-persp">@for (pp of p.perspectives!; track pp) { <span class="cw-tag">{{ pp }}</span> }</div>
                        }
                        @if (p.tip) { <p class="cw-place-tip">💡 {{ p.tip }}</p> }
                        <span class="cw-map">{{ t().viewMap }} →</span>
                      </a>
                    }
                  </div>
                }

                @if (m.phrases?.length) {
                  <div class="cw-phrases">
                    @for (ph of m.phrases!; track ph; let i = $index) {
                      <div class="cw-phrase">
                        <div class="cw-phrase-body">
                          <span>{{ ph }}</span>
                          @if (m.phraseMeta?.[i]; as pm) {
                            <div class="cw-phrase-meta">
                              <span class="cw-phrase-lens">{{ pm.perspective }}</span>
                              @if (pm.why) { <span class="cw-phrase-why">· {{ pm.why }}</span> }
                            </div>
                          }
                        </div>
                        <button class="cw-copy" (click)="copyPhrase(ph, i)">{{ copiedIdx() === i ? t().copied : t().copy }}</button>
                      </div>
                    }
                  </div>
                }

                @if (m.sim) {
                  <div class="cw-sim">
                    <div class="cw-sim-meta">
                      <span class="cw-sim-stage">{{ t().simStage }}: {{ m.sim.stage }}</span>
                      <div class="cw-sim-persp">
                        <small>{{ t().simBy }}:</small>
                        @for (p of m.sim.perspectiveNames; track p) { <span class="cw-pill-p">{{ p }}</span> }
                      </div>
                    </div>

                    <!-- horizontal carousel — one approach per page (matches iOS/Android pager) -->
                    <div class="cw-car-wrap">
                      <div class="cw-carousel" [id]="'cwcar-' + mi" (scroll)="onCarouselScroll($event, mi)">
                        @for (a of m.sim.approaches; track ai; let ai = $index) {
                          <div class="cw-appr" [class.best]="ai === bestIdx(m.sim!)">
                            <div class="cw-appr-top">
                              <span class="cw-tone">{{ toneEmoji(a.toneKey) }} {{ a.tone }}</span>
                              @if (ai === bestIdx(m.sim!)) { <span class="cw-best">★ {{ t().simBest }}</span> }
                              <button class="cw-copy" (click)="copyPhrase(a.phrase, msgKey(mi) + ai)">{{ copiedIdx() === msgKey(mi) + ai ? t().copied : t().copy }}</button>
                            </div>
                            <p class="cw-appr-phrase">"{{ a.phrase }}"</p>
                            <div class="cw-stars">
                              @for (s of [1,2,3,4,5]; track s) { <span [class.on]="s <= stars(a.confidence)">★</span> }
                              @if (a.confidence != null) { <span class="cw-conf">{{ a.confidence }}%</span> }
                            </div>
                            @if (a.why) { <p class="cw-appr-why"><b>{{ t().simWhy }}:</b> {{ a.why }}</p> }
                            @if (a.perspectives.length) {
                              <div class="cw-appr-tags">@for (pp of a.perspectives; track pp) { <span class="cw-tag">{{ pp }}</span> }</div>
                            }
                          </div>
                        }
                      </div>
                      @if (m.sim.approaches.length > 1) {
                        <button class="cw-arrow left" [class.hidden]="(carouselPage()[mi] || 0) === 0" (click)="navCarousel(mi, -1)" aria-label="Anterior">‹</button>
                        <button class="cw-arrow right" [class.hidden]="(carouselPage()[mi] || 0) >= m.sim.approaches.length - 1" (click)="navCarousel(mi, 1)" aria-label="Siguiente">›</button>
                      }
                    </div>
                    @if (m.sim.approaches.length > 1) {
                      <div class="cw-dots">
                        @for (a of m.sim.approaches; track di; let di = $index) {
                          <button class="cw-dot" [class.on]="(carouselPage()[mi] || 0) === di" (click)="goToPage(mi, di)" aria-label="Ir a enfoque"></button>
                        }
                      </div>
                    }
                  </div>
                }

                @if (m.mv) {
                  <div class="cw-mv">
                    <div class="cw-mv-head">
                      <div class="cw-stars">
                        @for (s of [1,2,3,4,5]; track s) { <span [class.on]="s <= mvStars(m.mv!.compatibilityStars)">★</span> }
                        @if (m.mv.compatibilityScore != null) { <span class="cw-conf">{{ m.mv.compatibilityScore }}%</span> }
                      </div>
                      <div class="cw-mv-label">{{ m.mv.compatibilityLabel }}</div>
                      <small class="cw-mv-cap">{{ t().mvCompat }}</small>
                    </div>
                    <div class="cw-car-wrap">
                      <div class="cw-carousel" [id]="'cwcar-' + mi" (scroll)="onCarouselScroll($event, mi)">
                        @for (st of m.mv.stages; track si; let si = $index) {
                          <div class="cw-stage">
                            <div class="cw-stage-h"><span class="cw-stage-emoji">{{ st.emoji }}</span><b>{{ st.label }}</b>
                              @if (st.score != null) { <span class="cw-conf">{{ st.score }}/10</span> }</div>
                            <p class="cw-stage-narr">{{ st.narrative }}</p>
                            @if (st.bestPhrase) {
                              <div class="cw-stage-phrase"><span>"{{ st.bestPhrase }}"</span>
                                <button class="cw-copy" (click)="copyPhrase(st.bestPhrase, msgKey(mi) + si)">{{ copiedIdx() === msgKey(mi) + si ? t().copied : t().copy }}</button></div>
                            }
                            @if (st.tip) { <p class="cw-appr-why"><b>{{ t().simWhy }}:</b> {{ st.tip }}</p> }
                          </div>
                        }
                      </div>
                      @if (m.mv.stages.length > 1) {
                        <button class="cw-arrow left" [class.hidden]="(carouselPage()[mi] || 0) === 0" (click)="navCarousel(mi, -1)" aria-label="Anterior">‹</button>
                        <button class="cw-arrow right" [class.hidden]="(carouselPage()[mi] || 0) >= m.mv.stages.length - 1" (click)="navCarousel(mi, 1)" aria-label="Siguiente">›</button>
                      }
                    </div>
                    @if (m.mv.stages.length > 1) {
                      <div class="cw-dots">
                        @for (st of m.mv.stages; track di; let di = $index) {
                          <button class="cw-dot" [class.on]="(carouselPage()[mi] || 0) === di" (click)="goToPage(mi, di)" aria-label="Ir a etapa"></button>
                        }
                      </div>
                    }
                    @if (m.mv.keyInsights.length) {
                      <div class="cw-mv-insights"><small>{{ t().mvInsights }}</small>
                        <ul>@for (k of m.mv.keyInsights; track k) { <li>{{ k }}</li> }</ul></div>
                    }
                  </div>
                }

                @if (m.role === 'coach' && m.ask && !m.typing) {
                  <div class="cw-fb">
                    @if (m.fb) {
                      <span class="cw-fb-thx">{{ t().fbThanks }}</span>
                    } @else {
                      <span class="cw-fb-q">{{ t().fbAsk }}</span>
                      <button class="cw-fb-btn" (click)="feedback(mi, 'up')" aria-label="Sí">👍</button>
                      <button class="cw-fb-btn" (click)="feedback(mi, 'down')" aria-label="No">👎</button>
                    }
                  </div>
                }
              </div>
            </div>
          }
          @if (thinking()) {
            <div class="cw-msg">
              <div class="cw-bubble cw-thinking">
                <span class="cw-dots"><i></i><i></i><i></i></span>
                <span class="cw-thinking-t">{{ thinkingLabel() || t().thinking }}</span>
              </div>
            </div>
          }
          @if (messages().length <= 1 && !simMode()) {
            <div class="cw-modes">
              <button class="cw-mode" (click)="startSim('situation')"><b>{{ t().simTitle }}</b><small>{{ t().simDesc }}</small></button>
              <button class="cw-mode" (click)="startSim('multiverse')"><b>{{ t().mvTitle }}</b><small>{{ t().mvDesc }}</small></button>
            </div>
          }
          @if (showChips()) {
            <div class="cw-chips">
              @for (c of t().chips; track c) { <button class="cw-chip" (click)="send(c)">{{ c }}</button> }
              <button class="cw-chip cw-chip-place" (click)="askPlaces()">{{ t().placeChip }}</button>
            </div>
          }
          @if (simLoading()) {
            <div class="cw-simload">
              <div class="cw-simload-cards">
                @for (e of loadEmojis(); track $index) {
                  <div class="cw-simload-card" [style.animation-delay.ms]="$index * 380">
                    <span class="cw-simload-emoji">{{ e }}</span>
                    <div class="cw-simload-bar"></div><div class="cw-simload-bar short"></div>
                  </div>
                }
              </div>
              <b class="cw-simload-title">{{ loadingMode() === 'multiverse' ? t().mvAnalyzing : t().simAnalyzing }}</b>
              @if (loadingMode() !== 'multiverse') { <small class="cw-simload-sub">{{ t().simThinking }}</small> }
            </div>
          }
          @if (showCta()) {
            <div class="cw-cta">
              <b>{{ t().ctaTitle }}</b><p>{{ t().ctaText }}</p>
              <div class="cw-cta-actions">
                <a class="cw-btn gold" [href]="storeLink" target="_blank" rel="noopener" (click)="trackDownload()">{{ t().download }}</a>
                <button class="cw-btn" (click)="share()">{{ justShared() ? t().shared : t().share }}</button>
              </div>
            </div>
          }
        </div>

        <!-- persistent mode bar — start/switch a simulation at any point (not only on first screen) -->
        @if (!busy()) {
          <div class="cw-modebar">
            @if (simMode()) {
              <span class="cw-modeon">{{ simMode() === 'multiverse' ? t().mvTitle : t().simTitle }}</span>
              <button class="cw-modex" (click)="exitSim()" aria-label="Salir del modo">✕</button>
            } @else {
              <button class="cw-modetab" (click)="startSim('situation')">{{ t().simTitle }}</button>
              <button class="cw-modetab" (click)="startSim('multiverse')">{{ t().mvTitle }}</button>
            }
          </div>
        }
        @if (!showCta()) {
          <div class="cw-taste">{{ freeLeft() === 1 ? t().taste1 : t().taste2 }}</div>
        }
        <form class="cw-input" (submit)="$event.preventDefault(); send(draft)">
          <input [(ngModel)]="draft" name="d" [placeholder]="inputPlaceholder()" [disabled]="busy()" autocomplete="off" maxlength="400" />
          <button type="submit" class="cw-snd" [disabled]="busy() || !draft.trim()">
            @if (busy()) { <span class="cw-spin"></span> } @else { ↑ }
          </button>
        </form>
        <div class="cw-foot">{{ t().footer }}</div>
      </section>
    }
  }
  `,
  styles: [`
    :host { --cw-gold:#D4AF37; --cw-gold-d:#B8860B; --cw-bg:#15151A; --cw-card:#1E1E26; --cw-border:#2A2A33; --cw-text:#fff; --cw-muted:#8A8A99;
      font-family:'Outfit',system-ui,sans-serif; }
    .cw-fab { position:fixed; right:22px; bottom:22px; z-index:9998; display:flex; align-items:center; gap:9px;
      padding:13px 18px; border:none; border-radius:999px; cursor:pointer; color:#1A1206; font-weight:700; font-size:14.5px;
      background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); box-shadow:0 10px 30px rgba(212,175,55,0.35); animation:cwPulse 2.6s ease infinite; }
    .cw-fab:hover { filter:brightness(1.06); transform:translateY(-2px); transition:.2s; }
    .cw-spark { font-size:17px; }
    @keyframes cwPulse { 0%,100%{box-shadow:0 10px 30px rgba(212,175,55,0.30)} 50%{box-shadow:0 10px 42px rgba(212,175,55,0.55)} }
    .cw-panel { position:fixed; right:22px; bottom:22px; z-index:9999; width:380px; max-width:calc(100vw - 28px); height:560px; max-height:calc(100dvh - 40px);
      display:flex; flex-direction:column; background:var(--cw-bg); border:1px solid var(--cw-border); border-radius:20px; overflow:hidden;
      box-shadow:0 24px 70px rgba(0,0,0,0.55); animation:cwIn .28s cubic-bezier(.22,1,.36,1);
      -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
    /* keep the coach's actual content selectable/copyable; the chrome (footer, header, buttons) is not */
    .cw-bubble > span, .cw-appr-phrase, .cw-appr-why, .cw-stage-narr, .cw-stage-phrase span, .cw-mv-insights li, .cw-phrase span { -webkit-user-select:text; user-select:text; }
    @keyframes cwIn { from{opacity:0; transform:translateY(20px) scale(.97)} to{opacity:1; transform:none} }
    /* Mobile: center the bot as a near-fullscreen sheet (focus the experience, not a corner). */
    @media (max-width: 600px) {
      .cw-panel { left:8px; right:8px; top:8px; bottom:8px; width:auto; max-width:none; height:auto; max-height:none;
        border-radius:18px; padding-bottom:env(safe-area-inset-bottom); }
      .cw-fab { right:16px; bottom:16px; padding:12px 16px; font-size:14px; }
    }
    @media (max-width: 380px) {
      .cw-fab .cw-fab-label { display:none; } /* tiny screens: icon-only FAB to avoid overflow */
      .cw-fab { padding:13px; }
    }
    .cw-head { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid var(--cw-border);
      background:linear-gradient(180deg,rgba(212,175,55,0.08),transparent); }
    .cw-id { display:flex; align-items:center; gap:10px; } .cw-id .cw-spark { color:var(--cw-gold); font-size:20px; filter:drop-shadow(0 0 8px rgba(212,175,55,.5)); }
    .cw-id b { display:block; font-size:15px; color:var(--cw-text); }
    .cw-demo { font-size:10.5px; color:var(--cw-gold); border:1px solid rgba(212,175,55,.4); border-radius:999px; padding:1px 7px; display:inline-block; margin-top:2px; }
    .cw-x { background:none; border:none; color:var(--cw-muted); font-size:16px; cursor:pointer; }
    .cw-body { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
    .cw-msg { display:flex; } .cw-msg.user { justify-content:flex-end; }
    .cw-bubble { max-width:84%; padding:11px 14px; border-radius:14px; font-size:14px; line-height:1.5; color:var(--cw-text);
      background:var(--cw-card); border:1px solid var(--cw-border); }
    .cw-msg.user .cw-bubble { background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); color:#1A1206; border:none; }
    .cw-chips { display:flex; flex-wrap:wrap; gap:7px; margin-top:4px; }
    .cw-chip { background:var(--cw-card); border:1px solid var(--cw-border); color:var(--cw-text); border-radius:999px; padding:8px 12px; font-size:12.5px; cursor:pointer; }
    .cw-chip:hover { border-color:var(--cw-gold-d); }
    .cw-loc { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
    .cw-city { display:flex; gap:6px; }
    .cw-city input { flex:1; background:#0c0c10; border:1px solid var(--cw-border); border-radius:10px; padding:8px 11px; color:var(--cw-text); font-size:13px; outline:none; font-family:inherit; }
    .cw-snd.sm { width:38px; }
    .cw-places { margin-top:10px; display:flex; flex-direction:column; gap:8px; }
    .cw-place { display:block; background:#0c0c10; border:1px solid var(--cw-border); border-radius:12px; padding:11px 13px; text-decoration:none; transition:border-color .15s; }
    .cw-place:hover { border-color:var(--cw-gold-d); }
    .cw-place-i { display:flex; align-items:center; justify-content:space-between; gap:8px; }
    .cw-place-i b { color:var(--cw-text); font-size:13.5px; }
    .cw-rate { color:var(--cw-gold); font-size:12px; white-space:nowrap; }
    .cw-place small { display:block; color:var(--cw-muted); font-size:11.5px; margin-top:3px; }
    .cw-map { display:inline-block; margin-top:7px; color:var(--cw-gold); font-size:11.5px; font-weight:600; }
    /* R36 — venue card enriched by the 4-agent psychology panel */
    .cw-place.best { border-color:rgba(212,175,55,.55); background:linear-gradient(180deg,rgba(212,175,55,.06),#0c0c10); }
    .cw-fit { color:var(--cw-gold); font-size:11.5px; font-weight:700; white-space:nowrap; }
    .cw-place-why { margin:6px 0 0; color:var(--cw-text); font-size:12px; line-height:1.45; opacity:.92; }
    .cw-place-persp { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; }
    .cw-place-tip { margin:6px 0 0; color:#6CEAC5; font-size:11.5px; line-height:1.4; }
    .cw-phrases { margin-top:10px; display:flex; flex-direction:column; gap:7px; }
    .cw-phrase { display:flex; gap:8px; align-items:flex-start; background:#0c0c10; border:1px solid var(--cw-border); border-radius:11px; padding:9px 11px; }
    .cw-phrase-body { flex:1; display:flex; flex-direction:column; gap:4px; min-width:0; }
    .cw-phrase-body > span { font-size:13px; color:var(--cw-text); line-height:1.45; }
    .cw-phrase-meta { display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; }
    .cw-phrase-lens { font-size:10px; font-weight:700; letter-spacing:.2px; color:#c9a9ff; background:rgba(131,27,252,.14); border:1px solid rgba(131,27,252,.32); border-radius:7px; padding:1.5px 7px; white-space:nowrap; }
    .cw-phrase-why { font-size:11px; color:var(--cw-muted); line-height:1.35; }
    .cw-copy { background:none; border:1px solid var(--cw-border); color:var(--cw-gold); border-radius:8px; padding:4px 9px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; align-self:center; }
    .cw-copy:hover { border-color:var(--cw-gold-d); }
    .cw-chip-sim { border-color:rgba(212,175,55,.45); color:var(--cw-gold); font-weight:600; }
    .cw-chip-place { border-color:rgba(156,89,234,.5); color:var(--cw-purple-l,#9c59ea); font-weight:600; background:rgba(156,89,234,.08); }
    .cw-chip-place:hover { border-color:var(--cw-purple-l,#9c59ea); background:rgba(156,89,234,.16); }
    /* elegant "coach is thinking" loader (chat + places) */
    .cw-thinking { display:inline-flex; align-items:center; gap:10px; background:var(--cw-card); border:1px solid var(--cw-border); animation:cwFade .25s ease; }
    .cw-dots { display:inline-flex; gap:4px; align-items:center; }
    .cw-dots i { width:6px; height:6px; border-radius:50%; background:var(--cw-gold); display:inline-block; animation:cwBounce 1.2s ease-in-out infinite; }
    .cw-dots i:nth-child(2){ animation-delay:.18s; } .cw-dots i:nth-child(3){ animation-delay:.36s; }
    .cw-thinking-t { font-size:12.5px; color:var(--cw-muted); }
    @keyframes cwBounce { 0%,80%,100%{ transform:translateY(0); opacity:.45; } 40%{ transform:translateY(-4px); opacity:1; } }
    @keyframes cwFade { from{ opacity:0; transform:translateY(4px); } to{ opacity:1; transform:none; } }
    @media (prefers-reduced-motion: reduce) {
      .cw-dots i, .cw-thinking, .cw-fab, .cw-panel, .cw-simload-card, .cw-spin, .cw-bubble { animation:none !important; transition:none !important; }
    }
    .cw-modes { display:flex; flex-direction:column; gap:8px; margin-top:4px; }
    .cw-mode { text-align:left; background:linear-gradient(135deg,rgba(212,175,55,.10),rgba(131,27,252,.10)); border:1px solid rgba(212,175,55,.35);
      border-radius:13px; padding:11px 13px; cursor:pointer; transition:border-color .15s, transform .15s; }
    .cw-mode:hover { border-color:var(--cw-gold); transform:translateY(-1px); }
    .cw-mode b { display:block; color:var(--cw-text); font-size:14px; margin-bottom:2px; }
    .cw-mode small { color:var(--cw-muted); font-size:11.5px; line-height:1.35; }
    .cw-simhint { margin-top:8px; font-size:12px; color:var(--cw-muted); font-style:italic; }
    /* multiverse result */
    .cw-mv { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
    .cw-mv-head { text-align:center; background:linear-gradient(135deg,rgba(212,175,55,.12),rgba(131,27,252,.12)); border:1px solid rgba(212,175,55,.3); border-radius:14px; padding:13px; }
    .cw-mv-head .cw-stars { justify-content:center; }
    .cw-mv-head .cw-stars span { font-size:17px; }
    .cw-mv-label { font-size:15px; font-weight:700; color:var(--cw-text); margin-top:4px; }
    .cw-mv-cap { display:block; color:var(--cw-muted); font-size:11px; text-transform:uppercase; letter-spacing:.5px; margin-top:2px; }
    .cw-stage { flex:0 0 100%; scroll-snap-align:center; box-sizing:border-box; background:rgba(0,0,0,.35); border:1px solid rgba(131,27,252,.30); border-radius:14px; padding:13px; margin-right:8px; }
    .cw-stage:last-child { margin-right:0; }
    .cw-stage-h { display:flex; align-items:center; gap:8px; }
    .cw-stage-emoji { font-size:18px; }
    .cw-stage-h b { flex:1; font-size:14px; color:var(--cw-text); }
    .cw-stage-narr { margin:9px 0 8px; font-size:13.5px; color:var(--cw-text); line-height:1.5; }
    .cw-stage-phrase { display:flex; gap:8px; align-items:flex-start; background:#0c0c10; border:1px solid var(--cw-border); border-radius:10px; padding:9px 11px; }
    .cw-stage-phrase span { flex:1; font-size:13px; color:var(--cw-text); font-style:italic; line-height:1.45; }
    .cw-mv-insights { background:#0c0c10; border:1px solid var(--cw-border); border-radius:12px; padding:11px 13px; }
    .cw-mv-insights small { color:var(--cw-gold); font-size:11px; text-transform:uppercase; letter-spacing:.4px; }
    .cw-mv-insights ul { margin:7px 0 0; padding-left:17px; }
    .cw-mv-insights li { font-size:13px; color:var(--cw-text); line-height:1.5; margin-bottom:4px; }
    .cw-sim { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
    .cw-sim-meta { background:#0c0c10; border:1px solid var(--cw-border); border-radius:11px; padding:10px 12px; }
    .cw-sim-stage { font-size:11px; color:var(--cw-gold); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
    .cw-sim-persp { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:7px; }
    .cw-sim-persp small { color:var(--cw-muted); font-size:11px; }
    .cw-pill-p { font-size:10.5px; color:var(--cw-purple-l,#9c59ea); border:1px solid rgba(156,89,234,.4); border-radius:999px; padding:1px 8px; }
    /* carousel: one approach per page, swipeable (matches iOS/Android pager) */
    .cw-car-wrap { position:relative; }
    .cw-carousel { display:flex; gap:0; overflow-x:auto; scroll-snap-type:x mandatory; scroll-behavior:smooth; -webkit-overflow-scrolling:touch; scrollbar-width:none; }
    .cw-carousel::-webkit-scrollbar { display:none; }
    .cw-arrow { position:absolute; top:50%; transform:translateY(-50%); z-index:2; width:30px; height:30px; border-radius:50%;
      border:1px solid rgba(212,175,55,.4); background:rgba(12,12,16,.85); color:var(--cw-gold); font-size:20px; line-height:1; cursor:pointer;
      display:grid; place-items:center; transition:opacity .2s, transform .2s; box-shadow:0 2px 10px rgba(0,0,0,.4); }
    .cw-arrow:hover { transform:translateY(-50%) scale(1.08); }
    .cw-arrow.left { left:-6px; } .cw-arrow.right { right:-6px; }
    .cw-arrow.hidden { opacity:0; pointer-events:none; }
    .cw-appr { flex:0 0 100%; scroll-snap-align:center; box-sizing:border-box; background:rgba(0,0,0,.35); border:1px solid rgba(131,27,252,.30);
      border-radius:14px; padding:13px; margin-right:8px; }
    .cw-appr:last-child { margin-right:0; }
    .cw-appr.best { border:1.5px solid transparent; background:
      linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.4)) padding-box,
      linear-gradient(135deg,var(--cw-gold),var(--cw-purple-v,#831bfc)) border-box; }
    .cw-appr-top { display:flex; align-items:center; gap:8px; }
    .cw-tone { font-size:11px; font-weight:700; color:#1A1206; background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); border-radius:999px; padding:3px 11px; white-space:nowrap; }
    .cw-best { font-size:10.5px; font-weight:700; color:var(--cw-gold); white-space:nowrap; }
    .cw-appr-top .cw-copy { margin-left:auto; }
    .cw-appr-phrase { margin:9px 0 7px; font-size:14px; color:var(--cw-text); line-height:1.5; font-style:italic; }
    .cw-stars { display:flex; align-items:center; gap:2px; margin-bottom:7px; }
    .cw-stars span { color:rgba(131,27,252,.35); font-size:13px; }
    .cw-stars span.on { color:var(--cw-gold); }
    .cw-conf { font-size:11px; color:var(--cw-gold); font-weight:600; margin-left:6px; }
    .cw-appr-why { margin:0; font-size:12px; color:var(--cw-muted); line-height:1.45; }
    .cw-appr-why b { color:var(--cw-text); }
    .cw-appr-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
    .cw-tag { font-size:10px; color:#9c59ea; border:1px solid rgba(156,89,234,.35); border-radius:6px; padding:1px 7px; }
    .cw-dots { display:flex; justify-content:center; gap:6px; margin-top:9px; }
    .cw-dot { width:7px; height:7px; border-radius:50%; background:rgba(156,89,234,.35); border:none; padding:0; cursor:pointer; transition:all .2s; }
    .cw-dot:hover { background:rgba(156,89,234,.6); }
    .cw-dot.on { width:18px; border-radius:4px; background:#9c59ea; }
    /* "simulating" loading — 4 emoji cards glowing in sequence (matches app SimulationSkeletonView) */
    .cw-simload { margin-top:8px; background:rgba(131,27,252,.12); border:1px solid rgba(131,27,252,.25); border-radius:16px; padding:16px; text-align:center; }
    .cw-simload-cards { display:flex; gap:8px; justify-content:center; margin-bottom:12px; }
    .cw-simload-card { flex:1; max-width:64px; background:rgba(131,27,252,.10); border:1px solid rgba(131,27,252,.25); border-radius:11px; padding:10px 6px; display:flex; flex-direction:column; align-items:center; gap:5px; animation:cwGlow 1.8s ease-in-out infinite; }
    .cw-simload-emoji { font-size:18px; }
    .cw-simload-bar { width:80%; height:4px; border-radius:3px; background:rgba(255,255,255,.18); }
    .cw-simload-bar.short { width:55%; }
    .cw-simload-title { display:block; color:var(--cw-text); font-size:14px; }
    .cw-simload-sub { color:#9c59ea; font-size:12px; }
    @keyframes cwGlow { 0%,100%{ transform:scale(1); border-color:rgba(131,27,252,.2); box-shadow:none; } 50%{ transform:scale(1.06); border-color:rgba(156,89,234,.7); box-shadow:0 0 14px rgba(131,27,252,.4); } }
    .cw-cta { margin-top:6px; background:linear-gradient(180deg,rgba(212,175,55,0.10),var(--cw-card)); border:1px solid rgba(212,175,55,0.3); border-radius:14px; padding:14px; }
    .cw-cta b { font-size:14px; color:var(--cw-text); } .cw-cta p { margin:5px 0 11px; font-size:12.5px; color:var(--cw-muted); }
    .cw-cta-actions { display:flex; gap:8px; }
    .cw-btn { flex:1; text-align:center; padding:9px; border-radius:10px; border:1px solid var(--cw-border); background:var(--cw-bg); color:var(--cw-text); font-weight:600; font-size:13px; cursor:pointer; text-decoration:none; }
    .cw-btn.gold { background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); color:#1A1206; border:none; }
    .cw-modebar { display:flex; gap:7px; align-items:center; padding:9px 12px 0; }
    .cw-modetab { flex:1; background:rgba(212,175,55,.08); border:1px solid rgba(212,175,55,.3); color:var(--cw-text);
      border-radius:9px; padding:7px 10px; font-size:12px; font-weight:600; cursor:pointer; transition:border-color .15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .cw-modetab:hover { border-color:var(--cw-gold); }
    .cw-modeon { flex:1; font-size:12px; font-weight:600; color:var(--cw-gold); background:rgba(212,175,55,.1); border:1px solid rgba(212,175,55,.35); border-radius:9px; padding:7px 10px; }
    .cw-modex { width:30px; height:30px; border-radius:9px; border:1px solid var(--cw-border); background:var(--cw-card); color:var(--cw-muted); font-size:13px; cursor:pointer; }
    .cw-modex:hover { color:var(--cw-text); border-color:var(--cw-gold-d); }
    .cw-taste { text-align:center; font-size:11px; font-weight:600; color:var(--cw-gold); letter-spacing:.2px; padding:7px 12px 0; }
    .cw-input { display:flex; gap:8px; padding:12px; border-top:1px solid var(--cw-border); }
    .cw-input input { flex:1; background:#0c0c10; border:1px solid var(--cw-border); border-radius:12px; padding:11px 14px; color:var(--cw-text); font-size:14px; outline:none; font-family:inherit; }
    .cw-input input:focus { border-color:var(--cw-gold-d); }
    .cw-snd { width:42px; border:none; border-radius:12px; background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); color:#1A1206; font-size:17px; font-weight:700; cursor:pointer; }
    .cw-snd:disabled { opacity:.5; cursor:not-allowed; }
    .cw-fb { display:flex; align-items:center; gap:8px; margin-top:9px; padding-top:9px; border-top:1px solid rgba(255,255,255,.06); }
    .cw-fb-q { font-size:12px; color:var(--cw-muted); }
    .cw-fb-btn { background:none; border:1px solid var(--cw-border); border-radius:8px; width:30px; height:28px; font-size:14px; cursor:pointer; transition:border-color .15s, transform .15s; }
    .cw-fb-btn:hover { border-color:var(--cw-gold-d); transform:translateY(-1px); }
    .cw-fb-thx { font-size:12px; color:var(--cw-gold); }
    .cw-foot { text-align:center; font-size:10.5px; color:var(--cw-muted); padding:0 0 9px; }
    .cw-spin { display:inline-block; width:15px; height:15px; border:2px solid rgba(26,18,6,.4); border-top-color:#1A1206; border-radius:50%; animation:cwSpin .7s linear infinite; }
    @keyframes cwSpin { to{transform:rotate(360deg)} }
    @media (max-width:480px){ .cw-panel{ right:8px; bottom:8px; width:calc(100vw - 16px); height:calc(100dvh - 16px); max-height:none; } }
  `],
})
export class CoachWidgetComponent {
  readonly isBrowser: boolean;
  readonly open = signal(false);
  readonly messages = signal<Msg[]>([]);
  readonly busy = signal(false);
  readonly justShared = signal(false);
  readonly copiedIdx = signal<number | null>(null);
  readonly simMode = signal<SimMode>('');
  readonly simLoading = signal(false);
  readonly loadingMode = signal<SimMode>('');
  // Elegant "coach is thinking" state for chat/places (sims use simLoading) — shown from the moment
  // the user acts until the AI response arrives.
  readonly thinking = signal(false);
  readonly thinkingLabel = signal('');
  readonly carouselPage = signal<Record<number, number>>({});
  draft = '';
  cityDraft = '';
  private readonly coachReplies = signal(0); // reactive so the free-taste counter + CTA update live
  private lastCoachText = '';
  private lastUserMsg = '';
  private shownPlaces = new Set<string>(); // venues already shown this session (so re-press shows OTHERS)
  private shownPhrases = new Set<string>(); // phrases already shown this session (so re-ask shows OTHERS)

  // Chrome language — follows the marketing site toggle (es/en/pt) for the widget labels.
  readonly lang = computed(() => {
    const l = String(this.translation.currentLanguage() || 'es').toLowerCase().split('-')[0];
    return I18N[l] ? l : (l === 'es' ? 'es' : 'en');
  });
  // Coach language — follows the SELECTED site language (auto-detected on entry from the device,
  // and changeable via the header selector). Whatever language the visitor picks is the language the
  // coach transcribes/responds in. Falls back to device language, then English. CoachFish supports 13.
  readonly coachLang = computed(() => {
    const sel = String(this.translation.currentLanguage() || '').toLowerCase().split('-')[0];
    if (COACH_LANGS.includes(sel)) return sel;
    if (this.isBrowser) {
      const navs = (navigator.languages?.length ? navigator.languages : [navigator.language || ''])
        .map((x) => String(x || '').toLowerCase().split('-')[0]);
      const hit = navs.find((b) => COACH_LANGS.includes(b));
      if (hit) return hit;
    }
    return 'en';
  });
  t() { return I18N[this.lang()] || I18N['es']; }
  // Free "taste" of the coach before nudging to the app. Generous: we never block — after FREE_TASTE
  // replies we show the download CTA, but the visitor can keep asking (the per-IP/hour backstop only
  // guards against abuse). The counter is a soft, attractive nudge.
  readonly showCta = computed(() => this.coachReplies() >= FREE_TASTE);
  readonly freeLeft = computed(() => Math.max(0, FREE_TASTE - this.coachReplies()));
  // Re-show the suggestion chips (starters + place chip) on the first screen AND after every coach
  // answer, so the visitor always has all options again. Hidden while waiting or in a simulation.
  readonly showChips = computed(() => {
    if (this.simMode() || this.simLoading() || this.thinking()) return false;
    const m = this.messages();
    if (m.length <= 1) return true;
    const last = m[m.length - 1];
    return !!last && last.role === 'coach' && !last.typing;
  });
  get storeLink() {
    if (!this.isBrowser) return STORE_IOS;
    return /android/i.test(navigator.userAgent) ? STORE_ANDROID : STORE_IOS;
  }

  private sessionId = '';

  constructor(@Inject(PLATFORM_ID) platformId: object, private translation: TranslationService, private firebase: FirebaseService) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      try {
        this.sessionId = localStorage.getItem('bs21_demo_sid') || '';
        if (!this.sessionId) { this.sessionId = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bs21_demo_sid', this.sessionId); }
      } catch { this.sessionId = 's_' + Date.now().toString(36); }
      // Open from the hero CTA (or any "Talk to the Coach" button on the page).
      window.addEventListener('open-coach', () => {
        if (!this.open()) {
          this.open.set(true);
          this.ga('coach_demo_open', { source: 'hero_cta' });
          if (this.messages().length === 0) this.messages.set([{ role: 'coach', text: this.t().greeting }]);
        }
      });
    }
  }

  /** Google Analytics (GA4) event — country + user counts come automatically from GA. */
  private ga(event: string, params: Record<string, unknown> = {}) {
    try { this.firebase.logEvent(event, { ...params, source: 'coach_demo' }); } catch { /* noop */ }
  }

  toggle() {
    this.open.update((v) => !v);
    if (this.open()) {
      this.ga('coach_demo_open');
      if (this.messages().length === 0) this.messages.set([{ role: 'coach', text: this.t().greeting }]);
    }
  }

  loadEmojis() { return this.loadingMode() === 'multiverse' ? ['🌟', '💬', '💕', '⚡', '🚀'] : ['💬', '😏', '💕', '🌱']; }

  startSim(mode: SimMode) {
    if (this.simMode() === mode) return;
    this.simMode.set(mode);
    this.ga(mode === 'multiverse' ? 'coach_demo_mv_open' : 'coach_demo_sim_open');
    this.messages.update((m) => [...m, { role: 'coach', text: mode === 'multiverse' ? this.t().mvHint : this.t().simHint }]);
    this.scroll();
  }
  exitSim() { this.simMode.set(''); }

  /** Elegant per-response feedback (👍/👎) → backend, to keep improving the coach. */
  feedback(msgIdx: number, rating: 'up' | 'down') {
    const m = this.messages()[msgIdx];
    if (!m || m.fb) return;
    this.messages.update((arr) => arr.map((x, i) => i === msgIdx ? { ...x, fb: rating } : x));
    const intent = m.mv ? 'multiverse' : m.sim ? 'simulate' : m.places ? 'place' : m.phrases ? 'phrase' : 'general';
    const answer = m.mv ? (m.mv.compatibilityLabel || 'multiverse') : m.sim ? (m.sim.approaches?.[0]?.phrase || 'simulation') : (m.text || '');
    this.ga('coach_demo_feedback', { rating, intent, lang: this.lang() });
    if (this.isBrowser) {
      fetch(FB_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, intent, userLanguage: this.coachLang(), sessionId: this.sessionId, question: m.q || '', answer }),
      }).catch(() => { /* fail-open — UI already shows thanks */ });
    }
  }
  /** R37: log which venue (and which psychology perspectives) the visitor taps — analytics to improve selection. Never blocks the link. */
  placeClick(p: PlaceCard, rank: number) {
    this.ga('coach_demo_place_click', { lang: this.coachLang(), fit: p.score ?? null, rank });
    if (this.isBrowser) {
      try {
        fetch(PLACE_CLICK_ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
          body: JSON.stringify({ name: p.name, fit: p.score ?? null, perspectives: p.perspectives || [], rank, userLanguage: this.coachLang(), sessionId: this.sessionId }),
        }).catch(() => { /* fail-open */ });
      } catch { /* noop */ }
    }
  }
  inputPlaceholder() {
    if (this.simMode() === 'multiverse') return this.t().mvHint;
    if (this.simMode() === 'situation') return this.t().simHint;
    return this.t().placeholder;
  }

  async send(text: string) {
    const msg = (text || '').trim();
    if (!msg || this.busy()) return;
    this.draft = '';
    this.lastUserMsg = msg;
    this.messages.update((m) => [...m, { role: 'user', text: msg }]);
    if (this.simMode() === 'situation') { await this.runSim(msg); return; }
    if (this.simMode() === 'multiverse') { await this.runMultiverse(msg); return; }
    await this.ask({ message: msg });
  }

  /** Multi-agent simulation: 5 perspectives analyze the visitor's situation. */
  private async runSim(situation: string) {
    this.busy.set(true); this.loadingMode.set('situation'); this.simLoading.set(true); this.scroll();
    this.ga('coach_demo_simulate', { lang: this.lang() });
    try {
      const res = await fetch(SIM_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation, userLanguage: this.coachLang(), sessionId: this.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.limited) this.ga('coach_demo_limited');
      this.coachReplies.update((v) => v + 1);
      if (Array.isArray(data?.approaches) && data.approaches.length) {
        this.messages.update((m) => [...m, { role: 'coach', text: '', ask: true, q: this.lastUserMsg, sim: { stage: data.stage || '', approaches: data.approaches, perspectiveNames: data.perspectiveNames || [], perspectivesUsed: data.perspectivesUsed || 0 } }]);
        this.lastCoachText = data.approaches[0]?.phrase || '';
      } else {
        this.messages.update((m) => [...m, { role: 'coach', text: data?.reply || this.t().greeting }]);
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.lang() === 'en' ? 'Simulation hiccup — try again.' : 'Hubo un problema con la simulación, inténtalo de nuevo.' }]);
    } finally { this.busy.set(false); this.simLoading.set(false); this.simMode.set(''); this.scroll(); }
  }

  /** Multi-universe simulation: the 5-stage relationship trajectory + compatibility. */
  private async runMultiverse(context: string) {
    this.busy.set(true); this.loadingMode.set('multiverse'); this.simLoading.set(true); this.scroll();
    this.ga('coach_demo_multiverse', { lang: this.lang() });
    try {
      const res = await fetch(MV_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, userLanguage: this.coachLang(), sessionId: this.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.limited) this.ga('coach_demo_limited');
      this.coachReplies.update((v) => v + 1);
      if (Array.isArray(data?.stages) && data.stages.length) {
        this.messages.update((m) => [...m, { role: 'coach', text: '', ask: true, q: this.lastUserMsg, mv: {
          compatibilityScore: data.compatibilityScore ?? null, compatibilityStars: data.compatibilityStars ?? null,
          compatibilityLabel: data.compatibilityLabel || '', stages: data.stages, keyInsights: data.keyInsights || [],
        } }]);
        this.lastCoachText = data.compatibilityLabel || (data.stages[0]?.bestPhrase || '');
      } else {
        this.messages.update((m) => [...m, { role: 'coach', text: data?.reply || this.t().greeting }]);
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.lang() === 'en' ? 'Simulation hiccup — try again.' : 'Hubo un problema con la simulación, inténtalo de nuevo.' }]);
    } finally { this.busy.set(false); this.simLoading.set(false); this.simMode.set(''); this.scroll(); }
  }

  // ── carousel + sim card helpers ──
  msgKey(i: number) { return (i + 1) * 100; }
  toneEmoji(toneKey?: string) {
    const m: Record<string, string> = { direct: '💬', playful: '😏', romantic_vulnerable: '💕', vulnerable: '🫧', grounded_honest: '🌱', warm: '🌷' };
    return (toneKey && m[toneKey]) || '✨';
  }
  stars(confidence: number | null) { return confidence == null ? 4 : Math.max(1, Math.min(5, Math.round(confidence / 20))); }
  mvStars(s: number | null) { return s == null ? 3 : Math.max(0, Math.min(5, Math.round(s))); }
  bestIdx(sim: SimResult) {
    let bi = 0; let bc = -1;
    sim.approaches.forEach((a, i) => { const c = a.confidence ?? 0; if (c > bc) { bc = c; bi = i; } });
    return bi;
  }
  onCarouselScroll(ev: Event, msgIdx: number) {
    const el = ev.target as HTMLElement;
    const page = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const cur = this.carouselPage();
    if (cur[msgIdx] !== page) this.carouselPage.set({ ...cur, [msgIdx]: page });
  }
  goToPage(msgIdx: number, page: number) {
    if (!this.isBrowser) return;
    const el = document.getElementById('cwcar-' + msgIdx) as HTMLElement | null;
    if (!el) return;
    const w = Math.max(1, el.clientWidth);
    const pages = Math.max(1, Math.round(el.scrollWidth / w));
    const p = Math.max(0, Math.min(page, pages - 1));
    el.scrollTo({ left: p * w, behavior: 'smooth' });
    this.carouselPage.set({ ...this.carouselPage(), [msgIdx]: p });
  }
  navCarousel(msgIdx: number, dir: number) {
    this.goToPage(msgIdx, (this.carouselPage()[msgIdx] || 0) + dir);
  }

  /** Re-ask the last question once we have a location (geo or city). */
  private async askWithLocation(extra: { lat?: number; lng?: number; city?: string }) {
    if (!this.lastUserMsg || this.busy()) return;
    await this.ask({ message: this.lastUserMsg, ...extra });
  }

  private async ask(payload: { message: string; lat?: number; lng?: number; city?: string }) {
    this.busy.set(true);
    if (!this.thinking()) { this.thinkingLabel.set(this.t().thinking); }
    this.thinking.set(true); this.scroll();
    try {
      const history = this.messages().filter((m) => !m.places && !m.phrases).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // R37/R45: send venues + phrases already shown so the panel returns OTHERS on re-press (no repeats).
        body: JSON.stringify({ ...payload, userLanguage: this.coachLang(), history, sessionId: this.sessionId, exclude: [...this.shownPlaces], excludePhrases: [...this.shownPhrases] }),
      });
      const data = await res.json().catch(() => ({}));
      this.thinking.set(false); // response arrived → hide the loader before rendering/typewriter
      if (data?.places?.length) {
        if (data?.exhausted) this.shownPlaces.clear(); // saw everything nearby → recycle next time
        for (const p of data.places) { if (p?.name) this.shownPlaces.add(p.name); }
      }
      if (data?.phrases?.length) {
        if (data?.exhausted) this.shownPhrases.clear(); // saw all fresh phrases → recycle next time
        for (const p of data.phrases) { if (typeof p === 'string') this.shownPhrases.add(p); }
      }
      // Never leave the user with a blank/echoed greeting — if the reply is empty, ask them to retry.
      const retry = this.lang() === 'en' ? "I didn't quite catch that — tell me a bit more and I'll help." : 'No te entendí del todo — cuéntame un poco más y te ayudo.';
      const reply = (data && typeof data.reply === 'string' && data.reply.trim()) ? data.reply : retry;
      this.coachReplies.update((v) => v + 1);
      this.lastCoachText = reply;
      // GA: one event per query (count = cantidad de consultas; geo/country auto from GA4).
      const intent = data?.places?.length ? 'place' : data?.phrases?.length ? 'phrase' : data?.needLocation ? 'place_need_loc' : 'general';
      this.ga('coach_demo_message', { intent, lang: this.lang() });
      if (data?.limited) this.ga('coach_demo_limited');
      if (data?.places?.length || data?.phrases?.length || data?.needLocation) {
        // structured result — show immediately with attachments (no typewriter)
        this.messages.update((m) => [...m, { role: 'coach', text: reply, places: data.places, phrases: data.phrases, phraseMeta: Array.isArray(data.phraseMeta) ? data.phraseMeta : undefined, needLocation: data.needLocation, ask: !!(data.places?.length || data.phrases?.length), q: this.lastUserMsg }]);
        this.scroll();
      } else {
        await this.typewrite(reply);
        this.messages.update((m) => m.map((x, i) => i === m.length - 1 ? { ...x, ask: true, q: this.lastUserMsg } : x));
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.lang() === 'en' ? 'Connection hiccup — try again.' : 'Hubo un problema de conexión, inténtalo de nuevo.' }]);
    } finally { this.busy.set(false); this.thinking.set(false); this.scroll(); }
  }

  /**
   * Resolve the geolocation permission state up-front (Permissions API where
   * available — Chrome/Edge/Firefox, Safari 16+). Lets us distinguish the three
   * cases the same way on desktop and mobile: already granted, needs a prompt,
   * or blocked. Returns 'unknown' on older Safari so we still attempt a prompt.
   */
  private async geoPermissionState(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
    try {
      const perms = (navigator as any).permissions;
      if (this.isBrowser && perms?.query) {
        const status = await perms.query({ name: 'geolocation' as PermissionName });
        return (status?.state as 'granted' | 'prompt' | 'denied') || 'unknown';
      }
    } catch { /* Safari < 16 / unsupported → fall through to a prompt attempt */ }
    return 'unknown';
  }

  /** Shared geolocation read with the three-case handling (granted / prompt / denied). */
  private requestGeolocation(q: string) {
    this.busy.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.busy.set(false); this.askWithLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      (err) => {
        this.busy.set(false);
        // PERMISSION_DENIED (code 1) → guide them; otherwise (timeout/unavailable) let backend ask for a city.
        if (err && err.code === err.PERMISSION_DENIED) {
          this.thinking.set(false);
          this.messages.update((m) => [...m, { role: 'coach', text: this.t().locBlocked }]);
          this.scroll();
        } else {
          this.ask({ message: q });
        }
      },
      // Give the user generous time to act on the permission dialog on desktop.
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 },
    );
  }

  /**
   * Place-suggestion chip. Same UX on desktop (PC/Mac) and mobile:
   *  1. Permission already GRANTED → use the location straight away (no dialog).
   *  2. Permission in PROMPT/unknown → trigger the browser permission dialog.
   *  3. Permission DENIED → don't fire a silent error; tell them it's blocked and let them type a city.
   */
  async askPlaces() {
    if (this.busy()) return;
    const q = this.t().placeQuery;
    this.lastUserMsg = q;
    this.messages.update((m) => [...m, { role: 'user', text: this.t().placeChip }]);
    this.ga('coach_demo_place_chip', { lang: this.coachLang() });

    if (!this.isBrowser || !navigator.geolocation) {
      // No geolocation API at all → backend asks for a city.
      this.thinkingLabel.set(this.t().placesLoading); this.thinking.set(true); this.scroll();
      this.ask({ message: q });
      return;
    }

    const state = await this.geoPermissionState();
    if (state === 'denied') {
      // Blocked at the browser level — a prompt will never appear; route to type-a-city.
      this.messages.update((m) => [...m, { role: 'coach', text: this.t().locBlocked }]);
      this.scroll();
      return;
    }
    // 'granted' resolves instantly; 'prompt'/'unknown' shows the OS/browser permission dialog.
    this.thinkingLabel.set(state === 'granted' ? this.t().placesLoading : this.t().locRequesting);
    this.thinking.set(true); this.scroll();
    this.requestGeolocation(q);
  }

  /** "Use my location" button shown in the needLocation block — same three-case handling. */
  async useLocation() {
    if (!this.isBrowser || !navigator.geolocation) { return; }
    const state = await this.geoPermissionState();
    if (state === 'denied') {
      this.messages.update((m) => [...m, { role: 'coach', text: this.t().locBlocked }]);
      this.scroll();
      return;
    }
    this.thinkingLabel.set(state === 'granted' ? this.t().placesLoading : this.t().locRequesting);
    this.thinking.set(true); this.scroll();
    this.requestGeolocation(this.t().placeQuery);
  }
  sendCity() {
    const c = (this.cityDraft || '').trim();
    if (!c) return;
    this.cityDraft = '';
    this.messages.update((m) => [...m, { role: 'user', text: c }]);
    this.askWithLocation({ city: c });
  }
  async copyPhrase(text: string, i: number) {
    if (!this.isBrowser) return;
    try { await navigator.clipboard.writeText(text); this.copiedIdx.set(i); setTimeout(() => this.copiedIdx.set(null), 1800); } catch { /* noop */ }
  }

  /** ChatGPT/Claude-style word-by-word reveal. */
  private async typewrite(full: string) {
    const idx = this.messages().length;
    this.messages.update((m) => [...m, { role: 'coach', text: '', typing: true }]);
    const words = full.split(' ');
    let acc = '';
    for (let i = 0; i < words.length; i++) {
      if (!this.open()) { acc = full; break; } // panel closed → stop animating, show full text
      acc += (i ? ' ' : '') + words[i];
      const cur = acc;
      this.messages.update((m) => m.map((x, j) => j === idx ? { ...x, text: cur, typing: true } : x));
      this.scroll();
      await new Promise((r) => setTimeout(r, 38));
    }
    this.messages.update((m) => m.map((x, j) => j === idx ? { ...x, text: acc, typing: false } : x));
  }

  async share() {
    if (!this.isBrowser) return;
    this.ga('coach_demo_share');
    const text = `${this.t().shareText}\n\n"${this.lastCoachText || ''}"\n\n${SITE}`;
    try {
      if ((navigator as any).share) { await (navigator as any).share({ title: 'Black Sugar 21', text, url: SITE }); }
      else { await navigator.clipboard.writeText(text); this.justShared.set(true); setTimeout(() => this.justShared.set(false), 2200); }
    } catch { /* user cancelled */ }
  }
  trackDownload() { this.ga('coach_demo_download', { store: this.isBrowser && /android/i.test(navigator.userAgent) ? 'android' : 'ios' }); }

  private scroll() {
    if (!this.isBrowser) return;
    setTimeout(() => { const b = document.querySelector('.cw-body'); if (b) b.scrollTop = b.scrollHeight; }, 30);
  }
}
