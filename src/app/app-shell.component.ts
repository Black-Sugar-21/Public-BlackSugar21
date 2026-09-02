import { Component, ChangeDetectionStrategy, Inject, OnDestroy, PLATFORM_ID, signal, computed, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';
import { WardrobePanelComponent } from './wardrobe-panel.component';
import { ShellNavIconComponent } from './shell-nav-icon.component';
import { UiButtonComponent } from './ui/atoms/ui-button.component';
import { UiOptionComponent } from './ui/atoms/ui-option.component';
import { UiInputComponent } from './ui/atoms/ui-input.component';
import { UiSkeletonComponent } from './ui/atoms/ui-skeleton.component';
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
  // "Pregunta del día" — blind daily question card in the 1:1 chat (13 languages)
  dqTitle: {"es":"✨ Pregunta del día","en":"✨ Question of the day","pt":"✨ Pergunta do dia","fr":"✨ Question du jour","de":"✨ Frage des Tages","it":"✨ Domanda del giorno","zh":"✨ 每日一问","ja":"✨ 今日の質問","ko":"✨ 오늘의 질문","ru":"✨ Вопрос дня","ar":"✨ سؤال اليوم","id":"✨ Pertanyaan hari ini","tr":"✨ Günün sorusu"},
  dqHint: {"es":"Ambos responden a ciegas — se revela cuando los dos contesten","en":"You both answer blind — revealed once you both reply","pt":"Os dois respondem às cegas — revela-se quando ambos responderem","fr":"Vous répondez à l'aveugle — révélé quand vous avez tous deux répondu","de":"Ihr antwortet beide blind — aufgedeckt, sobald beide geantwortet haben","it":"Rispondete entrambi alla cieca — si rivela quando entrambi rispondono","zh":"双方盲答——两人都回答后才会公开","ja":"ふたりとも見えない状態で回答——両方が答えると公開されます","ko":"둘 다 모르는 채로 답해요 — 두 사람이 답하면 공개돼요","ru":"Вы оба отвечаете вслепую — ответы откроются, когда ответят оба","ar":"كلاكما يجيب دون رؤية الآخر — تُكشف الإجابات عندما يجيب الاثنان","id":"Kalian berdua menjawab tanpa melihat — terungkap saat keduanya menjawab","tr":"İkiniz de görmeden yanıtlarsınız — ikiniz de yanıtlayınca açılır"},
  dqWaiting: {"es":"Esperando su respuesta…","en":"Waiting for their answer…","pt":"Aguardando a resposta…","fr":"En attente de sa réponse…","de":"Warten auf die Antwort…","it":"In attesa della risposta…","zh":"等待对方回答…","ja":"相手の回答を待っています…","ko":"상대의 답을 기다리는 중…","ru":"Ждём ответа собеседника…","ar":"بانتظار إجابته…","id":"Menunggu jawabannya…","tr":"Yanıtı bekleniyor…"},
  dqYou: {"es":"Tú","en":"You","pt":"Você","fr":"Toi","de":"Du","it":"Tu","zh":"你","ja":"あなた","ko":"나","ru":"Вы","ar":"أنت","id":"Kamu","tr":"Sen"},
  dqPlaceholder: {"es":"Escribe tu respuesta…","en":"Write your answer…","pt":"Escreva sua resposta…","fr":"Écris ta réponse…","de":"Schreib deine Antwort…","it":"Scrivi la tua risposta…","zh":"写下你的回答…","ja":"回答を入力…","ko":"답을 입력하세요…","ru":"Напишите свой ответ…","ar":"اكتب إجابتك…","id":"Tulis jawabanmu…","tr":"Cevabını yaz…"},
  dqSend: {"es":"Responder","en":"Answer","pt":"Responder","fr":"Répondre","de":"Antworten","it":"Rispondi","zh":"回答","ja":"回答する","ko":"답하기","ru":"Ответить","ar":"أجب","id":"Jawab","tr":"Yanıtla"},
  dqError: {"es":"No se pudo enviar, intenta de nuevo","en":"Couldn't send, try again","pt":"Não foi possível enviar, tente de novo","fr":"Échec de l'envoi, réessaie","de":"Senden fehlgeschlagen, versuch es erneut","it":"Invio non riuscito, riprova","zh":"发送失败，请重试","ja":"送信できませんでした。もう一度お試しください","ko":"보내지 못했어요. 다시 시도하세요","ru":"Не удалось отправить, попробуйте снова","ar":"تعذّر الإرسال، حاول مجدداً","id":"Gagal mengirim, coba lagi","tr":"Gönderilemedi, tekrar dene"},
  // R161 "La segunda opinión" — one-tap bestie verdict link + zero-click verdict chip (13 languages)
  soAsk: {"es":"Segunda opinión","en":"Second opinion","pt":"Segunda opinião","fr":"Deuxième avis","de":"Zweite Meinung","it":"Seconda opinione","zh":"第二意见","ja":"セカンドオピニオン","ko":"세컨드 오피니언","ru":"Второе мнение","ar":"رأي ثانٍ","id":"Opini kedua","tr":"İkinci görüş"},
  soCopied: {"es":"Enlace copiado — envíaselo a tu bestie","en":"Link copied — send it to your bestie","pt":"Link copiado — envie para sua bestie","fr":"Lien copié — envoie-le à ta bestie","de":"Link kopiert — schick ihn deiner Bestie","it":"Link copiato — mandalo alla tua bestie","zh":"链接已复制——发给你的闺蜜吧","ja":"リンクをコピーしました — 親友に送ろう","ko":"링크가 복사됐어요 — 베프에게 보내세요","ru":"Ссылка скопирована — отправь её бести","ar":"تم نسخ الرابط — أرسله لصديقك المقرّب","id":"Tautan disalin — kirim ke bestie-mu","tr":"Bağlantı kopyalandı — bestie'ne gönder"},
  soBestieFire: {"es":"Tu bestie dice: ¡Dale! 🔥","en":"Your bestie says: Go for it! 🔥","pt":"Sua bestie diz: Vai! 🔥","fr":"Ta bestie dit : Fonce ! 🔥","de":"Deine Bestie sagt: Los! 🔥","it":"La tua bestie dice: Vai! 🔥","zh":"你的闺蜜说：冲！🔥","ja":"親友の判定：アリ！🔥","ko":"베프의 한마디: 가자! 🔥","ru":"Твоя бести говорит: Действуй! 🔥","ar":"صديقك المقرّب يقول: انطلق! 🔥","id":"Bestie-mu bilang: Gas! 🔥","tr":"Bestie'n diyor ki: Yürü! 🔥"},
  soBestieHmm: {"es":"Tu bestie dice: Mmm… 🤔","en":"Your bestie says: Hmm… 🤔","pt":"Sua bestie diz: Hmm… 🤔","fr":"Ta bestie dit : Hmm… 🤔","de":"Deine Bestie sagt: Hmm… 🤔","it":"La tua bestie dice: Mmm… 🤔","zh":"你的闺蜜说：嗯……🤔","ja":"親友の判定：うーん…🤔","ko":"베프의 한마디: 음… 🤔","ru":"Твоя бести говорит: Хм… 🤔","ar":"صديقك المقرّب يقول: همم… 🤔","id":"Bestie-mu bilang: Hmm… 🤔","tr":"Bestie'n diyor ki: Hmm… 🤔"},
  soBestieFlag: {"es":"Tu bestie dice: Cuidado 🚩","en":"Your bestie says: Careful 🚩","pt":"Sua bestie diz: Cuidado 🚩","fr":"Ta bestie dit : Attention 🚩","de":"Deine Bestie sagt: Vorsicht 🚩","it":"La tua bestie dice: Attenzione 🚩","zh":"你的闺蜜说：小心 🚩","ja":"親友の判定：要注意 🚩","ko":"베프의 한마디: 조심해 🚩","ru":"Твоя бести говорит: Осторожно 🚩","ar":"صديقك المقرّب يقول: احذر 🚩","id":"Bestie-mu bilang: Hati-hati 🚩","tr":"Bestie'n diyor ki: Dikkat 🚩"},
  soErr: {"es":"No se pudo crear el enlace","en":"Couldn't create the link","pt":"Não foi possível criar o link","fr":"Impossible de créer le lien","de":"Link konnte nicht erstellt werden","it":"Impossibile creare il link","zh":"无法创建链接","ja":"リンクを作成できませんでした","ko":"링크를 만들지 못했어요","ru":"Не удалось создать ссылку","ar":"تعذّر إنشاء الرابط","id":"Gagal membuat tautan","tr":"Bağlantı oluşturulamadı"},
  soLimit: {"es":"Demasiados enlaces por ahora, intenta más tarde","en":"Too many links for now, try again later","pt":"Muitos links por agora, tente mais tarde","fr":"Trop de liens pour l'instant, réessaie plus tard","de":"Gerade zu viele Links, versuch es später","it":"Troppi link per ora, riprova più tardi","zh":"链接创建太频繁，请稍后再试","ja":"リンクの作成が多すぎます。後でお試しください","ko":"지금은 링크가 너무 많아요. 나중에 다시 시도하세요","ru":"Слишком много ссылок, попробуйте позже","ar":"روابط كثيرة الآن، حاول لاحقاً","id":"Terlalu banyak tautan, coba lagi nanti","tr":"Şimdilik çok fazla bağlantı, sonra tekrar dene"},
  discoLocTitle: {"es":"Activa tu ubicación","en":"Enable your location","pt":"Ative sua localização","fr":"Active ta localisation","de":"Standort aktivieren","it":"Attiva la posizione","zh":"开启你的位置","ja":"位置情報をオンに","ko":"위치를 켜세요","ru":"Включите геолокацию","ar":"فعّل موقعك","id":"Aktifkan lokasimu","tr":"Konumunu aç"},
  discoLocBody: {"es":"La usamos solo para mostrarte personas cerca de ti. Nunca la compartimos con nadie.","en":"We use it only to show you people near you. We never share it with anyone.","pt":"Usamos apenas para mostrar pessoas perto de você. Nunca compartilhamos.","fr":"Nous l'utilisons uniquement pour te montrer des personnes près de toi. Jamais partagée.","de":"Wir nutzen ihn nur, um dir Menschen in deiner Nähe zu zeigen. Niemals geteilt.","it":"La usiamo solo per mostrarti persone vicine. Mai condivisa.","zh":"仅用于向你展示附近的人，绝不分享。","ja":"近くの人を表示するためだけに使用します。共有しません。","ko":"근처 사람을 보여주기 위해서만 사용해요. 공유하지 않습니다.","ru":"Используем только чтобы показать людей рядом. Никогда не передаём.","ar":"نستخدمه فقط لعرض أشخاص قريبين منك. لا نشاركه أبداً.","id":"Hanya untuk menampilkan orang di dekatmu. Tidak pernah dibagikan.","tr":"Yalnızca yakınındaki kişileri göstermek için kullanırız. Asla paylaşmayız."},
  discoLocBtn: {"es":"Activar ubicación","en":"Enable location","pt":"Ativar localização","fr":"Activer la localisation","de":"Standort aktivieren","it":"Attiva posizione","zh":"开启位置","ja":"位置情報をオンにする","ko":"위치 켜기","ru":"Включить геолокацию","ar":"تفعيل الموقع","id":"Aktifkan lokasi","tr":"Konumu aç"},
  discoLocDenied: {"es":"Activa la ubicación desde los ajustes de tu navegador para ver personas cerca.","en":"Enable location in your browser settings to see people nearby.","pt":"Ative a localização nas configurações do navegador para ver pessoas perto.","fr":"Active la localisation dans les réglages du navigateur pour voir des personnes proches.","de":"Aktiviere den Standort in den Browser-Einstellungen, um Menschen in der Nähe zu sehen.","it":"Attiva la posizione nelle impostazioni del browser per vedere persone vicine.","zh":"请在浏览器设置中开启位置以查看附近的人。","ja":"近くの人を見るにはブラウザ設定で位置情報をオンにしてください。","ko":"근처 사람을 보려면 브라우저 설정에서 위치를 켜세요.","ru":"Включите геолокацию в настройках браузера, чтобы видеть людей рядом.","ar":"فعّل الموقع من إعدادات المتصفح لرؤية أشخاص قريبين.","id":"Aktifkan lokasi di pengaturan browser untuk melihat orang di dekatmu.","tr":"Yakındaki kişileri görmek için tarayıcı ayarlarından konumu aç."},
  dailyPicksTitle: {"es":"✨ Tus 3 del día","en":"✨ Your 3 of the day","pt":"✨ Seus 3 do dia","fr":"✨ Tes 3 du jour","de":"✨ Deine 3 des Tages","it":"✨ I tuoi 3 del giorno","zh":"✨ 今日为你精选 3 位","ja":"✨ 今日のおすすめ3人","ko":"✨ 오늘의 추천 3인","ru":"✨ Твоя тройка дня","ar":"✨ ثلاثتك لليوم","id":"✨ 3 pilihanmu hari ini","tr":"✨ Günün 3 seçimin"},
  dailyPicksSub: {"es":"Elegidos por tu coach","en":"Picked by your coach","pt":"Escolhidos pelo seu coach","fr":"Choisis par ton coach","de":"Von deinem Coach ausgewählt","it":"Scelti dal tuo coach","zh":"由你的教练精选","ja":"コーチが選びました","ko":"코치가 골랐어요","ru":"Выбраны твоим коучем","ar":"اختارهم مدرّبك","id":"Dipilih oleh coach-mu","tr":"Koçun tarafından seçildi"},
  dailyPicksKm: {"es":"a {n} km","en":"{n} km away","pt":"a {n} km","fr":"à {n} km","de":"{n} km entfernt","it":"a {n} km","zh":"距离 {n} 公里","ja":"{n}km先","ko":"{n}km 거리","ru":"в {n} км","ar":"على بُعد {n} كم","id":"{n} km jauhnya","tr":"{n} km uzakta"},
  discoSignIn: {"es":"Inicia sesión para descubrir personas","en":"Sign in to discover people","pt":"Entre para descobrir pessoas","fr":"Connecte-toi pour découvrir des gens","de":"Melde dich an, um Leute zu entdecken","it":"Accedi per scoprire persone","zh":"登录以发现新朋友","ja":"ログインして人を見つけよう","ko":"로그인하고 사람을 만나보세요","ru":"Войдите, чтобы знакомиться","ar":"سجّل الدخول لاكتشاف أشخاص","id":"Masuk untuk menemukan orang","tr":"İnsanları keşfetmek için giriş yap"},
  chemistry: {"es":"Química","en":"Chemistry","pt":"Química","fr":"Alchimie","de":"Chemie","it":"Affinità","zh":"默契","ja":"相性","ko":"케미","ru":"Химия","ar":"كيمياء","id":"Kimia","tr":"Kimya"},
  near: {"es":"Cerca","en":"Near","pt":"Perto","fr":"Proche","de":"In der Nähe","it":"Vicino","zh":"附近","ja":"近く","ko":"근처","ru":"Рядом","ar":"قريب","id":"Dekat","tr":"Yakın"},
  discoNoBack: {"es":"No puedes volver atrás 🚫","en":"You can't go back 🚫","pt":"Não dá para voltar 🚫","fr":"Tu ne peux pas revenir 🚫","de":"Zurück geht nicht 🚫","it":"Non puoi tornare indietro 🚫","zh":"无法返回上一个 🚫","ja":"前には戻れません 🚫","ko":"되돌아갈 수 없어요 🚫","ru":"Нельзя вернуться назад 🚫","ar":"لا يمكنك الرجوع 🚫","id":"Tidak bisa kembali 🚫","tr":"Geri dönemezsin 🚫"},
  chatsEmpty: {"es":"Aún no tienes matches. ¡Ve a Descubrir!","en":"No matches yet. Head to Discover!","pt":"Sem matches ainda. Vá em Descobrir!","fr":"Pas encore de matchs. Va dans Découvrir !","de":"Noch keine Matches. Geh zu Entdecken!","it":"Nessun match ancora. Vai su Scopri!","zh":"还没有匹配，去发现页看看！","ja":"まだマッチがありません。発見へ！","ko":"아직 매치가 없어요. 발견으로 가요!","ru":"Пока нет совпадений. Загляните в Поиск!","ar":"لا توجد مطابقات بعد. اذهب إلى اكتشف!","id":"Belum ada match. Ke Jelajah!","tr":"Henüz eşleşme yok. Keşfet'e git!"},
  chatPlaceholder: {"es":"Escribe un mensaje…","en":"Type a message…","pt":"Escreva uma mensagem…","fr":"Écris un message…","de":"Nachricht schreiben…","it":"Scrivi un messaggio…","zh":"输入消息…","ja":"メッセージを入力…","ko":"메시지 입력…","ru":"Напишите сообщение…","ar":"اكتب رسالة…","id":"Tulis pesan…","tr":"Mesaj yaz…"},
  chatStart: {"es":"Inicia la conversación 👋","en":"Start the conversation 👋","pt":"Comece a conversa 👋","fr":"Commence la conversation 👋","de":"Starte das Gespräch 👋","it":"Inizia la conversazione 👋","zh":"开始聊天吧 👋","ja":"会話を始めよう 👋","ko":"대화를 시작해요 👋","ru":"Начните разговор 👋","ar":"ابدأ المحادثة 👋","id":"Mulai obrolan 👋","tr":"Sohbete başla 👋"},
  coachIcebreakers: {"es":"Sugerencias del Coach IA","en":"AI Coach openers","pt":"Sugestões do Coach IA","fr":"Suggestions du Coach IA","de":"KI-Coach-Vorschläge","it":"Suggerimenti del Coach IA","zh":"AI 教练开场白","ja":"AIコーチの一言","ko":"AI 코치 제안","ru":"Подсказки ИИ-коуча","ar":"اقتراحات مدرب الذكاء الاصطناعي","id":"Saran Coach AI","tr":"AI Koç önerileri"},
  coachSuggesting: {"es":"El Coach IA está pensando ideas…","en":"AI Coach is thinking of openers…","pt":"O Coach IA está pensando em ideias…","fr":"Le Coach IA réfléchit à des idées…","de":"Der KI-Coach überlegt Vorschläge…","it":"Il Coach IA sta pensando a delle idee…","zh":"AI 教练正在想开场白…","ja":"AIコーチが一言を考え中…","ko":"AI 코치가 제안을 고민 중…","ru":"ИИ-коуч придумывает идеи…","ar":"مدرب الذكاء الاصطناعي يفكر في أفكار…","id":"Coach AI sedang memikirkan ide…","tr":"AI Koç öneriler düşünüyor…"},
  coachSmartReplies: {"es":"Respuestas sugeridas","en":"Suggested replies","pt":"Respostas sugeridas","fr":"Réponses suggérées","de":"Antwortvorschläge","it":"Risposte suggerite","zh":"建议回复","ja":"返信の候補","ko":"추천 답장","ru":"Подсказки для ответа","ar":"ردود مقترحة","id":"Saran balasan","tr":"Önerilen yanıtlar"},
  coachThinking: {"es":"El Coach IA está pensando…","en":"AI Coach is thinking…","pt":"O Coach IA está pensando…","fr":"Le Coach IA réfléchit…","de":"Der KI-Coach denkt nach…","it":"Il Coach IA sta pensando…","zh":"AI 教练思考中…","ja":"AIコーチが考え中…","ko":"AI 코치가 생각 중…","ru":"ИИ-коуч думает…","ar":"مدرب الذكاء الاصطناعي يفكر…","id":"Coach AI sedang berpikir…","tr":"AI Koç düşünüyor…"},
  coachChemistry: {"es":"Química","en":"Chemistry","pt":"Química","fr":"Alchimie","de":"Chemie","it":"Affinità","zh":"默契度","ja":"相性","ko":"케미","ru":"Химия","ar":"الانسجام","id":"Chemistry","tr":"Uyum"},
  coachPreDate: {"es":"Buen momento para proponer una cita","en":"Good moment to suggest a date","pt":"Bom momento para sugerir um encontro","fr":"Bon moment pour proposer un rendez-vous","de":"Guter Moment für ein Date","it":"Buon momento per proporre un appuntamento","zh":"适合提议约会的时机","ja":"デートに誘う好機です","ko":"데이트를 제안하기 좋은 순간","ru":"Хороший момент предложить свидание","ar":"وقت مناسب لاقتراح موعد","id":"Saat tepat untuk mengajak kencan","tr":"Buluşma teklif etmek için iyi an"},
  coachUse: {"es":"Usar","en":"Use","pt":"Usar","fr":"Utiliser","de":"Verwenden","it":"Usa","zh":"使用","ja":"使う","ko":"사용","ru":"Использовать","ar":"استخدام","id":"Pakai","tr":"Kullan"},
  datePlaces: {"es":"Lugares para una cita","en":"Date spots","pt":"Lugares para um encontro","fr":"Lieux pour un rendez-vous","de":"Date-Spots","it":"Posti per un appuntamento","zh":"约会地点","ja":"デートスポット","ko":"데이트 장소","ru":"Места для свидания","ar":"أماكن للموعد","id":"Tempat kencan","tr":"Buluşma mekanları"},
  datePlacesLoading: {"es":"Buscando lugares cerca…","en":"Finding spots near you…","pt":"Procurando lugares perto…","fr":"Recherche de lieux proches…","de":"Orte in der Nähe suchen…","it":"Cerco posti vicino…","zh":"正在寻找附近地点…","ja":"近くの場所を検索中…","ko":"근처 장소 찾는 중…","ru":"Ищу места рядом…","ar":"البحث عن أماكن قريبة…","id":"Mencari tempat di dekatmu…","tr":"Yakındaki mekanlar aranıyor…"},
  datePlacesEmpty: {"es":"No se encontraron lugares ahora. Inténtalo más tarde.","en":"No spots found right now. Try again later.","pt":"Nenhum lugar encontrado agora. Tente mais tarde.","fr":"Aucun lieu trouvé pour l'instant. Réessaie plus tard.","de":"Gerade keine Orte gefunden. Versuch es später.","it":"Nessun posto trovato ora. Riprova più tardi.","zh":"暂时没有找到地点，请稍后再试。","ja":"今は場所が見つかりません。後でお試しください。","ko":"지금은 장소를 찾지 못했어요. 나중에 다시 시도하세요.","ru":"Сейчас мест не найдено. Попробуйте позже.","ar":"لا توجد أماكن الآن. حاول لاحقاً.","id":"Belum ada tempat. Coba lagi nanti.","tr":"Şimdilik mekan yok. Sonra tekrar dene."},
  sharePlace: {"es":"Compartir","en":"Share","pt":"Compartilhar","fr":"Partager","de":"Teilen","it":"Condividi","zh":"分享","ja":"共有","ko":"공유","ru":"Поделиться","ar":"مشاركة","id":"Bagikan","tr":"Paylaş"},
  placeWebsite: {"es":"Sitio web","en":"Website","pt":"Site","fr":"Site web","de":"Website","it":"Sito web","zh":"网站","ja":"ウェブサイト","ko":"웹사이트","ru":"Сайト","ar":"موقع الويب","id":"Situs web","tr":"Web sitesi"},
  placeIG: {"es":"Instagram","en":"Instagram","pt":"Instagram","fr":"Instagram","de":"Instagram","it":"Instagram","zh":"Instagram","ja":"Instagram","ko":"Instagram","ru":"Instagram","ar":"Instagram","id":"Instagram","tr":"Instagram"},
  placesAll: {"es":"Todos","en":"All","pt":"Todos","fr":"Tous","de":"Alle","it":"Tutti","zh":"全部","ja":"すべて","ko":"전체","ru":"Все","ar":"الكل","id":"Semua","tr":"Tümü"},
  blueprintTitle: {"es":"Plan de cita IA","en":"AI Date Blueprint","pt":"Plano de encontro IA","fr":"Plan de rendez-vous IA","de":"KI-Date-Plan","it":"Piano d'appuntamento IA","zh":"AI 约会计划","ja":"AIデートプラン","ko":"AI 데이트 플랜","ru":"AI-план свидания","ar":"خطة موعد بالذكاء الاصطناعي","id":"Rencana Kencan AI","tr":"AI Buluşma Planı"},
  blueprintLoadingTxt: {"es":"Planeando tu cita perfecta…","en":"Planning your perfect date…","pt":"Planejando seu encontro perfeito…","fr":"Planification de ton rendez-vous parfait…","de":"Dein perfektes Date wird geplant…","it":"Sto pianificando il tuo appuntamento perfetto…","zh":"正在规划你的完美约会…","ja":"完璧なデートを計画中…","ko":"완벽한 데이트를 계획 중…","ru":"Планирую идеальное свидание…","ar":"أخطط لموعدك المثالي…","id":"Merencanakan kencan sempurnamu…","tr":"Mükemmel buluşmanı planlıyorum…"},
  blueprintShare: {"es":"Compartir plan al chat","en":"Share plan to chat","pt":"Compartilhar plano no chat","fr":"Partager le plan dans le chat","de":"Plan im Chat teilen","it":"Condividi il piano in chat","zh":"分享计划到聊天","ja":"プランをチャットで共有","ko":"플랜을 채팅에 공유","ru":"Поделиться планом в чате","ar":"شارك الخطة في المحادثة","id":"Bagikan rencana ke chat","tr":"Planı sohbette paylaş"},
  blueprintEmpty: {"es":"No se pudo generar el plan. Intenta de nuevo.","en":"Couldn't generate the plan. Try again.","pt":"Não foi possível gerar o plano. Tente de novo.","fr":"Impossible de générer le plan. Réessaie.","de":"Plan konnte nicht erstellt werden. Versuch es erneut.","it":"Impossibile generare il piano. Riprova.","zh":"无法生成计划，请重试。","ja":"プランを生成できませんでした。再試行してください。","ko":"플랜을 생성하지 못했어요. 다시 시도하세요.","ru":"Не удалось создать план. Попробуйте снова.","ar":"تعذّر إنشاء الخطة. حاول مجدداً.","id":"Gagal membuat rencana. Coba lagi.","tr":"Plan oluşturulamadı. Tekrar dene."},
  bpQuick: {"es":"Rápida","en":"Quick","pt":"Rápida","fr":"Rapide","de":"Kurz","it":"Veloce","zh":"快速","ja":"短め","ko":"짧게","ru":"Быстро","ar":"سريعة","id":"Singkat","tr":"Kısa"},
  bpStandard: {"es":"Estándar","en":"Standard","pt":"Padrão","fr":"Standard","de":"Standard","it":"Standard","zh":"标准","ja":"標準","ko":"기본","ru":"Стандарт","ar":"قياسية","id":"Standar","tr":"Standart"},
  bpFull: {"es":"Completa","en":"Full","pt":"Completa","fr":"Complète","de":"Voll","it":"Completa","zh":"完整","ja":"フル","ko":"풀","ru":"Полное","ar":"كاملة","id":"Penuh","tr":"Tam"},
  bpIcebreaker: {"es":"Para romper el hielo","en":"Conversation starter","pt":"Para quebrar o gelo","fr":"Pour briser la glace","de":"Gesprächseinstieg","it":"Per rompere il ghiaccio","zh":"开场白","ja":"会話のきっかけ","ko":"대화 시작","ru":"Для начала разговора","ar":"لكسر الجمود","id":"Pembuka obrolan","tr":"Sohbet başlatıcı"},
  bpSuggestion: {"es":"Sugerencia IA — personalízala a tu gusto","en":"AI suggestion — customize it to your liking","pt":"Sugestão IA — personalize do seu jeito","fr":"Suggestion IA — personnalise-la à ta guise","de":"KI-Vorschlag — passe ihn an","it":"Suggerimento IA — personalizzalo come vuoi","zh":"AI 建议 — 按你的喜好调整","ja":"AIの提案 — 自由にカスタマイズ","ko":"AI 제안 — 원하는 대로 수정하세요","ru":"AI-предложение — настройте по своему вкусу","ar":"اقتراح ذكي — خصّصه كما تريد","id":"Saran AI — sesuaikan sesukamu","tr":"AI önerisi — istediğin gibi düzenle"},
  bpAddPlace: {"es":"Agregar un lugar","en":"Add a place","pt":"Adicionar um lugar","fr":"Ajouter un lieu","de":"Ort hinzufügen","it":"Aggiungi un posto","zh":"添加地点","ja":"場所を追加","ko":"장소 추가","ru":"Добавить место","ar":"إضافة مكان","id":"Tambah tempat","tr":"Mekan ekle"},
  bpClearAll: {"es":"Borrar todo","en":"Clear all","pt":"Limpar tudo","fr":"Tout effacer","de":"Alle löschen","it":"Cancella tutto","zh":"清空","ja":"すべて消去","ko":"모두 지우기","ru":"Очистить всё","ar":"مسح الكل","id":"Hapus semua","tr":"Tümünü sil"},
  bpAdd: {"es":"Agregar","en":"Add","pt":"Adicionar","fr":"Ajouter","de":"Hinzufügen","it":"Aggiungi","zh":"添加","ja":"追加","ko":"추가","ru":"Добавить","ar":"إضافة","id":"Tambah","tr":"Ekle"},
  bpEmptySteps: {"es":"Agrega lugares para armar tu plan.","en":"Add places to build your plan.","pt":"Adicione lugares para montar seu plano.","fr":"Ajoute des lieux pour créer ton plan.","de":"Füge Orte hinzu, um deinen Plan zu erstellen.","it":"Aggiungi posti per creare il tuo piano.","zh":"添加地点来制定你的计划。","ja":"場所を追加してプランを作りましょう。","ko":"장소를 추가해 플랜을 만들어요.","ru":"Добавьте места, чтобы составить план.","ar":"أضف أماكن لبناء خطتك.","id":"Tambahkan tempat untuk menyusun rencanamu.","tr":"Planını oluşturmak için mekan ekle."},
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
  daTitle: {"es":"¿Necesitas un descanso?","en":"Need a break?","pt":"Precisa de uma pausa?","fr":"Besoin d'une pause ?","de":"Brauchst du eine Pause?","it":"Ti serve una pausa?","zh":"需要休息一下吗？","ja":"少し休みますか？","ko":"잠시 쉬어갈까요?","ru":"Нужен перерыв?","ar":"تحتاج إلى استراحة؟","id":"Butuh istirahat?","tr":"Mola mı lazım?"},
  daDesc: {"es":"Tómate el tiempo que necesites. Pausa tu cuenta y vuelve cuando quieras.","en":"Take all the time you need. Pause your account and come back when you're ready.","pt":"Leve o tempo que precisar. Pause sua conta e volte quando quiser.","fr":"Prends le temps qu'il te faut. Mets ton compte en pause et reviens quand tu veux.","de":"Lass dir Zeit. Pausiere dein Konto und komm zurück, wenn du bereit bist.","it":"Prenditi il tempo che ti serve. Metti in pausa l'account e torna quando vuoi.","zh":"慢慢来。暂停账户，准备好了再回来。","ja":"焦らなくて大丈夫。アカウントを一時停止して、いつでも戻ってきてください。","ko":"필요한 만큼 쉬어요. 계정을 일시 정지하고 준비되면 돌아오세요.","ru":"Не торопитесь. Поставьте аккаунт на паузу и вернитесь, когда будете готовы.","ar":"خذ وقتك. أوقف حسابك مؤقتاً وعد عندما تكون مستعداً.","id":"Santai saja. Jeda akunmu dan kembali kapan pun kamu siap.","tr":"Acele etme. Hesabını duraklat ve hazır olduğunda geri dön."},
  daWarning: {"es":"En pausa, tu perfil se oculta de los demás, pero no se elimina por completo.","en":"When paused, your profile is hidden from others, but it's not completely deleted.","pt":"Em pausa, seu perfil fica oculto dos outros, mas não é totalmente excluído.","fr":"En pause, ton profil est masqué aux autres, mais pas totalement supprimé.","de":"Pausiert ist dein Profil für andere verborgen, aber nicht vollständig gelöscht.","it":"In pausa, il tuo profilo è nascosto agli altri, ma non viene eliminato del tutto.","zh":"暂停后，你的资料对他人隐藏，但不会被完全删除。","ja":"一時停止中はプロフィールが非表示になりますが、完全には削除されません。","ko":"일시 정지하면 프로필이 다른 사람에게 숨겨지지만 완전히 삭제되지는 않아요.","ru":"На паузе профиль скрыт от других, но не удаляется полностью.","ar":"عند الإيقاف المؤقت، يُخفى ملفك عن الآخرين لكنه لا يُحذف بالكامل.","id":"Saat dijeda, profilmu disembunyikan dari orang lain, tapi tidak dihapus sepenuhnya.","tr":"Duraklatıldığında profilin başkalarından gizlenir ama tamamen silinmez."},
  daPause: {"es":"Pausar cuenta","en":"Pause account","pt":"Pausar conta","fr":"Mettre en pause","de":"Konto pausieren","it":"Metti in pausa","zh":"暂停账户","ja":"アカウントを一時停止","ko":"계정 일시정지","ru":"Поставить на паузу","ar":"إيقاف الحساب مؤقتاً","id":"Jeda akun","tr":"Hesabı duraklat"},
  daDelete: {"es":"Eliminar cuenta","en":"Delete account","pt":"Excluir conta","fr":"Supprimer le compte","de":"Konto löschen","it":"Elimina account","zh":"删除账户","ja":"アカウントを削除","ko":"계정 삭제","ru":"Удалить аккаунт","ar":"حذف الحساب","id":"Hapus akun","tr":"Hesabı sil"},
  daConfirmDesc: {"es":"Antes de irte, considera lo que perderás. Tu cuenta se eliminará inmediata y permanentemente, y no se puede deshacer.","en":"Before you go, please consider what you'll lose. Your account will be deleted immediately and permanently — this cannot be undone.","pt":"Antes de sair, considere o que vai perder. Sua conta será excluída imediata e permanentemente, e não pode ser desfeita.","fr":"Avant de partir, pense à ce que tu perdras. Ton compte sera supprimé immédiatement et définitivement — c'est irréversible.","de":"Bevor du gehst, bedenke, was du verlierst. Dein Konto wird sofort und dauerhaft gelöscht — das kann nicht rückgängig gemacht werden.","it":"Prima di andare, considera cosa perderai. Il tuo account verrà eliminato immediatamente e definitivamente — azione irreversibile.","zh":"在离开之前，请考虑你将失去什么。你的账户将被立即永久删除，且无法撤销。","ja":"退会する前に、失うものをご確認ください。アカウントは直ちに完全に削除され、取り消せません。","ko":"떠나기 전에 잃게 될 것을 생각해 보세요. 계정은 즉시 영구적으로 삭제되며 되돌릴 수 없어요.","ru":"Прежде чем уйти, подумайте, что вы потеряете. Ваш аккаунт будет удалён немедленно и навсегда — отменить нельзя.","ar":"قبل أن تغادر، فكّر فيما ستفقده. سيُحذف حسابك فوراً وبشكل دائم، ولا يمكن التراجع عن ذلك.","id":"Sebelum pergi, pertimbangkan apa yang akan hilang. Akunmu akan dihapus segera dan permanen — tidak dapat dibatalkan.","tr":"Gitmeden önce neleri kaybedeceğini düşün. Hesabın anında ve kalıcı olarak silinecek — bu işlem geri alınamaz."},
  daLoseTitle: {"es":"Qué perderás:","en":"What you'll lose:","pt":"O que você vai perder:","fr":"Ce que tu perdras :","de":"Was du verlierst:","it":"Cosa perderai:","zh":"你将失去：","ja":"失うもの：","ko":"잃게 되는 것:","ru":"Что вы потеряете:","ar":"ما ستفقده:","id":"Yang akan hilang:","tr":"Kaybedeceklerin:"},
  daLose1: {"es":"Todos tus matches y conversaciones","en":"All your matches and conversations","pt":"Todos os seus matches e conversas","fr":"Tous tes matchs et conversations","de":"Alle deine Matches und Unterhaltungen","it":"Tutti i tuoi match e le conversazioni","zh":"你所有的匹配和对话","ja":"すべてのマッチと会話","ko":"모든 매치와 대화","ru":"Все ваши пары и переписки","ar":"كل توافقاتك ومحادثاتك","id":"Semua match dan percakapanmu","tr":"Tüm eşleşmelerin ve sohbetlerin"},
  daLose2: {"es":"Tu historial de mensajes","en":"Your message history","pt":"Seu histórico de mensagens","fr":"Ton historique de messages","de":"Dein Nachrichtenverlauf","it":"La cronologia dei messaggi","zh":"你的消息记录","ja":"メッセージ履歴","ko":"메시지 기록","ru":"История сообщений","ar":"سجل رسائلك","id":"Riwayat pesanmu","tr":"Mesaj geçmişin"},
  daLose3: {"es":"Tus fotos e información de perfil","en":"Your photos and profile information","pt":"Suas fotos e informações de perfil","fr":"Tes photos et infos de profil","de":"Deine Fotos und Profilinformationen","it":"Le tue foto e le informazioni del profilo","zh":"你的照片和个人资料信息","ja":"写真とプロフィール情報","ko":"사진과 프로필 정보","ru":"Ваши фото и данные профиля","ar":"صورك ومعلومات ملفك","id":"Foto dan informasi profilmu","tr":"Fotoğrafların ve profil bilgilerin"},
  daTypeLabel: {"es":"Escribe DELETE para confirmar","en":"Type DELETE to confirm","pt":"Digite DELETE para confirmar","fr":"Tape DELETE pour confirmer","de":"Gib DELETE ein, um zu bestätigen","it":"Digita DELETE per confermare","zh":"输入 DELETE 以确认","ja":"確認のため DELETE と入力","ko":"확인하려면 DELETE 입력","ru":"Введите DELETE для подтверждения","ar":"اكتب DELETE للتأكيد","id":"Ketik DELETE untuk konfirmasi","tr":"Onaylamak için DELETE yaz"},
  daDeleteBtn: {"es":"Eliminar mi cuenta","en":"Delete my account","pt":"Excluir minha conta","fr":"Supprimer mon compte","de":"Mein Konto löschen","it":"Elimina il mio account","zh":"删除我的账户","ja":"アカウントを削除する","ko":"내 계정 삭제","ru":"Удалить мой аккаунт","ar":"حذف حسابي","id":"Hapus akunku","tr":"Hesabımı sil"},
  // Reactivation (paused account re-login) — same copy as iOS reactivate-account-* / Android reactivate_question.
  raTitle: {"es":"¿Quieres reactivar tu cuenta?","en":"Reactivate your account?","pt":"Quer reativar sua conta?","fr":"Réactiver ton compte ?","de":"Konto reaktivieren?","it":"Vuoi riattivare il tuo account?","zh":"要重新激活你的账户吗？","ja":"アカウントを再開しますか？","ko":"계정을 다시 활성화할까요?","ru":"Восстановить аккаунт?","ar":"هل تريد إعادة تفعيل حسابك؟","id":"Aktifkan kembali akunmu?","tr":"Hesabını yeniden etkinleştir?"},
  raDesc: {"es":"Al continuar, tu perfil será visible nuevamente.","en":"By continuing, your profile will be visible again.","pt":"Ao continuar, seu perfil ficará visível novamente.","fr":"En continuant, ton profil sera de nouveau visible.","de":"Wenn du fortfährst, ist dein Profil wieder sichtbar.","it":"Continuando, il tuo profilo tornerà visibile.","zh":"继续后，你的资料将重新可见。","ja":"続けると、プロフィールが再び表示されます。","ko":"계속하면 프로필이 다시 표시됩니다.","ru":"Если продолжить, ваш профиль снова станет видимым.","ar":"بالمتابعة، سيصبح ملفك مرئياً مرة أخرى.","id":"Dengan melanjutkan, profilmu akan terlihat lagi.","tr":"Devam edersen profilin tekrar görünür olacak."},
  raEnable: {"es":"Habilitar cuenta","en":"Enable account","pt":"Ativar conta","fr":"Activer le compte","de":"Konto aktivieren","it":"Attiva account","zh":"启用账户","ja":"アカウントを有効にする","ko":"계정 활성화","ru":"Включить аккаунт","ar":"تفعيل الحساب","id":"Aktifkan akun","tr":"Hesabı etkinleştir"},
  raError: {"es":"Error al reactivar la cuenta. Intenta de nuevo.","en":"Couldn't reactivate your account. Please try again.","pt":"Erro ao reativar a conta. Tente novamente.","fr":"Impossible de réactiver le compte. Réessaie.","de":"Konto konnte nicht reaktiviert werden. Bitte erneut versuchen.","it":"Impossibile riattivare l'account. Riprova.","zh":"无法重新激活账户，请重试。","ja":"アカウントを再開できませんでした。もう一度お試しください。","ko":"계정을 다시 활성화하지 못했어요. 다시 시도해 주세요.","ru":"Не удалось восстановить аккаунт. Попробуйте снова.","ar":"تعذّر إعادة تفعيل الحساب. حاول مرة أخرى.","id":"Gagal mengaktifkan kembali akun. Coba lagi.","tr":"Hesap yeniden etkinleştirilemedi. Tekrar dene."},
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
  journeyLevelWord: {"es":"Nivel","en":"Level","pt":"Nível","fr":"Niveau","de":"Level","it":"Livello","zh":"等级","ja":"レベル","ko":"레벨","ru":"Уровень","ar":"المستوى","id":"Level","tr":"Seviye"},
  journeyKeepGoing: {"es":"Sigue avanzando para subir de nivel","en":"Keep going to level up","pt":"Continue para subir de nível","fr":"Continue pour monter de niveau","de":"Mach weiter, um aufzusteigen","it":"Continua per salire di livello","zh":"继续努力升级","ja":"続けてレベルアップしよう","ko":"계속해서 레벨을 올리세요","ru":"Продолжай, чтобы повысить уровень","ar":"واصل للارتقاء بالمستوى","id":"Terus lanjut untuk naik level","tr":"Seviye atlamak için devam et"},
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
  // R160 "Con ganas de salir esta semana" — weekly ready-to-meet toggle + badge (13 languages)
  verifiedBadge: {"es":"Verificado","en":"Verified","pt":"Verificado","fr":"Vérifié","de":"Verifiziert","it":"Verificato","zh":"已验证","ja":"認証済み","ko":"인증됨","ru":"Верифицирован","ar":"موثّق","id":"Terverifikasi","tr":"Doğrulanmış"},
  readyTitle: {"es":"✨ Con ganas de salir esta semana","en":"✨ Up for going out this week","pt":"✨ A fim de sair esta semana","fr":"✨ Envie de sortir cette semaine","de":"✨ Diese Woche Lust auszugehen","it":"✨ Voglia di uscire questa settimana","zh":"✨ 本周想出去约会","ja":"✨ 今週は出かけたい気分","ko":"✨ 이번 주에 만나고 싶어요","ru":"✨ Хочу встретиться на этой неделе","ar":"✨ متحمس للخروج هذا الأسبوع","id":"✨ Ingin jalan minggu ini","tr":"✨ Bu hafta çıkmaya hazırım"},
  readyHint: {"es":"Se muestra en tu perfil y expira el domingo","en":"Shown on your profile — expires on Sunday","pt":"Aparece no seu perfil e expira no domingo","fr":"Affiché sur ton profil — expire dimanche","de":"Wird in deinem Profil angezeigt und läuft am Sonntag ab","it":"Appare sul tuo profilo e scade domenica","zh":"会显示在你的资料上，周日到期","ja":"プロフィールに表示され、日曜日に期限切れになります","ko":"프로필에 표시되며 일요일에 만료돼요","ru":"Показывается в профиле и истекает в воскресенье","ar":"يظهر في ملفك الشخصي وينتهي يوم الأحد","id":"Ditampilkan di profilmu dan berakhir hari Minggu","tr":"Profilinde gösterilir, pazar günü sona erer"},
  readyBadge: {"es":"✨ Con ganas de salir","en":"✨ Up for going out","pt":"✨ A fim de sair","fr":"✨ Envie de sortir","de":"✨ Lust auszugehen","it":"✨ Voglia di uscire","zh":"✨ 想出去约会","ja":"✨ 出かけたい気分","ko":"✨ 만나고 싶어요","ru":"✨ Хочу встретиться","ar":"✨ متحمس للخروج","id":"✨ Ingin jalan","tr":"✨ Çıkmaya hazır"},
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

// Store URLs are loaded from Firebase Remote Config (store_url_ios / store_url_android) at runtime.
// These constants are kept as fallbacks in case Remote Config is unavailable.
const STORE_IOS_FALLBACK = 'https://apps.apple.com/app/id6470783901';
const STORE_ANDROID_FALLBACK = 'https://play.google.com/store/apps/details?id=com.bimbask.blacksugar21';

// Date-spot category labels (iOS category-* parity) — 13 languages.
const PLACE_CAT_LABELS: Record<string, Record<string, string>> = {
  cafe: {es:'Café',en:'Café',pt:'Café',fr:'Café',de:'Café',it:'Caffè',zh:'咖啡',ja:'カフェ',ko:'카페',ru:'Кафе',ar:'مقهى',id:'Kafe',tr:'Kafe'},
  restaurant: {es:'Restaurante',en:'Restaurant',pt:'Restaurante',fr:'Restaurant',de:'Restaurant',it:'Ristorante',zh:'餐厅',ja:'レストラン',ko:'레스토랑',ru:'Ресторан',ar:'مطعم',id:'Restoran',tr:'Restoran'},
  bar: {es:'Bar',en:'Bar',pt:'Bar',fr:'Bar',de:'Bar',it:'Bar',zh:'酒吧',ja:'バー',ko:'바',ru:'Бар',ar:'بار',id:'Bar',tr:'Bar'},
  night_club: {es:'Discoteca',en:'Club',pt:'Balada',fr:'Club',de:'Club',it:'Discoteca',zh:'夜店',ja:'クラブ',ko:'클럽',ru:'Клуб',ar:'نادٍ ليلي',id:'Klub',tr:'Kulüp'},
  movie_theater: {es:'Cine',en:'Cinema',pt:'Cinema',fr:'Cinéma',de:'Kino',it:'Cinema',zh:'电影院',ja:'映画館',ko:'영화관',ru:'Кино',ar:'سينما',id:'Bioskop',tr:'Sinema'},
  park: {es:'Parque',en:'Park',pt:'Parque',fr:'Parc',de:'Park',it:'Parco',zh:'公园',ja:'公園',ko:'공원',ru:'Парк',ar:'حديقة',id:'Taman',tr:'Park'},
  museum: {es:'Museo',en:'Museum',pt:'Museu',fr:'Musée',de:'Museum',it:'Museo',zh:'博物馆',ja:'博物館',ko:'박물관',ru:'Музей',ar:'متحف',id:'Museum',tr:'Müze'},
  bowling_alley: {es:'Bolos',en:'Bowling',pt:'Boliche',fr:'Bowling',de:'Bowling',it:'Bowling',zh:'保龄球',ja:'ボウリング',ko:'볼링',ru:'Боулинг',ar:'بولينغ',id:'Boling',tr:'Bowling'},
  art_gallery: {es:'Galería',en:'Gallery',pt:'Galeria',fr:'Galerie',de:'Galerie',it:'Galleria',zh:'画廊',ja:'ギャラリー',ko:'갤러리',ru:'Галерея',ar:'معرض فني',id:'Galeri',tr:'Galeri'},
  bakery: {es:'Pastelería',en:'Bakery',pt:'Padaria',fr:'Boulangerie',de:'Bäckerei',it:'Pasticceria',zh:'烘焙店',ja:'ベーカリー',ko:'베이커리',ru:'Пекарня',ar:'مخبز',id:'Toko roti',tr:'Fırın'},
  shopping_mall: {es:'Centro comercial',en:'Mall',pt:'Shopping',fr:'Centre commercial',de:'Einkaufszentrum',it:'Centro commerciale',zh:'商场',ja:'モール',ko:'쇼핑몰',ru:'ТЦ',ar:'مركز تسوق',id:'Mal',tr:'AVM'},
  spa: {es:'Spa',en:'Spa',pt:'Spa',fr:'Spa',de:'Spa',it:'Spa',zh:'水疗',ja:'スパ',ko:'스파',ru:'Спа',ar:'سبا',id:'Spa',tr:'Spa'},
  aquarium: {es:'Acuario',en:'Aquarium',pt:'Aquário',fr:'Aquarium',de:'Aquarium',it:'Acquario',zh:'水族馆',ja:'水族館',ko:'아쿠아리움',ru:'Аквариум',ar:'حوض أسماك',id:'Akuarium',tr:'Akvaryum'},
  zoo: {es:'Zoológico',en:'Zoo',pt:'Zoológico',fr:'Zoo',de:'Zoo',it:'Zoo',zh:'动物园',ja:'動物園',ko:'동물원',ru:'Зоопарк',ar:'حديقة حيوان',id:'Kebun binatang',tr:'Hayvanat bahçesi'},
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CoachWidgetComponent, WardrobePanelComponent, ShellNavIconComponent, UiButtonComponent, UiOptionComponent, UiInputComponent, UiSkeletonComponent],
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent implements OnDestroy {
  private isBrowser: boolean;
  readonly section = signal<Section>('coach');
  // R151: wardrobe sub-view inside the coach section (parity with the apps'
  // wardrobe entry in the coach top bar). Signed-in only — the toggle button
  // is hidden for anonymous visitors.
  readonly showWardrobe = signal(false);
  // R155: RC `wardrobe_enabled` kill-switch (simplicity pass, default hidden). Loaded once.
  readonly wardrobeEnabled = signal(false);
  // R164: legacy swipe Discover tab hidden by default (RC `discovery_tab_enabled`) — coach matchmaker replaces it.
  readonly discoveryTabEnabled = signal(false);
  readonly visibleNavItems = computed(() => this.discoveryTabEnabled() ? this.navItems : this.navItems.filter((it) => it.key !== 'discovery'));
  readonly showConfirm = signal(false);
  // Discovery feed state (real feed via getDiscoveryFeed, like/pass via recordSwipe)
  readonly discoProfiles = signal<any[]>([]);
  readonly discoIdx = signal(0);
  readonly discoLoading = signal(false);
  readonly discoLoaded = signal(false);
  readonly discoError = signal(false);
  readonly chatError = signal('');
  // "Tus 3 del día" (getDailyPicks CF) — stable all day server-side; fetched once per session.
  readonly dailyPicks = signal<any[]>([]);
  readonly picksLoading = signal(false);
  private picksFetched = false;
  private async loadDailyPicks() {
    if (this.picksFetched || !this.firebase.currentUser() || !this.hasLocation()) return;
    this.picksFetched = true;   // once per session — the backend caches per day anyway
    this.picksLoading.set(true);
    try {
      const res = await this.firebase.getDailyPicks(this.lang());
      this.dailyPicks.set(res?.success && Array.isArray(res.picks) ? res.picks.slice(0, 3) : []);
    } catch { this.dailyPicks.set([]); }   // error → strip hides entirely
    finally { this.picksLoading.set(false); }
  }
  picksKm(n: number): string { return this.s('dailyPicksKm').replace('{n}', String(Math.round(n))); }
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
      this.loadDailyPicks();          // location just became available → picks can load now
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
  /** uid → first-photo download URL for the matches/chat list avatars (iOS pictures.first parity). */
  readonly matchPhotos = signal<Record<string, string>>({});
  matchPhoto(uid: string): string { return this.matchPhotos()[uid] || ''; }
  /** uid → true once its avatar <img> has decoded (so we can show an elegant skeleton until then). */
  readonly matchPhotoReady = signal<Record<string, boolean>>({});
  matchPhotoReady_(uid: string): boolean { return !!this.matchPhotoReady()[uid]; }
  onMatchAvatarLoad(uid: string) { this.matchPhotoReady.update((m) => ({ ...m, [uid]: true })); }
  /** uid → true once getUserBasic has resolved (name + photo known). Until then we show ONLY the
   *  skeleton — never the "…" name placeholder — so the avatar doesn't flash three dots. */
  readonly matchBasicReady = signal<Record<string, boolean>>({});
  matchBasicReady_(uid: string): boolean { return !!this.matchBasicReady()[uid]; }
  /** First letter of the match name, or "?" — never the "…" loading placeholder. */
  matchInitial(uid: string): string { return ((this.matchNames()[uid] || '').charAt(0) || '?').toUpperCase(); }
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
  // AI Coach icebreakers in an empty chat (iOS ChatView Wingman parity) — tappable openers.
  readonly icebreakers = signal<{ message: string; emoji?: string }[]>([]);
  readonly icebreakersLoading = signal(false);
  private icebreakerMatch = '';
  private loadIcebreakers(match: any) {
    if (!match?.otherUid) { this.icebreakers.set([]); return; }
    this.icebreakerMatch = match.id;
    this.icebreakers.set([]);
    this.icebreakersLoading.set(true);
    this.firebase.generateIcebreakers(match.otherUid, this.lang())
      .then((list) => { if (this.icebreakerMatch === match.id) this.icebreakers.set(list); })
      .finally(() => { if (this.icebreakerMatch === match.id) this.icebreakersLoading.set(false); });
  }
  /** Tap an icebreaker → drop it in the composer so the user can send (or tweak) it. */
  useIcebreaker(text: string) { this.chatText = text; }
  // AI Coach SMART REPLIES (iOS SmartReplyChipsView parity): when the OTHER person's message is the
  // latest, auto-suggest up to 3 replies + an engagement tip above the composer. Tap → fill composer.
  readonly smartReplies = signal<string[]>([]);
  readonly smartReplyTip = signal('');
  readonly smartRepliesLoading = signal(false);
  private smartReplyFor = '';        // message id we fetched/are fetching for
  private smartReplyDismissed = '';  // message id the user dismissed (don't re-suggest)
  private async maybeFetchSmartReplies(matchId: string, lastMsg: any) {
    const id = lastMsg?.id || '';
    const text = String(lastMsg?.message || '').trim();
    if (!id || !text || id === this.smartReplyFor || id === this.smartReplyDismissed) return;
    if (lastMsg.type && lastMsg.type !== 'text') return; // only plain-text incoming messages
    this.smartReplyFor = id;
    this.smartReplies.set([]); this.smartReplyTip.set(''); this.smartRepliesLoading.set(true);
    const r = await this.firebase.generateSmartReply(matchId, text, this.lang());
    if (this.smartReplyFor === id) { this.smartReplies.set(r.replies); this.smartReplyTip.set(r.tip); }
    this.smartRepliesLoading.set(false);
  }
  useSmartReply(text: string) { this.chatText = text; this.dismissSmartReplies(); }
  dismissSmartReplies() { this.smartReplyDismissed = this.smartReplyFor; this.smartReplies.set([]); this.smartReplyTip.set(''); this.smartRepliesLoading.set(false); }
  private resetSmartReplies() { this.smartReplyFor = ''; this.smartReplyDismissed = ''; this.smartReplies.set([]); this.smartReplyTip.set(''); this.smartRepliesLoading.set(false); }
  // AI Coach REAL-TIME INSIGHTS (iOS CoachInsightsBanner parity): chemistry score/trend + tips +
  // a suggested action, auto-fetched (cooldown) for an ongoing conversation; expandable + dismissible.
  readonly coachInsights = signal<{ chemistryScore: number; chemistryTrend: string; engagementLevel: string; preDateDetected: boolean; tips: { text: string; type: string; icon: string }[]; suggestedAction: { type: string; text: string } | null } | null>(null);
  readonly coachInsightsLoading = signal(false);
  readonly coachInsightsExpanded = signal(false);
  private coachInsightsFor = '';
  private coachInsightsDismissed = '';
  private lastCoachFetch = 0;
  private coachInsightsAutoTimer: ReturnType<typeof setTimeout> | null = null;
  // Dynamic-chat UX: an ignored info card is a stale fixture, not a message — it self-hides
  // instead of camping over the conversation. Engaging with it (expand/use) cancels the timer;
  // it can still resurface on the next natural tips refresh (45s cooldown above).
  private static readonly COACH_INSIGHTS_AUTO_HIDE_MS = 16000;
  private resetCoachInsights() {
    this.coachInsights.set(null); this.coachInsightsLoading.set(false); this.coachInsightsExpanded.set(false);
    this.coachInsightsFor = ''; this.coachInsightsDismissed = ''; this.lastCoachFetch = 0;
    if (this.coachInsightsAutoTimer) { clearTimeout(this.coachInsightsAutoTimer); this.coachInsightsAutoTimer = null; }
  }
  private async maybeFetchCoachInsights(matchId: string) {
    if (!matchId || matchId === this.coachInsightsDismissed) return;
    const now = Date.now();
    if (this.coachInsightsFor === matchId && now - this.lastCoachFetch < 45000) return; // iOS-style cooldown
    this.lastCoachFetch = now; this.coachInsightsFor = matchId;
    this.coachInsightsLoading.set(true);
    const r = await this.firebase.getRealtimeCoachTips(matchId, this.lang());
    if (this.coachInsightsFor === matchId && r && r.tips.length) {
      this.coachInsights.set(r);
      this.armCoachInsightsAutoHide();
    }
    this.coachInsightsLoading.set(false);
  }
  private armCoachInsightsAutoHide() {
    if (this.coachInsightsAutoTimer) clearTimeout(this.coachInsightsAutoTimer);
    this.coachInsightsAutoTimer = setTimeout(() => {
      // Only auto-hide if the user never engaged (expanding = "I'm reading this now").
      if (!this.coachInsightsExpanded()) { this.coachInsights.set(null); }
      this.coachInsightsAutoTimer = null;
    }, AppShellComponent.COACH_INSIGHTS_AUTO_HIDE_MS);
  }
  toggleCoachInsights() {
    this.coachInsightsExpanded.update((v) => !v);
    // Engaged with it → stop the countdown; a manual ✕ is now how it goes away.
    if (this.coachInsightsExpanded() && this.coachInsightsAutoTimer) { clearTimeout(this.coachInsightsAutoTimer); this.coachInsightsAutoTimer = null; }
  }
  dismissCoachInsights() {
    this.coachInsightsDismissed = this.selectedMatch()?.id || ''; this.coachInsights.set(null); this.coachInsightsExpanded.set(false);
    if (this.coachInsightsAutoTimer) { clearTimeout(this.coachInsightsAutoTimer); this.coachInsightsAutoTimer = null; }
  }
  useCoachAction(text: string) {
    this.chatText = text;
    // Using the suggested action IS engagement — cancel the auto-hide countdown.
    if (this.coachInsightsAutoTimer) { clearTimeout(this.coachInsightsAutoTimer); this.coachInsightsAutoTimer = null; }
  }
  // ── "Pregunta del día" (blind daily question, getDailyQuestion/answerDailyQuestion CFs) ────────
  // Loaded ONCE per matchId per session (cache map). Fetch failure → dqState=null → card hidden;
  // the daily question NEVER blocks the chat. ✕ collapses per session; the ✨ chip re-expands.
  readonly dqState = signal<any | null>(null);
  readonly dqLoading = signal(false);
  readonly dqSubmitting = signal(false);
  readonly dqError = signal(false);
  readonly dqCollapsed = signal<ReadonlySet<string>>(new Set<string>());
  dqDraft = '';
  private dqCache = new Map<string, any | null>();
  private dqFor = '';
  private loadDailyQuestion(matchId: string) {
    this.dqFor = matchId;
    this.dqError.set(false); this.dqSubmitting.set(false); this.dqDraft = '';
    if (this.dqCache.has(matchId)) { this.dqState.set(this.dqCache.get(matchId) ?? null); this.dqLoading.set(false); return; }
    this.dqState.set(null);
    this.dqLoading.set(true);
    this.firebase.getDailyQuestion(matchId, this.lang())
      .then((v) => { this.dqCache.set(matchId, v); if (this.dqFor === matchId) this.dqState.set(v); })
      .catch(() => { this.dqCache.set(matchId, null); })   // hidden — never blocks the chat
      .finally(() => { if (this.dqFor === matchId) this.dqLoading.set(false); });
  }
  /** My answer — pre-reveal it comes as myAnswer; post-reveal it's in answers[] by uid. */
  dqMy(): string {
    const q = this.dqState(); if (!q) return '';
    if (q.myAnswer) return String(q.myAnswer);
    const a = (Array.isArray(q.answers) ? q.answers : []).find((x: any) => x?.uid === this.myUid());
    return a?.answer ? String(a.answer) : '';
  }
  /** The match's answer (revealed only). */
  dqOther(): string {
    const q = this.dqState();
    const a = (Array.isArray(q?.answers) ? q.answers : []).find((x: any) => x?.uid && x.uid !== this.myUid());
    return a?.answer ? String(a.answer) : '';
  }
  /** Label for the match's answer: their name if resolved, else a neutral "Match". */
  dqOtherLabel(uid: string): string { return this.matchNames()[uid] || 'Match'; }
  async submitDailyAnswer() {
    const m = this.selectedMatch(); const q = this.dqState();
    const t = this.dqDraft.trim();
    if (!m || !q || !t || this.dqSubmitting()) return;
    this.dqSubmitting.set(true); this.dqError.set(false);
    try {
      const v = await this.firebase.answerDailyQuestion(m.id, q.date, t, this.lang());
      this.dqCache.set(m.id, v);
      if (this.selectedMatch()?.id === m.id) { this.dqState.set(v); this.dqDraft = ''; }
      this.track('daily_question_answered');
    } catch { if (this.selectedMatch()?.id === m.id) this.dqError.set(true); }  // inline error + retry (draft kept)
    finally { this.dqSubmitting.set(false); }
  }
  dqIsCollapsed(): boolean { const m = this.selectedMatch(); return !!m && this.dqCollapsed().has(m.id); }
  dqCollapse() {
    const m = this.selectedMatch(); if (!m) return;
    this.dqCollapsed.update((s) => { const n = new Set(s); n.add(m.id); return n; });
  }
  dqExpand() {
    const m = this.selectedMatch(); if (!m) return;
    this.dqCollapsed.update((s) => { const n = new Set(s); n.delete(m.id); return n; });
  }
  // ── R161 "La segunda opinión" (one-tap bestie link + zero-click verdict chip) ──────────────────
  // ONE tap: 👀 → busy → createSecondOpinionLink → native share sheet (or clipboard + toast).
  // Verdicts arrive at users/{uid}/secondOpinionResults via a session-long listener; the newest
  // result for the OPEN chat renders as a slim chip above the thread, dismissible per session.
  readonly soBusy = signal(false);
  readonly soToast = signal('');
  readonly soToastUrl = signal('');   // clipboard blocked → the URL itself, selectable in the toast
  readonly soResults = signal<any[]>([]);
  readonly soDismissed = signal<ReadonlySet<string>>(new Set<string>());
  private soUnsub: (() => void) | null = null;
  private soToastT: ReturnType<typeof setTimeout> | null = null;
  /** Newest valid verdict for the OPEN chat (null → no chip). Old/malformed payloads are ignored. */
  readonly soVerdict = computed(() => {
    const m = this.selectedMatch();
    if (!m || this.soDismissed().has(m.id)) return null;
    const rows = this.soResults().filter((r: any) =>
      r?.matchId === m.id && (r.verdict === 'fire' || r.verdict === 'hmm' || r.verdict === 'flag'));
    if (!rows.length) return null;
    return rows.sort((a: any, b: any) =>
      (b.votedAt?.toMillis?.() || 0) - (a.votedAt?.toMillis?.() || 0))[0];  // newest wins
  });
  soVerdictText(v: any): string {
    return this.s(v?.verdict === 'fire' ? 'soBestieFire' : v?.verdict === 'flag' ? 'soBestieFlag' : 'soBestieHmm');
  }
  soDismissVerdict() {
    const m = this.selectedMatch(); if (!m) return;
    this.soDismissed.update((s) => { const n = new Set(s); n.add(m.id); return n; });
  }
  /** THE one-tap ask: create the link → native share sheet, or copy + toast. Double-tap guarded. */
  async askSecondOpinion() {
    const m = this.selectedMatch();
    if (!m || this.soBusy()) return;
    this.soBusy.set(true);
    try {
      const r: any = await this.firebase.createSecondOpinionLink(m.id, this.lang());
      if (r?.success && r.url) {
        this.track('second_opinion_link_created');
        const nav: any = navigator;
        if (typeof nav.share === 'function') {
          try { await nav.share({ url: r.url }); } catch { /* user closed the share sheet — fine */ }
        } else {
          try { await nav.clipboard.writeText(r.url); this.showSoToast(this.s('soCopied')); }
          catch { this.showSoToast(this.s('soAsk'), r.url); }  // clipboard blocked → selectable URL
        }
      } else {
        this.showSoToast(this.s(r?.error === 'rate_limit_exceeded' ? 'soLimit' : 'soErr'));
      }
    } catch (e: any) {
      // HttpsError (auth/membership/resource-exhausted) → localized toast.
      const msg = String(e?.message || e?.code || '');
      this.showSoToast(this.s(/rate.?limit|resource.?exhausted/i.test(msg) ? 'soLimit' : 'soErr'));
    } finally { this.soBusy.set(false); }
  }
  private showSoToast(text: string, url = '') {
    if (this.soToastT) clearTimeout(this.soToastT);
    this.soToast.set(text); this.soToastUrl.set(url);
    // URL fallback stays longer — the user has to select+copy it by hand.
    this.soToastT = setTimeout(() => { this.soToast.set(''); this.soToastUrl.set(''); }, url ? 9000 : 3000);
  }
  // AI Coach DATE-SPOT suggestions (iOS PlaceSuggestionsView parity): a sheet of nearby venues to
  // share into the chat as a place card.
  readonly placeSheetOpen = signal(false);
  readonly placeSuggestions = signal<any[]>([]);
  readonly placesLoading = signal(false);
  readonly placeSending = signal('');
  // iOS PlaceSuggestionsView category carousel — same ids/icons/order.
  readonly placeCats: { id: string; icon: string }[] = [
    { id: 'cafe', icon: '☕' }, { id: 'restaurant', icon: '🍽️' }, { id: 'bar', icon: '🍺' }, { id: 'night_club', icon: '💃' },
    { id: 'movie_theater', icon: '🎬' }, { id: 'park', icon: '🌳' }, { id: 'museum', icon: '🏛️' }, { id: 'bowling_alley', icon: '🎳' },
    { id: 'art_gallery', icon: '🎨' }, { id: 'bakery', icon: '🥐' }, { id: 'shopping_mall', icon: '🛍️' }, { id: 'spa', icon: '💆' },
    { id: 'aquarium', icon: '🐠' }, { id: 'zoo', icon: '🦁' },
  ];
  readonly placeCatSel = signal(''); // '' = all
  placeCatLabel(id: string): string { const m = PLACE_CAT_LABELS[id]; return (m && (m[this.lang()] || m['en'])) || id; }
  async openPlaceSheet() {
    const m = this.selectedMatch(); if (!m) return;
    this.placeSheetOpen.set(true);
    if (this.placeSuggestions().length || this.placesLoading()) return; // already loaded
    this.fetchPlaces();
  }
  selectPlaceCat(id: string) { if (this.placeCatSel() === id || this.placesLoading()) return; this.placeCatSel.set(id); this.fetchPlaces(); }
  readonly placeHasMore = signal(false);
  readonly placeLoadingMore = signal(false);
  private placeLoadCount = 0;
  private async fetchPlaces() {
    const m = this.selectedMatch(); if (!m) return;
    this.placesLoading.set(true); this.placeSuggestions.set([]); this.placeHasMore.set(false); this.placeLoadCount = 0;
    const cat = this.placeCatSel();
    const r = await this.firebase.getDateSuggestions(m.id, this.lang(), cat || undefined, { loadCount: 0 });
    this.placeSuggestions.set(r.suggestions); this.placeHasMore.set(r.hasMore);
    this.placesLoading.set(false);
  }
  /** Infinite scroll: append the next page, excluding already-shown places, until hasMore is false. */
  async loadMorePlaces() {
    const m = this.selectedMatch();
    if (!m || this.placeLoadingMore() || this.placesLoading() || !this.placeHasMore()) return;
    this.placeLoadingMore.set(true);
    this.placeLoadCount += 1;
    const cur = this.placeSuggestions();
    const exclude = cur.map((p: any) => p.placeId || p.id).filter(Boolean);
    const r = await this.firebase.getDateSuggestions(m.id, this.lang(), this.placeCatSel() || undefined, { loadCount: this.placeLoadCount, excludePlaceIds: exclude });
    const seen = new Set(exclude);
    const fresh = r.suggestions.filter((p: any) => !seen.has(p.placeId || p.id));
    if (fresh.length) this.placeSuggestions.set([...cur, ...fresh]);
    this.placeHasMore.set(r.hasMore && fresh.length > 0); // stop if a page returned nothing new
    this.placeLoadingMore.set(false);
  }
  onPlaceScroll(e: Event) {
    const el = e.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) this.loadMorePlaces();
  }
  closePlaceSheet() { this.placeSheetOpen.set(false); this.placeAddMode.set(false); }
  async sendPlace(place: any) {
    if (this.placeAddMode()) { this.addBlueprintStepFromPlace(place); return; } // add to the Date Blueprint instead of chat
    const m = this.selectedMatch(); if (!m || this.placeSending()) return;
    this.placeSending.set(place?.placeId || place?.name || 'x');
    try { await this.firebase.sendPlaceMessage(m.id, place); this.placeSheetOpen.set(false); }
    catch { /* best-effort */ }
    finally { this.placeSending.set(''); }
  }
  placePhoto(place: any): string { return (Array.isArray(place?.photos) && place.photos[0]?.url) ? place.photos[0].url : ''; }
  // AI Coach DATE BLUEPRINT (iOS DateBlueprintSheet parity): a full date plan in a bottom sheet.
  readonly blueprintSheetOpen = signal(false);
  readonly blueprint = signal<any | null>(null);
  readonly blueprintLoading = signal(false);
  readonly blueprintSending = signal(false);
  readonly blueprintDuration = signal<'quick' | 'standard' | 'full'>('standard');
  readonly blueprintDurations: { id: 'quick' | 'standard' | 'full'; icon: string }[] = [
    { id: 'quick', icon: '⚡' }, { id: 'standard', icon: '✨' }, { id: 'full', icon: '🌙' },
  ];
  async openBlueprintSheet() {
    const m = this.selectedMatch(); if (!m) return;
    this.blueprintSheetOpen.set(true);
    if (this.blueprint() || this.blueprintLoading()) return;
    this.fetchBlueprint();
  }
  selectBlueprintDuration(d: 'quick' | 'standard' | 'full') { if (this.blueprintDuration() === d || this.blueprintLoading()) return; this.blueprintDuration.set(d); this.fetchBlueprint(); }
  // Editable steps (iOS DateBlueprintSheet: the AI plan is a suggestion you customize — remove,
  // add places, clear all — before sharing). Seeded from the generated plan, then user-owned.
  readonly blueprintSteps = signal<any[]>([]);
  private async fetchBlueprint() {
    const m = this.selectedMatch(); if (!m) return;
    this.blueprintLoading.set(true); this.blueprint.set(null); this.blueprintSteps.set([]);
    const bp = await this.firebase.generateDateBlueprint(m.id, this.lang(), this.blueprintDuration());
    this.blueprint.set(bp);
    this.blueprintSteps.set(bp && Array.isArray(bp.steps) ? [...bp.steps] : []);
    this.blueprintLoading.set(false);
  }
  removeBlueprintStep(i: number) { this.blueprintSteps.update((arr) => arr.filter((_, idx) => idx !== i)); }
  clearBlueprintSteps() { this.blueprintSteps.set([]); }
  /** "Add a place" → open the place picker on top in ADD mode; tapping a place appends it as a step. */
  addPlaceToBlueprint() { this.placeAddMode.set(true); this.openPlaceSheet(); }
  addBlueprintStepFromPlace(place: any) {
    const step = {
      time: '', duration: '', activity: place?.name || '', placeName: place?.name || '', tip: '',
      place: { name: place?.name || '', address: place?.address || '', rating: place?.rating ?? null, googleMapsUrl: place?.googleMapsUrl || '', photos: Array.isArray(place?.photos) ? place.photos : [], placeId: place?.placeId || place?.id || '' },
      photoUrl: this.placePhoto(place),
    };
    this.blueprintSteps.update((arr) => [...arr, step]);
    this.placeSheetOpen.set(false); this.placeAddMode.set(false); // back to the blueprint sheet
  }
  readonly placeAddMode = signal(false);
  closeBlueprintSheet() { this.blueprintSheetOpen.set(false); }
  async sendBlueprint() {
    const m = this.selectedMatch(); const bp = this.blueprint();
    if (!m || !bp || !this.blueprintSteps().length || this.blueprintSending()) return;
    this.blueprintSending.set(true);
    try { await this.firebase.sendBlueprintMessage(m.id, { ...bp, steps: this.blueprintSteps() }); this.blueprintSheetOpen.set(false); }
    catch { /* best-effort */ }
    finally { this.blueprintSending.set(false); }
  }
  /** A blueprint step's photo (handles both {place:{photos}} and flattened {photoUrl}). */
  stepPhoto(s: any): string { return s?.place?.photos?.[0]?.url || s?.photoUrl || ''; }
  stepPlaceName(s: any): string { return s?.place?.name || s?.placeName || ''; }
  chemColor(score: number): string { return score >= 75 ? 'green' : score >= 50 ? 'gold' : 'red'; }
  trendIcon(t: string): string { return t === 'rising' ? '↗' : t === 'falling' ? '↘' : '→'; }
  private unsubMatches: (() => void) | null = null;
  private unsubMsgs: (() => void) | null = null;
  // iOS tab order: Coach (tab 0) → Discover (tab 1) → Messages (tab 2) → Profile. Homologated.
  readonly navItems: Array<{ key: Section; icon: string }> = [
    { key: 'coach', icon: '✦' },
    { key: 'discovery', icon: '🔥' },
    { key: 'chats', icon: '💬' },
    { key: 'profile', icon: '👤' },
  ];
  // Store links loaded from Remote Config (store_url_ios / store_url_android).
  // Falls back to the known production URLs so the link is never broken on RC timeout.
  readonly storeIos = signal(STORE_IOS_FALLBACK);
  readonly storeAndroid = signal(STORE_ANDROID_FALLBACK);
  /** Returns the platform-appropriate store link (Android/iOS). */
  get storeLink(): string {
    if (this.isBrowser && /android/i.test(navigator.userAgent)) return this.storeAndroid();
    return this.storeIos();
  }

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
    // R161: bestie-verdict listener — started ONCE per signed-in session, torn down on sign-out
    // (and in ngOnDestroy). Zero clicks: verdicts stream in and the chip appears by itself.
    effect(() => {
      const u = this.firebase.currentUser();
      if (u && !this.soUnsub) {
        this.soUnsub = this.firebase.listenSecondOpinions((rows) => this.soResults.set(rows));
      } else if (!u && this.soUnsub) {
        this.soUnsub(); this.soUnsub = null; this.soResults.set([]);
      }
    });
    // Load store links from Remote Config (same source as app.ts and coach-widget).
    this.firebase.getStoreLinks().then((links) => {
      if (links?.ios) this.storeIos.set(links.ios);
      if (links?.android) this.storeAndroid.set(links.android);
    }).catch(() => { /* fallback values already set */ });
    // R155: wardrobe visibility flag (simplicity pass) — hidden unless RC enables it.
    if (this.isBrowser) {
      this.firebase.isWardrobeEnabled().then((on) => this.wardrobeEnabled.set(on)).catch(() => { /* stays hidden */ });
      this.firebase.isDiscoveryTabEnabled().then((on) => {
        this.discoveryTabEnabled.set(on);
        if (!on && this.section() === 'discovery') this.go('coach'); // tab hidden → never strand the user there
      }).catch(() => { /* stays hidden */ });
    }
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
    if (sec === 'discovery') this.loadDailyPicks();   // internally guarded: signed-in + location + once
    if (sec === 'chats' && !this.unsubMatches && this.firebase.currentUser()) this.subscribeMatches();
    if (sec === 'profile' && this.profileComplete()) {
      if (!this.profilePhotos().length) this.loadProfilePhotos();
      if (!this.limitsLoaded()) this.loadProfileLimits();
      if (!this.journey() && !this.journeyLoading()) this.loadJourney();
    }
  }
  // R150 Dating Journey — level badge + XP progress bar (iOS/Android DatingJourneyCard parity).
  readonly journey = signal<{ level: number; progress: number; completenessPct: number } | null>(null);
  readonly journeyLoading = signal(false);
  coachStreak(): number { return (this.firebase.userProfile() as any)?.coachStreakDays ?? 0; }
  journeyCompleteText(pct: number): string {
    const m: Record<string, string> = {
      es: `Perfil ${pct}% completo`, en: `Profile ${pct}% complete`, pt: `Perfil ${pct}% completo`,
      fr: `Profil ${pct}% complété`, de: `Profil zu ${pct}% vollständig`, it: `Profilo ${pct}% completo`,
      zh: `资料完成度 ${pct}%`, ja: `プロフィール ${pct}% 完成`, ko: `프로필 ${pct}% 완성`,
      ru: `Профиль заполнен на ${pct}%`, ar: `اكتمل الملف ${pct}%`, id: `Profil ${pct}% lengkap`, tr: `Profil ${pct}% tamamlandı`,
    };
    return m[this.lang()] ?? m['en'];
  }
  streakText(count: number): string {
    const m: Record<string, string> = {
      es: `🔥 ${count} días de racha`, en: `🔥 ${count} day${count !== 1 ? 's' : ''} streak`, pt: `🔥 ${count} dias seguidos`,
      fr: `🔥 ${count} jours de suite`, de: `🔥 ${count} Tage Streak`, it: `🔥 ${count} giorni di fila`,
      zh: `🔥 连续 ${count} 天`, ja: `🔥 ${count}日連続`, ko: `🔥 ${count}일 연속`,
      ru: `🔥 ${count} дн. подряд`, ar: `🔥 ${count} أيام`, id: `🔥 ${count} hari beruntun`, tr: `🔥 ${count} günlük seri`,
    };
    return m[this.lang()] ?? m['en'];
  }
  private async loadJourney() {
    if (!this.firebase.currentUser() || this.journeyLoading()) return;
    this.journeyLoading.set(true);
    try { this.journey.set(await this.firebase.getDatingJourney(this.lang())); }
    catch { /* noop */ }
    finally { this.journeyLoading.set(false); }
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
  // R160 "Con ganas de salir esta semana" — weekly ready-to-meet toggle (own users doc).
  // State is DERIVED from the userProfile signal (readyToMeetUntil > now), so an expired timestamp
  // renders as OFF and a failed write auto-reverts (the signal only refreshes on success).
  readonly readySaving = signal(false);
  readyOn(): boolean {
    const v: any = (this.firebase.userProfile() as any)?.readyToMeetUntil;
    if (!v) return false;
    const ms = typeof v.toMillis === 'function' ? v.toMillis() : (typeof v.seconds === 'number' ? v.seconds * 1000 : 0);
    return ms > Date.now();
  }
  async toggleReady() {
    if (this.readySaving()) return;                    // double-click guard while in flight
    const next = !this.readyOn();
    this.readySaving.set(true);
    try {
      await this.firebase.setReadyToMeet(next);
      this.track('ready_to_meet_toggle', { on: next });
    } catch { /* write failed → profile signal untouched → switch stays in its previous state */ }
    finally { this.readySaving.set(false); }
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

  // ── Delete account (identical flow to iOS/Android: pause-first, then type-DELETE confirm) ──────
  readonly daOpen = signal(false);          // step 1: "need a break?" (pause vs delete)
  readonly daConfirm = signal(false);       // step 2: type-DELETE confirmation
  readonly daBusy = signal(false);
  daType = '';                              // user-typed confirmation word
  daCanDelete(): boolean { return this.daType.trim().toUpperCase() === 'DELETE'; }
  openDeleteAccount() { this.daType = ''; this.daConfirm.set(false); this.daOpen.set(true); }
  closeDeleteAccount() { if (!this.daBusy()) { this.daOpen.set(false); this.daConfirm.set(false); } }
  async daPauseAccount() {
    if (this.daBusy()) return;
    this.daBusy.set(true);
    try { await this.firebase.pauseAccount(); await this.firebase.signOutUser(); }
    catch { /* noop */ }
    finally { this.daBusy.set(false); if (this.isBrowser) window.location.assign('/'); else this.router.navigate(['/']); }
  }
  async daDeleteAccount() {
    if (this.daBusy() || !this.daCanDelete()) return;
    this.daBusy.set(true);
    try { await this.firebase.deleteAccount(); await this.firebase.signOutUser(); }
    catch { /* noop */ }
    finally { this.daBusy.set(false); if (this.isBrowser) window.location.assign('/'); else this.router.navigate(['/']); }
  }

  // ── Reactivation (paused account re-login) — iOS ReactiveAccountViewModel parity ──────────────
  /** True when the signed-in profile is PAUSED (hidden from discovery). Gates the whole app with the
   *  reactivation screen until the user re-enables (or signs out) — same as iOS/Android. */
  readonly accountPaused = computed(() => {
    const p: any = this.firebase.userProfile();
    return !!p && p.paused === true && !this.firebase.accountDeleted();
  });
  readonly reactivating = signal(false);
  readonly reactivateErr = signal('');
  async reactivateAccount() {
    if (this.reactivating()) return;
    this.reactivating.set(true); this.reactivateErr.set('');
    try { await this.firebase.reactivateAccount(); }      // clears paused → accountPaused() flips false → app shows
    catch { this.reactivateErr.set(this.s('raError')); }
    finally { this.reactivating.set(false); }
  }
  async cancelReactivate() {
    // "Cancelar" → stay paused; leave the app (sign out), like iOS dismissing the reactivation screen.
    try { await this.firebase.signOutUser(); } catch { /* noop */ }
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
  // ── Discovery vertical pager (TikTok-style) ──────────────────────────────────
  // The deck stacks the CURRENT card + the NEXT card directly below it. Advancing slides the whole
  // deck UP by one card-height, so the current rises out the top WHILE the next rises into place at
  // the SAME moment (no "up-then-down" bounce). Swipe UP (or tap ♥) advances; you CANNOT go back —
  // dragging DOWN resists, shows a brief notice, and springs back to where it was.
  readonly deckUp = signal(false);      // advancing: deck animates up one card
  readonly snapping = signal(false);    // instant reset (transition off) after the slide
  readonly cantGoBack = signal(false);  // brief "can't go back" notice on a down-drag attempt
  private cantGoBackT: any = null;
  nextProfile(): any | null {
    const list = this.discoProfiles();
    const i = this.discoIdx() + 1;
    return i < list.length ? list[i] : null;
  }
  nextProfilePhoto(): string | null {
    const p = this.nextProfile();
    return (p && Array.isArray(p.pictures) && p.pictures.length) ? (p.pictures[0]?.url || null) : null;
  }
  deckTransform(): string {
    if (this.deckUp()) return 'translateY(-100%)';
    if (this.dragging()) return `translateY(${this.dragY()}px)`;
    return 'translateY(0)';
  }
  private advance() {
    // Snap with NO transition: deck instantly back to 0 showing the new current + next (the slide
    // already moved the next into view, so there is zero visible downward motion).
    this.snapping.set(true);
    this.deckUp.set(false);
    this.dragY.set(0); this.dragX.set(0); this.swiping.set(null); this.photoIdx.set(0);
    this.discoIdx.update((v) => v + 1);
    if (this.isBrowser) requestAnimationFrame(() => requestAnimationFrame(() => this.snapping.set(false)));
    else this.snapping.set(false);
  }
  onCardDown(e: PointerEvent) {
    if (!this.currentProfile() || this.swiping()) return;
    this.dragging.set(true);
    this.dragStartY = e.clientY;
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* noop */ }
  }
  onCardMove(e: PointerEvent) {
    if (!this.dragging()) return;
    const dy = e.clientY - this.dragStartY;
    if (dy > 6) {
      // Dragging DOWN — going back is not allowed. Resist hard + show the notice.
      this.dragY.set(Math.min(dy * 0.10, 30));
      if (!this.cantGoBack()) this.cantGoBack.set(true);
    } else {
      this.dragY.set(dy); // up follows the finger
    }
  }
  onCardUp() {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (this.dragY() < -this.SWIPE_THRESHOLD) { this.swipe('pass'); return; } // swiped up enough → advance
    this.dragY.set(0);            // springs back to where it was
    if (this.cantGoBack()) { clearTimeout(this.cantGoBackT); this.cantGoBackT = setTimeout(() => this.cantGoBack.set(false), 1400); }
  }
  /** Like / pass → record, then the deck rises one card (current out the top + next into place, together). */
  swipe(action: 'like' | 'pass' | 'superlike') {
    const p = this.currentProfile();
    if (!p || this.swiping()) return;
    this.track('discovery_swipe', { action });
    this.firebase.recordSwipe(p.userId, action).then((matchId) => { if (matchId) this.track('new_match'); }).catch(() => { /* best-effort */ });
    this.swiping.set(action === 'pass' ? 'pass' : 'like');
    this.dragY.set(0);
    this.deckUp.set(true);                       // slide the deck up (≈380ms)
    setTimeout(() => this.advance(), 380);
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
            if (b) {
              this.matchNames.update((m) => ({ ...m, [r.otherUid]: b.name }));
              if (b.photo) this.matchPhotos.update((m) => ({ ...m, [r.otherUid]: b.photo }));
            }
            // Mark resolved either way → avatar now shows the photo (skeleton until <img> decodes) or the letter.
            this.matchBasicReady.update((m) => ({ ...m, [r.otherUid]: true }));
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
    this.loadIcebreakers(match); // AI Coach openers for an empty conversation (shown only when no messages yet)
    this.loadDailyQuestion(match.id); // "Pregunta del día" card (cached once per matchId per session)
    this.resetSmartReplies();
    this.resetCoachInsights();
    this.placeSheetOpen.set(false); this.placeSuggestions.set([]); this.placesLoading.set(false); this.placeCatSel.set('');
    this.blueprintSheetOpen.set(false); this.blueprint.set(null); this.blueprintSteps.set([]); this.blueprintLoading.set(false); this.blueprintDuration.set('standard'); this.placeAddMode.set(false);
    // Live TAIL listener: the latest page only (older pages are cursor-fetched on demand).
    if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; }
    this.unsubMsgs = this.firebase.listenMessages(match.id, AppShellComponent.CHAT_PAGE, (msgs, more) => {
      this.chatTail.set(msgs);
      if (this.chatOlder().length === 0) this.chatHasMore.set(more);  // more older than the first page?
      const last = msgs[msgs.length - 1];
      if (last && last.senderId && last.senderId !== this.myUid()) {
        this.firebase.markMatchRead(match.id);
        this.maybeFetchSmartReplies(match.id, last); // AI Coach smart replies for the incoming message
      }
      if (msgs.length >= 2) this.maybeFetchCoachInsights(match.id); // insights for an ongoing conversation (cooldown-guarded)
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
  /** Total unread chats — red badge on the Chats tab (iOS tab-badge parity). */
  readonly unreadTabCount = computed(() => this.matches().reduce((n, m) => n + (this.isUnread(m) ? 1 : 0), 0));
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

  ngOnDestroy() { if (this.unsubMatches) this.unsubMatches(); if (this.unsubMsgs) this.unsubMsgs(); if (this.soUnsub) { this.soUnsub(); this.soUnsub = null; } if (this.soToastT) clearTimeout(this.soToastT); if (this.firebase.currentUser()) this.firebase.setActiveChat(null); }
}
