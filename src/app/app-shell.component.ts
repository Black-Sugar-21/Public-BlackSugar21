import { Component, ChangeDetectionStrategy, Inject, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  confirmTitle: {"es":"¿Cerrar sesión?","en":"Sign out?","pt":"Sair?","fr":"Se déconnecter ?","de":"Abmelden?","it":"Uscire?","zh":"退出登录？","ja":"ログアウトしますか？","ko":"로그아웃할까요?","ru":"Выйти?","ar":"تسجيل الخروج؟","id":"Keluar?","tr":"Çıkış yapılsın mı?"},
  confirmBody: {"es":"Tendrás que iniciar sesión de nuevo para volver a tu cuenta.","en":"You'll need to sign in again to get back to your account.","pt":"Você precisará entrar de novo para voltar à sua conta.","fr":"Tu devras te reconnecter pour retrouver ton compte.","de":"Du musst dich erneut anmelden, um zurückzukehren.","it":"Dovrai accedere di nuovo per tornare al tuo account.","zh":"你需要重新登录才能回到账户。","ja":"アカウントに戻るには再度ログインが必要です。","ko":"계정으로 돌아가려면 다시 로그인해야 해요.","ru":"Чтобы вернуться, нужно будет войти снова.","ar":"ستحتاج لتسجيل الدخول مجدداً للعودة لحسابك.","id":"Kamu perlu masuk lagi untuk kembali ke akun.","tr":"Hesabına dönmek için tekrar giriş yapman gerekir."},
  cancel: {"es":"Cancelar","en":"Cancel","pt":"Cancelar","fr":"Annuler","de":"Abbrechen","it":"Annulla","zh":"取消","ja":"キャンセル","ko":"취소","ru":"Отмена","ar":"إلغاء","id":"Batal","tr":"İptal"},
  discoLoading: {"es":"Buscando personas compatibles…","en":"Finding compatible people…","pt":"Buscando pessoas compatíveis…","fr":"Recherche de personnes compatibles…","de":"Suche passende Menschen…","it":"Ricerca di persone compatibili…","zh":"正在寻找合拍的人…","ja":"相性の良い人を検索中…","ko":"잘 맞는 사람을 찾는 중…","ru":"Ищем подходящих людей…","ar":"جارٍ البحث عن أشخاص متوافقين…","id":"Mencari orang yang cocok…","tr":"Uyumlu kişiler aranıyor…"},
  discoEmpty: {"es":"No hay más perfiles por ahora. Vuelve más tarde.","en":"No more profiles right now. Check back later.","pt":"Sem mais perfis por agora. Volte mais tarde.","fr":"Plus de profils pour l'instant. Reviens plus tard.","de":"Vorerst keine weiteren Profile. Schau später vorbei.","it":"Nessun altro profilo per ora. Torna più tardi.","zh":"暂时没有更多人了，稍后再来。","ja":"今はこれ以上いません。あとでまた見てね。","ko":"지금은 더 없어요. 나중에 다시 확인해요.","ru":"Пока больше нет анкет. Загляните позже.","ar":"لا مزيد من الملفات الآن. عُد لاحقاً.","id":"Tidak ada profil lagi. Cek lagi nanti.","tr":"Şimdilik başka profil yok. Sonra tekrar bak."},
  discoRetry: {"es":"Recargar","en":"Reload","pt":"Recarregar","fr":"Recharger","de":"Neu laden","it":"Ricarica","zh":"重新加载","ja":"再読み込み","ko":"새로고침","ru":"Обновить","ar":"إعادة التحميل","id":"Muat ulang","tr":"Yenile"},
  discoSignIn: {"es":"Inicia sesión para descubrir personas","en":"Sign in to discover people","pt":"Entre para descobrir pessoas","fr":"Connecte-toi pour découvrir des gens","de":"Melde dich an, um Leute zu entdecken","it":"Accedi per scoprire persone","zh":"登录以发现新朋友","ja":"ログインして人を見つけよう","ko":"로그인하고 사람을 만나보세요","ru":"Войдите, чтобы знакомиться","ar":"سجّل الدخول لاكتشاف أشخاص","id":"Masuk untuk menemukan orang","tr":"İnsanları keşfetmek için giriş yap"},
  chatsEmpty: {"es":"Aún no tienes matches. ¡Ve a Descubrir!","en":"No matches yet. Head to Discover!","pt":"Sem matches ainda. Vá em Descobrir!","fr":"Pas encore de matchs. Va dans Découvrir !","de":"Noch keine Matches. Geh zu Entdecken!","it":"Nessun match ancora. Vai su Scopri!","zh":"还没有匹配，去发现页看看！","ja":"まだマッチがありません。発見へ！","ko":"아직 매치가 없어요. 발견으로 가요!","ru":"Пока нет совпадений. Загляните в Поиск!","ar":"لا توجد مطابقات بعد. اذهب إلى اكتشف!","id":"Belum ada match. Ke Jelajah!","tr":"Henüz eşleşme yok. Keşfet'e git!"},
  chatPlaceholder: {"es":"Escribe un mensaje…","en":"Type a message…","pt":"Escreva uma mensagem…","fr":"Écris un message…","de":"Nachricht schreiben…","it":"Scrivi un messaggio…","zh":"输入消息…","ja":"メッセージを入力…","ko":"메시지 입력…","ru":"Напишите сообщение…","ar":"اكتب رسالة…","id":"Tulis pesan…","tr":"Mesaj yaz…"},
  chatStart: {"es":"Inicia la conversación 👋","en":"Start the conversation 👋","pt":"Comece a conversa 👋","fr":"Commence la conversation 👋","de":"Starte das Gespräch 👋","it":"Inizia la conversazione 👋","zh":"开始聊天吧 👋","ja":"会話を始めよう 👋","ko":"대화를 시작해요 👋","ru":"Начните разговор 👋","ar":"ابدأ المحادثة 👋","id":"Mulai obrolan 👋","tr":"Sohbete başla 👋"},
  chatSignIn: {"es":"Inicia sesión para ver tus mensajes","en":"Sign in to see your messages","pt":"Entre para ver suas mensagens","fr":"Connecte-toi pour voir tes messages","de":"Melde dich an, um Nachrichten zu sehen","it":"Accedi per vedere i messaggi","zh":"登录以查看消息","ja":"ログインしてメッセージを見る","ko":"로그인하고 메시지 보기","ru":"Войдите, чтобы видеть сообщения","ar":"سجّل الدخول لعرض رسائلك","id":"Masuk untuk melihat pesan","tr":"Mesajları görmek için giriş yap"},
};

const STORE_IOS = 'https://apps.apple.com/app/id6470783901';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CoachWidgetComponent],
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnDestroy {
  private isBrowser: boolean;
  readonly section = signal<Section>('coach');
  readonly showConfirm = signal(false);
  // Discovery feed state (real feed via getDiscoveryFeed, like/pass via recordSwipe)
  readonly discoProfiles = signal<any[]>([]);
  readonly discoIdx = signal(0);
  readonly discoLoading = signal(false);
  readonly discoLoaded = signal(false);
  readonly photoIdx = signal(0);
  readonly swiping = signal<'like' | 'pass' | null>(null);
  // Chat state
  readonly matches = signal<any[]>([]);
  readonly matchNames = signal<Record<string, string>>({});
  readonly selectedMatch = signal<any | null>(null);
  readonly chatMsgs = signal<any[]>([]);
  chatText = '';
  private unsubMatches: (() => void) | null = null;
  private unsubMsgs: (() => void) | null = null;
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
  go(sec: Section) {
    this.section.set(sec);
    if (sec === 'discovery' && !this.discoLoaded() && this.firebase.currentUser()) this.loadDiscovery();
    if (sec === 'chats' && !this.unsubMatches && this.firebase.currentUser()) this.subscribeMatches();
  }
  initial(u: { displayName?: string | null; email?: string | null } | null): string {
    const n = (u?.displayName || u?.email || '?').trim();
    return (n.charAt(0) || '?').toUpperCase();
  }
  async signOut() { this.showConfirm.set(false); try { await this.firebase.signOutUser(); } catch { /* noop */ } this.router.navigate(['/']); }

  // ── Discovery ──────────────────────────────────────────────────────────────
  async loadDiscovery() {
    if (this.discoLoading()) return;
    this.discoLoading.set(true);
    try {
      const profiles = await this.firebase.getDiscoveryFeed(20);
      this.discoProfiles.set(Array.isArray(profiles) ? profiles : []);
      this.discoIdx.set(0);
      this.photoIdx.set(0);
      this.discoLoaded.set(true);
    } catch { this.discoProfiles.set([]); this.discoLoaded.set(true); }
    finally { this.discoLoading.set(false); }
  }
  currentProfile(): any | null {
    const list = this.discoProfiles();
    const i = this.discoIdx();
    return i < list.length ? list[i] : null;
  }
  profilePhoto(): string | null {
    const p = this.currentProfile();
    if (!p || !Array.isArray(p.pictures) || !p.pictures.length) return null;
    const pi = Math.min(this.photoIdx(), p.pictures.length - 1);
    return p.pictures[pi]?.url || null;
  }
  nextPhoto() {
    const p = this.currentProfile();
    if (!p || !Array.isArray(p.pictures) || p.pictures.length < 2) return;
    this.photoIdx.update((v) => (v + 1) % p.pictures.length);
  }
  private advance() { this.photoIdx.set(0); this.discoIdx.update((v) => v + 1); this.swiping.set(null); }
  swipe(action: 'like' | 'pass' | 'superlike') {
    const p = this.currentProfile();
    if (!p) return;
    this.swiping.set(action === 'pass' ? 'pass' : 'like');
    this.firebase.recordSwipe(p.userId, action).catch(() => { /* best-effort */ });
    setTimeout(() => this.advance(), 220);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────────
  private subscribeMatches() {
    this.unsubMatches = this.firebase.listenMatches((rows) => {
      this.matches.set(rows);
      const names = { ...this.matchNames() };
      rows.forEach((r) => {
        if (r.otherUid && names[r.otherUid] === undefined) {
          names[r.otherUid] = '';
          this.firebase.getUserBasic(r.otherUid).then((b) => {
            if (b) this.matchNames.update((m) => ({ ...m, [r.otherUid]: b.name }));
          });
        }
      });
      this.matchNames.set(names);
    });
  }
  matchName(uid: string): string { return this.matchNames()[uid] || '…'; }
  openChat(match: any) {
    this.selectedMatch.set(match);
    this.chatMsgs.set([]);
    if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; }
    this.unsubMsgs = this.firebase.listenMessages(match.id, (msgs) => this.chatMsgs.set(msgs));
  }
  backToList() { this.selectedMatch.set(null); if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; } }
  myUid(): string { return this.firebase.currentUser()?.uid || ''; }
  async sendChat() {
    const m = this.selectedMatch();
    const t = this.chatText.trim();
    if (!m || !t) return;
    this.chatText = '';
    try { await this.firebase.sendMessage(m.id, t); } catch { this.chatText = t; /* restore on failure (e.g., first-message gate) */ }
  }

  ngOnDestroy() { if (this.unsubMatches) this.unsubMatches(); if (this.unsubMsgs) this.unsubMsgs(); }
}
