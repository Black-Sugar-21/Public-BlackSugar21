import { Component, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslationService } from './translation.service';
import { FirebaseService } from './firebase.service';

interface PlaceCard { name: string; address: string; rating: number | null; mapsUrl: string; }
interface SimApproach { tone: string; phrase: string; why: string; perspectives: string[]; confidence: number | null; }
interface SimResult { stage: string; approaches: SimApproach[]; perspectiveNames: string[]; perspectivesUsed: number; }
interface Msg {
  role: 'coach' | 'user'; text: string; typing?: boolean;
  places?: PlaceCard[]; phrases?: string[]; needLocation?: boolean; sim?: SimResult;
}

const ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoChat';
const SIM_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoSimulate';
const STORE_IOS = 'https://apps.apple.com/app/id6470783901';
const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.black.sugar21';
const SITE = 'https://blacksugar21.com';

const I18N: Record<string, any> = {
  es: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versión de prueba',
    greeting: 'Hola 👋 Soy tu Coach de inteligencia emocional para citas. Cuéntame qué situación tienes y te doy una idea concreta para tu próxima conversación.',
    chips: ['¿Cómo inicio una conversación?', 'Me dejaron en visto 😅', '¿Cómo propongo una cita?'],
    placeholder: 'Escribe tu situación…', send: 'Enviar',
    ctaTitle: '¿Te sirvió? Esto es solo una probada.', ctaText: 'En la app, el Coach te recuerda, conoce tus matches y te acompaña de verdad.',
    download: 'Descargar la app', share: 'Compartir', shared: '¡Copiado!',
    shareText: 'Probé el Coach IA de Black Sugar 21 y me dio este consejo 👀',
    footer: 'Generado por IA · versión de prueba',
    useLoc: '📍 Usar mi ubicación', cityPh: 'o escribe tu ciudad…', copy: 'Copiar', copied: '✓ Copiado', viewMap: 'Ver en mapa',
    simChip: '🔮 Simular una situación', simHint: 'Describe tu situación y mis 5 perspectivas la analizan',
    simAnalyzing: 'Analizando con 5 perspectivas…', simBy: 'Analizado por', simStage: 'Etapa', simWhy: 'Por qué funciona',
  },
  en: {
    fab: 'AI Coach', title: 'AI Coach', demo: 'Demo',
    greeting: "Hi 👋 I'm your emotional-intelligence dating coach. Tell me your situation and I'll give you one concrete idea for your next conversation.",
    chips: ['How do I start a conversation?', 'They left me on read 😅', 'How do I ask them out?'],
    placeholder: 'Describe your situation…', send: 'Send',
    ctaTitle: 'Liked it? This is just a taste.', ctaText: 'In the app, the Coach remembers you, knows your matches, and truly has your back.',
    download: 'Download the app', share: 'Share', shared: 'Copied!',
    shareText: 'I tried Black Sugar 21’s AI Coach and it gave me this advice 👀',
    footer: 'AI-generated · demo version',
    useLoc: '📍 Use my location', cityPh: 'or type your city…', copy: 'Copy', copied: '✓ Copied', viewMap: 'View on map',
    simChip: '🔮 Simulate a situation', simHint: 'Describe your situation and my 5 perspectives analyze it',
    simAnalyzing: 'Analyzing with 5 perspectives…', simBy: 'Analyzed by', simStage: 'Stage', simWhy: 'Why it works',
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
          @for (m of messages(); track $index) {
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
                    @for (p of m.places!; track p.name) {
                      <a class="cw-place" [href]="p.mapsUrl" target="_blank" rel="noopener">
                        <div class="cw-place-i"><b>{{ p.name }}</b>
                          @if (p.rating) { <span class="cw-rate">★ {{ p.rating }}</span> }</div>
                        <small>{{ p.address }}</small>
                        <span class="cw-map">{{ t().viewMap }} →</span>
                      </a>
                    }
                  </div>
                }

                @if (m.phrases?.length) {
                  <div class="cw-phrases">
                    @for (ph of m.phrases!; track ph; let i = $index) {
                      <div class="cw-phrase">
                        <span>{{ ph }}</span>
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
                    @for (a of m.sim.approaches; track $index) {
                      <div class="cw-appr">
                        <div class="cw-appr-top">
                          <span class="cw-tone">{{ a.tone }}</span>
                          @if (a.confidence != null) { <span class="cw-conf">{{ a.confidence }}%</span> }
                          <button class="cw-copy" (click)="copyPhrase(a.phrase, 1000 + $index)">{{ copiedIdx() === 1000 + $index ? t().copied : t().copy }}</button>
                        </div>
                        <p class="cw-appr-phrase">"{{ a.phrase }}"</p>
                        @if (a.why) { <p class="cw-appr-why"><b>{{ t().simWhy }}:</b> {{ a.why }}</p> }
                        @if (a.perspectives.length) {
                          <div class="cw-appr-tags">@for (pp of a.perspectives; track pp) { <span class="cw-tag">{{ pp }}</span> }</div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }
          @if (messages().length <= 1) {
            <div class="cw-chips">
              <button class="cw-chip cw-chip-sim" (click)="startSim()">{{ t().simChip }}</button>
              @for (c of t().chips; track c) { <button class="cw-chip" (click)="send(c)">{{ c }}</button> }
            </div>
          }
          @if (simMode() && !busy()) { <div class="cw-simhint">{{ t().simHint }}</div> }
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

        <form class="cw-input" (submit)="$event.preventDefault(); send(draft)">
          <input [(ngModel)]="draft" name="d" [placeholder]="t().placeholder" [disabled]="busy()" autocomplete="off" maxlength="400" />
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
      box-shadow:0 24px 70px rgba(0,0,0,0.55); animation:cwIn .28s cubic-bezier(.22,1,.36,1); }
    @keyframes cwIn { from{opacity:0; transform:translateY(20px) scale(.97)} to{opacity:1; transform:none} }
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
    .cw-phrases { margin-top:10px; display:flex; flex-direction:column; gap:7px; }
    .cw-phrase { display:flex; gap:8px; align-items:flex-start; background:#0c0c10; border:1px solid var(--cw-border); border-radius:11px; padding:9px 11px; }
    .cw-phrase span { flex:1; font-size:13px; color:var(--cw-text); line-height:1.45; }
    .cw-copy { background:none; border:1px solid var(--cw-border); color:var(--cw-gold); border-radius:8px; padding:4px 9px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap; align-self:center; }
    .cw-copy:hover { border-color:var(--cw-gold-d); }
    .cw-chip-sim { border-color:rgba(212,175,55,.45); color:var(--cw-gold); font-weight:600; }
    .cw-simhint { margin-top:8px; font-size:12px; color:var(--cw-muted); font-style:italic; }
    .cw-sim { margin-top:10px; display:flex; flex-direction:column; gap:10px; }
    .cw-sim-meta { background:#0c0c10; border:1px solid var(--cw-border); border-radius:11px; padding:10px 12px; }
    .cw-sim-stage { font-size:11px; color:var(--cw-gold); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
    .cw-sim-persp { display:flex; flex-wrap:wrap; gap:5px; align-items:center; margin-top:7px; }
    .cw-sim-persp small { color:var(--cw-muted); font-size:11px; }
    .cw-pill-p { font-size:10.5px; color:var(--cw-purple-l,#9c59ea); border:1px solid rgba(156,89,234,.4); border-radius:999px; padding:1px 8px; }
    .cw-appr { background:#0c0c10; border:1px solid var(--cw-border); border-radius:12px; padding:12px; }
    .cw-appr-top { display:flex; align-items:center; gap:8px; }
    .cw-tone { font-size:11px; font-weight:700; color:#1A1206; background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); border-radius:999px; padding:2px 10px; }
    .cw-conf { font-size:11px; color:var(--cw-gold); font-weight:600; }
    .cw-appr-top .cw-copy { margin-left:auto; }
    .cw-appr-phrase { margin:8px 0 6px; font-size:14px; color:var(--cw-text); line-height:1.5; }
    .cw-appr-why { margin:0; font-size:12px; color:var(--cw-muted); line-height:1.45; }
    .cw-appr-why b { color:var(--cw-text); }
    .cw-appr-tags { display:flex; flex-wrap:wrap; gap:5px; margin-top:8px; }
    .cw-tag { font-size:10px; color:var(--cw-muted); border:1px solid var(--cw-border); border-radius:6px; padding:1px 7px; }
    .cw-cta { margin-top:6px; background:linear-gradient(180deg,rgba(212,175,55,0.10),var(--cw-card)); border:1px solid rgba(212,175,55,0.3); border-radius:14px; padding:14px; }
    .cw-cta b { font-size:14px; color:var(--cw-text); } .cw-cta p { margin:5px 0 11px; font-size:12.5px; color:var(--cw-muted); }
    .cw-cta-actions { display:flex; gap:8px; }
    .cw-btn { flex:1; text-align:center; padding:9px; border-radius:10px; border:1px solid var(--cw-border); background:var(--cw-bg); color:var(--cw-text); font-weight:600; font-size:13px; cursor:pointer; text-decoration:none; }
    .cw-btn.gold { background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); color:#1A1206; border:none; }
    .cw-input { display:flex; gap:8px; padding:12px; border-top:1px solid var(--cw-border); }
    .cw-input input { flex:1; background:#0c0c10; border:1px solid var(--cw-border); border-radius:12px; padding:11px 14px; color:var(--cw-text); font-size:14px; outline:none; font-family:inherit; }
    .cw-input input:focus { border-color:var(--cw-gold-d); }
    .cw-snd { width:42px; border:none; border-radius:12px; background:linear-gradient(135deg,var(--cw-gold),var(--cw-gold-d)); color:#1A1206; font-size:17px; font-weight:700; cursor:pointer; }
    .cw-snd:disabled { opacity:.5; cursor:not-allowed; }
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
  readonly simMode = signal(false);
  draft = '';
  cityDraft = '';
  private coachReplies = 0;
  private lastCoachText = '';
  private lastUserMsg = '';

  readonly lang = computed(() => {
    const l = String(this.translation.currentLanguage() || 'es').toLowerCase();
    return I18N[l] ? l : (l.startsWith('es') ? 'es' : 'en');
  });
  t() { return I18N[this.lang()] || I18N['es']; }
  readonly showCta = computed(() => this.coachReplies >= 2);
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

  startSim() {
    this.simMode.set(true);
    this.ga('coach_demo_sim_open');
    this.messages.update((m) => [...m, { role: 'coach', text: this.t().simHint }]);
    this.scroll();
  }

  async send(text: string) {
    const msg = (text || '').trim();
    if (!msg || this.busy()) return;
    this.draft = '';
    this.lastUserMsg = msg;
    this.messages.update((m) => [...m, { role: 'user', text: msg }]);
    if (this.simMode()) { await this.runSim(msg); return; }
    await this.ask({ message: msg });
  }

  /** Multi-agent simulation: 5 perspectives analyze the visitor's situation. */
  private async runSim(situation: string) {
    this.busy.set(true);
    this.ga('coach_demo_simulate', { lang: this.lang() });
    try {
      const res = await fetch(SIM_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ situation, userLanguage: this.lang(), sessionId: this.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.limited) this.ga('coach_demo_limited');
      this.coachReplies++;
      if (Array.isArray(data?.approaches) && data.approaches.length) {
        this.messages.update((m) => [...m, { role: 'coach', text: '', sim: { stage: data.stage || '', approaches: data.approaches, perspectiveNames: data.perspectiveNames || [], perspectivesUsed: data.perspectivesUsed || 0 } }]);
        this.lastCoachText = data.approaches[0]?.phrase || '';
      } else {
        this.messages.update((m) => [...m, { role: 'coach', text: data?.reply || this.t().greeting }]);
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.lang() === 'en' ? 'Simulation hiccup — try again.' : 'Hubo un problema con la simulación, inténtalo de nuevo.' }]);
    } finally { this.busy.set(false); this.simMode.set(false); this.scroll(); }
  }

  /** Re-ask the last question once we have a location (geo or city). */
  private async askWithLocation(extra: { lat?: number; lng?: number; city?: string }) {
    if (!this.lastUserMsg || this.busy()) return;
    await this.ask({ message: this.lastUserMsg, ...extra });
  }

  private async ask(payload: { message: string; lat?: number; lng?: number; city?: string }) {
    this.busy.set(true);
    try {
      const history = this.messages().filter((m) => !m.places && !m.phrases).slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, userLanguage: this.lang(), history, sessionId: this.sessionId }),
      });
      const data = await res.json().catch(() => ({}));
      const reply = (data && data.reply) || this.t().greeting;
      this.coachReplies++;
      this.lastCoachText = reply;
      // GA: one event per query (count = cantidad de consultas; geo/country auto from GA4).
      const intent = data?.places?.length ? 'place' : data?.phrases?.length ? 'phrase' : data?.needLocation ? 'place_need_loc' : 'general';
      this.ga('coach_demo_message', { intent, lang: this.lang() });
      if (data?.limited) this.ga('coach_demo_limited');
      if (data?.places?.length || data?.phrases?.length || data?.needLocation) {
        // structured result — show immediately with attachments (no typewriter)
        this.messages.update((m) => [...m, { role: 'coach', text: reply, places: data.places, phrases: data.phrases, needLocation: data.needLocation }]);
        this.scroll();
      } else {
        await this.typewrite(reply);
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.lang() === 'en' ? 'Connection hiccup — try again.' : 'Hubo un problema de conexión, inténtalo de nuevo.' }]);
    } finally { this.busy.set(false); this.scroll(); }
  }

  useLocation() {
    if (!this.isBrowser || !navigator.geolocation) { return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.askWithLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* denied → user can type a city */ },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 },
    );
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
      acc += (i ? ' ' : '') + words[i];
      const cur = acc;
      this.messages.update((m) => m.map((x, j) => j === idx ? { ...x, text: cur, typing: true } : x));
      this.scroll();
      await new Promise((r) => setTimeout(r, 38));
    }
    this.messages.update((m) => m.map((x, j) => j === idx ? { ...x, typing: false } : x));
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
