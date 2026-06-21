import { Component, Inject, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';
import { TranslationService, Language } from './translation.service';
import { FirebaseService } from './firebase.service';

type Section = 'coach' | 'discovery' | 'chats' | 'profile';

// 13-language strings for the web-app shell (nav + the "in the app" teaser sections).
const SHELL_I18N: Record<string, Record<string, string>> = {
  coach: {"es":"Coach","en":"Coach","pt":"Coach","fr":"Coach","de":"Coach","it":"Coach","zh":"教练","ja":"コーチ","ko":"코치","ru":"Коуч","ar":"المدرّب","id":"Coach","tr":"Koç"},
  discovery: {"es":"Descubrir","en":"Discover","pt":"Descobrir","fr":"Découvrir","de":"Entdecken","it":"Scopri","zh":"发现","ja":"見つける","ko":"발견","ru":"Поиск","ar":"اكتشف","id":"Jelajah","tr":"Keşfet"},
  chats: {"es":"Mensajes","en":"Chats","pt":"Mensagens","fr":"Messages","de":"Chats","it":"Messaggi","zh":"消息","ja":"チャット","ko":"메시지","ru":"Чаты","ar":"الرسائل","id":"Pesan","tr":"Sohbetler"},
  profile: {"es":"Perfil","en":"Profile","pt":"Perfil","fr":"Profil","de":"Profil","it":"Profilo","zh":"资料","ja":"プロフィール","ko":"프로필","ru":"Профиль","ar":"الملف","id":"Profil","tr":"Profil"},
  inAppTitle: {"es":"Esto vive en la app","en":"This lives in the app","pt":"Isto está no app","fr":"Disponible dans l'app","de":"In der App verfügbar","it":"Disponibile nell'app","zh":"此功能在 App 中","ja":"アプリで利用できます","ko":"앱에서 이용하세요","ru":"Доступно в приложении","ar":"هذا متاح في التطبيق","id":"Tersedia di aplikasi","tr":"Bu uygulamada"},
  discoveryBody: {"es":"Descubre perfiles compatibles, desliza y haz match — todo con IA. Descarga la app para empezar.","en":"Discover compatible profiles, swipe and match — all AI-powered. Download the app to start.","pt":"Descubra perfis compatíveis, deslize e dê match — tudo com IA. Baixe o app para começar.","fr":"Découvre des profils compatibles, swipe et matche — propulsé par l'IA. Télécharge l'app.","de":"Entdecke passende Profile, swipe und matche — KI-gestützt. Lade die App.","it":"Scopri profili compatibili, scorri e fai match — con IA. Scarica l'app.","zh":"发现合拍的人，滑动并匹配——全程 AI。下载 App 开始。","ja":"相性の良い相手を見つけてスワイプ・マッチ。アプリをダウンロード。","ko":"잘 맞는 프로필을 발견하고 스와이프·매치 — 앱을 받아 시작하세요.","ru":"Находите совместимые анкеты, свайпайте и матчитесь — на ИИ. Скачайте приложение.","ar":"اكتشف ملفات متوافقة ومرّر وطابِق — بالذكاء الاصطناعي. حمّل التطبيق.","id":"Temukan profil cocok, geser dan match — bertenaga AI. Unduh aplikasinya.","tr":"Uyumlu profilleri keşfet, kaydır ve eşleş — yapay zekâ ile. Uygulamayı indir."},
  chatsBody: {"es":"Tus matches y conversaciones están en la app, con sugerencias del Coach IA. Descárgala para chatear.","en":"Your matches and chats are in the app, with AI Coach suggestions. Download it to chat.","pt":"Seus matches e conversas estão no app, com sugestões do Coach IA. Baixe para conversar.","fr":"Tes matchs et messages sont dans l'app, avec les suggestions du Coach IA. Télécharge-la.","de":"Deine Matches und Chats sind in der App, mit KI-Coach-Vorschlägen. Lade sie herunter.","it":"I tuoi match e le chat sono nell'app, con i suggerimenti del Coach IA. Scaricala.","zh":"你的匹配和聊天都在 App 中，附带 AI 教练建议。下载即可聊天。","ja":"マッチとチャットはアプリ内、AIコーチの提案つき。ダウンロードしてね。","ko":"매치와 대화는 앱에 있어요 — AI 코치 제안과 함께. 받아서 대화하세요.","ru":"Ваши матчи и чаты — в приложении, с подсказками ИИ-коуча. Скачайте.","ar":"مطابقاتك ومحادثاتك في التطبيق مع اقتراحات المدرّب. حمّله للدردشة.","id":"Match dan obrolanmu ada di aplikasi, dengan saran Coach AI. Unduh untuk chat.","tr":"Eşleşmelerin ve sohbetlerin uygulamada, AI Koç önerileriyle. İndir."},
  download: {"es":"Descargar la app","en":"Download the app","pt":"Baixar o app","fr":"Télécharger l'app","de":"App herunterladen","it":"Scarica l'app","zh":"下载 App","ja":"アプリをダウンロード","ko":"앱 다운로드","ru":"Скачать приложение","ar":"حمّل التطبيق","id":"Unduh aplikasi","tr":"Uygulamayı indir"},
  signIn: {"es":"Inicia sesión para ver tu perfil","en":"Sign in to see your profile","pt":"Entre para ver seu perfil","fr":"Connecte-toi pour voir ton profil","de":"Melde dich an, um dein Profil zu sehen","it":"Accedi per vedere il profilo","zh":"登录以查看资料","ja":"ログインしてプロフィールを表示","ko":"로그인하고 프로필 보기","ru":"Войдите, чтобы увидеть профиль","ar":"سجّل الدخول لعرض ملفك","id":"Masuk untuk melihat profil","tr":"Profilini görmek için giriş yap"},
  signOut: {"es":"Cerrar sesión","en":"Sign out","pt":"Sair","fr":"Se déconnecter","de":"Abmelden","it":"Esci","zh":"退出登录","ja":"ログアウト","ko":"로그아웃","ru":"Выйти","ar":"تسجيل الخروج","id":"Keluar","tr":"Çıkış yap"},
  backHome: {"es":"Volver al inicio","en":"Back to home","pt":"Voltar ao início","fr":"Retour à l'accueil","de":"Zur Startseite","it":"Torna alla home","zh":"返回首页","ja":"ホームに戻る","ko":"홈으로","ru":"На главную","ar":"العودة للرئيسية","id":"Ke beranda","tr":"Ana sayfa"},
};

const STORE_IOS = 'https://apps.apple.com/app/id6470783901';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, CoachWidgetComponent],
  template: `
    <div class="shell" [attr.dir]="lang() === 'ar' ? 'rtl' : 'ltr'">
      <!-- Desktop sidebar -->
      <aside class="shell-side">
        <a routerLink="/" class="shell-brand"><span class="shell-spark">✦</span> Black Sugar <b>21</b></a>
        <nav class="shell-nav">
          @for (it of navItems; track it.key) {
            <button class="shell-nav-item" [class.active]="section() === it.key" (click)="go(it.key)">
              <span class="shell-nav-ic">{{ it.icon }}</span><span class="shell-nav-lbl">{{ s(it.key === 'coach' ? 'coach' : it.key) }}</span>
            </button>
          }
        </nav>
        <div class="shell-side-foot">
          @if (firebase.currentUser(); as u) {
            <button class="shell-acct" (click)="go('profile')">
              @if (u.photoURL) { <img [src]="u.photoURL" alt="" referrerpolicy="no-referrer" /> } @else { <span class="shell-acct-i">{{ initial(u) }}</span> }
              <span class="shell-acct-n">{{ u.displayName || u.email }}</span>
            </button>
          }
        </div>
      </aside>

      <!-- Main panel -->
      <main class="shell-main">
        @switch (section()) {
          @case ('coach') {
            <div class="shell-coach"><app-coach-widget [embedded]="true"></app-coach-widget></div>
          }
          @case ('discovery') {
            <div class="shell-teaser">
              <div class="shell-teaser-ic">🔥</div>
              <h2>{{ s('inAppTitle') }}</h2>
              <p>{{ s('discoveryBody') }}</p>
              <a class="shell-cta" [href]="storeLink" target="_blank" rel="noopener">📱 {{ s('download') }}</a>
            </div>
          }
          @case ('chats') {
            <div class="shell-teaser">
              <div class="shell-teaser-ic">💬</div>
              <h2>{{ s('inAppTitle') }}</h2>
              <p>{{ s('chatsBody') }}</p>
              <a class="shell-cta" [href]="storeLink" target="_blank" rel="noopener">📱 {{ s('download') }}</a>
            </div>
          }
          @case ('profile') {
            <div class="shell-profile">
              @if (firebase.currentUser(); as u) {
                @if (u.photoURL) { <img class="shell-pf-av" [src]="u.photoURL" alt="" referrerpolicy="no-referrer" /> }
                @else { <span class="shell-pf-av initial">{{ initial(u) }}</span> }
                <h2>{{ u.displayName || u.email }}</h2>
                @if (u.email) { <p class="shell-pf-mail">{{ u.email }}</p> }
                <a class="shell-cta" [href]="storeLink" target="_blank" rel="noopener">📱 {{ s('download') }}</a>
                <button class="shell-signout" (click)="signOut()">{{ s('signOut') }}</button>
              } @else {
                <div class="shell-teaser-ic">👤</div>
                <p>{{ s('signIn') }}</p>
                <a routerLink="/" class="shell-cta">{{ s('backHome') }}</a>
              }
            </div>
          }
        }
      </main>

      <!-- Mobile bottom nav -->
      <nav class="shell-tabs">
        @for (it of navItems; track it.key) {
          <button class="shell-tab" [class.active]="section() === it.key" (click)="go(it.key)">
            <span class="shell-tab-ic">{{ it.icon }}</span>
          </button>
        }
      </nav>
    </div>
  `,
  styles: [`
    :host { display:block; }
    .shell { display:flex; min-height:100dvh; background:#0A0A0A; color:#fff; font-family:'Outfit',sans-serif; }
    .shell-side { width:240px; flex:none; background:#101010; border-right:1px solid rgba(255,255,255,.08); display:flex; flex-direction:column; padding:18px 12px; }
    .shell-brand { display:flex; align-items:center; gap:8px; color:#fff; text-decoration:none; font-size:18px; font-weight:700; padding:8px 10px 18px; }
    .shell-brand b { color:#D4AF37; } .shell-spark { color:#D4AF37; }
    .shell-nav { display:flex; flex-direction:column; gap:4px; flex:1; }
    .shell-nav-item { display:flex; align-items:center; gap:12px; background:none; border:none; color:#E0E0E0; font-family:inherit; font-size:15px; padding:12px 12px; border-radius:12px; cursor:pointer; text-align:left; }
    .shell-nav-item:hover { background:rgba(255,255,255,.05); }
    .shell-nav-item.active { background:rgba(212,175,55,.12); color:#D4AF37; font-weight:600; }
    .shell-nav-ic { font-size:18px; width:22px; text-align:center; }
    .shell-acct { display:flex; align-items:center; gap:9px; width:100%; background:none; border:1px solid rgba(255,255,255,.1); border-radius:12px; padding:9px 10px; color:#E0E0E0; cursor:pointer; font-family:inherit; }
    .shell-acct img, .shell-acct-i { width:30px; height:30px; border-radius:50%; flex:none; }
    .shell-acct-i { display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#D4AF37,#B8860B); color:#0A0A0A; font-weight:700; }
    .shell-acct-n { font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .shell-main { flex:1; min-width:0; display:flex; }
    .shell-coach { flex:1; display:flex; min-height:0; }
    .shell-teaser, .shell-profile { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:32px; gap:14px; }
    .shell-teaser-ic { font-size:54px; }
    .shell-teaser h2, .shell-profile h2 { font-family:'Playfair Display',serif; font-size:26px; margin:0; }
    .shell-teaser p, .shell-profile p { color:#B0B0B0; max-width:42ch; line-height:1.5; margin:0; }
    .shell-cta { display:inline-block; background:linear-gradient(135deg,#D4AF37,#B8860B); color:#0A0A0A; font-weight:700; padding:13px 26px; border-radius:999px; text-decoration:none; margin-top:6px; }
    .shell-pf-av { width:84px; height:84px; border-radius:50%; object-fit:cover; border:2px solid #D4AF37; }
    .shell-pf-av.initial { display:inline-flex; align-items:center; justify-content:center; background:linear-gradient(135deg,#D4AF37,#B8860B); color:#0A0A0A; font-weight:700; font-size:2rem; }
    .shell-pf-mail { color:#B0B0B0; }
    .shell-signout { background:none; border:1px solid rgba(255,255,255,.18); color:#E0E0E0; border-radius:999px; padding:11px 24px; font-family:inherit; cursor:pointer; }
    .shell-tabs { display:none; }
    @media (max-width: 860px) {
      .shell-side { display:none; }
      .shell { flex-direction:column; }
      .shell-main { padding-bottom:64px; }
      .shell-tabs { display:flex; position:fixed; bottom:0; left:0; right:0; height:60px; background:#101010; border-top:1px solid rgba(255,255,255,.1); z-index:50; }
      .shell-tab { flex:1; background:none; border:none; color:#888; font-size:22px; cursor:pointer; }
      .shell-tab.active { color:#D4AF37; }
    }
  `],
})
export class AppShellComponent {
  private isBrowser: boolean;
  readonly section = signal<Section>('coach');
  readonly navItems: Array<{ key: Section; icon: string }> = [
    { key: 'discovery', icon: '🔥' },
    { key: 'coach', icon: '✦' },
    { key: 'chats', icon: '💬' },
    { key: 'profile', icon: '👤' },
  ];
  readonly storeLink = STORE_IOS;

  constructor(
    @Inject(PLATFORM_ID) platformId: object,
    private translate: TranslationService,
    public firebase: FirebaseService,
    private router: Router,
  ) { this.isBrowser = isPlatformBrowser(platformId); }

  lang(): Language { return this.translate.currentLanguage(); }
  s(key: string): string { const m = SHELL_I18N[key]; return (m && (m[this.lang()] || m['en'])) || key; }
  go(sec: Section) { this.section.set(sec); }
  initial(u: { displayName?: string | null; email?: string | null } | null): string {
    const n = (u?.displayName || u?.email || '?').trim();
    return (n.charAt(0) || '?').toUpperCase();
  }
  async signOut() { try { await this.firebase.signOutUser(); } catch { /* noop */ } this.router.navigate(['/']); }
}
