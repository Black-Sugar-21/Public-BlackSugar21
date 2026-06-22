import { Component, ChangeDetectionStrategy, Inject, OnDestroy, PLATFORM_ID, signal, computed, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';
import { ShellNavIconComponent } from './shell-nav-icon.component';
import { UiButtonComponent } from './ui/atoms/ui-button.component';
import { UiOptionComponent } from './ui/atoms/ui-option.component';
import { UiInputComponent } from './ui/atoms/ui-input.component';
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
  discoError: {"es":"No se pudo cargar el feed. Revisa tu conexión e inténtalo de nuevo.","en":"Couldn't load the feed. Check your connection and try again.","pt":"Não foi possível carregar o feed. Verifique a conexão e tente de novo.","fr":"Échec du chargement. Vérifie ta connexion et réessaie.","de":"Feed konnte nicht geladen werden. Prüfe deine Verbindung und versuch es erneut.","it":"Impossibile caricare il feed. Controlla la connessione e riprova.","zh":"无法加载，请检查网络后重试。","ja":"読み込めませんでした。接続を確認して再試行してください。","ko":"불러오지 못했어요. 연결을 확인하고 다시 시도하세요.","ru":"Не удалось загрузить. Проверьте соединение и повторите.","ar":"تعذّر تحميل القائمة. تحقّق من اتصالك وحاول مجدداً.","id":"Tidak bisa memuat. Periksa koneksi dan coba lagi.","tr":"Akış yüklenemedi. Bağlantını kontrol edip tekrar dene."},
  chatLoadOlder: {"es":"Cargar mensajes anteriores","en":"Load older messages","pt":"Carregar mensagens antigas","fr":"Charger les messages plus anciens","de":"Ältere Nachrichten laden","it":"Carica messaggi precedenti","zh":"加载更早的消息","ja":"以前のメッセージを読み込む","ko":"이전 메시지 불러오기","ru":"Загрузить ранние сообщения","ar":"تحميل الرسائل الأقدم","id":"Muat pesan lama","tr":"Eski mesajları yükle"},
  viewOnMaps: {"es":"Ver en Maps","en":"View on Maps","pt":"Ver no Maps","fr":"Voir sur Maps","de":"Auf Maps ansehen","it":"Vedi su Maps","zh":"在地图查看","ja":"マップで見る","ko":"지도에서 보기","ru":"Открыть на карте","ar":"عرض على الخرائط","id":"Lihat di Maps","tr":"Haritalarda gör"},
  getTickets: {"es":"Entradas","en":"Get tickets","pt":"Ingressos","fr":"Billets","de":"Tickets","it":"Biglietti","zh":"购票","ja":"チケット","ko":"티켓 구매","ru":"Билеты","ar":"التذاكر","id":"Tiket","tr":"Biletler"},
  chatSendErr: {"es":"No se pudo enviar el mensaje. Inténtalo de nuevo.","en":"Couldn't send the message. Try again.","pt":"Não foi possível enviar. Tente de novo.","fr":"Échec de l'envoi. Réessaie.","de":"Nachricht konnte nicht gesendet werden. Versuch es erneut.","it":"Invio non riuscito. Riprova.","zh":"消息发送失败，请重试。","ja":"送信できませんでした。もう一度お試しください。","ko":"메시지를 보내지 못했어요. 다시 시도하세요.","ru":"Не удалось отправить. Повторите.","ar":"تعذّر إرسال الرسالة. حاول مجدداً.","id":"Gagal mengirim pesan. Coba lagi.","tr":"Mesaj gönderilemedi. Tekrar dene."},
  discoLocTitle: {"es":"Activa tu ubicación","en":"Enable your location","pt":"Ative sua localização","fr":"Active ta localisation","de":"Standort aktivieren","it":"Attiva la posizione","zh":"开启你的位置","ja":"位置情報をオンに","ko":"위치를 켜세요","ru":"Включите геолокацию","ar":"فعّل موقعك","id":"Aktifkan lokasimu","tr":"Konumunu aç"},
  discoLocBody: {"es":"La usamos solo para mostrarte personas cerca de ti. Nunca la compartimos con nadie.","en":"We use it only to show you people near you. We never share it with anyone.","pt":"Usamos apenas para mostrar pessoas perto de você. Nunca compartilhamos.","fr":"Nous l'utilisons uniquement pour te montrer des personnes près de toi. Jamais partagée.","de":"Wir nutzen ihn nur, um dir Menschen in deiner Nähe zu zeigen. Niemals geteilt.","it":"La usiamo solo per mostrarti persone vicine. Mai condivisa.","zh":"仅用于向你展示附近的人，绝不分享。","ja":"近くの人を表示するためだけに使用します。共有しません。","ko":"근처 사람을 보여주기 위해서만 사용해요. 공유하지 않습니다.","ru":"Используем только чтобы показать людей рядом. Никогда не передаём.","ar":"نستخدمه فقط لعرض أشخاص قريبين منك. لا نشاركه أبداً.","id":"Hanya untuk menampilkan orang di dekatmu. Tidak pernah dibagikan.","tr":"Yalnızca yakınındaki kişileri göstermek için kullanırız. Asla paylaşmayız."},
  discoLocBtn: {"es":"Activar ubicación","en":"Enable location","pt":"Ativar localização","fr":"Activer la localisation","de":"Standort aktivieren","it":"Attiva posizione","zh":"开启位置","ja":"位置情報をオンにする","ko":"위치 켜기","ru":"Включить геолокацию","ar":"تفعيل الموقع","id":"Aktifkan lokasi","tr":"Konumu aç"},
  discoLocDenied: {"es":"Activa la ubicación desde los ajustes de tu navegador para ver personas cerca.","en":"Enable location in your browser settings to see people nearby.","pt":"Ative a localização nas configurações do navegador para ver pessoas perto.","fr":"Active la localisation dans les réglages du navigateur pour voir des personnes proches.","de":"Aktiviere den Standort in den Browser-Einstellungen, um Menschen in der Nähe zu sehen.","it":"Attiva la posizione nelle impostazioni del browser per vedere persone vicine.","zh":"请在浏览器设置中开启位置以查看附近的人。","ja":"近くの人を見るにはブラウザ設定で位置情報をオンにしてください。","ko":"근처 사람을 보려면 브라우저 설정에서 위치를 켜세요.","ru":"Включите геолокацию в настройках браузера, чтобы видеть людей рядом.","ar":"فعّل الموقع من إعدادات المتصفح لرؤية أشخاص قريبين.","id":"Aktifkan lokasi di pengaturan browser untuk melihat orang di dekatmu.","tr":"Yakındaki kişileri görmek için tarayıcı ayarlarından konumu aç."},
  discoSignIn: {"es":"Inicia sesión para descubrir personas","en":"Sign in to discover people","pt":"Entre para descobrir pessoas","fr":"Connecte-toi pour découvrir des gens","de":"Melde dich an, um Leute zu entdecken","it":"Accedi per scoprire persone","zh":"登录以发现新朋友","ja":"ログインして人を見つけよう","ko":"로그인하고 사람을 만나보세요","ru":"Войдите, чтобы знакомиться","ar":"سجّل الدخول لاكتشاف أشخاص","id":"Masuk untuk menemukan orang","tr":"İnsanları keşfetmek için giriş yap"},
  chemistry: {"es":"Química","en":"Chemistry","pt":"Química","fr":"Alchimie","de":"Chemie","it":"Affinità","zh":"默契","ja":"相性","ko":"케미","ru":"Химия","ar":"كيمياء","id":"Kimia","tr":"Kimya"},
  near: {"es":"Cerca","en":"Near","pt":"Perto","fr":"Proche","de":"In der Nähe","it":"Vicino","zh":"附近","ja":"近く","ko":"근처","ru":"Рядом","ar":"قريب","id":"Dekat","tr":"Yakın"},
  chatsEmpty: {"es":"Aún no tienes matches. ¡Ve a Descubrir!","en":"No matches yet. Head to Discover!","pt":"Sem matches ainda. Vá em Descobrir!","fr":"Pas encore de matchs. Va dans Découvrir !","de":"Noch keine Matches. Geh zu Entdecken!","it":"Nessun match ancora. Vai su Scopri!","zh":"还没有匹配，去发现页看看！","ja":"まだマッチがありません。発見へ！","ko":"아직 매치가 없어요. 발견으로 가요!","ru":"Пока нет совпадений. Загляните в Поиск!","ar":"لا توجد مطابقات بعد. اذهب إلى اكتشف!","id":"Belum ada match. Ke Jelajah!","tr":"Henüz eşleşme yok. Keşfet'e git!"},
  chatPlaceholder: {"es":"Escribe un mensaje…","en":"Type a message…","pt":"Escreva uma mensagem…","fr":"Écris un message…","de":"Nachricht schreiben…","it":"Scrivi un messaggio…","zh":"输入消息…","ja":"メッセージを入力…","ko":"메시지 입력…","ru":"Напишите сообщение…","ar":"اكتب رسالة…","id":"Tulis pesan…","tr":"Mesaj yaz…"},
  chatStart: {"es":"Inicia la conversación 👋","en":"Start the conversation 👋","pt":"Comece a conversa 👋","fr":"Commence la conversation 👋","de":"Starte das Gespräch 👋","it":"Inizia la conversazione 👋","zh":"开始聊天吧 👋","ja":"会話を始めよう 👋","ko":"대화를 시작해요 👋","ru":"Начните разговор 👋","ar":"ابدأ المحادثة 👋","id":"Mulai obrolan 👋","tr":"Sohbete başla 👋"},
  chatSignIn: {"es":"Inicia sesión para ver tus mensajes","en":"Sign in to see your messages","pt":"Entre para ver suas mensagens","fr":"Connecte-toi pour voir tes messages","de":"Melde dich an, um Nachrichten zu sehen","it":"Accedi per vedere i messaggi","zh":"登录以查看消息","ja":"ログインしてメッセージを見る","ko":"로그인하고 메시지 보기","ru":"Войдите, чтобы видеть сообщения","ar":"سجّل الدخول لعرض رسائلك","id":"Masuk untuk melihat pesan","tr":"Mesajları görmek için giriş yap"},
  // Onboarding (13 languages)
  obWelcome: {"es":"Conoce a tu Coach de Inteligencia Emocional","en":"Meet your AI Emotional-Intelligence Coach","pt":"Conheça seu Coach de Inteligência Emocional com IA","fr":"Rencontre ton coach en intelligence émotionnelle IA","de":"Lerne deinen KI-Coach für emotionale Intelligenz kennen","it":"Conosci il tuo Coach IA di intelligenza emotiva","zh":"认识你的 AI 情商教练","ja":"AI感情知能コーチに出会いましょう","ko":"AI 감성지능 코치를 만나보세요","ru":"Познакомьтесь с ИИ-коучем по эмоциональному интеллекту","ar":"تعرّف على مدرّب الذكاء العاطفي بالذكاء الاصطناعي","id":"Kenali Coach Kecerdasan Emosional AI-mu","tr":"Meet your AI Emotional-Intelligence Coach"},
  obWelcomeSub: {"es":"Tu compañero personal para conectar mejor.","en":"Your personal companion to connect better.","pt":"Seu companheiro pessoal para se conectar melhor.","fr":"Ton compagnon personnel pour mieux te connecter.","de":"Dein persönlicher Begleiter für bessere Verbindungen.","it":"Il tuo compagno personale per connetterti meglio.","zh":"你的专属伙伴，帮你更好地建立连接。","ja":"より良くつながるための、あなた専用のパートナー。","ko":"더 잘 연결되도록 돕는 당신만의 파트너.","ru":"Ваш личный помощник, чтобы общаться лучше.","ar":"رفيقك الشخصي لتتواصل بشكل أفضل.","id":"Teman pribadimu untuk terhubung lebih baik.","tr":"Your personal companion to connect better."},
  obCap1: {"es":"Consejos según tu forma de ser","en":"Advice based on who you are","pt":"Conselhos de acordo com você","fr":"Des conseils adaptés à toi","de":"Tipps, die zu dir passen","it":"Consigli su misura per te","zh":"贴合你个性的建议","ja":"あなたに合わせたアドバイス","ko":"당신에게 맞춘 조언","ru":"Советы с учётом вашего характера","ar":"نصائح تناسب شخصيتك","id":"Saran sesuai dirimu","tr":"Advice based on who you are"},
  obCap2: {"es":"Simula conversaciones y citas","en":"Simulate conversations and dates","pt":"Simula conversas e encontros","fr":"Simule des conversations et des rendez-vous","de":"Gespräche und Dates simulieren","it":"Simula conversazioni e appuntamenti","zh":"模拟对话和约会","ja":"会話やデートをシミュレーション","ko":"대화와 데이트 시뮬레이션","ru":"Моделирует разговоры и свидания","ar":"محاكاة المحادثات والمواعيد","id":"Simulasikan percakapan dan kencan","tr":"Simulate conversations and dates"},
  obCap3: {"es":"Ideas para romper el hielo","en":"Ideas to break the ice","pt":"Ideias para quebrar o gelo","fr":"Des idées pour briser la glace","de":"Ideen, um das Eis zu brechen","it":"Idee per rompere il ghiaccio","zh":"打破僵局的点子","ja":"会話のきっかけのアイデア","ko":"어색함을 깨는 아이디어","ru":"Идеи, чтобы растопить лёд","ar":"أفكار لكسر الجمود","id":"Ide untuk mencairkan suasana","tr":"Ideas to break the ice"},
  obCap4: {"es":"Te recuerda y te ayuda a crecer","en":"Remembers you and helps you grow","pt":"Lembra de você e ajuda você a crescer","fr":"Se souvient de toi et t'aide à progresser","de":"Merkt sich dich und hilft dir zu wachsen","it":"Ti ricorda e ti aiuta a crescere","zh":"记住你，助你成长","ja":"あなたを記憶し、成長を後押し","ko":"당신을 기억하고 성장을 도와요","ru":"Помнит вас и помогает расти","ar":"يتذكّرك ويساعدك على النمو","id":"Mengingatmu dan membantumu berkembang","tr":"Remembers you and helps you grow"},
  obWelcomeFooter: {"es":"Creemos tu perfil — tu coach te acompaña desde aquí.","en":"Let's set up your profile — your coach is with you from here.","pt":"Vamos criar seu perfil — seu coach te acompanha a partir daqui.","fr":"Créons ton profil — ton coach t'accompagne dès maintenant.","de":"Erstelle dein Profil — dein Coach begleitet dich ab hier.","it":"Creiamo il tuo profilo — il tuo coach ti accompagna da qui.","zh":"来创建你的资料吧——从这里开始，教练与你同行。","ja":"プロフィールを作りましょう。ここからコーチが一緒です。","ko":"프로필을 만들어요 — 지금부터 코치가 함께해요.","ru":"Создадим ваш профиль — коуч рядом с этого момента.","ar":"لننشئ ملفك — مدرّبك معك من هنا.","id":"Yuk buat profilmu — coach-mu menemanimu mulai sekarang.","tr":"Let's set up your profile — your coach is with you from here."},
  obStart: {"es":"Comenzar","en":"Get started","pt":"Começar","fr":"Commencer","de":"Loslegen","it":"Inizia","zh":"开始","ja":"はじめる","ko":"시작하기","ru":"Начать","ar":"ابدأ","id":"Mulai","tr":"Başla"},
  obNameDesc: {"es":"Así te verán el Coach y tus matches.","en":"How the Coach and your matches will see you.","pt":"Como o Coach e seus matches verão você.","fr":"Comment le Coach et tes matchs te verront.","de":"So sehen dich Coach und Matches.","it":"Come ti vedranno il Coach e i match.","zh":"教练和匹配的人将这样看到你。","ja":"コーチとマッチに表示される名前です。","ko":"코치와 매치에게 보일 이름이에요.","ru":"Так вас увидят коуч и совпадения.","ar":"هكذا سيراك المدرّب ومطابقاتك.","id":"Begini Coach dan match melihatmu.","tr":"Koç ve eşleşmelerin seni böyle görür."},
  obYearsSuffix: {"es":"años","en":"years old","pt":"anos","fr":"ans","de":"Jahre","it":"anni","zh":"岁","ja":"歳","ko":"세","ru":"лет","ar":"سنة","id":"tahun","tr":"yaşında"},
  obUnderageMsg: {"es":"Debes tener al menos {min} años para continuar.","en":"You must be at least {min} to continue.","pt":"Você precisa ter pelo menos {min} anos para continuar.","fr":"Tu dois avoir au moins {min} ans pour continuer.","de":"Du musst mindestens {min} Jahre alt sein.","it":"Devi avere almeno {min} anni per continuare.","zh":"你必须年满 {min} 岁才能继续。","ja":"続けるには{min}歳以上である必要があります。","ko":"계속하려면 만 {min}세 이상이어야 해요.","ru":"Вам должно быть не менее {min} лет.","ar":"يجب أن يكون عمرك {min} عامًا على الأقل للمتابعة.","id":"Kamu harus berusia minimal {min} tahun untuk lanjut.","tr":"Devam etmek için en az {min} yaşında olmalısın."},
  obInvalidDateMsg: {"es":"Fecha inválida.","en":"Invalid date.","pt":"Data inválida.","fr":"Date invalide.","de":"Ungültiges Datum.","it":"Data non valida.","zh":"日期无效。","ja":"無効な日付です。","ko":"유효하지 않은 날짜예요.","ru":"Недействительная дата.","ar":"تاريخ غير صالح.","id":"Tanggal tidak valid.","tr":"Geçersiz tarih."},
  obBirthdayDesc: {"es":"Solo para confirmar que eres mayor de 18.","en":"Just to confirm you're 18 or older.","pt":"Apenas para confirmar que você tem 18+.","fr":"Juste pour confirmer que tu as 18 ans ou plus.","de":"Nur um zu bestätigen, dass du 18+ bist.","it":"Solo per confermare che hai almeno 18 anni.","zh":"仅用于确认你已年满 18 岁。","ja":"18歳以上であることの確認のみに使用します。","ko":"만 18세 이상인지 확인하기 위함이에요.","ru":"Только чтобы подтвердить, что вам 18+.","ar":"فقط للتأكد من أنك 18 عامًا أو أكثر.","id":"Hanya untuk memastikan kamu 18+.","tr":"Yalnızca 18 yaşından büyük olduğunu doğrulamak için."},
  obGenderDesc: {"es":"Nos ayuda a mostrarte a las personas correctas.","en":"Helps us show you to the right people.","pt":"Ajuda a mostrar você às pessoas certas.","fr":"Nous aide à te montrer aux bonnes personnes.","de":"Hilft, dich den richtigen Leuten zu zeigen.","it":"Ci aiuta a mostrarti alle persone giuste.","zh":"帮助我们把你展示给合适的人。","ja":"最適な相手に表示するために使います。","ko":"알맞은 사람들에게 보여주는 데 도움이 돼요.","ru":"Помогает показать вас нужным людям.","ar":"يساعدنا على عرضك للأشخاص المناسبين.","id":"Membantu menampilkanmu ke orang yang tepat.","tr":"Seni doğru kişilere göstermemize yardımcı olur."},
  obTypeDesc: {"es":"Elige cómo quieres vivir la experiencia.","en":"Choose how you want to experience it.","pt":"Escolha como quer viver a experiência.","fr":"Choisis comment vivre l'expérience.","de":"Wähle, wie du es erleben willst.","it":"Scegli come vivere l'esperienza.","zh":"选择你想要的体验方式。","ja":"体験のスタイルを選んでください。","ko":"경험 방식을 선택하세요.","ru":"Выберите, как хотите этим пользоваться.","ar":"اختر كيف تريد أن تعيش التجربة.","id":"Pilih cara kamu menikmatinya.","tr":"Deneyimi nasıl yaşamak istediğini seç."},
  obOrientationDesc: {"es":"¿A quién quieres conocer?","en":"Who do you want to meet?","pt":"Quem você quer conhecer?","fr":"Qui veux-tu rencontrer ?","de":"Wen möchtest du kennenlernen?","it":"Chi vuoi conoscere?","zh":"你想认识谁？","ja":"誰と出会いたいですか？","ko":"누구를 만나고 싶나요?","ru":"С кем хотите познакомиться?","ar":"من تريد أن تقابل؟","id":"Siapa yang ingin kamu temui?","tr":"Kiminle tanışmak istersin?"},
  obAgeDesc: {"es":"El rango de edad que quieres ver.","en":"The age range you want to see.","pt":"A faixa etária que você quer ver.","fr":"La tranche d'âge que tu veux voir.","de":"Der Altersbereich, den du sehen willst.","it":"La fascia d'età che vuoi vedere.","zh":"你想看到的年龄范围。","ja":"表示したい年齢の範囲。","ko":"보고 싶은 나이 범위예요.","ru":"Возрастной диапазон, который хотите видеть.","ar":"الفئة العمرية التي تريد رؤيتها.","id":"Rentang usia yang ingin kamu lihat.","tr":"Görmek istediğin yaş aralığı."},
  obDistanceDesc: {"es":"Qué tan lejos buscar personas.","en":"How far to look for people.","pt":"A que distância procurar pessoas.","fr":"Jusqu'où chercher des personnes.","de":"Wie weit nach Leuten gesucht wird.","it":"Quanto lontano cercare persone.","zh":"搜索他人的距离范围。","ja":"どのくらいの距離で探すか。","ko":"사람을 찾을 거리예요.","ru":"На каком расстоянии искать людей.","ar":"إلى أي مدى تبحث عن أشخاص.","id":"Seberapa jauh mencari orang.","tr":"İnsanları ne kadar uzakta arayacağın."},
  obName: {"es":"¿Cómo te llamas?","en":"What's your name?","pt":"Como você se chama?","fr":"Comment t'appelles-tu ?","de":"Wie heißt du?","it":"Come ti chiami?","zh":"你叫什么名字？","ja":"お名前は？","ko":"이름이 뭐예요?","ru":"Как вас зовут?","ar":"ما اسمك؟","id":"Siapa namamu?","tr":"Adın ne?"},
  obNamePh: {"es":"Tu nombre","en":"Your name","pt":"Seu nome","fr":"Ton nom","de":"Dein Name","it":"Il tuo nome","zh":"你的名字","ja":"あなたの名前","ko":"이름","ru":"Ваше имя","ar":"اسمك","id":"Namamu","tr":"Adın"},
  obBirthday: {"es":"Tu fecha de nacimiento","en":"Your birthday","pt":"Sua data de nascimento","fr":"Ta date de naissance","de":"Dein Geburtsdatum","it":"La tua data di nascita","zh":"你的生日","ja":"生年月日","ko":"생년월일","ru":"Дата рождения","ar":"تاريخ ميلادك","id":"Tanggal lahirmu","tr":"Doğum tarihin"},
  obDay: {"es":"Día","en":"Day","pt":"Dia","fr":"Jour","de":"Tag","it":"Giorno","zh":"日","ja":"日","ko":"일","ru":"День","ar":"يوم","id":"Hari","tr":"Gün"},
  obMonth: {"es":"Mes","en":"Month","pt":"Mês","fr":"Mois","de":"Monat","it":"Mese","zh":"月","ja":"月","ko":"월","ru":"Месяц","ar":"شهر","id":"Bulan","tr":"Ay"},
  obYear: {"es":"Año","en":"Year","pt":"Ano","fr":"Année","de":"Jahr","it":"Anno","zh":"年","ja":"年","ko":"년","ru":"Год","ar":"سنة","id":"Tahun","tr":"Yıl"},
  obGender: {"es":"Tu género","en":"Your gender","pt":"Seu gênero","fr":"Ton genre","de":"Dein Geschlecht","it":"Il tuo genere","zh":"你的性别","ja":"性別","ko":"성별","ru":"Ваш пол","ar":"جنسك","id":"Jenis kelaminmu","tr":"Cinsiyetin"},
  obMale: {"es":"Hombre","en":"Man","pt":"Homem","fr":"Homme","de":"Mann","it":"Uomo","zh":"男","ja":"男性","ko":"남성","ru":"Мужчина","ar":"رجل","id":"Pria","tr":"Erkek"},
  obFemale: {"es":"Mujer","en":"Woman","pt":"Mulher","fr":"Femme","de":"Frau","it":"Donna","zh":"女","ja":"女性","ko":"여성","ru":"Женщина","ar":"امرأة","id":"Wanita","tr":"Kadın"},
  obType: {"es":"Tipo de perfil","en":"Profile type","pt":"Tipo de perfil","fr":"Type de profil","de":"Profiltyp","it":"Tipo di profilo","zh":"资料类型","ja":"プロフィールタイプ","ko":"프로필 유형","ru":"Тип профиля","ar":"نوع الملف","id":"Tipe profil","tr":"Profil türü"},
  obElite: {"es":"💎 Elite","en":"💎 Elite","pt":"💎 Elite","fr":"💎 Elite","de":"💎 Elite","it":"💎 Elite","zh":"💎 Elite","ja":"💎 Elite","ko":"💎 Elite","ru":"💎 Elite","ar":"💎 إيليت","id":"💎 Elite","tr":"💎 Elite"},
  obEliteDesc: {"es":"Ofrezco experiencias y mentoría","en":"I offer experiences and mentorship","pt":"Ofereço experiências e mentoria","fr":"J'offre des expériences et du mentorat","de":"Ich biete Erlebnisse und Mentoring","it":"Offro esperienze e mentorship","zh":"我提供体验与指导","ja":"経験とメンターシップを提供","ko":"경험과 멘토십을 제공","ru":"Предлагаю опыт и наставничество","ar":"أقدّم تجارب وإرشاداً","id":"Saya menawarkan pengalaman & bimbingan","tr":"Deneyim ve mentorluk sunuyorum"},
  obPrime: {"es":"🌟 Prime","en":"🌟 Prime","pt":"🌟 Prime","fr":"🌟 Prime","de":"🌟 Prime","it":"🌟 Prime","zh":"🌟 Prime","ja":"🌟 Prime","ko":"🌟 Prime","ru":"🌟 Prime","ar":"🌟 برايم","id":"🌟 Prime","tr":"🌟 Prime"},
  obPrimeDesc: {"es":"Busco conexiones auténticas","en":"I'm looking for authentic connections","pt":"Busco conexões autênticas","fr":"Je cherche des connexions authentiques","de":"Ich suche echte Verbindungen","it":"Cerco connessioni autentiche","zh":"我在寻找真诚的连接","ja":"本物のつながりを探しています","ko":"진정한 인연을 찾고 있어요","ru":"Ищу настоящие связи","ar":"أبحث عن روابط حقيقية","id":"Mencari koneksi yang tulus","tr":"Gerçek bağlar arıyorum"},
  obOrientation: {"es":"Me interesan","en":"I'm interested in","pt":"Tenho interesse em","fr":"Je m'intéresse à","de":"Ich interessiere mich für","it":"Mi interessano","zh":"我感兴趣的是","ja":"興味があるのは","ko":"관심 대상","ru":"Мне интересны","ar":"يهمّني","id":"Aku tertarik pada","tr":"İlgilendiğim"},
  obMen: {"es":"Hombres","en":"Men","pt":"Homens","fr":"Hommes","de":"Männer","it":"Uomini","zh":"男性","ja":"男性","ko":"남성","ru":"Мужчины","ar":"رجال","id":"Pria","tr":"Erkekler"},
  obWomen: {"es":"Mujeres","en":"Women","pt":"Mulheres","fr":"Femmes","de":"Frauen","it":"Donne","zh":"女性","ja":"女性","ko":"여성","ru":"Женщины","ar":"نساء","id":"Wanita","tr":"Kadınlar"},
  obBoth: {"es":"Todos","en":"Everyone","pt":"Todos","fr":"Tout le monde","de":"Alle","it":"Tutti","zh":"所有人","ja":"すべて","ko":"모두","ru":"Все","ar":"الجميع","id":"Semua","tr":"Herkes"},
  obBio: {"es":"Sobre ti (opcional)","en":"About you (optional)","pt":"Sobre você (opcional)","fr":"À propos de toi (facultatif)","de":"Über dich (optional)","it":"Su di te (facoltativo)","zh":"关于你（可选）","ja":"あなたについて（任意）","ko":"소개 (선택)","ru":"О себе (необязательно)","ar":"عنك (اختياري)","id":"Tentang kamu (opsional)","tr":"Hakkında (isteğe bağlı)"},
  obBioPh: {"es":"Cuéntanos algo de ti…","en":"Tell us about you…","pt":"Conte algo sobre você…","fr":"Parle-nous de toi…","de":"Erzähl uns von dir…","it":"Raccontaci di te…","zh":"介绍一下你自己…","ja":"あなたについて教えて…","ko":"당신에 대해 알려주세요…","ru":"Расскажите о себе…","ar":"أخبرنا عنك…","id":"Ceritakan tentangmu…","tr":"Kendinden bahset…"},
  obNext: {"es":"Continuar","en":"Continue","pt":"Continuar","fr":"Continuer","de":"Weiter","it":"Continua","zh":"继续","ja":"続ける","ko":"계속","ru":"Далее","ar":"متابعة","id":"Lanjut","tr":"Devam"},
  obBack: {"es":"Atrás","en":"Back","pt":"Voltar","fr":"Retour","de":"Zurück","it":"Indietro","zh":"返回","ja":"戻る","ko":"뒤로","ru":"Назад","ar":"رجوع","id":"Kembali","tr":"Geri"},
  obFinish: {"es":"Finalizar","en":"Finish","pt":"Concluir","fr":"Terminer","de":"Fertig","it":"Fine","zh":"完成","ja":"完了","ko":"완료","ru":"Готово","ar":"إنهاء","id":"Selesai","tr":"Bitir"},
  obAge18: {"es":"Debes tener al menos 18 años.","en":"You must be at least 18.","pt":"Você deve ter pelo menos 18 anos.","fr":"Tu dois avoir au moins 18 ans.","de":"Du musst mindestens 18 sein.","it":"Devi avere almeno 18 anni.","zh":"你必须年满 18 岁。","ja":"18歳以上である必要があります。","ko":"만 18세 이상이어야 해요.","ru":"Вам должно быть не менее 18 лет.","ar":"يجب أن يكون عمرك 18 عاماً على الأقل.","id":"Kamu harus berusia minimal 18.","tr":"En az 18 yaşında olmalısın."},
  obRequired: {"es":"Completa este paso para continuar.","en":"Complete this step to continue.","pt":"Conclua este passo para continuar.","fr":"Complète cette étape pour continuer.","de":"Schließe diesen Schritt ab, um fortzufahren.","it":"Completa questo passaggio per continuare.","zh":"完成此步骤以继续。","ja":"続けるにはこのステップを完了してください。","ko":"계속하려면 이 단계를 완료하세요.","ru":"Завершите этот шаг, чтобы продолжить.","ar":"أكمل هذه الخطوة للمتابعة.","id":"Selesaikan langkah ini untuk lanjut.","tr":"Devam etmek için bu adımı tamamla."},
  obLocationTitle: {"es":"Tu ubicación","en":"Your location","pt":"Sua localização","fr":"Ta position","de":"Dein Standort","it":"La tua posizione","zh":"你的位置","ja":"あなたの位置","ko":"내 위치","ru":"Ваше местоположение","ar":"موقعك","id":"Lokasimu","tr":"Konumun"},
  obLocationDesc: {"es":"La usamos para mostrarte personas cerca de ti.","en":"We use it to show you people near you.","pt":"Usamos para mostrar pessoas perto de você.","fr":"On l'utilise pour te montrer des personnes près de toi.","de":"Wir nutzen ihn, um dir Leute in deiner Nähe zu zeigen.","it":"La usiamo per mostrarti persone vicine a te.","zh":"我们用它向你展示附近的人。","ja":"近くの人を表示するために使います。","ko":"근처 사람을 보여주는 데 사용해요.","ru":"Используем, чтобы показывать людей рядом.","ar":"نستخدمه لعرض أشخاص بالقرب منك.","id":"Kami pakai untuk menampilkan orang di dekatmu.","tr":"Yakınındaki kişileri göstermek için kullanırız."},
  obLocationWhy1: {"es":"Encontrar coincidencias cercanas","en":"Find nearby matches","pt":"Encontrar matches por perto","fr":"Trouver des profils à proximité","de":"Matches in der Nähe finden","it":"Trovare match nelle vicinanze","zh":"寻找附近的匹配","ja":"近くのマッチを見つける","ko":"근처 매치 찾기","ru":"Находить пары рядом","ar":"العثور على تطابقات قريبة","id":"Temukan match terdekat","tr":"Yakındaki eşleşmeleri bul"},
  obLocationWhy2: {"es":"Calcular la distancia con precisión","en":"Calculate distance accurately","pt":"Calcular a distância com precisão","fr":"Calculer la distance précisément","de":"Entfernung genau berechnen","it":"Calcolare la distanza con precisione","zh":"精确计算距离","ja":"距離を正確に計算","ko":"거리를 정확히 계산","ru":"Точно рассчитывать расстояние","ar":"حساب المسافة بدقة","id":"Hitung jarak dengan akurat","tr":"Mesafeyi doğru hesapla"},
  obLocationWhyPlaces: {"es":"Sugerir lugares cercanos para tus citas","en":"Suggest nearby spots for your dates","pt":"Sugerir lugares próximos para seus encontros","fr":"Suggérer des lieux proches pour tes rendez-vous","de":"Orte in der Nähe für deine Dates vorschlagen","it":"Suggerire luoghi vicini per i tuoi appuntamenti","zh":"为你的约会推荐附近的地点","ja":"デートに近くのスポットを提案","ko":"데이트하기 좋은 근처 장소 추천","ru":"Предлагать места рядом для свиданий","ar":"اقتراح أماكن قريبة لمواعيدك","id":"Menyarankan tempat terdekat untuk kencanmu","tr":"Buluşmaların için yakın mekanlar öner"},
  obLocationWhy3: {"es":"Nunca mostramos tu ubicación exacta","en":"We never show your exact location","pt":"Nunca mostramos sua localização exata","fr":"On ne montre jamais ta position exacte","de":"Wir zeigen nie deinen genauen Standort","it":"Non mostriamo mai la tua posizione esatta","zh":"我们绝不显示你的确切位置","ja":"正確な位置は決して表示しません","ko":"정확한 위치는 절대 표시하지 않아요","ru":"Мы никогда не показываем точное местоположение","ar":"لا نعرض موقعك الدقيق أبداً","id":"Kami tak pernah menampilkan lokasi pastimu","tr":"Tam konumunu asla göstermeyiz"},
  obLocationBtn: {"es":"Usar mi ubicación","en":"Use my location","pt":"Usar minha localização","fr":"Utiliser ma position","de":"Meinen Standort verwenden","it":"Usa la mia posizione","zh":"使用我的位置","ja":"現在地を使う","ko":"내 위치 사용","ru":"Использовать местоположение","ar":"استخدام موقعي","id":"Gunakan lokasiku","tr":"Konumumu kullan"},
  obLocationOk: {"es":"✓ Ubicación detectada","en":"✓ Location detected","pt":"✓ Localização detectada","fr":"✓ Position détectée","de":"✓ Standort erkannt","it":"✓ Posizione rilevata","zh":"✓ 已检测到位置","ja":"✓ 位置を取得しました","ko":"✓ 위치를 찾았어요","ru":"✓ Местоположение определено","ar":"✓ تم تحديد الموقع","id":"✓ Lokasi terdeteksi","tr":"✓ Konum algılandı"},
  obLocationDenied: {"es":"No se pudo obtener tu ubicación. Puedes continuar y añadirla luego.","en":"Couldn't get your location. You can continue and add it later.","pt":"Não foi possível obter sua localização. Você pode continuar e adicioná-la depois.","fr":"Impossible d'obtenir ta position. Tu peux continuer et l'ajouter plus tard.","de":"Standort konnte nicht ermittelt werden. Du kannst fortfahren und ihn später hinzufügen.","it":"Impossibile ottenere la posizione. Puoi continuare e aggiungerla dopo.","zh":"无法获取你的位置。你可以继续，稍后再添加。","ja":"位置を取得できませんでした。続けて後で追加できます。","ko":"위치를 가져오지 못했어요. 계속하고 나중에 추가할 수 있어요.","ru":"Не удалось определить местоположение. Можно продолжить и добавить позже.","ar":"تعذّر تحديد موقعك. يمكنك المتابعة وإضافته لاحقاً.","id":"Tidak bisa mendapatkan lokasimu. Kamu bisa lanjut dan menambahkannya nanti.","tr":"Konumun alınamadı. Devam edip sonra ekleyebilirsin."},
  obSaveErr: {"es":"No se pudo guardar. Inténtalo de nuevo.","en":"Couldn't save. Please try again.","pt":"Não foi possível salvar. Tente de novo.","fr":"Échec de l'enregistrement. Réessaie.","de":"Speichern fehlgeschlagen. Versuch es erneut.","it":"Salvataggio non riuscito. Riprova.","zh":"保存失败，请重试。","ja":"保存できませんでした。再試行してください。","ko":"저장하지 못했어요. 다시 시도하세요.","ru":"Не удалось сохранить. Повторите.","ar":"تعذّر الحفظ. حاول مجدداً.","id":"Gagal menyimpan. Coba lagi.","tr":"Kaydedilemedi. Tekrar dene."},
  obPhotos: {"es":"Tus fotos","en":"Your photos","pt":"Suas fotos","fr":"Tes photos","de":"Deine Fotos","it":"Le tue foto","zh":"你的照片","ja":"あなたの写真","ko":"사진","ru":"Ваши фото","ar":"صورك","id":"Fotomu","tr":"Fotoğrafların"},
  obPhotoHint: {"es":"Agrega al menos 2 (hasta 6). La 1ª es tu principal.","en":"Add at least 2 (up to 6). The 1st is your main.","pt":"Adicione ao menos 2 (até 6). A 1ª é a principal.","fr":"Ajoute au moins 2 (jusqu'à 6). La 1ʳᵉ est principale.","de":"Mind. 2 (bis 6). Das 1. ist dein Hauptfoto.","it":"Aggiungi almeno 2 (fino a 6). La 1ª è principale.","zh":"至少添加 2 张（最多 6）。第 1 张为主图。","ja":"2枚以上（最大6）。1枚目がメイン。","ko":"최소 2장(최대 6). 첫 번째가 대표.","ru":"Минимум 2 (до 6). Первое — главное.","ar":"أضف صورتين على الأقل (حتى 6). الأولى رئيسية.","id":"Tambah min. 2 (maks 6). Foto ke-1 utama.","tr":"En az 2 (en çok 6). 1.'si ana fotoğraf."},
  obPhotoRejected: {"es":"Esa foto no pasó la revisión de IA. Prueba con otra.","en":"That photo didn't pass the AI review. Try another.","pt":"Essa foto não passou na revisão de IA. Tente outra.","fr":"Cette photo n'a pas passé la vérification IA. Essaie une autre.","de":"Dieses Foto hat die KI-Prüfung nicht bestanden. Versuch ein anderes.","it":"Quella foto non ha superato la verifica IA. Provane un'altra.","zh":"该照片未通过 AI 审核，请换一张。","ja":"その写真はAI審査に通りませんでした。別の写真をお試しください。","ko":"이 사진은 AI 검토를 통과하지 못했어요. 다른 사진을 시도해 보세요.","ru":"Это фото не прошло проверку ИИ. Попробуйте другое.","ar":"لم تجتز هذه الصورة مراجعة الذكاء الاصطناعي. جرّب صورة أخرى.","id":"Foto itu tidak lolos peninjauan AI. Coba yang lain.","tr":"Bu fotoğraf yapay zeka incelemesini geçemedi. Başka birini dene."},
  obStarting: {"es":"Comenzando…","en":"Getting started…","pt":"Começando…","fr":"On démarre…","de":"Geht los…","it":"Si parte…","zh":"正在开始…","ja":"開始中…","ko":"시작하는 중…","ru":"Начинаем…","ar":"جارٍ البدء…","id":"Memulai…","tr":"Başlıyoruz…"},
  obReady: {"es":"¡Todo listo!","en":"All set!","pt":"Tudo pronto!","fr":"C'est prêt !","de":"Alles bereit!","it":"Tutto pronto!","zh":"一切就绪！","ja":"準備完了！","ko":"준비 완료!","ru":"Готово!","ar":"كل شيء جاهز!","id":"Semua siap!","tr":"Her şey hazır!"},
  obUploadingTitle: {"es":"Subiendo foto…","en":"Uploading photo…","pt":"Enviando foto…","fr":"Envoi de la photo…","de":"Foto wird hochgeladen…","it":"Caricamento foto…","zh":"正在上传照片…","ja":"写真をアップロード中…","ko":"사진 업로드 중…","ru":"Загрузка фото…","ar":"جارٍ رفع الصورة…","id":"Mengunggah foto…","tr":"Fotoğraf yükleniyor…"},
  genderClearTitle: {"es":"¿Cambiar tu género?","en":"Change your gender?","pt":"Mudar seu gênero?","fr":"Changer ton genre ?","de":"Geschlecht ändern?","it":"Cambiare il tuo genere?","zh":"更改你的性别？","ja":"性別を変更しますか？","ko":"성별을 변경할까요?","ru":"Изменить пол?","ar":"تغيير جنسك؟","id":"Ubah gender kamu?","tr":"Cinsiyetini değiştir?"},
  genderClearBody: {"es":"Tus fotos se verifican según tu género, así que al cambiarlo se eliminarán. Tendrás que subir fotos nuevas.","en":"Your photos are verified for your gender, so changing it will remove them. You'll need to upload new photos.","pt":"Suas fotos são verificadas conforme seu gênero, então mudá-lo vai removê-las. Você precisará enviar novas fotos.","fr":"Tes photos sont vérifiées selon ton genre, le changer va donc les supprimer. Tu devras en ajouter de nouvelles.","de":"Deine Fotos werden für dein Geschlecht geprüft – eine Änderung entfernt sie. Du musst neue Fotos hochladen.","it":"Le tue foto sono verificate in base al tuo genere, quindi cambiarlo le rimuoverà. Dovrai caricarne di nuove.","zh":"你的照片是按性别审核的，更改性别会删除它们。你需要重新上传照片。","ja":"写真は性別に基づいて審査されるため、変更すると削除されます。新しい写真をアップロードする必要があります。","ko":"사진은 성별에 따라 검증되므로 변경하면 삭제됩니다. 새 사진을 업로드해야 해요.","ru":"Ваши фото проверяются по полу, поэтому при его смене они будут удалены. Нужно будет загрузить новые.","ar":"يتم التحقق من صورك حسب جنسك، لذا تغييره سيحذفها. ستحتاج لرفع صور جديدة.","id":"Foto kamu diverifikasi sesuai gender, jadi mengubahnya akan menghapusnya. Kamu perlu mengunggah foto baru.","tr":"Fotoğrafların cinsiyetine göre doğrulanır, bu yüzden değiştirmek onları kaldırır. Yeni fotoğraf yüklemen gerekir."},
  genderClearConfirm: {"es":"Cambiar y borrar fotos","en":"Change & remove photos","pt":"Mudar e remover fotos","fr":"Changer et supprimer","de":"Ändern & Fotos löschen","it":"Cambia e rimuovi foto","zh":"更改并删除照片","ja":"変更して写真を削除","ko":"변경하고 사진 삭제","ru":"Сменить и удалить фото","ar":"تغيير وحذف الصور","id":"Ubah & hapus foto","tr":"Değiştir ve fotoğrafları sil"},
  obAnalyzing: {"es":"Revisando con IA…","en":"Reviewing with AI…","pt":"Revisando com IA…","fr":"Vérification par l'IA…","de":"KI-Prüfung…","it":"Verifica con IA…","zh":"AI 审核中…","ja":"AIで審査中…","ko":"AI 검토 중…","ru":"Проверка ИИ…","ar":"المراجعة بالذكاء…","id":"Meninjau dengan AI…","tr":"Yapay zeka inceliyor…"},
  obPhotosSelected: {"es":"{n} de 6 fotos","en":"{n} of 6 photos","pt":"{n} de 6 fotos","fr":"{n} sur 6 photos","de":"{n} von 6 Fotos","it":"{n} di 6 foto","zh":"{n}/6 张照片","ja":"6枚中{n}枚","ko":"{n}/6장","ru":"{n} из 6 фото","ar":"{n} من 6 صور","id":"{n} dari 6 foto","tr":"{n} / 6 fotoğraf"},
  obAiSub: {"es":"Verificando que sea apropiada y de buena calidad…","en":"Checking it's appropriate and good quality…","pt":"Verificando se é apropriada e de boa qualidade…","fr":"On vérifie qu'elle est appropriée et de bonne qualité…","de":"Wir prüfen, ob es passend und gut ist…","it":"Verifichiamo che sia appropriata e di buona qualità…","zh":"正在检查照片是否合适且清晰…","ja":"適切で高品質か確認しています…","ko":"적절하고 좋은 품질인지 확인 중이에요…","ru":"Проверяем, что фото подходящее и качественное…","ar":"نتحقق من أنها مناسبة وبجودة جيدة…","id":"Memeriksa apakah pantas dan berkualitas baik…","tr":"Uygun ve kaliteli mi diye kontrol ediyoruz…"},
  obPhotosMin: {"es":"(mínimo {min})","en":"(minimum {min})","pt":"(mínimo {min})","fr":"({min} minimum)","de":"(mindestens {min})","it":"(minimo {min})","zh":"（最少{min}张）","ja":"(最小{min})","ko":"(최소 {min}장)","ru":"(минимум {min})","ar":"(الحد الأدنى {min})","id":"(minimal {min})","tr":"(en az {min})"},
  obAddPhoto: {"es":"＋ Agregar foto","en":"＋ Add photo","pt":"＋ Adicionar foto","fr":"＋ Ajouter une photo","de":"＋ Foto hinzufügen","it":"＋ Aggiungi foto","zh":"＋ 添加照片","ja":"＋ 写真を追加","ko":"＋ 사진 추가","ru":"＋ Добавить фото","ar":"＋ أضف صورة","id":"＋ Tambah foto","tr":"＋ Fotoğraf ekle"},
  obPhotoErr: {"es":"No se pudo subir la foto. Inténtalo de nuevo.","en":"Couldn't upload the photo. Try again.","pt":"Não foi possível enviar a foto. Tente de novo.","fr":"Échec de l'envoi de la photo. Réessaie.","de":"Foto-Upload fehlgeschlagen. Versuch es erneut.","it":"Caricamento foto non riuscito. Riprova.","zh":"照片上传失败，请重试。","ja":"写真をアップロードできませんでした。","ko":"사진 업로드 실패. 다시 시도.","ru":"Не удалось загрузить фото. Повторите.","ar":"تعذّر رفع الصورة. حاول مجدداً.","id":"Gagal mengunggah foto. Coba lagi.","tr":"Fotoğraf yüklenemedi. Tekrar dene."},
  editInApp: {"es":"Editar perfil en la app","en":"Edit profile in the app","pt":"Editar perfil no app","fr":"Modifier le profil dans l'app","de":"Profil in der App bearbeiten","it":"Modifica profilo nell'app","zh":"在 App 中编辑资料","ja":"アプリでプロフィール編集","ko":"앱에서 프로필 편집","ru":"Изменить профиль в приложении","ar":"عدّل الملف في التطبيق","id":"Edit profil di aplikasi","tr":"Profili uygulamada düzenle"},
  // ── Profile tab (homologado con iOS ProfileView) ──
  completeProfile: {"es":"Completar perfil","en":"Complete profile","pt":"Perfil completo","fr":"Profil complet","de":"Vollständiges Profil","it":"Completa il profilo","zh":"完善资料","ja":"完全なプロフィール","ko":"프로필 완성","ru":"Полный профиль","ar":"الملف الشخصي الكامل","id":"Profil lengkap","tr":"Profili tamamla"},
  dailyLikes: {"es":"Likes Diarios","en":"Daily Likes","pt":"Curtidas Diárias","fr":"J'aime Quotidiens","de":"Tägliche Likes","it":"Mi piace giornalieri","zh":"每日喜欢","ja":"デイリーライク","ko":"일일 좋아요","ru":"Ежедневные лайки","ar":"الإعجابات اليومية","id":"Suka Harian","tr":"Günlük Beğeniler"},
  likesRemainingToday: {"es":"restantes hoy","en":"remaining today","pt":"restantes hoje","fr":"restants aujourd'hui","de":"heute übrig","it":"rimasti oggi","zh":"今日剩余","ja":"今日の残り","ko":"오늘 남은 횟수","ru":"осталось сегодня","ar":"المتبقي اليوم","id":"tersisa hari ini","tr":"bugün kalan"},
  coachQuestions: {"es":"Coach IA","en":"AI Coach","pt":"Coach IA","fr":"Coach IA","de":"KI-Coach","it":"Coach IA","zh":"AI教练","ja":"AIコーチ","ko":"AI 코치","ru":"ИИ Коуч","ar":"مدرب الذكاء","id":"Coach AI","tr":"AI Koç"},
  coachQuestionsRemaining: {"es":"restantes hoy","en":"remaining today","pt":"restantes hoje","fr":"restants aujourd'hui","de":"heute übrig","it":"rimasti oggi","zh":"今日剩余","ja":"今日の残り","ko":"오늘 남은 횟수","ru":"осталось сегодня","ar":"المتبقي اليوم","id":"tersisa hari ini","tr":"bugün kalan"},
  like: {"es":"Me gusta","en":"Like","pt":"Curtir","fr":"J'aime","de":"Gefällt mir","it":"Mi piace","zh":"喜欢","ja":"いいね","ko":"좋아요","ru":"Нравится","ar":"إعجاب","id":"Suka","tr":"Beğen"},
  typeElite: {"es":"Elite","en":"Elite","pt":"Elite","fr":"Elite","de":"Elite","it":"Elite","zh":"Elite","ja":"Elite","ko":"Elite","ru":"Elite","ar":"إيليت","id":"Elite","tr":"Elite"},
  typePrime: {"es":"Prime","en":"Prime","pt":"Prime","fr":"Prime","de":"Prime","it":"Prime","zh":"Prime","ja":"Prime","ko":"Prime","ru":"Prime","ar":"برايم","id":"Prime","tr":"Prime"},
  // ── Edit profile (in-web, iOS EditProfileView parity) ──
  epEdit: {"es":"Editar perfil","en":"Edit profile","pt":"Editar perfil","fr":"Modifier le profil","de":"Profil bearbeiten","it":"Modifica profilo","zh":"编辑资料","ja":"プロフィール編集","ko":"프로필 편집","ru":"Изменить профиль","ar":"تعديل الملف","id":"Edit profil","tr":"Profili düzenle"},
  epAbout: {"es":"Sobre ti","en":"About you","pt":"Sobre você","fr":"À propos de toi","de":"Über dich","it":"Su di te","zh":"关于你","ja":"あなたについて","ko":"자기소개","ru":"О себе","ar":"نبذة عنك","id":"Tentang kamu","tr":"Hakkında"},
  epInterests: {"es":"Intereses","en":"Interests","pt":"Interesses","fr":"Centres d'intérêt","de":"Interessen","it":"Interessi","zh":"兴趣","ja":"興味","ko":"관심사","ru":"Интересы","ar":"الاهتمامات","id":"Minat","tr":"İlgi alanları"},
  epAddInterest: {"es":"Añadir interés","en":"Add interest","pt":"Adicionar interesse","fr":"Ajouter un intérêt","de":"Interesse hinzufügen","it":"Aggiungi interesse","zh":"添加兴趣","ja":"興味を追加","ko":"관심사 추가","ru":"Добавить интерес","ar":"أضف اهتماماً","id":"Tambah minat","tr":"İlgi ekle"},
  epAgeRange: {"es":"Rango de edad","en":"Age range","pt":"Faixa etária","fr":"Tranche d'âge","de":"Altersbereich","it":"Fascia d'età","zh":"年龄范围","ja":"年齢の範囲","ko":"나이 범위","ru":"Возрастной диапазон","ar":"الفئة العمرية","id":"Rentang usia","tr":"Yaş aralığı"},
  epMinAge: {"es":"Edad mínima","en":"Minimum age","pt":"Idade mínima","fr":"Âge minimum","de":"Mindestalter","it":"Età minima","zh":"最小年龄","ja":"最小年齢","ko":"최소 나이","ru":"Мин. возраст","ar":"أدنى عمر","id":"Usia minimum","tr":"En düşük yaş"},
  epMaxAge: {"es":"Edad máxima","en":"Maximum age","pt":"Idade máxima","fr":"Âge maximum","de":"Höchstalter","it":"Età massima","zh":"最大年龄","ja":"最大年齢","ko":"최대 나이","ru":"Макс. возраст","ar":"أقصى عمر","id":"Usia maksimum","tr":"En yüksek yaş"},
  epDistance: {"es":"Distancia máxima","en":"Maximum distance","pt":"Distância máxima","fr":"Distance maximale","de":"Maximale Entfernung","it":"Distanza massima","zh":"最大距离","ja":"最大距離","ko":"최대 거리","ru":"Макс. расстояние","ar":"أقصى مسافة","id":"Jarak maksimum","tr":"En fazla mesafe"},
  epSave: {"es":"Guardar","en":"Save","pt":"Salvar","fr":"Enregistrer","de":"Speichern","it":"Salva","zh":"保存","ja":"保存","ko":"저장","ru":"Сохранить","ar":"حفظ","id":"Simpan","tr":"Kaydet"},
  epCancel: {"es":"Cancelar","en":"Cancel","pt":"Cancelar","fr":"Annuler","de":"Abbrechen","it":"Annulla","zh":"取消","ja":"キャンセル","ko":"취소","ru":"Отмена","ar":"إلغاء","id":"Batal","tr":"İptal"},
  epDone: {"es":"Listo","en":"Done","pt":"Concluído","fr":"Terminé","de":"Fertig","it":"Fatto","zh":"完成","ja":"完了","ko":"완료","ru":"Готово","ar":"تم","id":"Selesai","tr":"Bitti"},
  epAiSuggest: {"es":"Sugerencias IA","en":"AI suggestions","pt":"Sugestões IA","fr":"Suggestions IA","de":"KI-Vorschläge","it":"Suggerimenti IA","zh":"AI 建议","ja":"AI 提案","ko":"AI 제안","ru":"ИИ-подсказки","ar":"اقتراحات الذكاء","id":"Saran AI","tr":"AI önerileri"},
  epTapSuggestion: {"es":"Toca una para usarla","en":"Tap one to use it","pt":"Toque para usar","fr":"Touche pour l'utiliser","de":"Zum Übernehmen tippen","it":"Tocca per usarla","zh":"点击使用","ja":"タップして使用","ko":"탭하여 사용","ru":"Нажмите, чтобы применить","ar":"اضغط للاستخدام","id":"Ketuk untuk pakai","tr":"Kullanmak için dokun"},
  epPhotoCoach: {"es":"Coach IA de Fotos","en":"AI Photo Coach","pt":"Coach IA de Fotos","fr":"Coach Photo IA","de":"KI-Foto-Coach","it":"Coach Foto IA","zh":"AI 照片教练","ja":"AI フォトコーチ","ko":"AI 사진 코치","ru":"ИИ фото-коуч","ar":"مدرب الصور","id":"Pelatih Foto AI","tr":"AI Foto Koçu"},
  epPhotoScore: {"es":"Puntaje del perfil","en":"Profile score","pt":"Pontuação do perfil","fr":"Score du profil","de":"Profil-Score","it":"Punteggio profilo","zh":"资料评分","ja":"プロフィールスコア","ko":"프로필 점수","ru":"Оценка профиля","ar":"تقييم الملف","id":"Skor profil","tr":"Profil puanı"},
  epAnalyzing: {"es":"Analizando…","en":"Analyzing…","pt":"Analisando…","fr":"Analyse…","de":"Analysiere…","it":"Analisi…","zh":"分析中…","ja":"分析中…","ko":"분석 중…","ru":"Анализ…","ar":"جارٍ التحليل…","id":"Menganalisis…","tr":"Analiz ediliyor…"},
  epAnalyzingSub: {"es":"Analizando tus fotos con IA, dame unos segundos…","en":"Analyzing your photos with AI, just a few seconds…","pt":"Analisando suas fotos com IA, alguns segundos…","fr":"Analyse de tes photos par l'IA, quelques secondes…","de":"Deine Fotos werden per KI analysiert, einen Moment…","it":"Analisi delle tue foto con l'IA, qualche secondo…","zh":"AI 正在分析你的照片，请稍候…","ja":"AIが写真を分析中です。少々お待ちください…","ko":"AI가 사진을 분석 중이에요. 잠시만요…","ru":"ИИ анализирует ваши фото, несколько секунд…","ar":"يحلّل الذكاء صورك، بضع ثوانٍ…","id":"AI menganalisis fotomu, beberapa detik…","tr":"Yapay zeka fotoğraflarını analiz ediyor, birkaç saniye…"},
  epGenerating: {"es":"Generando…","en":"Generating…","pt":"Gerando…","fr":"Génération…","de":"Erstelle…","it":"Generazione…","zh":"生成中…","ja":"生成中…","ko":"생성 중…","ru":"Генерация…","ar":"جارٍ الإنشاء…","id":"Membuat…","tr":"Oluşturuluyor…"},
  epCoachError: {"es":"No se pudo analizar ahora. Inténtalo de nuevo en un momento.","en":"Couldn't analyze right now. Try again in a moment.","pt":"Não foi possível analisar agora. Tente de novo em instantes.","fr":"Analyse impossible pour le moment. Réessaie bientôt.","de":"Analyse momentan nicht möglich. Versuch es gleich erneut.","it":"Analisi non riuscita ora. Riprova tra poco.","zh":"暂时无法分析，请稍后再试。","ja":"今は分析できませんでした。少し後でもう一度お試しください。","ko":"지금은 분석할 수 없어요. 잠시 후 다시 시도하세요.","ru":"Сейчас не удалось проанализировать. Повторите чуть позже.","ar":"تعذّر التحليل الآن. حاول مجدداً بعد قليل.","id":"Tidak bisa menganalisis sekarang. Coba lagi sebentar.","tr":"Şu anda analiz edilemedi. Birazdan tekrar dene."},
  epLoadingProfile: {"es":"Cargando tu perfil…","en":"Loading your profile…","pt":"Carregando seu perfil…","fr":"Chargement de ton profil…","de":"Dein Profil wird geladen…","it":"Caricamento del tuo profilo…","zh":"正在加载你的资料…","ja":"プロフィールを読み込み中…","ko":"프로필을 불러오는 중…","ru":"Загружаем ваш профиль…","ar":"جارٍ تحميل ملفك…","id":"Memuat profilmu…","tr":"Profilin yükleniyor…"},
  epLocation: {"es":"Ubicación","en":"Location","pt":"Localização","fr":"Localisation","de":"Standort","it":"Posizione","zh":"位置","ja":"位置","ko":"위치","ru":"Местоположение","ar":"الموقع","id":"Lokasi","tr":"Konum"},
  epUpdateLocation: {"es":"Actualizar ubicación","en":"Update location","pt":"Atualizar localização","fr":"Mettre à jour la position","de":"Standort aktualisieren","it":"Aggiorna posizione","zh":"更新位置","ja":"位置を更新","ko":"위치 업데이트","ru":"Обновить местоположение","ar":"تحديث الموقع","id":"Perbarui lokasi","tr":"Konumu güncelle"},
  epLocDone: {"es":"Ubicación actualizada","en":"Location updated","pt":"Localização atualizada","fr":"Position mise à jour","de":"Standort aktualisiert","it":"Posizione aggiornata","zh":"位置已更新","ja":"位置を更新しました","ko":"위치가 업데이트됨","ru":"Местоположение обновлено","ar":"تم تحديث الموقع","id":"Lokasi diperbarui","tr":"Konum güncellendi"},
  epLocError: {"es":"No se pudo obtener la ubicación","en":"Couldn't get your location","pt":"Não foi possível obter a localização","fr":"Impossible d'obtenir la position","de":"Standort konnte nicht ermittelt werden","it":"Impossibile ottenere la posizione","zh":"无法获取位置","ja":"位置を取得できませんでした","ko":"위치를 가져올 수 없습니다","ru":"Не удалось определить местоположение","ar":"تعذّر تحديد الموقع","id":"Tidak bisa mendapatkan lokasi","tr":"Konum alınamadı"},
};

// Curated interest catalog — IDENTICAL ids + categories to iOS UserInterest.swift (interest_*), so
// interests are cross-platform consistent + localized. t: applicableUserTypes; cat: InterestCategory.
const INTEREST_CATALOG: Array<{ id: string; t: 'prime' | 'elite' | 'both'; cat: string; es: string; en: string }> = [
  { id: 'interest_travel_adventures', t: 'prime', cat: 'lifestyle', es: 'Viajes y Aventuras ✈️', en: 'Travel & Adventures ✈️' },
  { id: 'interest_shopping_fashion', t: 'prime', cat: 'lifestyle', es: 'Compras y Moda 🛍️', en: 'Shopping & Fashion 🛍️' },
  { id: 'interest_luxury_experiences', t: 'elite', cat: 'lifestyle', es: 'Experiencias Únicas 💎', en: 'Unique Experiences 💎' },
  { id: 'interest_international_travel', t: 'elite', cat: 'lifestyle', es: 'Viajes Internacionales 🌍', en: 'International Travel 🌍' },
  { id: 'interest_beach_vacation', t: 'prime', cat: 'lifestyle', es: 'Vacaciones en la Playa 🏖️', en: 'Beach Vacation 🏖️' },
  { id: 'interest_fine_dining', t: 'prime', cat: 'gastronomy', es: 'Alta Gastronomía 🍷', en: 'Fine Dining 🍷' },
  { id: 'interest_gourmet_cuisine', t: 'elite', cat: 'gastronomy', es: 'Cocina Gourmet 🍽️', en: 'Gourmet Cuisine 🍽️' },
  { id: 'interest_wine_spirits', t: 'elite', cat: 'gastronomy', es: 'Vinos y Licores 🥃', en: 'Wine & Spirits 🥃' },
  { id: 'interest_cooking', t: 'both', cat: 'gastronomy', es: 'Cocina 👨‍🍳', en: 'Cooking 👨‍🍳' },
  { id: 'interest_art_culture', t: 'prime', cat: 'culture', es: 'Arte y Cultura 🎭', en: 'Art & Culture 🎭' },
  { id: 'interest_art_collecting', t: 'elite', cat: 'culture', es: 'Arte y Coleccionismo 🎨', en: 'Art & Collecting 🎨' },
  { id: 'interest_books_reading', t: 'both', cat: 'culture', es: 'Libros y Lectura 📚', en: 'Books & Reading 📚' },
  { id: 'interest_fitness_wellness', t: 'prime', cat: 'wellness', es: 'Fitness y Bienestar 💪', en: 'Fitness & Wellness 💪' },
  { id: 'interest_spa_relaxation', t: 'prime', cat: 'wellness', es: 'Spa y Relajación 🧖‍♀️', en: 'Spa & Relaxation 🧖‍♀️' },
  { id: 'interest_yoga_meditation', t: 'both', cat: 'wellness', es: 'Yoga y Meditación 🧘', en: 'Yoga & Meditation 🧘' },
  { id: 'interest_education_growth', t: 'prime', cat: 'personal_growth', es: 'Educación y Crecimiento 📖', en: 'Education & Growth 📖' },
  { id: 'interest_exclusive_events', t: 'prime', cat: 'social', es: 'Eventos Exclusivos ✨', en: 'Exclusive Events ✨' },
  { id: 'interest_dancing_nightlife', t: 'prime', cat: 'social', es: 'Baile y Vida Nocturna 💃', en: 'Dancing & Nightlife 💃' },
  { id: 'interest_vip_events', t: 'elite', cat: 'social', es: 'Eventos VIP 🎉', en: 'VIP Events 🎉' },
  { id: 'interest_vip_clubs', t: 'elite', cat: 'social', es: 'Clubes VIP 🥂', en: 'VIP Clubs 🥂' },
  { id: 'interest_philanthropy', t: 'elite', cat: 'social', es: 'Filantropía ❤️', en: 'Philanthropy ❤️' },
  { id: 'interest_music_concerts', t: 'prime', cat: 'entertainment', es: 'Música y Conciertos 🎵', en: 'Music & Concerts 🎵' },
  { id: 'interest_movies_theater', t: 'both', cat: 'entertainment', es: 'Cine y Teatro 🎬', en: 'Movies & Theater 🎬' },
  { id: 'interest_mentorship_business', t: 'elite', cat: 'professional', es: 'Mentoría y Negocios 💼', en: 'Mentorship & Business 💼' },
  { id: 'interest_business_networking', t: 'elite', cat: 'professional', es: 'Networking de Negocios 🤝', en: 'Business Networking 🤝' },
  { id: 'interest_real_estate_investments', t: 'elite', cat: 'professional', es: 'Bienes Raíces e Inversiones 🏢', en: 'Real Estate & Investments 🏢' },
  { id: 'interest_golf_premium_sports', t: 'elite', cat: 'sports', es: 'Golf y Deportes Premium ⛳', en: 'Golf & Premium Sports ⛳' },
  { id: 'interest_sailing_yachting', t: 'elite', cat: 'sports', es: 'Navegación y Yates ⛵', en: 'Sailing & Yachting ⛵' },
  { id: 'interest_nature_outdoors', t: 'both', cat: 'sports', es: 'Naturaleza y Aire Libre 🌿', en: 'Nature & Outdoors 🌿' },
  { id: 'interest_photography', t: 'both', cat: 'hobbies', es: 'Fotografía 📸', en: 'Photography 📸' },
];

// Category order + labels (iOS InterestCategory). Grouping homologated with EnhancedInterestsSelectionSheet.
const INTEREST_CATEGORIES: Array<{ key: string; es: string; en: string }> = [
  { key: 'lifestyle', es: 'Estilo de Vida ✨', en: 'Lifestyle ✨' },
  { key: 'gastronomy', es: 'Gastronomía 🍽️', en: 'Gastronomy 🍽️' },
  { key: 'culture', es: 'Cultura 🎨', en: 'Culture 🎨' },
  { key: 'wellness', es: 'Bienestar 💆', en: 'Wellness 💆' },
  { key: 'personal_growth', es: 'Crecimiento Personal 🧠', en: 'Personal Growth 🧠' },
  { key: 'social', es: 'Social 👥', en: 'Social 👥' },
  { key: 'entertainment', es: 'Entretenimiento 🎬', en: 'Entertainment 🎬' },
  { key: 'professional', es: 'Profesional 💼', en: 'Professional 💼' },
  { key: 'sports', es: 'Deportes ⚽', en: 'Sports ⚽' },
  { key: 'hobbies', es: 'Pasatiempos 🎯', en: 'Hobbies 🎯' },
];

// Static bio examples — fallback when getBioCoaching is unavailable (parity with iOS staticBioFallback).
const BIO_FALLBACK: Record<string, string[]> = {
  es: [
    'Amante de los buenos cafés, los viajes espontáneos y las conversaciones que valen la pena. Busco algo auténtico.',
    'Curioso por naturaleza: gastronomía, música en vivo y planes al aire libre. Si te ríes fácil, encajamos.',
    'Equilibrio entre ambición y calma. Me encanta descubrir lugares nuevos y compartir experiencias memorables.',
  ],
  en: [
    'Lover of good coffee, spontaneous trips and conversations that matter. Looking for something genuine.',
    'Curious by nature: food, live music and outdoor plans. If you laugh easily, we\'ll get along.',
    'A balance of ambition and calm. I love discovering new places and sharing memorable experiences.',
  ],
};

const STORE_IOS = 'https://apps.apple.com/app/id6470783901';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CoachWidgetComponent, ShellNavIconComponent, UiButtonComponent, UiOptionComponent, UiInputComponent],
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
  readonly discoError = signal(false);
  readonly chatError = signal('');
  readonly discoLocStatus = signal<'idle' | 'loading' | 'denied'>('idle');
  /** Discovery needs a location to rank nearby people. True once the profile has lat/lng. */
  hasLocation(): boolean { const p: any = this.firebase.userProfile(); return typeof p?.latitude === 'number' && typeof p?.longitude === 'number'; }
  async enableDiscoveryLocation() {
    if (this.discoLocStatus() === 'loading') return;
    this.discoLocStatus.set('loading');
    const geo = await this.getGeo();
    if (!geo) { this.discoLocStatus.set('denied'); this.track('location_denied'); return; }
    try {
      await this.firebase.updateLocation(geo.lat, geo.lng);
      this.track('location_enabled');
      this.discoLocStatus.set('idle');
      this.discoLoaded.set(false);
      await this.loadDiscovery();
    } catch { this.discoLocStatus.set('denied'); }
  }
  readonly photoIdx = signal(0);
  readonly swiping = signal<'like' | 'pass' | null>(null);
  // Drag-to-swipe (replicates the native Tinder feel: card follows finger, rotates, springs back
  // under 1/3-width threshold, flies out on release past it — tween ~400ms).
  readonly dragX = signal(0);
  readonly dragY = signal(0);
  readonly dragging = signal(false);
  private dragStartX = 0;
  private dragStartY = 0;
  private readonly SWIPE_THRESHOLD = 110;
  // Chat state
  readonly matches = signal<any[]>([]);
  readonly matchNames = signal<Record<string, string>>({});
  readonly selectedMatch = signal<any | null>(null);
  // iOS pagination parity: a live TAIL listener (latest page) + cursor-fetched OLDER pages, merged.
  readonly chatTail = signal<any[]>([]);
  readonly chatOlder = signal<any[]>([]);
  readonly chatMsgs = computed(() => {
    const map = new Map<string, any>();
    for (const m of [...this.chatOlder(), ...this.chatTail()]) map.set(m.id, m);
    return [...map.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  });
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
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    // iOS/Android parity: a signed-in user WITHOUT a profile is gated into onboarding on every entry
    // (not once). Force the onboarding view whenever the checked profile is incomplete.
    effect(() => { if (this.needsOnboarding() && this.section() !== 'profile') this.section.set('profile'); });
    // iOS parity: an onboarded user who already granted geolocation gets their location refreshed
    // silently on entry — keeps nearby-people + nearby-place suggestions accurate without re-asking.
    effect(() => {
      if (this.firebase.profileChecked() && !!this.firebase.currentUser() && !this.needsOnboarding()) {
        this.refreshLocationIfPermitted();
      }
    });
  }

  private autoLocDone = false;
  /** Silently refresh the stored location IF the browser already granted permission (no prompt). */
  private async refreshLocationIfPermitted() {
    if (this.autoLocDone || !this.isBrowser) return;
    this.autoLocDone = true;
    try {
      const perm: any = (navigator as any).permissions ? await (navigator as any).permissions.query({ name: 'geolocation' }) : null;
      if (perm && perm.state !== 'granted') return; // never prompt here — only refresh when already allowed
      const geo = await this.getGeo();
      if (geo) await this.firebase.updateLocation(geo.lat, geo.lng);
    } catch { /* best-effort: location stays as last saved */ }
  }

  /** Signed in + profile loaded + incomplete → must complete onboarding before using the app. */
  needsOnboarding(): boolean {
    return !!this.firebase.currentUser() && this.firebase.profileChecked() && !this.firebase.isProfileComplete();
  }

  lang(): Language { return this.translate.currentLanguage(); }
  s(key: string): string { const m = SHELL_I18N[key]; return (m && (m[this.lang()] || m['en'])) || key; }
  /** Firebase Analytics (GA4) — logs for ALL visitors, logged-in or anonymous (GA4 client_id).
   *  Tagged auth state + platform=web so the web app is comparable to iOS/Android in Firebase. */
  private track(event: string, params: Record<string, unknown> = {}) {
    try { this.firebase.logEvent(event, { ...params, platform: 'web', surface: 'app', authed: !!this.firebase.currentUser() }); } catch { /* analytics best-effort */ }
  }
  go(sec: Section) {
    if (this.needsOnboarding()) { this.section.set('profile'); return; }  // can't leave onboarding until complete
    this.section.set(sec);
    this.track('screen_view', { firebase_screen: sec, screen_name: sec });
    if (sec === 'discovery' && !this.discoLoaded() && this.firebase.currentUser() && this.hasLocation()) this.loadDiscovery();
    if (sec === 'chats' && !this.unsubMatches && this.firebase.currentUser()) this.subscribeMatches();
    if (sec === 'profile' && this.profileComplete()) {
      if (!this.profilePhotos().length) this.loadProfilePhotos();
      if (!this.limitsLoaded()) this.loadProfileLimits();
    }
  }
  // Profile-tab limits (X / Y) — homologado con iOS ProfileView (daily likes + coach credits).
  readonly dailyLikesLimit = signal(100);
  readonly coachDailyCredits = signal(4);
  readonly limitsLoaded = signal(false);
  private async loadProfileLimits() {
    try {
      const l = await this.firebase.getProfileLimits();
      this.dailyLikesLimit.set(l.dailyLikesLimit);
      this.coachDailyCredits.set(l.coachDailyCredits);
    } catch { /* keep defaults */ }
    finally { this.limitsLoaded.set(true); }
  }
  dailyLikesRemaining(): number {
    const v = (this.firebase.userProfile() as any)?.dailyLikesRemaining;
    return typeof v === 'number' ? v : this.dailyLikesLimit();
  }
  coachMessagesRemaining(): number {
    const v = (this.firebase.userProfile() as any)?.coachMessagesRemaining;
    return typeof v === 'number' ? v : this.coachDailyCredits();
  }
  readonly profilePhotos = signal<string[]>([]);
  readonly photosLoading = signal(false);
  readonly pfAvatarLoaded = signal(false);   // skeleton on the profile avatar until the image paints
  private async loadProfilePhotos() {
    const p: any = this.firebase.userProfile();
    const names = Array.isArray(p?.pictures) ? p.pictures : (Array.isArray(p?.pictureNames) ? p.pictureNames : []);
    if (!names.length) return;
    this.photosLoading.set(true);
    this.pfAvatarLoaded.set(false);
    try { this.profilePhotos.set(await this.firebase.getOwnPhotoUrls(names)); } catch { /* keep avatar fallback */ }
    finally { this.photosLoading.set(false); }
  }
  initial(u: { displayName?: string | null; email?: string | null } | null): string {
    const n = (u?.displayName || u?.email || '?').trim();
    return (n.charAt(0) || '?').toUpperCase();
  }
  async signOut() {
    this.showConfirm.set(false);
    try { await this.firebase.signOutUser(); } catch { /* noop */ }
    // Hard redirect to the landing (blacksugar21.com/) so no signed-in SPA state lingers.
    if (this.isBrowser) window.location.assign('/'); else this.router.navigate(['/']);
  }

  // ── Discovery ──────────────────────────────────────────────────────────────
  async loadDiscovery() {
    if (this.discoLoading()) return;
    this.discoLoading.set(true);
    this.discoError.set(false);
    try {
      const profiles = await this.firebase.getDiscoveryFeed(20);
      this.discoProfiles.set(Array.isArray(profiles) ? profiles : []);
      this.discoIdx.set(0);
      this.photoIdx.set(0);
      this.discoLoaded.set(true);
    } catch { this.discoProfiles.set([]); this.discoLoaded.set(true); this.discoError.set(true); }  // distinguish error from empty (iOS parity)
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
  private advance() { this.photoIdx.set(0); this.dragX.set(0); this.dragY.set(0); this.swiping.set(null); this.discoIdx.update((v) => v + 1); }

  // iOS-exact vertical pager (TikTok-style): swipe UP advances to the next profile (a pass if you
  // didn't like it); the ♥ button likes + advances; you CANNOT go back (drag-down springs back).
  onCardDown(e: PointerEvent) {
    if (!this.currentProfile() || this.swiping()) return;
    this.dragging.set(true);
    this.dragStartY = e.clientY;
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  onCardMove(e: PointerEvent) {
    if (!this.dragging()) return;
    const dy = e.clientY - this.dragStartY;
    this.dragY.set(dy < 0 ? dy : dy * 0.18); // up follows; down resists (no going back)
  }
  onCardUp() {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (this.dragY() < -this.SWIPE_THRESHOLD) this.swipe('pass'); // swiped up enough → pass + advance
    else this.dragY.set(0); // springs back (CSS transition)
  }
  /** Like / pass → record then scroll the card up and bring in the next (≈400ms, like the native transition). */
  swipe(action: 'like' | 'pass' | 'superlike') {
    const p = this.currentProfile();
    if (!p || this.swiping()) return;
    this.swiping.set(action === 'pass' ? 'pass' : 'like');
    this.dragY.set(-1100); // fly up out of view
    this.track('discovery_swipe', { action });
    this.firebase.recordSwipe(p.userId, action).then((matchId) => { if (matchId) this.track('new_match'); }).catch(() => { /* best-effort */ });
    setTimeout(() => this.advance(), 400);
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
  private static readonly CHAT_PAGE = 30; // iOS messagesPageSize
  readonly chatHasMore = signal(false);
  readonly chatLoadingOlder = signal(false);
  openChat(match: any) {
    this.selectedMatch.set(match);
    this.chatTail.set([]);
    this.chatOlder.set([]);
    this.chatHasMore.set(false);
    this.chatError.set('');
    // iOS ChatView parity: mark read + set this as the active chat (suppresses the recipient's push).
    this.firebase.markMatchRead(match.id);
    this.firebase.setActiveChat(match.id);
    // Live TAIL listener: the latest page only (older pages are cursor-fetched on demand).
    if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; }
    this.unsubMsgs = this.firebase.listenMessages(match.id, AppShellComponent.CHAT_PAGE, (msgs, more) => {
      this.chatTail.set(msgs);
      if (this.chatOlder().length === 0) this.chatHasMore.set(more);  // more older than the first page?
      const last = msgs[msgs.length - 1];
      if (last && last.senderId && last.senderId !== this.myUid()) this.firebase.markMatchRead(match.id);
    });
  }
  /** Load older messages via timestamp cursor + prepend (iOS loadOlderMessages parity). */
  async loadOlderChat() {
    const m = this.selectedMatch(); if (!m || this.chatLoadingOlder()) return;
    const oldest = this.chatMsgs()[0];
    if (!oldest?.ts) return;
    this.chatLoadingOlder.set(true);
    try {
      const older = await this.firebase.loadOlderMessages(m.id, oldest.ts, AppShellComponent.CHAT_PAGE);
      if (older.length) this.chatOlder.update((cur) => [...older, ...cur]);
      this.chatHasMore.set(older.length >= AppShellComponent.CHAT_PAGE);
    } catch { /* keep what we have */ }
    finally { this.chatLoadingOlder.set(false); }
  }
  // ── Rich message cards (place / event / blueprint) — render iOS-sent message types ──
  placeCategory(p: any): string { return (p?.category || '📍').toString(); }
  backToList() {
    this.selectedMatch.set(null);
    if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; }
    this.firebase.setActiveChat(null);  // no longer viewing → push resumes
  }
  /** Unread = the last message is from the other user and newer than my lastSeen (iOS unread parity). */
  isUnread(m: any): boolean {
    if (!m || !m.lastMessageSenderId || m.lastMessageSenderId === this.myUid()) return false;
    const lastMs = m.lastMessageTimestamp?.toMillis?.() || m.lastMessageTime || 0;
    const seenMs = m.lastSeenTimestamps?.[this.myUid()]?.toMillis?.() || 0;
    return lastMs > seenMs;
  }
  myUid(): string { return this.firebase.currentUser()?.uid || ''; }
  /** WhatsApp-style per-bubble time (parity with iOS ContentMessageView). */
  fmtTime(ms: number): string {
    if (!ms) return '';
    try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  }
  // Discovery card userType badge (Elite / Prime) — parity with iOS SwipeView capsule.
  discoTypeLabel(p: any): string {
    const t = p?.userType;
    if (t === 'SUGAR_BABY') return this.s('typePrime');
    if (t === 'SUGAR_DADDY' || t === 'SUGAR_MOMMY') return this.s('typeElite');
    return '';
  }
  discoIsElite(p: any): boolean { const t = p?.userType; return t === 'SUGAR_DADDY' || t === 'SUGAR_MOMMY'; }
  async sendChat() {
    const m = this.selectedMatch();
    const t = this.chatText.trim();
    if (!m || !t) return;
    this.chatText = '';
    this.chatError.set('');
    // Surface send failures (e.g. first-message gate) instead of silently restoring — iOS parity.
    try { await this.firebase.sendMessage(m.id, t); this.track('message_sent'); } catch { this.chatText = t; this.chatError.set(this.s('chatSendErr')); }
  }

  // ── Profile + onboarding ─────────────────────────────────────────────────────
  profileComplete(): boolean { return this.firebase.isProfileComplete(); }
  profileAge(): number | null {
    const p: any = this.firebase.userProfile();
    const ms = p?.birthDate?.toMillis?.();
    if (!ms) return null;
    return Math.floor((Date.now() - ms) / (365.25 * 86400000));
  }
  profileInterests(): string[] { const p: any = this.firebase.userProfile(); return Array.isArray(p?.interests) ? p.interests : []; }

  // ── Edit profile (in-web, iOS EditProfileView parity) ───────────────────────
  readonly epEditing = signal(false);
  readonly epSaving = signal(false);
  // iOS/Android parity (confirmGenderChange): switching gender invalidates the AI-moderated photos.
  readonly epGenderConfirm = signal(false);
  private epPendingMale: boolean | null = null;
  epSetGender(male: boolean) {
    if (this.ep.male !== null && this.ep.male !== male && this.epPhotos().length) {
      this.epPendingMale = male;
      this.epGenderConfirm.set(true);
      return;
    }
    this.ep.male = male;
  }
  epConfirmGender() {
    if (this.epPendingMale !== null) {
      this.ep.male = this.epPendingMale;
      // Parity with Android confirmGenderChange: remove the now-invalid photos from Storage too,
      // not just the local list — otherwise they'd be orphaned (uploaded on add, unreferenced on save).
      const orphans = this.epPhotos().map((p) => p.name);
      this.epPhotos.set([]);
      if (orphans.length) this.firebase.deleteProfilePhotos(orphans);
    }
    this.epPendingMale = null;
    this.epGenderConfirm.set(false);
  }
  epCancelGender() { this.epPendingMale = null; this.epGenderConfirm.set(false); }
  readonly epError = signal('');
  ep = { name: '', bio: '', male: null as boolean | null, type: '' as 'elite' | 'prime' | '', orientation: '' as 'men' | 'women' | 'both' | '', minAge: 18, maxAge: 50, maxDistance: 50, lat: null as number | null, lng: null as number | null };
  readonly epInterests = signal<string[]>([]);
  readonly epLoading = signal(false);
  readonly epLocStatus = signal<'idle' | 'loading' | 'done' | 'error'>('idle');
  /** Normalize a stored interest to its catalog ID (backend may store with/without the `interest_`
   *  prefix — iOS does the same normalization). Keeps unknown/legacy values as-is. */
  private normInterest(x: string): string {
    const s = String(x || '');
    if (INTEREST_CATALOG.some((c) => c.id === s)) return s;
    if (INTEREST_CATALOG.some((c) => c.id === 'interest_' + s)) return 'interest_' + s;
    return s;
  }
  /** Interests grouped by category and filtered by the chosen type (iOS EnhancedInterestsSelectionSheet). */
  interestGroups(): Array<{ key: string; es: string; en: string; items: typeof INTEREST_CATALOG }> {
    const ty = this.ep.type; if (!ty) return [];
    return INTEREST_CATEGORIES
      .map((c) => ({ ...c, items: INTEREST_CATALOG.filter((x) => x.cat === c.key && (x.t === 'both' || x.t === ty)) }))
      .filter((g) => g.items.length > 0);
  }
  isInterestSelected(id: string): boolean { return this.epInterests().includes(id); }
  epToggleInterest(id: string) {
    const cur = this.epInterests();
    if (cur.includes(id)) this.epInterests.set(cur.filter((x) => x !== id));
    else if (cur.length < 5) this.epInterests.set([...cur, id]);
  }
  /** Legacy free-text interests not in the catalog (shown as removable chips so data isn't lost). */
  epCustomInterests(): string[] { return this.epInterests().filter((id) => !INTEREST_CATALOG.some((x) => x.id === id)); }
  /** Localize an interest ID (interest_*, prefixed or not) → label; free-text legacy values pass through. */
  interestLabel(id: string): string {
    const it = INTEREST_CATALOG.find((x) => x.id === id || x.id === 'interest_' + id);
    if (it) return this.lang() === 'es' ? it.es : it.en;
    // Unknown id (Android-only extras / future server catalog) → prettify so we never show a raw key.
    const s = String(id || '').replace(/^interest_/, '').replace(/_/g, ' ').trim();
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
  }
  async epUpdateLocation() {
    if (this.epLocStatus() === 'loading') return;
    this.epLocStatus.set('loading');
    const geo = await this.getGeo();
    if (geo) { this.ep.lat = geo.lat; this.ep.lng = geo.lng; this.epLocStatus.set('done'); }
    else this.epLocStatus.set('error');
  }
  readonly epPhotos = signal<Array<{ name: string; url: string; loaded?: boolean }>>([]);
  readonly epUploading = signal(false);
  readonly epUploadPct = signal(0); // 0-100 upload progress for the current photo
  readonly grid9 = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  /** Mark a grid photo as painted → removes its skeleton (skeleton stays until the image loads). */
  epImgLoaded(i: number) { this.epPhotos.update((a) => a.map((p, idx) => (idx === i ? { ...p, loaded: true } : p))); }
  // Bio AI suggestions (getBioCoaching, iOS parity) + static fallback
  readonly epBioLoading = signal(false);
  readonly epBioSuggestions = signal<string[]>([]);
  // Photo Coach (getPhotoCoachAnalysis, iOS parity)
  readonly epPhotoCoachLoading = signal(false);
  readonly epPhotoCoach = signal<{ overallScore: number; recommendations: string[] } | null>(null);
  readonly epPhotoCoachErr = signal(false);
  async epBioSuggest() {
    if (this.epBioLoading()) return;
    this.epBioLoading.set(true);
    try {
      let sug = await this.firebase.getBioCoaching(this.ep.bio, this.lang());
      if (!sug.length) { const m = BIO_FALLBACK[this.lang()] || BIO_FALLBACK['en']; sug = m; }
      this.epBioSuggestions.set(sug);
    } finally { this.epBioLoading.set(false); }
  }
  applyBioSuggestion(t: string) { this.ep.bio = (t || '').slice(0, 500); this.epBioSuggestions.set([]); }
  async runPhotoCoach() {
    if (this.epPhotoCoachLoading()) return;
    this.epPhotoCoach.set(null);
    this.epPhotoCoachErr.set(false);
    this.epPhotoCoachLoading.set(true);
    try {
      const r = await this.firebase.getPhotoCoachAnalysis(this.lang());
      this.epPhotoCoach.set(r);
      if (!r) this.epPhotoCoachErr.set(true);   // never leave the user with no feedback
    } catch { this.epPhotoCoachErr.set(true); }
    finally { this.epPhotoCoachLoading.set(false); }
  }
  async openEditProfile() {
    const p: any = this.firebase.userProfile() || {};
    const t = p.userType;
    this.ep.name = p.name || p.displayName || '';
    this.ep.bio = p.bio || '';
    this.ep.male = typeof p.male === 'boolean' ? p.male : null;
    this.ep.type = t === 'SUGAR_BABY' ? 'prime' : (t === 'SUGAR_DADDY' || t === 'SUGAR_MOMMY' ? 'elite' : '');
    this.ep.orientation = (p.orientation as 'men' | 'women' | 'both') || '';
    this.ep.minAge = typeof p.minAge === 'number' ? p.minAge : 18;
    this.ep.maxAge = typeof p.maxAge === 'number' ? p.maxAge : 50;
    this.ep.maxDistance = typeof p.maxDistance === 'number' ? p.maxDistance : 50;
    this.ep.lat = null; this.ep.lng = null; this.epLocStatus.set('idle');
    // Normalize stored interests → catalog IDs so backend-saved selections appear selected.
    this.epInterests.set(Array.isArray(p.interests) ? p.interests.map((x: string) => this.normInterest(x)) : []);
    const names: string[] = Array.isArray(p.pictures) ? p.pictures : [];
    // Show the editor immediately with SKELETON photo cells (url:'') while the backend signs the URLs
    // — same UX intent as iOS .showLoading(isLoading) on EditProfileView.
    this.epPhotos.set(names.map((n) => ({ name: n, url: '', loaded: false })));
    this.epBioSuggestions.set([]);
    this.epPhotoCoach.set(null);
    this.epPhotoCoachErr.set(false);
    this.epError.set('');
    this.epEditing.set(true);
    // iOS .showLoading parity: dim overlay + spinner ONLY while the backend signs the photo URLs
    // (skip the overlay flash when they're already cached).
    const needFetch = !this.profilePhotos().length && names.length > 0;
    if (needFetch) this.epLoading.set(true);
    try {
      if (needFetch) await this.loadProfilePhotos();
      const urls = this.profilePhotos();
      this.epPhotos.set(names.map((n, i) => ({ name: n, url: urls[i] || '', loaded: false })));
    } finally { this.epLoading.set(false); }
  }
  closeEditProfile() { this.epEditing.set(false); this.epError.set(''); }
  async epAddPhotos(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files || []).filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (!files.length) return;
    this.epUploading.set(true); this.epError.set('');
    try {
      for (const f of files.slice(0, 9 - this.epPhotos().length)) {
        if (f.size > 10 * 1024 * 1024) { this.epError.set(this.s('obPhotoErr')); continue; }
        try {
          // iOS/Android parity: AI (Gemini Vision) reviews each photo before it's accepted.
          const b64 = await this.fileToModerationBase64(f);
          const verdict = await this.firebase.moderateProfileImage(b64, this.ep.male, this.lang());
          if (!verdict.approved) { this.epError.set(verdict.reason || this.s('obPhotoRejected')); continue; }
          this.epUploadPct.set(0);
          const name = await this.firebase.uploadProfilePhoto(f, (pct) => this.epUploadPct.set(pct));
          this.epPhotos.update((p) => [...p, { name, url: URL.createObjectURL(f), loaded: false }]);
        } catch (e) { console.error('[edit-profile] photo failed:', e); this.epError.set(this.s('obPhotoErr')); }
      }
    } finally { this.epUploading.set(false); }
  }
  // iOS/Android parity: a profile must keep at least 2 photos — block removing below that
  // (a gender change is the only path that clears all, since the user must re-validate them).
  epRemovePhoto(i: number) {
    if (this.epPhotos().length <= 2) { this.epError.set(this.obPhotosMinText()); return; }
    this.epError.set('');
    this.epPhotos.update((p) => p.filter((_, idx) => idx !== i));
  }
  epRemoveInterest(it: string) { this.epInterests.update((a) => a.filter((x) => x !== it)); }
  epMinChanged(v: any) { this.ep.minAge = +v; if (this.ep.minAge > +this.ep.maxAge) this.ep.maxAge = this.ep.minAge; }
  epMaxChanged(v: any) { this.ep.maxAge = +v; if (this.ep.maxAge < +this.ep.minAge) this.ep.minAge = this.ep.maxAge; }
  epCanSave(): boolean { return this.ep.name.trim().length >= 2 && this.ep.male !== null && this.ep.type !== '' && !!this.ep.orientation && this.epPhotos().length >= 2; }
  async epSave() {
    if (this.epSaving()) return;
    if (!this.epCanSave()) { this.epError.set(this.s('obRequired')); return; }
    this.epSaving.set(true); this.epError.set('');
    try {
      const male = !!this.ep.male;
      const userType = this.ep.type === 'elite' ? (male ? 'SUGAR_DADDY' : 'SUGAR_MOMMY') : 'SUGAR_BABY';
      await this.firebase.updateProfile({
        name: this.titleCaseName(this.ep.name), bio: this.ep.bio.trim(), male, userType,
        orientation: this.ep.orientation, interests: this.epInterests(),
        pictures: this.epPhotos().map((p) => p.name),
        minAge: this.ep.minAge, maxAge: this.ep.maxAge, maxDistance: this.ep.maxDistance,
        ...(this.ep.lat != null && this.ep.lng != null ? { latitude: this.ep.lat, longitude: this.ep.lng } : {}),
      });
      this.profilePhotos.set([]);
      await this.loadProfilePhotos();
      this.track('profile_saved');
      this.epEditing.set(false);
    } catch { this.epError.set(this.s('obSaveErr')); }
    finally { this.epSaving.set(false); }
  }

  profileTypeLabel(): string {
    const t = (this.firebase.userProfile() as any)?.userType || '';
    if (t === 'SUGAR_BABY') return '🌟';
    if (t === 'SUGAR_DADDY' || t === 'SUGAR_MOMMY') return '💎';
    return '';
  }

  // Onboarding wizard (creates a discovery-valid profile with the apps' schema).
  readonly obStep = signal(0);
  readonly obStarted = signal(false); // coach-welcome intro before the wizard (iOS/Android parity)
  readonly obSaving = signal(false);
  readonly obError = signal('');
  ob = { name: '', day: '', month: '', year: '', male: null as boolean | null, type: '' as 'elite' | 'prime' | '', orientation: '' as 'men' | 'women' | 'both' | '', minAge: 18, maxAge: 50, maxDistance: 50 };
  readonly obPhotos = signal<Array<{ name: string; url: string }>>([]);
  readonly obUploading = signal(false);
  readonly obUploadPct = signal(0); // 0-100 upload progress for the current photo
  readonly obDone = signal(false);  // elegant success flourish after onboarding completes
  readonly obGeo = signal<{ lat: number; lng: number } | null>(null); // captured in the location step
  readonly obLocating = signal(false);
  private readonly OB_LAST = 8;
  obCanProceed(): boolean {
    switch (this.obStep()) {
      case 0: return this.ob.name.trim().length >= 2;
      case 1: return this.obBirthState() === 'ok';
      case 2: return this.ob.male !== null;
      case 3: return this.ob.type !== '';
      case 4: return this.ob.orientation !== '';
      case 5: return true; // age range (has defaults)
      case 6: return true; // distance (has default)
      case 7: return true; // location (optional, best-effort like iOS)
      case 8: return this.obPhotos().length >= 2; // iOS/Android parity: minimum 2 photos
      default: return true;
    }
  }
  /** Capture location on demand (location step). Mirrors iOS OnboardingLocationView "use my location". */
  async obUseLocation() {
    if (this.obLocating()) return;
    this.obLocating.set(true); this.obError.set('');
    const geo = await this.getGeo();
    if (geo) this.obGeo.set(geo); else this.obError.set(this.s('obLocationDenied'));
    this.obLocating.set(false);
  }
  /** iOS parity: if the browser already granted geolocation, capture it automatically when the step opens. */
  private async obAutoLocateIfGranted() {
    if (this.obGeo()) return;
    try {
      const perm: any = (navigator as any).permissions ? await (navigator as any).permissions.query({ name: 'geolocation' }) : null;
      if (!perm || perm.state === 'granted') { const geo = await this.getGeo(); if (geo) this.obGeo.set(geo); }
    } catch { /* permissions API unavailable — leave to the manual button */ }
  }
  // iOS/Android parity: changing gender invalidates photos (they were AI-moderated against the
  // previous expectedGender), so we clear them when the gender actually changes.
  obSetGender(male: boolean) {
    if (this.ob.male !== null && this.ob.male !== male && this.obPhotos().length) {
      const orphans = this.obPhotos().map((p) => p.name);
      this.obPhotos.set([]);
      this.firebase.deleteProfilePhotos(orphans); // they were AI-moderated for the old gender → remove from Storage
    }
    this.ob.male = male;
  }
  // Age-range sliders keep min ≤ max (mirrors edit-profile).
  obMinChanged(v: any) { this.ob.minAge = +v; if (this.ob.minAge > this.ob.maxAge) this.ob.maxAge = this.ob.minAge; }
  obMaxChanged(v: any) { this.ob.maxAge = +v; if (this.ob.maxAge < this.ob.minAge) this.ob.minAge = this.ob.maxAge; }
  async obAddPhotos(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    this.obUploading.set(true); this.obError.set('');
    try {
      for (const f of files.slice(0, 6 - this.obPhotos().length)) {
        if (f.size > 10 * 1024 * 1024) { this.obError.set(this.s('obPhotoErr')); continue; } // 10MB cap
        // Per-photo: one bad file (HEIC that won't decode, slow upload) must NOT freeze the rest.
        try {
          // iOS/Android parity: every photo is reviewed by AI (Gemini Vision) BEFORE it's accepted.
          const b64 = await this.fileToModerationBase64(f);
          const verdict = await this.firebase.moderateProfileImage(b64, this.ob.male, this.lang());
          if (!verdict.approved) { this.obError.set(verdict.reason || this.s('obPhotoRejected')); continue; }
          this.obUploadPct.set(0);
          const name = await this.firebase.uploadProfilePhoto(f, (pct) => this.obUploadPct.set(pct));
          this.obPhotos.update((p) => [...p, { name, url: URL.createObjectURL(f) }]);
        } catch (e) {
          console.error('[onboarding] photo failed:', e);
          this.obError.set(this.s('obPhotoErr')); // surfaced, never a silent hang
        }
      }
    } finally { this.obUploading.set(false); input.value = ''; }
  }
  /** Downscale to ≤1024px JPEG → raw base64 (no data: prefix), under the moderation CF's ~1.5MB cap.
   *  Hardened: a hard timeout guarantees it never hangs (some mobile browsers fire NEITHER onload nor
   *  onerror for HEIC/odd images → the onboarding overlay would spin forever). */
  private fileToModerationBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      let settled = false;
      const finish = (fn: () => void) => { if (settled) return; settled = true; clearTimeout(timer); URL.revokeObjectURL(url); fn(); };
      const timer = setTimeout(() => finish(() => reject(new Error('img-timeout'))), 15000);
      img.onload = () => finish(() => {
        try {
          const max = 1024;
          let w = img.width, h = img.height;
          if (!w || !h) { reject(new Error('img-empty')); return; }
          if (w > max || h > max) { const r = Math.min(max / w, max / h); w = Math.round(w * r); h = Math.round(h * r); }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('no-ctx')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve((canvas.toDataURL('image/jpeg', 0.82).split(',')[1]) || '');
        } catch (e) { reject(e instanceof Error ? e : new Error('canvas-fail')); }
      });
      img.onerror = () => finish(() => reject(new Error('img-load')));
      img.src = url;
    });
  }
  obRemovePhoto(i: number) { this.obPhotos.update((p) => p.filter((_, idx) => idx !== i)); }
  obBirthAge(): number | null {
    const d = parseInt(this.ob.day, 10), m = parseInt(this.ob.month, 10), y = parseInt(this.ob.year, 10);
    if (!d || !m || !y || y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const bd = new Date(y, m - 1, d);
    if (bd.getFullYear() !== y || bd.getMonth() !== m - 1) return null;
    if (bd.getTime() > Date.now()) return null; // future date
    // Exact calendar age (matches iOS dateComponents([.year])).
    const today = new Date();
    let age = today.getFullYear() - y;
    const mo = today.getMonth() - (m - 1);
    if (mo < 0 || (mo === 0 && today.getDate() < d)) age--;
    return age;
  }
  /** Country-based minimum age (mirrors iOS getMinimumAgeByCountry). */
  obMinAge(): number {
    let region = '';
    try { region = (navigator.language.split('-')[1] || '').toUpperCase(); } catch { /* noop */ }
    const byCountry: Record<string, number> = { KR: 19, TH: 20, SA: 21, AE: 21 };
    return byCountry[region] ?? 18;
  }
  /** Birthday step state for elegant live feedback (iOS parity). */
  obBirthState(): 'empty' | 'invalid' | 'underage' | 'ok' {
    if (!this.ob.day || !this.ob.month || !this.ob.year) return 'empty';
    const age = this.obBirthAge();
    if (age === null || age > 120) return 'invalid';
    if (age < this.obMinAge()) return 'underage';
    return 'ok';
  }
  obUnderageText(): string { return this.s('obUnderageMsg').replace('{min}', String(this.obMinAge())); }
  obPhotosSelectedText(): string { return this.s('obPhotosSelected').replace('{n}', String(this.obPhotos().length)); }
  obPhotosMinText(): string { return this.s('obPhotosMin').replace('{min}', '2'); }
  obNext() {
    this.obError.set('');
    if (!this.obCanProceed()) { this.obError.set(this.obStep() === 1 ? this.s('obAge18') : this.s('obRequired')); return; }
    if (this.obStep() < this.OB_LAST) {
      this.obStep.update((v) => v + 1);
      if (this.obStep() === 7) this.obAutoLocateIfGranted(); // location step: auto-capture if already granted (iOS parity)
    } else this.obSave();
  }
  obBack() { this.obError.set(''); if (this.obStep() > 0) this.obStep.update((v) => v - 1); }
  /** iOS parity (PersonalInfoView auto-capitalization): capitalize each word of the display name. */
  private titleCaseName(s: string): string {
    return s.trim().replace(/\s+/g, ' ').split(' ').map((w) => w ? w[0].toLocaleUpperCase() + w.slice(1) : w).join(' ');
  }
  private getGeo(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((res) => {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(
        (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => res(null), { timeout: 8000, maximumAge: 600000 });
    });
  }
  async obSave() {
    if (this.obSaving()) return;
    this.obSaving.set(true);
    try {
      const male = !!this.ob.male;
      const userType = this.ob.type === 'elite' ? (male ? 'SUGAR_DADDY' : 'SUGAR_MOMMY') : 'SUGAR_BABY';
      const bd = new Date(parseInt(this.ob.year, 10), parseInt(this.ob.month, 10) - 1, parseInt(this.ob.day, 10));
      const geo = this.obGeo() ?? await this.getGeo();
      await this.firebase.saveOnboarding({
        name: this.titleCaseName(this.ob.name), birthDate: bd, male, userType, orientation: this.ob.orientation || 'both',
        latitude: geo?.lat, longitude: geo?.lng,
        minAge: this.ob.minAge, maxAge: this.ob.maxAge, maxDistance: this.ob.maxDistance,
        pictures: this.obPhotos().map((p) => p.name),
      });
      this.track('onboarding_complete', { userType });
      this.obStep.set(0);
      // Load the just-uploaded photos so the profile avatar shows the FIRST uploaded photo
      // (never the Google/login photo), then play an elegant success flourish.
      this.profilePhotos.set([]); this.pfAvatarLoaded.set(false); this.loadProfilePhotos();
      this.obDone.set(true);
      if (this.isBrowser) setTimeout(() => this.obDone.set(false), 1900);
    } catch { this.obError.set(this.s('obSaveErr')); }
    finally { this.obSaving.set(false); }
  }

  ngOnDestroy() { if (this.unsubMatches) this.unsubMatches(); if (this.unsubMsgs) this.unsubMsgs(); if (this.firebase.currentUser()) this.firebase.setActiveChat(null); }
}
