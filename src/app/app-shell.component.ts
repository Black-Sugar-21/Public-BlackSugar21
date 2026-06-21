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
  private async loadProfilePhotos() {
    const p: any = this.firebase.userProfile();
    const names = Array.isArray(p?.pictures) ? p.pictures : (Array.isArray(p?.pictureNames) ? p.pictureNames : []);
    if (!names.length) return;
    try { this.profilePhotos.set(await this.firebase.getOwnPhotoUrls(names)); } catch { /* keep avatar fallback */ }
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

  // ── Profile + onboarding ─────────────────────────────────────────────────────
  profileComplete(): boolean { return this.firebase.isProfileComplete(); }
  profileAge(): number | null {
    const p: any = this.firebase.userProfile();
    const ms = p?.birthDate?.toMillis?.();
    if (!ms) return null;
    return Math.floor((Date.now() - ms) / (365.25 * 86400000));
  }
  profileInterests(): string[] { const p: any = this.firebase.userProfile(); return Array.isArray(p?.interests) ? p.interests : []; }
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
