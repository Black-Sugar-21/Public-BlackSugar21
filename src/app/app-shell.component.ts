import { Component, ChangeDetectionStrategy, Inject, OnDestroy, PLATFORM_ID, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';
import { ShellNavIconComponent } from './shell-nav-icon.component';
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
  chatSendErr: {"es":"No se pudo enviar el mensaje. Inténtalo de nuevo.","en":"Couldn't send the message. Try again.","pt":"Não foi possível enviar. Tente de novo.","fr":"Échec de l'envoi. Réessaie.","de":"Nachricht konnte nicht gesendet werden. Versuch es erneut.","it":"Invio non riuscito. Riprova.","zh":"消息发送失败，请重试。","ja":"送信できませんでした。もう一度お試しください。","ko":"메시지를 보내지 못했어요. 다시 시도하세요.","ru":"Не удалось отправить. Повторите.","ar":"تعذّر إرسال الرسالة. حاول مجدداً.","id":"Gagal mengirim pesan. Coba lagi.","tr":"Mesaj gönderilemedi. Tekrar dene."},
  discoSignIn: {"es":"Inicia sesión para descubrir personas","en":"Sign in to discover people","pt":"Entre para descobrir pessoas","fr":"Connecte-toi pour découvrir des gens","de":"Melde dich an, um Leute zu entdecken","it":"Accedi per scoprire persone","zh":"登录以发现新朋友","ja":"ログインして人を見つけよう","ko":"로그인하고 사람을 만나보세요","ru":"Войдите, чтобы знакомиться","ar":"سجّل الدخول لاكتشاف أشخاص","id":"Masuk untuk menemukan orang","tr":"İnsanları keşfetmek için giriş yap"},
  chemistry: {"es":"Química","en":"Chemistry","pt":"Química","fr":"Alchimie","de":"Chemie","it":"Affinità","zh":"默契","ja":"相性","ko":"케미","ru":"Химия","ar":"كيمياء","id":"Kimia","tr":"Kimya"},
  near: {"es":"Cerca","en":"Near","pt":"Perto","fr":"Proche","de":"In der Nähe","it":"Vicino","zh":"附近","ja":"近く","ko":"근처","ru":"Рядом","ar":"قريب","id":"Dekat","tr":"Yakın"},
  chatsEmpty: {"es":"Aún no tienes matches. ¡Ve a Descubrir!","en":"No matches yet. Head to Discover!","pt":"Sem matches ainda. Vá em Descobrir!","fr":"Pas encore de matchs. Va dans Découvrir !","de":"Noch keine Matches. Geh zu Entdecken!","it":"Nessun match ancora. Vai su Scopri!","zh":"还没有匹配，去发现页看看！","ja":"まだマッチがありません。発見へ！","ko":"아직 매치가 없어요. 발견으로 가요!","ru":"Пока нет совпадений. Загляните в Поиск!","ar":"لا توجد مطابقات بعد. اذهب إلى اكتشف!","id":"Belum ada match. Ke Jelajah!","tr":"Henüz eşleşme yok. Keşfet'e git!"},
  chatPlaceholder: {"es":"Escribe un mensaje…","en":"Type a message…","pt":"Escreva uma mensagem…","fr":"Écris un message…","de":"Nachricht schreiben…","it":"Scrivi un messaggio…","zh":"输入消息…","ja":"メッセージを入力…","ko":"메시지 입력…","ru":"Напишите сообщение…","ar":"اكتب رسالة…","id":"Tulis pesan…","tr":"Mesaj yaz…"},
  chatStart: {"es":"Inicia la conversación 👋","en":"Start the conversation 👋","pt":"Comece a conversa 👋","fr":"Commence la conversation 👋","de":"Starte das Gespräch 👋","it":"Inizia la conversazione 👋","zh":"开始聊天吧 👋","ja":"会話を始めよう 👋","ko":"대화를 시작해요 👋","ru":"Начните разговор 👋","ar":"ابدأ المحادثة 👋","id":"Mulai obrolan 👋","tr":"Sohbete başla 👋"},
  chatSignIn: {"es":"Inicia sesión para ver tus mensajes","en":"Sign in to see your messages","pt":"Entre para ver suas mensagens","fr":"Connecte-toi pour voir tes messages","de":"Melde dich an, um Nachrichten zu sehen","it":"Accedi per vedere i messaggi","zh":"登录以查看消息","ja":"ログインしてメッセージを見る","ko":"로그인하고 메시지 보기","ru":"Войдите, чтобы видеть сообщения","ar":"سجّل الدخول لعرض رسائلك","id":"Masuk untuk melihat pesan","tr":"Mesajları görmek için giriş yap"},
  // Onboarding (13 languages)
  obWelcome: {"es":"Completa tu perfil","en":"Complete your profile","pt":"Complete seu perfil","fr":"Complète ton profil","de":"Profil vervollständigen","it":"Completa il profilo","zh":"完善你的资料","ja":"プロフィールを完成","ko":"프로필 완성","ru":"Заполните профиль","ar":"أكمل ملفك","id":"Lengkapi profilmu","tr":"Profilini tamamla"},
  obWelcomeSub: {"es":"Unos pasos para que el Coach y tus matches te conozcan.","en":"A few steps so the Coach and your matches know you.","pt":"Alguns passos para o Coach e seus matches te conhecerem.","fr":"Quelques étapes pour que le Coach et tes matchs te connaissent.","de":"Ein paar Schritte, damit Coach und Matches dich kennen.","it":"Pochi passi per farti conoscere dal Coach e dai match.","zh":"几步让教练和匹配的人了解你。","ja":"コーチとマッチがあなたを知るための数ステップ。","ko":"코치와 매치가 당신을 알 수 있도록 몇 단계.","ru":"Несколько шагов, чтобы коуч и совпадения узнали вас.","ar":"خطوات قليلة ليتعرّف عليك المدرّب ومطابقاتك.","id":"Beberapa langkah agar Coach dan match mengenalmu.","tr":"Koç ve eşleşmelerin seni tanıması için birkaç adım."},
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
  obSaveErr: {"es":"No se pudo guardar. Inténtalo de nuevo.","en":"Couldn't save. Please try again.","pt":"Não foi possível salvar. Tente de novo.","fr":"Échec de l'enregistrement. Réessaie.","de":"Speichern fehlgeschlagen. Versuch es erneut.","it":"Salvataggio non riuscito. Riprova.","zh":"保存失败，请重试。","ja":"保存できませんでした。再試行してください。","ko":"저장하지 못했어요. 다시 시도하세요.","ru":"Не удалось сохранить. Повторите.","ar":"تعذّر الحفظ. حاول مجدداً.","id":"Gagal menyimpan. Coba lagi.","tr":"Kaydedilemedi. Tekrar dene."},
  obPhotos: {"es":"Tus fotos","en":"Your photos","pt":"Suas fotos","fr":"Tes photos","de":"Deine Fotos","it":"Le tue foto","zh":"你的照片","ja":"あなたの写真","ko":"사진","ru":"Ваши фото","ar":"صورك","id":"Fotomu","tr":"Fotoğrafların"},
  obPhotoHint: {"es":"Agrega al menos 1 (hasta 6). La 1ª es tu principal.","en":"Add at least 1 (up to 6). The 1st is your main.","pt":"Adicione ao menos 1 (até 6). A 1ª é a principal.","fr":"Ajoute au moins 1 (jusqu'à 6). La 1ʳᵉ est principale.","de":"Mind. 1 (bis 6). Das 1. ist dein Hauptfoto.","it":"Aggiungi almeno 1 (fino a 6). La 1ª è principale.","zh":"至少添加 1 张（最多 6）。第 1 张为主图。","ja":"1枚以上（最大6）。1枚目がメイン。","ko":"최소 1장(최대 6). 첫 번째가 대표.","ru":"Минимум 1 (до 6). Первое — главное.","ar":"أضف صورة واحدة على الأقل (حتى 6). الأولى رئيسية.","id":"Tambah min. 1 (maks 6). Foto ke-1 utama.","tr":"En az 1 (en çok 6). 1.'si ana fotoğraf."},
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
  { id: 'interest_vip_events', t: 'elite', cat: 'social', es: 'Eventos VIP 🎉', en: 'VIP Events 🎉' },
  { id: 'interest_philanthropy', t: 'elite', cat: 'social', es: 'Filantropía ❤️', en: 'Philanthropy ❤️' },
  { id: 'interest_music_concerts', t: 'prime', cat: 'entertainment', es: 'Música y Conciertos 🎵', en: 'Music & Concerts 🎵' },
  { id: 'interest_movies_theater', t: 'both', cat: 'entertainment', es: 'Cine y Teatro 🎬', en: 'Movies & Theater 🎬' },
  { id: 'interest_mentorship_business', t: 'elite', cat: 'professional', es: 'Mentoría y Negocios 💼', en: 'Mentorship & Business 💼' },
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
  imports: [CommonModule, FormsModule, RouterModule, CoachWidgetComponent, ShellNavIconComponent],
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
  async signOut() { this.showConfirm.set(false); try { await this.firebase.signOutUser(); } catch { /* noop */ } this.router.navigate(['/']); }

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
    this.firebase.recordSwipe(p.userId, action).catch(() => { /* best-effort */ });
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
  openChat(match: any) {
    this.selectedMatch.set(match);
    this.chatMsgs.set([]);
    this.chatError.set('');
    if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; }
    this.unsubMsgs = this.firebase.listenMessages(match.id, (msgs) => this.chatMsgs.set(msgs));
  }
  backToList() { this.selectedMatch.set(null); if (this.unsubMsgs) { this.unsubMsgs(); this.unsubMsgs = null; } }
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
    try { await this.firebase.sendMessage(m.id, t); } catch { this.chatText = t; this.chatError.set(this.s('chatSendErr')); }
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
    if (!it) return id;
    return this.lang() === 'es' ? it.es : it.en;
  }
  async epUpdateLocation() {
    if (this.epLocStatus() === 'loading') return;
    this.epLocStatus.set('loading');
    const geo = await this.getGeo();
    if (geo) { this.ep.lat = geo.lat; this.ep.lng = geo.lng; this.epLocStatus.set('done'); }
    else this.epLocStatus.set('error');
  }
  readonly epPhotos = signal<Array<{ name: string; url: string; loaded?: boolean }>>([]);
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
    const files = Array.from(input.files || []);
    input.value = '';
    for (const f of files.slice(0, 9 - this.epPhotos().length)) {
      try { const name = await this.firebase.uploadProfilePhoto(f); this.epPhotos.update((p) => [...p, { name, url: URL.createObjectURL(f), loaded: false }]); }
      catch { this.epError.set(this.s('obPhotoErr')); }
    }
  }
  epRemovePhoto(i: number) { this.epPhotos.update((p) => p.filter((_, idx) => idx !== i)); }
  epRemoveInterest(it: string) { this.epInterests.update((a) => a.filter((x) => x !== it)); }
  epMinChanged(v: any) { this.ep.minAge = +v; if (this.ep.minAge > +this.ep.maxAge) this.ep.maxAge = this.ep.minAge; }
  epMaxChanged(v: any) { this.ep.maxAge = +v; if (this.ep.maxAge < +this.ep.minAge) this.ep.minAge = this.ep.maxAge; }
  epCanSave(): boolean { return this.ep.name.trim().length >= 2 && this.ep.male !== null && this.ep.type !== '' && !!this.ep.orientation && this.epPhotos().length >= 1; }
  async epSave() {
    if (this.epSaving()) return;
    if (!this.epCanSave()) { this.epError.set(this.s('obRequired')); return; }
    this.epSaving.set(true); this.epError.set('');
    try {
      const male = !!this.ep.male;
      const userType = this.ep.type === 'elite' ? (male ? 'SUGAR_DADDY' : 'SUGAR_MOMMY') : 'SUGAR_BABY';
      await this.firebase.updateProfile({
        name: this.ep.name.trim(), bio: this.ep.bio.trim(), male, userType,
        orientation: this.ep.orientation, interests: this.epInterests(),
        pictures: this.epPhotos().map((p) => p.name),
        minAge: this.ep.minAge, maxAge: this.ep.maxAge, maxDistance: this.ep.maxDistance,
        ...(this.ep.lat != null && this.ep.lng != null ? { latitude: this.ep.lat, longitude: this.ep.lng } : {}),
      });
      this.profilePhotos.set([]);
      await this.loadProfilePhotos();
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
  readonly obSaving = signal(false);
  readonly obError = signal('');
  ob = { name: '', day: '', month: '', year: '', male: null as boolean | null, type: '' as 'elite' | 'prime' | '', orientation: '' as 'men' | 'women' | 'both' | '', bio: '' };
  readonly obPhotos = signal<Array<{ name: string; url: string }>>([]);
  readonly obUploading = signal(false);
  private readonly OB_LAST = 6;
  obCanProceed(): boolean {
    switch (this.obStep()) {
      case 0: return this.ob.name.trim().length >= 2;
      case 1: { const a = this.obBirthAge(); return a !== null && a >= 18; }
      case 2: return this.ob.male !== null;
      case 3: return this.ob.type !== '';
      case 4: return this.ob.orientation !== '';
      case 5: return true; // bio optional
      case 6: return this.obPhotos().length >= 1; // at least one photo
      default: return true;
    }
  }
  async obAddPhotos(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files || []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    this.obUploading.set(true); this.obError.set('');
    try {
      for (const f of files.slice(0, 6 - this.obPhotos().length)) {
        if (f.size > 10 * 1024 * 1024) continue; // 10MB cap
        const name = await this.firebase.uploadProfilePhoto(f);
        this.obPhotos.update((p) => [...p, { name, url: URL.createObjectURL(f) }]);
      }
    } catch { this.obError.set(this.s('obPhotoErr')); }
    finally { this.obUploading.set(false); input.value = ''; }
  }
  obRemovePhoto(i: number) { this.obPhotos.update((p) => p.filter((_, idx) => idx !== i)); }
  private obBirthAge(): number | null {
    const d = parseInt(this.ob.day, 10), m = parseInt(this.ob.month, 10), y = parseInt(this.ob.year, 10);
    if (!d || !m || !y || y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const bd = new Date(y, m - 1, d);
    if (bd.getFullYear() !== y || bd.getMonth() !== m - 1) return null;
    return Math.floor((Date.now() - bd.getTime()) / (365.25 * 86400000));
  }
  obNext() {
    this.obError.set('');
    if (!this.obCanProceed()) { this.obError.set(this.obStep() === 1 ? this.s('obAge18') : this.s('obRequired')); return; }
    if (this.obStep() < this.OB_LAST) this.obStep.update((v) => v + 1);
    else this.obSave();
  }
  obBack() { this.obError.set(''); if (this.obStep() > 0) this.obStep.update((v) => v - 1); }
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
      const geo = await this.getGeo();
      await this.firebase.saveOnboarding({
        name: this.ob.name.trim(), birthDate: bd, male, userType, orientation: this.ob.orientation || 'both',
        bio: this.ob.bio.trim() || undefined, latitude: geo?.lat, longitude: geo?.lng,
        pictures: this.obPhotos().map((p) => p.name),
      });
      this.obStep.set(0);
    } catch { this.obError.set(this.s('obSaveErr')); }
    finally { this.obSaving.set(false); }
  }

  ngOnDestroy() { if (this.unsubMatches) this.unsubMatches(); if (this.unsubMsgs) this.unsubMsgs(); }
}
