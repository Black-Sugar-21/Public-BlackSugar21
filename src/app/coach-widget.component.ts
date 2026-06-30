import { Component, ChangeDetectionStrategy, Inject, Input, PLATFORM_ID, signal, computed, effect, untracked, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslationService } from './translation.service';
import { FirebaseService } from './firebase.service';
import { UiPillComponent } from './ui/atoms/ui-pill.component';
import { CoachPlaceCardComponent } from './ui/organisms/coach-place-card.component';
import { CoachSessionsListComponent } from './ui/organisms/coach-sessions-list.component';
import { UiSkeletonComponent } from './ui/atoms/ui-skeleton.component';
import { UiButtonComponent } from './ui/atoms/ui-button.component';
import { UiPhoneInputComponent } from './ui/molecules/ui-phone-input.component';

interface PlaceCard { name: string; address: string; rating: number | null; mapsUrl: string; emoji?: string | null; why?: string | null; perspectives?: string[]; score?: number | null; tip?: string | null; website?: string | null; instagram?: string | null; instagramHandle?: string | null; venueOffer?: string | null; upcomingEvents?: string[] | null; description?: string | null; distanceKm?: number | null; isOpenNow?: boolean | null; reviewCount?: number | null; priceLevel?: string | null; isEvent?: boolean; eventInfo?: string | null; promoInfo?: string | null; category?: string | null; bestFor?: string | null; photos?: Array<{url: string; width: number; height: number}> | null; }
interface SimApproach { toneKey?: string; tone: string; phrase: string; why: string; perspectives: string[]; confidence: number | null; }
interface SimResult { stage: string; approaches: SimApproach[]; perspectiveNames: string[]; perspectivesUsed: number; }
interface MvStage { stageId: string; emoji: string; label: string; narrative: string; bestPhrase: string; score: number | null; tip: string; }
interface MvResult { compatibilityScore: number | null; compatibilityStars: number | null; compatibilityLabel: string; stages: MvStage[]; keyInsights: string[]; }
type SimMode = '' | 'situation' | 'multiverse';
interface AreaEvent { title: string; date: string; time: string; venue: string; description: string; category: string; instagram: string | null; }
interface SuggestionItem {
  text: string;
  tone?: string | null;
  why?: string | null;
  bestFor?: string | null;
  score?: number | null;
}
interface Msg {
  role: 'coach' | 'user'; text: string; typing?: boolean;
  places?: PlaceCard[]; phrases?: SuggestionItem[]; phrasesInitialVisible?: number; phraseMeta?: { perspective: string; why: string | null }[]; needLocation?: boolean; sim?: SimResult; mv?: MvResult;
  areaEvents?: AreaEvent[]; // distinct "events near you" card (Google-grounded, no IG needed)
  ask?: boolean; q?: string; fb?: 'up' | 'down'; // feedback affordance on coach answers
}

const ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoChat';
const SIM_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoSimulate';
const MV_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoMultiverse';
const FB_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoFeedback';
const PLACE_CLICK_ENDPOINT = 'https://us-central1-black-sugar21.cloudfunctions.net/coachDemoPlaceClick';
// Languages CoachFish (getLanguageInstruction/normalizeLanguageCode) responds in — auto-detected.
const COACH_LANGS = ['en', 'es', 'pt', 'fr', 'de', 'it', 'zh', 'ja', 'ko', 'ar', 'id', 'ru', 'tr'];
const FREE_TASTE = 5; // free coach replies for unauthenticated visitors before the login soft-gate
// (more generous than the signed-in 4/day cap — an attractive "taste" that hooks anonymous
// visitors before nudging them to sign in. Server backstop IP_HOURLY_LIMIT=12/h still applies.)
// Flip to true ONLY after the web Apple OAuth is configured (Apple Services ID + .p8 key uploaded to
// Firebase Console → Auth → Apple). Until then signInWithPopup('apple.com') returns operation-not-allowed,
// so the button is hidden to avoid a broken option. Native iOS/Android Apple sign-in is unaffected.
const APPLE_WEB_ENABLED = false;

// R65: login sheet strings in all 13 languages (single source; no hardcoded per-string ternaries).
const LOGIN_I18N: Record<string, Record<string, string>> = {
  headerSignIn: {"es":"Iniciar sesión","en":"Sign in","pt":"Entrar","fr":"Se connecter","de":"Anmelden","it":"Accedi","zh":"登录","ja":"ログイン","ko":"로그인","ru":"Войти","ar":"تسجيل الدخول","id":"Masuk","tr":"Giriş yap"},
  connected: {"es":"Conectado","en":"Connected","pt":"Conectado","fr":"Connecté","de":"Verbunden","it":"Connesso","zh":"已连接","ja":"接続済み","ko":"연결됨","ru":"Подключено","ar":"متصل","id":"Terhubung","tr":"Bağlandı"},
  signingIn: {"es":"Iniciando sesión…","en":"Signing you in…","pt":"Entrando…","fr":"Connexion…","de":"Anmeldung läuft…","it":"Accesso in corso…","zh":"正在登录…","ja":"サインイン中…","ko":"로그인 중…","ru":"Вход…","ar":"جارٍ تسجيل الدخول…","id":"Sedang masuk…","tr":"Giriş yapılıyor…"},
  signOut: {"es":"Cerrar sesión","en":"Sign out","pt":"Sair","fr":"Se déconnecter","de":"Abmelden","it":"Esci","zh":"退出登录","ja":"ログアウト","ko":"로그아웃","ru":"Выйти","ar":"تسجيل الخروج","id":"Keluar","tr":"Çıkış yap"},
  signOutConfirm: {"es":"¿Cerrar sesión?","en":"Sign out?","pt":"Sair?","fr":"Se déconnecter ?","de":"Abmelden?","it":"Uscire?","zh":"退出登录？","ja":"ログアウトしますか？","ko":"로그아웃할까요?","ru":"Выйти?","ar":"تسجيل الخروج؟","id":"Keluar?","tr":"Çıkış yapılsın mı?"},
  signOutBody: {"es":"Tendrás que iniciar sesión de nuevo.","en":"You'll need to sign in again.","pt":"Você precisará entrar de novo.","fr":"Tu devras te reconnecter.","de":"Du musst dich erneut anmelden.","it":"Dovrai accedere di nuovo.","zh":"你需要重新登录。","ja":"再度ログインが必要です。","ko":"다시 로그인해야 해요.","ru":"Нужно будет войти снова.","ar":"ستحتاج لتسجيل الدخول مجدداً.","id":"Kamu perlu masuk lagi.","tr":"Tekrar giriş yapman gerekir."},
  cancel: {"es":"Cancelar","en":"Cancel","pt":"Cancelar","fr":"Annuler","de":"Abbrechen","it":"Annulla","zh":"取消","ja":"キャンセル","ko":"취소","ru":"Отмена","ar":"إلغاء","id":"Batal","tr":"İptal"},
  title: {"es":"Inicia sesión o regístrate","en":"Sign in or sign up","pt":"Entre ou cadastre-se","fr":"Connexion ou inscription","de":"Anmelden oder registrieren","it":"Accedi o registrati","zh":"登录或注册","ja":"ログインまたは登録","ko":"로그인 또는 가입","ru":"Войти или зарегистрироваться","ar":"سجّل الدخول أو أنشئ حساباً","id":"Masuk atau daftar","tr":"Giriş yap veya kayıt ol"},
  subtitle: {"es":"Respuestas más inteligentes, tu historial guardado y matches alineados con tu perfil.","en":"Smarter answers, your history saved, and matches aligned with your profile.","pt":"Respostas mais inteligentes, seu histórico salvo e matches alinhados ao seu perfil.","fr":"Des réponses plus pertinentes, votre historique sauvegardé et des matchs alignés sur votre profil.","de":"Klügere Antworten, dein Verlauf gespeichert und Matches passend zu deinem Profil.","it":"Risposte più intelligenti, la tua cronologia salvata e match in linea con il tuo profilo.","zh":"更智能的回答、保存的历史记录，以及与你资料相符的匹配。","ja":"より賢い回答、履歴の保存、プロフィールに合ったマッチを。","ko":"더 똑똑한 답변, 저장되는 기록, 프로필에 맞는 매치까지.","ru":"Умные ответы, сохранённая история и совпадения по вашему профилю.","ar":"إجابات أذكى، سجلّك محفوظ، ومطابقات تناسب ملفك.","id":"Jawaban lebih cerdas, riwayat tersimpan, dan match sesuai profilmu.","tr":"Daha akıllı yanıtlar, kayıtlı geçmişin ve profiline uygun eşleşmeler."},
  gate: {"es":"Probaste el Coach IA ✦ Inicia sesión gratis y desbloquea tu experiencia completa.","en":"You've tried the AI Coach ✦ Sign in free and unlock your full experience.","pt":"Você experimentou o Coach IA ✦ Entre grátis e desbloqueie sua experiência completa.","fr":"Vous avez essayé le Coach IA ✦ Connectez-vous gratuitement et débloquez l'expérience complète.","de":"Du hast den KI-Coach getestet ✦ Melde dich kostenlos an und schalte dein volles Erlebnis frei.","it":"Hai provato il Coach IA ✦ Accedi gratis e sblocca l'esperienza completa.","zh":"你已体验 AI 教练 ✦ 免费登录，解锁完整体验。","ja":"AIコーチを試しましたね ✦ 無料でログインして、フル体験を解放しましょう。","ko":"AI 코치를 경험했어요 ✦ 무료로 로그인하고 전체 경험을 해제하세요.","ru":"Вы попробовали ИИ-коуча ✦ Войдите бесплатно и откройте полный доступ.","ar":"لقد جرّبت مدرّب الذكاء الاصطناعي ✦ سجّل الدخول مجاناً واكتشف التجربة الكاملة.","id":"Kamu sudah mencoba Coach AI ✦ Masuk gratis dan buka pengalaman lengkapmu.","tr":"Yapay Zekâ Koçu'nu denedin ✦ Ücretsiz giriş yap ve tam deneyimin kilidini aç."},
  benefitsTitle: {"es":"Al entrar desbloqueas:","en":"When you sign in you unlock:","pt":"Ao entrar você desbloqueia:","fr":"En vous connectant, vous débloquez :","de":"Mit der Anmeldung schaltest du frei:","it":"Accedendo sblocchi:","zh":"登录后即可解锁：","ja":"ログインで解放：","ko":"로그인하면 해제됩니다:","ru":"При входе вы получаете:","ar":"عند تسجيل الدخول تفتح:","id":"Saat masuk kamu membuka:","tr":"Giriş yapınca açılır:"},
  benefit1: {"es":"4 preguntas al día, todos los días","en":"4 questions a day, every day","pt":"4 perguntas por dia, todos os dias","fr":"4 questions par jour, chaque jour","de":"4 Fragen pro Tag, jeden Tag","it":"4 domande al giorno, ogni giorno","zh":"每天 4 个提问，天天如此","ja":"毎日4つの質問","ko":"매일 4개의 질문","ru":"4 вопроса каждый день","ar":"4 أسئلة كل يوم","id":"4 pertanyaan setiap hari","tr":"Her gün 4 soru"},
  benefit2: {"es":"Racha diaria: vuelve cada día y gana preguntas extra","en":"Daily streak: come back each day and earn extra questions","pt":"Sequência diária: volte todo dia e ganhe perguntas extras","fr":"Série quotidienne : revenez chaque jour et gagnez des questions bonus","de":"Tägliche Serie: komm jeden Tag wieder und verdiene Extra-Fragen","it":"Serie giornaliera: torna ogni giorno e guadagna domande extra","zh":"每日连续：每天回来赢得额外提问","ja":"デイリーストリーク：毎日戻って追加の質問を獲得","ko":"매일 연속 출석: 매일 돌아와 추가 질문 획득","ru":"Ежедневная серия: возвращайтесь и получайте доп. вопросы","ar":"سلسلة يومية: عُد كل يوم واكسب أسئلة إضافية","id":"Rentetan harian: kembali tiap hari, dapat pertanyaan ekstra","tr":"Günlük seri: her gün gel, ekstra soru kazan"},
  benefit3: {"es":"Tu coach te recuerda — historial y avances guardados","en":"Your coach remembers you — history and progress saved","pt":"Seu coach lembra de você — histórico e progresso salvos","fr":"Votre coach se souvient de vous — historique et progrès sauvegardés","de":"Dein Coach erinnert sich — Verlauf und Fortschritt gespeichert","it":"Il tuo coach ti ricorda — cronologia e progressi salvati","zh":"你的教练记得你——历史与进度已保存","ja":"コーチがあなたを記憶 — 履歴と進捗を保存","ko":"코치가 당신을 기억해요 — 기록과 진행 상황 저장","ru":"Ваш коуч помнит вас — история и прогресс сохранены","ar":"مدرّبك يتذكّرك — السجل والتقدّم محفوظان","id":"Coach-mu mengingatmu — riwayat dan progres tersimpan","tr":"Koçun seni hatırlar — geçmiş ve ilerleme kaydedilir"},
  trust: {"es":"Gratis · privado · sin spam","en":"Free · private · no spam","pt":"Grátis · privado · sem spam","fr":"Gratuit · privé · sans spam","de":"Kostenlos · privat · kein Spam","it":"Gratis · privato · niente spam","zh":"免费 · 私密 · 无垃圾信息","ja":"無料 · プライベート · スパムなし","ko":"무료 · 비공개 · 스팸 없음","ru":"Бесплатно · конфиденциально · без спама","ar":"مجاني · خاص · بدون رسائل مزعجة","id":"Gratis · privat · tanpa spam","tr":"Ücretsiz · gizli · spam yok"},
  google: {"es":"Continuar con Google","en":"Continue with Google","pt":"Continuar com o Google","fr":"Continuer avec Google","de":"Mit Google fortfahren","it":"Continua con Google","zh":"使用 Google 继续","ja":"Google で続ける","ko":"Google로 계속하기","ru":"Продолжить с Google","ar":"المتابعة بحساب Google","id":"Lanjutkan dengan Google","tr":"Google ile devam et"},
  apple: {"es":"Continuar con Apple","en":"Continue with Apple","pt":"Continuar com a Apple","fr":"Continuer avec Apple","de":"Mit Apple fortfahren","it":"Continua con Apple","zh":"使用 Apple 继续","ja":"Apple で続ける","ko":"Apple로 계속하기","ru":"Продолжить с Apple","ar":"المتابعة بحساب Apple","id":"Lanjutkan dengan Apple","tr":"Apple ile devam et"},
  phone: {"es":"Continuar con tu teléfono","en":"Continue with your phone","pt":"Continuar com seu telefone","fr":"Continuer avec votre téléphone","de":"Mit deinem Telefon fortfahren","it":"Continua con il tuo telefono","zh":"使用手机号继续","ja":"電話番号で続ける","ko":"휴대폰으로 계속하기","ru":"Продолжить с телефоном","ar":"المتابعة برقم هاتفك","id":"Lanjutkan dengan ponselmu","tr":"Telefonunla devam et"},
  phonePh: {"es":"Teléfono, ej. +56 9 1234 5678","en":"Phone, e.g. +56 9 1234 5678","pt":"Telefone, ex. +56 9 1234 5678","fr":"Téléphone, ex. +56 9 1234 5678","de":"Telefon, z. B. +56 9 1234 5678","it":"Telefono, es. +56 9 1234 5678","zh":"电话，例如 +56 9 1234 5678","ja":"電話番号、例 +56 9 1234 5678","ko":"전화번호, 예: +56 9 1234 5678","ru":"Телефон, напр. +56 9 1234 5678","ar":"الهاتف، مثال +56 9 1234 5678","id":"Telepon, mis. +56 9 1234 5678","tr":"Telefon, örn. +56 9 1234 5678"},
  phoneNumPh: {"es":"Número de teléfono","en":"Phone number","pt":"Número de telefone","fr":"Numéro de téléphone","de":"Telefonnummer","it":"Numero di telefono","zh":"电话号码","ja":"電話番号","ko":"전화번호","ru":"Номер телефона","ar":"رقم الهاتف","id":"Nomor telepon","tr":"Telefon numarası"},
  searchCountry: {"es":"Buscar país","en":"Search country","pt":"Buscar país","fr":"Rechercher un pays","de":"Land suchen","it":"Cerca paese","zh":"搜索国家/地区","ja":"国を検索","ko":"국가 검색","ru":"Поиск страны","ar":"ابحث عن بلد","id":"Cari negara","tr":"Ülke ara"},
  sendCode: {"es":"Enviar código","en":"Send code","pt":"Enviar código","fr":"Envoyer le code","de":"Code senden","it":"Invia codice","zh":"发送验证码","ja":"コードを送信","ko":"코드 전송","ru":"Отправить код","ar":"إرسال الرمز","id":"Kirim kode","tr":"Kod gönder"},
  sending: {"es":"Enviando…","en":"Sending…","pt":"Enviando…","fr":"Envoi…","de":"Senden…","it":"Invio…","zh":"发送中…","ja":"送信中…","ko":"전송 중…","ru":"Отправка…","ar":"جارٍ الإرسال…","id":"Mengirim…","tr":"Gönderiliyor…"},
  codePh: {"es":"Código de 6 dígitos","en":"6-digit code","pt":"Código de 6 dígitos","fr":"Code à 6 chiffres","de":"6-stelliger Code","it":"Codice di 6 cifre","zh":"6 位验证码","ja":"6 桁のコード","ko":"6자리 코드","ru":"6-значный код","ar":"رمز من 6 أرقام","id":"Kode 6 digit","tr":"6 haneli kod"},
  verify: {"es":"Verificar","en":"Verify","pt":"Verificar","fr":"Vérifier","de":"Bestätigen","it":"Verifica","zh":"验证","ja":"認証","ko":"확인","ru":"Подтвердить","ar":"تحقّق","id":"Verifikasi","tr":"Doğrula"},
  verifying: {"es":"Verificando…","en":"Verifying…","pt":"Verificando…","fr":"Vérification…","de":"Bestätigen…","it":"Verifica…","zh":"验证中…","ja":"認証中…","ko":"확인 중…","ru":"Проверка…","ar":"جارٍ التحقّق…","id":"Memverifikasi…","tr":"Doğrulanıyor…"},
  back: {"es":"Atrás","en":"Back","pt":"Voltar","fr":"Retour","de":"Zurück","it":"Indietro","zh":"返回","ja":"戻る","ko":"뒤로","ru":"Назад","ar":"رجوع","id":"Kembali","tr":"Geri"},
  changeNumber: {"es":"Cambiar número","en":"Change number","pt":"Alterar número","fr":"Changer de numéro","de":"Nummer ändern","it":"Cambia numero","zh":"更换号码","ja":"番号を変更","ko":"번호 변경","ru":"Изменить номер","ar":"تغيير الرقم","id":"Ubah nomor","tr":"Numarayı değiştir"},
  errProviderOff: {"es":"Este método de inicio no está disponible ahora. Prueba con Google o tu teléfono.","en":"This sign-in method isn't available right now. Try Google or your phone.","pt":"Este método de login não está disponível agora. Tente Google ou seu telefone.","fr":"Cette méthode de connexion n'est pas disponible. Essaie Google ou ton téléphone.","de":"Diese Anmeldemethode ist gerade nicht verfügbar. Versuch Google oder dein Telefon.","it":"Questo accesso non è disponibile ora. Prova Google o il telefono.","zh":"此登录方式暂不可用，请用 Google 或手机。","ja":"このログイン方法は現在利用できません。Googleか電話でお試しください。","ko":"이 로그인 방법을 지금은 사용할 수 없어요. Google이나 전화를 사용하세요.","ru":"Этот способ входа сейчас недоступен. Попробуйте Google или телефон.","ar":"طريقة الدخول هذه غير متاحة الآن. جرّب Google أو هاتفك.","id":"Metode masuk ini belum tersedia. Coba Google atau teleponmu.","tr":"Bu giriş yöntemi şu an kullanılamıyor. Google veya telefonunu dene."},
  errPopupBlocked: {"es":"Tu navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.","en":"Your browser blocked the popup. Allow popups and try again.","pt":"Seu navegador bloqueou a janela. Permita pop-ups e tente de novo.","fr":"Ton navigateur a bloqué la fenêtre. Autorise les pop-ups et réessaie.","de":"Dein Browser hat das Fenster blockiert. Pop-ups erlauben und erneut versuchen.","it":"Il browser ha bloccato la finestra. Consenti i popup e riprova.","zh":"浏览器拦截了弹窗，请允许弹窗后重试。","ja":"ブラウザがポップアップをブロックしました。許可して再試行してください。","ko":"브라우저가 팝업을 차단했어요. 팝업을 허용하고 다시 시도하세요.","ru":"Браузер заблокировал окно. Разрешите всплывающие окна и повторите.","ar":"حظر متصفحك النافذة. اسمح بالنوافذ المنبثقة وحاول مجدداً.","id":"Browser memblokir popup. Izinkan popup dan coba lagi.","tr":"Tarayıcı pencereyi engelledi. Açılır pencerelere izin verip tekrar dene."},
  errNetwork: {"es":"Problema de conexión. Revisa tu internet e inténtalo de nuevo.","en":"Connection problem. Check your internet and try again.","pt":"Problema de conexão. Verifique a internet e tente de novo.","fr":"Problème de connexion. Vérifie ton internet et réessaie.","de":"Verbindungsproblem. Prüfe dein Internet und versuch es erneut.","it":"Problema di connessione. Controlla internet e riprova.","zh":"连接出现问题，请检查网络后重试。","ja":"接続に問題があります。通信環境を確認して再試行してください。","ko":"연결 문제예요. 인터넷을 확인하고 다시 시도하세요.","ru":"Проблема соединения. Проверьте интернет и повторите.","ar":"مشكلة في الاتصال. تحقق من الإنترنت وحاول مجدداً.","id":"Masalah koneksi. Periksa internet dan coba lagi.","tr":"Bağlantı sorunu. İnternetini kontrol edip tekrar dene."},
  errAuthFailed: {"es":"No se pudo iniciar sesión. Inténtalo de nuevo.","en":"Couldn't sign you in. Please try again.","pt":"Não foi possível entrar. Tente de novo.","fr":"Connexion impossible. Réessaie.","de":"Anmeldung fehlgeschlagen. Versuch es erneut.","it":"Accesso non riuscito. Riprova.","zh":"登录失败，请重试。","ja":"ログインできませんでした。もう一度お試しください。","ko":"로그인하지 못했어요. 다시 시도하세요.","ru":"Не удалось войти. Повторите.","ar":"تعذّر تسجيل الدخول. حاول مجدداً.","id":"Gagal masuk. Coba lagi.","tr":"Giriş yapılamadı. Tekrar dene."},
  errInvalidPhone: {"es":"Ingresa tu número con código de país, ej. +56 9 1234 5678","en":"Enter your number with country code, e.g. +56 9 1234 5678","pt":"Digite seu número com o código do país, ex. +56 9 1234 5678","fr":"Saisissez votre numéro avec l'indicatif du pays, ex. +56 9 1234 5678","de":"Gib deine Nummer mit Ländervorwahl ein, z. B. +56 9 1234 5678","it":"Inserisci il numero con il prefisso internazionale, es. +56 9 1234 5678","zh":"请输入带国家代码的号码，例如 +56 9 1234 5678","ja":"国番号付きで番号を入力してください、例 +56 9 1234 5678","ko":"국가 코드를 포함해 번호를 입력하세요, 예: +56 9 1234 5678","ru":"Введите номер с кодом страны, напр. +56 9 1234 5678","ar":"أدخل رقمك مع رمز الدولة، مثال +56 9 1234 5678","id":"Masukkan nomormu dengan kode negara, mis. +56 9 1234 5678","tr":"Numaranı ülke koduyla gir, örn. +56 9 1234 5678"},
  errSend: {"es":"No se pudo enviar el código — revisa el número e inténtalo de nuevo.","en":"Couldn't send the code — check the number and try again.","pt":"Não foi possível enviar o código — verifique o número e tente novamente.","fr":"Impossible d'envoyer le code — vérifiez le numéro et réessayez.","de":"Code konnte nicht gesendet werden — prüfe die Nummer und versuch es erneut.","it":"Impossibile inviare il codice — controlla il numero e riprova.","zh":"无法发送验证码——请检查号码后重试。","ja":"コードを送信できませんでした — 番号を確認してもう一度お試しください。","ko":"코드를 보내지 못했어요 — 번호를 확인하고 다시 시도하세요.","ru":"Не удалось отправить код — проверьте номер и попробуйте снова.","ar":"تعذّر إرسال الرمز — تحقّق من الرقم وحاول مجدداً.","id":"Gagal mengirim kode — periksa nomor lalu coba lagi.","tr":"Kod gönderilemedi — numarayı kontrol edip tekrar dene."},
  errCode: {"es":"Ingresa el código de 6 dígitos.","en":"Enter the 6-digit code.","pt":"Digite o código de 6 dígitos.","fr":"Saisissez le code à 6 chiffres.","de":"Gib den 6-stelligen Code ein.","it":"Inserisci il codice di 6 cifre.","zh":"请输入 6 位验证码。","ja":"6 桁のコードを入力してください。","ko":"6자리 코드를 입력하세요.","ru":"Введите 6-значный код.","ar":"أدخل الرمز المكوّن من 6 أرقام.","id":"Masukkan kode 6 digit.","tr":"6 haneli kodu gir."},
  errWrong: {"es":"Código incorrecto o expirado.","en":"Wrong or expired code.","pt":"Código incorreto ou expirado.","fr":"Code incorrect ou expiré.","de":"Falscher oder abgelaufener Code.","it":"Codice errato o scaduto.","zh":"验证码错误或已过期。","ja":"コードが間違っているか期限切れです。","ko":"잘못되었거나 만료된 코드예요.","ru":"Неверный или истёкший код.","ar":"رمز غير صحيح أو منتهي الصلاحية.","id":"Kode salah atau kedaluwarsa.","tr":"Hatalı veya süresi dolmuş kod."},
};
// 13-language UI strings for the newer widget chrome (greeting, conversation history, discover hint).
// Kept here (not in the 3-lang content I18N) so these features are localized for ALL supported languages.
const UI_I18N: Record<string, Record<string, string>> = {
  // a11y aria-labels (13-lang)
  ariaClose: {"es":"Cerrar","en":"Close","pt":"Fechar","fr":"Fermer","de":"Schließen","it":"Chiudi","zh":"关闭","ja":"閉じる","ko":"닫기","ru":"Закрыть","ar":"إغلاق","id":"Tutup","tr":"Kapat"},
  ariaDelete: {"es":"Eliminar","en":"Delete","pt":"Excluir","fr":"Supprimer","de":"Löschen","it":"Elimina","zh":"删除","ja":"削除","ko":"삭제","ru":"Удалить","ar":"حذف","id":"Hapus","tr":"Sil"},
  ariaPrev: {"es":"Anterior","en":"Previous","pt":"Anterior","fr":"Précédent","de":"Zurück","it":"Precedente","zh":"上一个","ja":"前へ","ko":"이전","ru":"Назад","ar":"السابق","id":"Sebelumnya","tr":"Önceki"},
  ariaNext: {"es":"Siguiente","en":"Next","pt":"Próximo","fr":"Suivant","de":"Weiter","it":"Successivo","zh":"下一个","ja":"次へ","ko":"다음","ru":"Вперёд","ar":"التالي","id":"Berikutnya","tr":"Sonraki"},
  ariaGoFocus: {"es":"Ir a enfoque","en":"Go to focus","pt":"Ir para o foco","fr":"Aller au focus","de":"Zum Fokus","it":"Vai al focus","zh":"前往焦点","ja":"フォーカスへ","ko":"포커스로 이동","ru":"К фокусу","ar":"الذهاب إلى التركيز","id":"Ke fokus","tr":"Odağa git"},
  ariaGoStage: {"es":"Ir a etapa","en":"Go to stage","pt":"Ir para a etapa","fr":"Aller à l'étape","de":"Zur Phase","it":"Vai alla fase","zh":"前往阶段","ja":"ステージへ","ko":"단계로 이동","ru":"К этапу","ar":"الذهاب إلى المرحلة","id":"Ke tahap","tr":"Aşamaya git"},
  ariaExitMode: {"es":"Salir del modo","en":"Exit mode","pt":"Sair do modo","fr":"Quitter le mode","de":"Modus verlassen","it":"Esci dalla modalità","zh":"退出模式","ja":"モードを終了","ko":"모드 종료","ru":"Выйти из режима","ar":"الخروج من الوضع","id":"Keluar mode","tr":"Moddan çık"},
  morning: {"es":"Buenos días","en":"Good morning","pt":"Bom dia","fr":"Bonjour","de":"Guten Morgen","it":"Buongiorno","zh":"早上好","ja":"おはよう","ko":"좋은 아침","ru":"Доброе утро","ar":"صباح الخير","id":"Selamat pagi","tr":"Günaydın"},
  afternoon: {"es":"Buenas tardes","en":"Good afternoon","pt":"Boa tarde","fr":"Bon après-midi","de":"Guten Tag","it":"Buon pomeriggio","zh":"下午好","ja":"こんにちは","ko":"좋은 오후","ru":"Добрый день","ar":"مساء الخير","id":"Selamat siang","tr":"İyi günler"},
  evening: {"es":"Buenas noches","en":"Good evening","pt":"Boa noite","fr":"Bonsoir","de":"Guten Abend","it":"Buonasera","zh":"晚上好","ja":"こんばんは","ko":"좋은 저녁","ru":"Добрый вечер","ar":"مساء الخير","id":"Selamat malam","tr":"İyi akşamlar"},
  newChat: {"es":"Nueva conversación","en":"New conversation","pt":"Nova conversa","fr":"Nouvelle conversation","de":"Neue Unterhaltung","it":"Nuova conversazione","zh":"新对话","ja":"新しい会話","ko":"새 대화","ru":"Новый разговор","ar":"محادثة جديدة","id":"Percakapan baru","tr":"Yeni sohbet"},
  historyTitle: {"es":"Tus conversaciones","en":"Your conversations","pt":"Suas conversas","fr":"Tes conversations","de":"Deine Unterhaltungen","it":"Le tue conversazioni","zh":"你的对话","ja":"会話履歴","ko":"대화 목록","ru":"Ваши разговоры","ar":"محادثاتك","id":"Percakapanmu","tr":"Sohbetlerin"},
  historyShort: {"es":"Historial","en":"History","pt":"Histórico","fr":"Historique","de":"Verlauf","it":"Cronologia","zh":"历史","ja":"履歴","ko":"기록","ru":"История","ar":"السجل","id":"Riwayat","tr":"Geçmiş"},
  newShort: {"es":"Nueva","en":"New","pt":"Nova","fr":"Nouveau","de":"Neu","it":"Nuova","zh":"新建","ja":"新規","ko":"새로","ru":"Новый","ar":"جديد","id":"Baru","tr":"Yeni"},
  historyEmpty: {"es":"Aún no tienes conversaciones guardadas.","en":"No saved conversations yet.","pt":"Ainda não há conversas salvas.","fr":"Aucune conversation enregistrée.","de":"Noch keine gespeicherten Unterhaltungen.","it":"Nessuna conversazione salvata.","zh":"还没有保存的对话。","ja":"保存された会話はまだありません。","ko":"저장된 대화가 아직 없어요.","ru":"Пока нет сохранённых разговоров.","ar":"لا توجد محادثات محفوظة بعد.","id":"Belum ada percakapan tersimpan.","tr":"Henüz kayıtlı sohbet yok."},
  discoverHint: {"es":"✨ En la app: descubre personas compatibles","en":"✨ In the app: discover compatible people","pt":"✨ No app: descubra pessoas compatíveis","fr":"✨ Dans l'app : découvre des personnes compatibles","de":"✨ In der App: entdecke passende Menschen","it":"✨ Nell'app: scopri persone compatibili","zh":"✨ 在应用中：发现合拍的人","ja":"✨ アプリで相性の良い人を見つけよう","ko":"✨ 앱에서 잘 맞는 사람을 만나보세요","ru":"✨ В приложении: знакомься с подходящими людьми","ar":"✨ في التطبيق: اكتشف أشخاصاً متوافقين","id":"✨ Di app: temukan orang yang cocok","tr":"✨ Uygulamada: uyumlu kişileri keşfet"},
};
const STORE_IOS = 'https://apps.apple.com/app/id6470783901';
// NOTE: store links should be loaded from Remote Config (store_url_ios / store_url_android) at runtime.
// These constants are production-known fallbacks used before RC resolves.
const STORE_ANDROID = 'https://play.google.com/store/apps/details?id=com.bimbask.blacksugar21';
const SITE = 'https://blacksugar21.com';

const I18N: Record<string, any> = {
  es: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versión beta de prueba', newChat: 'Nueva conversación', showPrev: 'Ver conversación anterior', historyTitle: 'Tus conversaciones', historyEmpty: 'Aún no tienes conversaciones guardadas.', morning: 'Buenos días', afternoon: 'Buenas tardes', evening: 'Buenas noches', discoverHint: '✨ En la app: descubre personas compatibles',
    greeting: 'Hola 👋 Soy tu Coach de inteligencia emocional para citas. Cuéntame qué situación tienes y te doy una idea concreta para tu próxima conversación.',
    chips: ['¿Cómo inicio una conversación?', 'Me dejaron en visto 😅', '¿Cómo propongo una cita?'],
    placeholder: 'Escribe tu situación…', send: 'Enviar',
    ctaTitle: 'Probaste el Coach IA ✦',
    ctaSubtitle: 'En la app tenés 4 preguntas al día, te recuerda y simula tu relación.',
    ctaText: 'En la app son 4 preguntas al día: te recuerda, conoce tus matches y simula tu relación.',
    ctaDismiss: 'Seguir probando',
    freeCounterOf: 'de', freeCounterSuffix: 'gratis', freeCounterPrefix: 'Pregunta',
    taste2: 'preguntas gratis para probar', taste1: '✦ Te queda 1 pregunta gratis',
    download: 'Descargar la app', share: 'Compartir', shared: '¡Copiado!',
    shareText: 'Probé el Coach IA de Black Sugar 21 y me dio este consejo 👀',
    footer: 'Generado por IA · versión beta',
    useLoc: '📍 Usar mi ubicación', cityPh: 'o escribe tu ciudad…', copy: 'Copiar frase', copied: '✓ Copiado', viewMap: 'Ver en mapa', webSite: 'Sitio web',
    phrasesSheetTitle: 'Frases sugeridas', noSuggestions: 'No hay frases disponibles', showMore: 'Ver {n} más ↓', loadMore: 'Generar más frases',
    simChip: '🔮 Simular una situación', simHint: 'Describe tu situación y mis 5 perspectivas la analizan',
    simAnalyzing: 'Analizando enfoques…', simThinking: '5 perspectivas pensando…', simBy: 'Analizado por', simStage: 'Etapa', simWhy: 'Por qué funciona', simBest: 'Recomendada',
    // two simulations + simple explanation of the difference
    simTitle: '🔮 Simular una situación', simDesc: 'Qué decir AHORA en un momento puntual · 5 perspectivas te dan frases listas.',
    mvTitle: '🌌 Simular la relación', mvDesc: 'Cómo evolucionaría la relación en 5 etapas + tu compatibilidad.',
    mvHint: 'Descríbeme a la persona o conexión y simulo las 5 etapas de la relación',
    mvAnalyzing: 'Simulando 5 universos…', mvCompat: 'Compatibilidad', mvInsights: 'Claves de esta conexión',
    fbAsk: '¿Te sirvió?', fbThanks: '¡Gracias por tu feedback! 💛',
    placeChip: '📍 Lugares para una cita', placeQuery: '¿Qué lugares me recomiendas para una primera cita cerca de mí?',
    planLabel: 'Planea tu cita', suggested: 'sugerido ahora',
    placeCats: [
      { key: 'cafe', t: '☕ Café', q: '¿Qué cafeterías acogedoras hay cerca para una cita?' },
      { key: 'restaurant', t: '🍽️ Restaurante', q: '¿Qué restaurantes con buen ambiente hay cerca para una cita?' },
      { key: 'bar', t: '🍸 Bar', q: '¿Qué bares con buen ambiente hay cerca para una cita?' },
      { key: 'night_club', t: '💃 Discoteca', q: '¿Qué discotecas buenas hay cerca para salir a bailar de noche?' },
    ],
    areaEventsTitle: 'Eventos cerca de ti', areaEventsSoon: 'Próx.',
    thinking: 'El coach está pensando…', placesLoading: 'Buscando lugares para tu cita 📍…',
    debateSteps: [
      'Analizando lugares cercanos…',
      'Dinámica social · evaluando el ambiente…',
      'Comunicación · revisando reseñas…',
      'Inteligencia emocional · midiendo la conexión…',
      'Presencia digital · buscando Instagram e historias…',
      'Sintetizando las mejores opciones para ti…',
    ],
    locRequesting: 'Obteniendo tu ubicación 📍…',
    locBlocked: 'Tu navegador tiene la ubicación bloqueada 🔒 Habilítala en el candado de la barra de direcciones, o escribe tu ciudad aquí abajo y te recomiendo lugares 👇',
    needCity: 'Dime en qué ciudad estás y te recomiendo lugares 👇',
  },
  en: {
    fab: 'AI Coach', title: 'AI Coach', demo: 'Beta version', newChat: 'New conversation', showPrev: 'Show previous conversation', historyTitle: 'Your conversations', historyEmpty: 'No saved conversations yet.', morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', discoverHint: '✨ In the app: discover compatible people',
    greeting: "Hi 👋 I'm your emotional-intelligence dating coach. Tell me your situation and I'll give you one concrete idea for your next conversation.",
    chips: ['How do I start a conversation?', 'They left me on read 😅', 'How do I ask them out?'],
    placeholder: 'Describe your situation…', send: 'Send',
    ctaTitle: 'You\'ve tried Coach IA ✦',
    ctaSubtitle: 'In the app you get 4 questions a day, it remembers you and simulates your relationship.',
    ctaText: 'In the app it\'s 4 questions a day: it remembers you, knows your matches, and simulates your relationship.',
    ctaDismiss: 'Keep trying',
    freeCounterOf: 'of', freeCounterSuffix: 'free', freeCounterPrefix: 'Question',
    taste2: 'free questions to try', taste1: '✦ 1 free question left',
    download: 'Download the app', share: 'Share', shared: 'Copied!',
    shareText: 'I tried Black Sugar 21’s AI Coach and it gave me this advice 👀',
    footer: 'AI-generated · beta version',
    useLoc: '📍 Use my location', cityPh: 'or type your city…', copy: 'Copy phrase', copied: '✓ Copied', viewMap: 'View on map', webSite: 'Website',
    phrasesSheetTitle: 'Suggested phrases', noSuggestions: 'No phrases available', showMore: 'See {n} more ↓', loadMore: 'Generate more phrases',
    simChip: '🔮 Simulate a situation', simHint: 'Describe your situation and my 5 perspectives analyze it',
    simAnalyzing: 'Analyzing approaches…', simThinking: '5 perspectives thinking…', simBy: 'Analyzed by', simStage: 'Stage', simWhy: 'Why it works', simBest: 'Recommended',
    simTitle: '🔮 Simulate a situation', simDesc: 'What to say RIGHT NOW in a specific moment · 5 perspectives give you ready phrases.',
    mvTitle: '🌌 Simulate the relationship', mvDesc: 'How the relationship would unfold across 5 stages + your compatibility.',
    mvHint: 'Describe the person or connection and I simulate the 5 relationship stages',
    mvAnalyzing: 'Simulating 5 universes…', mvCompat: 'Compatibility', mvInsights: 'Keys to this connection',
    fbAsk: 'Was this helpful?', fbThanks: 'Thanks for your feedback! 💛',
    placeChip: '📍 Date spots near me', placeQuery: 'What are some good places for a first date near me?',
    planLabel: 'Plan your date', suggested: 'suggested now',
    placeCats: [
      { key: 'cafe', t: '☕ Coffee', q: 'What cozy coffee shops are near me for a date?' },
      { key: 'restaurant', t: '🍽️ Restaurant', q: 'What restaurants with great ambiance are near me for a date?' },
      { key: 'bar', t: '🍸 Bar', q: 'What good bars are near me for a date?' },
      { key: 'night_club', t: '💃 Club', q: 'What good clubs are near me to go dancing at night?' },
    ],
    areaEventsTitle: 'Events near you', areaEventsSoon: 'Soon',
    thinking: 'The coach is thinking…', placesLoading: 'Finding date spots near you 📍…',
    debateSteps: [
      'Scanning nearby spots…',
      'Social dynamics · reading the vibe…',
      'Communication · checking reviews…',
      'Emotional intelligence · gauging the connection…',
      'Digital presence · finding Instagram & stories…',
      'Synthesizing the best options for you…',
    ],
    locRequesting: 'Getting your location 📍…',
    locBlocked: "Your browser has location blocked 🔒 Enable it from the lock icon in the address bar, or type your city below and I'll suggest spots 👇",
    needCity: "Tell me what city you're in and I'll suggest places 👇",
  },
  pt: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versão beta de teste', newChat: 'Nova conversa', showPrev: 'Ver conversa anterior', historyTitle: 'Suas conversas', historyEmpty: 'Ainda não há conversas salvas.', morning: 'Bom dia', afternoon: 'Boa tarde', evening: 'Boa noite', discoverHint: '✨ No app: descubra pessoas compatíveis',
    greeting: 'Oi 👋 Sou seu Coach de inteligência emocional para encontros. Me conta sua situação e te dou uma ideia concreta para a sua próxima conversa.',
    chips: ['Como inicio uma conversa?', 'Me deixaram no vácuo 😅', 'Como chamo para um encontro?'],
    placeholder: 'Escreva sua situação…', send: 'Enviar',
    ctaTitle: 'Você testou o Coach IA ✦',
    ctaSubtitle: 'No app você tem 4 perguntas por dia, ele te lembra e simula seu relacionamento.',
    ctaText: 'No app são 4 perguntas por dia: ele lembra de você, conhece seus matches e simula sua relação.',
    ctaDismiss: 'Continuar testando',
    freeCounterOf: 'de', freeCounterSuffix: 'grátis', freeCounterPrefix: 'Pergunta',
    taste2: 'perguntas grátis para testar', taste1: '✦ Resta 1 pergunta grátis',
    download: 'Baixar o app', share: 'Compartilhar', shared: 'Copiado!',
    shareText: 'Testei o Coach IA do Black Sugar 21 e ele me deu este conselho 👀',
    footer: 'Gerado por IA · versão beta',
    useLoc: '📍 Usar minha localização', cityPh: 'ou escreva sua cidade…', copy: 'Copiar frase', copied: '✓ Copiado', viewMap: 'Ver no mapa', webSite: 'Site',
    phrasesSheetTitle: 'Frases sugeridas', noSuggestions: 'Nenhuma frase disponível', showMore: 'Ver {n} mais ↓', loadMore: 'Gerar mais frases',
    simChip: '🔮 Simular uma situação', simHint: 'Descreva sua situação e minhas 5 perspectivas a analisam',
    simAnalyzing: 'Analisando abordagens…', simThinking: '5 perspectivas pensando…', simBy: 'Analisado por', simStage: 'Etapa', simWhy: 'Por que funciona', simBest: 'Recomendada',
    simTitle: '🔮 Simular uma situação', simDesc: 'O que dizer AGORA num momento específico · 5 perspectivas te dão frases prontas.',
    mvTitle: '🌌 Simular a relação', mvDesc: 'Como a relação evoluiria em 5 etapas + sua compatibilidade.',
    mvHint: 'Me descreva a pessoa ou conexão e eu simulo as 5 etapas da relação',
    mvAnalyzing: 'Simulando 5 universos…', mvCompat: 'Compatibilidade', mvInsights: 'Chaves desta conexão',
    fbAsk: 'Foi útil?', fbThanks: 'Obrigado pelo seu feedback! 💛',
    placeChip: '📍 Lugares para um encontro', placeQuery: 'Que lugares você recomenda para um primeiro encontro perto de mim?',
    planLabel: 'Planeje seu encontro', suggested: 'sugerido agora',
    placeCats: [
      { key: 'cafe', t: '☕ Café', q: 'Que cafeterias aconchegantes tem perto para um encontro?' },
      { key: 'restaurant', t: '🍽️ Restaurante', q: 'Que restaurantes com bom ambiente tem perto para um encontro?' },
      { key: 'bar', t: '🍸 Bar', q: 'Que bons bares tem perto para um encontro?' },
      { key: 'night_club', t: '💃 Balada', q: 'Que boas baladas tem perto para sair para dançar à noite?' },
    ],
    areaEventsTitle: 'Eventos perto de você', areaEventsSoon: 'Próx.',
    thinking: 'O coach está pensando…', placesLoading: 'Buscando lugares para o seu encontro 📍…',
    debateSteps: [
      'Analisando lugares próximos…',
      'Dinâmica social · avaliando o ambiente…',
      'Comunicação · revisando avaliações…',
      'Inteligência emocional · medindo a conexão…',
      'Presença digital · buscando Instagram e stories…',
      'Sintetizando as melhores opções para você…',
    ],
    locRequesting: 'Obtendo sua localização 📍…',
    locBlocked: 'Seu navegador está com a localização bloqueada 🔒 Habilite no cadeado da barra de endereço, ou escreva sua cidade aqui embaixo e te recomendo lugares 👇',
    needCity: 'Me diga em que cidade você está e te recomendo lugares 👇',
  },
  fr: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Version bêta', newChat: 'Nouvelle conversation', showPrev: 'Voir la conversation précédente', historyTitle: 'Tes conversations', historyEmpty: 'Aucune conversation enregistrée.', morning: 'Bonjour', afternoon: 'Bon après-midi', evening: 'Bonsoir', discoverHint: '✨ Dans l\'app : découvre des personnes compatibles',
    greeting: 'Bonjour 👋 Je suis ton coach d\'intelligence émotionnelle pour les rencontres. Dis-moi ta situation et je te donne une idée concrète pour ta prochaine conversation.',
    chips: ['Comment débuter une conversation ?', 'Je suis laissé·e sur vu 😅', 'Comment proposer un rendez-vous ?'],
    placeholder: 'Décris ta situation…', send: 'Envoyer',
    ctaTitle: 'Tu as essayé Coach IA ✦',
    ctaSubtitle: 'Dans l\'app tu as 4 questions par jour, il te mémorise et simule ta relation.',
    ctaText: 'Dans l\'app c\'est 4 questions par jour : il te mémorise, connaît tes matchs et simule ta relation.',
    ctaDismiss: 'Continuer à tester',
    freeCounterOf: 'sur', freeCounterSuffix: 'gratuites', freeCounterPrefix: 'Question',
    taste2: 'questions gratuites pour tester', taste1: '✦ Il te reste 1 question gratuite',
    download: 'Télécharger l\'app', share: 'Partager', shared: 'Copié !',
    shareText: 'J\'ai essayé Coach IA de Black Sugar 21 et il m\'a donné ce conseil 👀',
    footer: 'Généré par IA · version bêta',
    useLoc: '📍 Utiliser ma localisation', cityPh: 'ou tape ta ville…', copy: 'Copier la phrase', copied: '✓ Copié', viewMap: 'Voir sur la carte', webSite: 'Site web',
    phrasesSheetTitle: 'Phrases suggérées', noSuggestions: 'Aucune phrase disponible', showMore: 'Voir {n} de plus ↓', loadMore: 'Générer plus de phrases',
    simChip: '🔮 Simuler une situation', simHint: 'Décris ta situation et mes 5 perspectives l\'analysent',
    simAnalyzing: 'Analyse des approches…', simThinking: '5 perspectives en réflexion…', simBy: 'Analysé par', simStage: 'Étape', simWhy: 'Pourquoi ça marche', simBest: 'Recommandé',
    simTitle: '🔮 Simuler une situation', simDesc: 'Quoi dire MAINTENANT dans un moment précis · 5 perspectives te donnent des phrases prêtes.',
    mvTitle: '🌌 Simuler la relation', mvDesc: 'Comment la relation évoluerait en 5 étapes + ta compatibilité.',
    mvHint: 'Décris-moi la personne ou la connexion et je simule les 5 étapes de la relation',
    mvAnalyzing: 'Simulation de 5 univers…', mvCompat: 'Compatibilité', mvInsights: 'Clés de cette connexion',
    fbAsk: 'C\'était utile ?', fbThanks: 'Merci pour ton feedback ! 💛',
    placeChip: '📍 Endroits pour un rendez-vous', placeQuery: 'Quels endroits recommandes-tu pour un premier rendez-vous près de moi ?',
    planLabel: 'Planifie ton rendez-vous', suggested: 'suggéré maintenant',
    placeCats: [
      { key: 'cafe', t: '☕ Café', q: 'Quels cafés cosy y a-t-il près de moi pour un rendez-vous ?' },
      { key: 'restaurant', t: '🍽️ Restaurant', q: 'Quels restaurants avec bonne ambiance y a-t-il près de moi ?' },
      { key: 'bar', t: '🍸 Bar', q: 'Quels bons bars y a-t-il près de moi pour un rendez-vous ?' },
      { key: 'night_club', t: '💃 Club', q: 'Quels bons clubs y a-t-il près de moi pour danser ?' },
    ],
    areaEventsTitle: 'Événements près de toi', areaEventsSoon: 'Bientôt',
    thinking: 'Le coach réfléchit…', placesLoading: 'Recherche d\'endroits près de toi 📍…',
    debateSteps: [
      'Analyse des lieux proches…',
      'Dynamique sociale · lecture de l\'ambiance…',
      'Communication · vérification des avis…',
      'Intelligence émotionnelle · évaluation de la connexion…',
      'Présence numérique · recherche d\'Instagram et stories…',
      'Synthèse des meilleures options pour toi…',
    ],
    locRequesting: 'Obtention de ta localisation 📍…',
    locBlocked: 'Ton navigateur a bloqué la localisation 🔒 Active-la depuis l\'icône cadenas dans la barre d\'adresse, ou tape ta ville ci-dessous et je te suggère des endroits 👇',
    needCity: 'Dis-moi dans quelle ville tu es et je te suggère des endroits 👇',
  },
  de: {
    fab: 'KI-Coach', title: 'KI-Coach', demo: 'Beta-Version', newChat: 'Neues Gespräch', showPrev: 'Vorheriges Gespräch anzeigen', historyTitle: 'Deine Gespräche', historyEmpty: 'Noch keine gespeicherten Gespräche.', morning: 'Guten Morgen', afternoon: 'Guten Tag', evening: 'Guten Abend', discoverHint: '✨ In der App: entdecke kompatible Menschen',
    greeting: 'Hallo 👋 Ich bin dein emotionaler Dating-Coach. Erzähl mir deine Situation und ich gebe dir eine konkrete Idee für dein nächstes Gespräch.',
    chips: ['Wie starte ich ein Gespräch?', 'Ich wurde auf gelesen gelassen 😅', 'Wie schlage ich ein Date vor?'],
    placeholder: 'Beschreib deine Situation…', send: 'Senden',
    ctaTitle: 'Du hast Coach IA getestet ✦',
    ctaSubtitle: 'In der App hast du 4 Fragen am Tag, sie erinnert sich an dich und simuliert deine Beziehung.',
    ctaText: 'In der App sind es 4 Fragen täglich: sie erinnert sich, kennt deine Matches und simuliert deine Beziehung.',
    ctaDismiss: 'Weiter testen',
    freeCounterOf: 'von', freeCounterSuffix: 'kostenlos', freeCounterPrefix: 'Frage',
    taste2: 'kostenlose Fragen zum Testen', taste1: '✦ Noch 1 kostenlose Frage übrig',
    download: 'App herunterladen', share: 'Teilen', shared: 'Kopiert!',
    shareText: 'Ich habe Coach IA von Black Sugar 21 ausprobiert und er hat mir diesen Rat gegeben 👀',
    footer: 'KI-generiert · Beta-Version',
    useLoc: '📍 Meinen Standort verwenden', cityPh: 'oder gib deine Stadt ein…', copy: 'Satz kopieren', copied: '✓ Kopiert', viewMap: 'Auf Karte ansehen', webSite: 'Webseite',
    phrasesSheetTitle: 'Vorgeschlagene Sätze', noSuggestions: 'Keine Sätze verfügbar', showMore: '{n} weitere anzeigen ↓', loadMore: 'Mehr generieren',
    simChip: '🔮 Situation simulieren', simHint: 'Beschreib deine Situation und meine 5 Perspektiven analysieren sie',
    simAnalyzing: 'Ansätze werden analysiert…', simThinking: '5 Perspektiven denken nach…', simBy: 'Analysiert von', simStage: 'Phase', simWhy: 'Warum es funktioniert', simBest: 'Empfohlen',
    simTitle: '🔮 Situation simulieren', simDesc: 'Was JETZT in einem bestimmten Moment sagen · 5 Perspektiven geben dir fertige Sätze.',
    mvTitle: '🌌 Beziehung simulieren', mvDesc: 'Wie sich die Beziehung in 5 Phasen entwickeln würde + deine Kompatibilität.',
    mvHint: 'Beschreib mir die Person oder Verbindung und ich simuliere die 5 Beziehungsphasen',
    mvAnalyzing: '5 Universen werden simuliert…', mvCompat: 'Kompatibilität', mvInsights: 'Schlüssel dieser Verbindung',
    fbAsk: 'War das hilfreich?', fbThanks: 'Danke für dein Feedback! 💛',
    placeChip: '📍 Orte für ein Date', placeQuery: 'Was empfiehlst du für ein erstes Date in meiner Nähe?',
    planLabel: 'Dein Date planen', suggested: 'gerade empfohlen',
    placeCats: [
      { key: 'cafe', t: '☕ Café', q: 'Welche gemütlichen Cafés gibt es in meiner Nähe für ein Date?' },
      { key: 'restaurant', t: '🍽️ Restaurant', q: 'Welche Restaurants mit toller Atmosphäre gibt es in meiner Nähe?' },
      { key: 'bar', t: '🍸 Bar', q: 'Welche guten Bars gibt es in meiner Nähe für ein Date?' },
      { key: 'night_club', t: '💃 Club', q: 'Welche guten Clubs gibt es in meiner Nähe zum Tanzen?' },
    ],
    areaEventsTitle: 'Events in deiner Nähe', areaEventsSoon: 'Bald',
    thinking: 'Der Coach denkt nach…', placesLoading: 'Suche nach Orten in deiner Nähe 📍…',
    debateSteps: [
      'Nahe Orte werden analysiert…',
      'Soziale Dynamik · Stimmung lesen…',
      'Kommunikation · Bewertungen prüfen…',
      'Emotionale Intelligenz · Verbindung messen…',
      'Digitale Präsenz · Instagram & Stories suchen…',
      'Die besten Optionen für dich zusammenfassen…',
    ],
    locRequesting: 'Deinen Standort ermitteln 📍…',
    locBlocked: 'Dein Browser hat den Standort gesperrt 🔒 Aktiviere ihn über das Schloss-Symbol in der Adressleiste, oder gib deine Stadt unten ein und ich schlage Orte vor 👇',
    needCity: 'Sag mir, in welcher Stadt du bist, und ich schlage dir Orte vor 👇',
  },
  it: {
    fab: 'Coach IA', title: 'Coach IA', demo: 'Versione beta', newChat: 'Nuova conversazione', showPrev: 'Vedi conversazione precedente', historyTitle: 'Le tue conversazioni', historyEmpty: 'Nessuna conversazione salvata.', morning: 'Buongiorno', afternoon: 'Buon pomeriggio', evening: 'Buonasera', discoverHint: '✨ Nell\'app: scopri persone compatibili',
    greeting: 'Ciao 👋 Sono il tuo coach di intelligenza emotiva per gli appuntamenti. Dimmi la tua situazione e ti do un\'idea concreta per la tua prossima conversazione.',
    chips: ['Come inizio una conversazione?', 'Mi ha lasciato su visto 😅', 'Come propongo un appuntamento?'],
    placeholder: 'Descrivi la tua situazione…', send: 'Invia',
    ctaTitle: 'Hai provato Coach IA ✦',
    ctaSubtitle: 'Nell\'app hai 4 domande al giorno, ti ricorda e simula la tua relazione.',
    ctaText: 'Nell\'app sono 4 domande al giorno: ti ricorda, conosce i tuoi match e simula la tua relazione.',
    ctaDismiss: 'Continua a provare',
    freeCounterOf: 'di', freeCounterSuffix: 'gratis', freeCounterPrefix: 'Domanda',
    taste2: 'domande gratis per provare', taste1: '✦ Ti rimane 1 domanda gratis',
    download: 'Scarica l\'app', share: 'Condividi', shared: 'Copiato!',
    shareText: 'Ho provato Coach IA di Black Sugar 21 e mi ha dato questo consiglio 👀',
    footer: 'Generato dall\'IA · versione beta',
    useLoc: '📍 Usa la mia posizione', cityPh: 'o scrivi la tua città…', copy: 'Copia frase', copied: '✓ Copiato', viewMap: 'Vedi sulla mappa', webSite: 'Sito web',
    phrasesSheetTitle: 'Frasi suggerite', noSuggestions: 'Nessuna frase disponibile', showMore: 'Vedi altri {n} ↓', loadMore: 'Genera altre frasi',
    simChip: '🔮 Simula una situazione', simHint: 'Descrivi la tua situazione e le mie 5 prospettive la analizzano',
    simAnalyzing: 'Analisi degli approcci…', simThinking: '5 prospettive in riflessione…', simBy: 'Analizzato da', simStage: 'Fase', simWhy: 'Perché funziona', simBest: 'Consigliato',
    simTitle: '🔮 Simula una situazione', simDesc: 'Cosa dire ORA in un momento preciso · 5 prospettive ti danno frasi pronte.',
    mvTitle: '🌌 Simula la relazione', mvDesc: 'Come si evolverebbe la relazione in 5 fasi + la tua compatibilità.',
    mvHint: 'Descrivimi la persona o la connessione e simulo le 5 fasi della relazione',
    mvAnalyzing: 'Simulazione di 5 universi…', mvCompat: 'Compatibilità', mvInsights: 'Chiavi di questa connessione',
    fbAsk: 'È stato utile?', fbThanks: 'Grazie per il tuo feedback! 💛',
    placeChip: '📍 Posti per un appuntamento', placeQuery: 'Cosa mi consigli per un primo appuntamento vicino a me?',
    planLabel: 'Pianifica il tuo appuntamento', suggested: 'suggerito ora',
    placeCats: [
      { key: 'cafe', t: '☕ Caffè', q: 'Quali caffè accoglienti ci sono vicino a me per un appuntamento?' },
      { key: 'restaurant', t: '🍽️ Ristorante', q: 'Quali ristoranti con bella atmosfera ci sono vicino a me?' },
      { key: 'bar', t: '🍸 Bar', q: 'Quali buoni bar ci sono vicino a me per un appuntamento?' },
      { key: 'night_club', t: '💃 Club', q: 'Quali buoni club ci sono vicino a me per ballare?' },
    ],
    areaEventsTitle: 'Eventi vicino a te', areaEventsSoon: 'Presto',
    thinking: 'Il coach sta pensando…', placesLoading: 'Ricerca posti vicino a te 📍…',
    debateSteps: [
      'Analisi dei posti vicini…',
      'Dinamica sociale · lettura dell\'atmosfera…',
      'Comunicazione · verifica delle recensioni…',
      'Intelligenza emotiva · misurazione della connessione…',
      'Presenza digitale · ricerca di Instagram e storie…',
      'Sintesi delle migliori opzioni per te…',
    ],
    locRequesting: 'Ottenimento della tua posizione 📍…',
    locBlocked: 'Il tuo browser ha la posizione bloccata 🔒 Abilitala dall\'icona lucchetto nella barra degli indirizzi, o scrivi la tua città qui sotto e ti suggerisco posti 👇',
    needCity: 'Dimmi in quale città sei e ti suggerisco posti 👇',
  },
  ja: {
    fab: 'AIコーチ', title: 'AIコーチ', demo: 'ベータ版', newChat: '新しい会話', showPrev: '前の会話を見る', historyTitle: '会話履歴', historyEmpty: '保存された会話はまだありません。', morning: 'おはようございます', afternoon: 'こんにちは', evening: 'こんばんは', discoverHint: '✨ アプリで相性の良い人を見つけよう',
    greeting: 'こんにちは 👋 私はあなたのデートの感情知性コーチです。状況を教えてください。次の会話のための具体的なアイデアをお伝えします。',
    chips: ['どうやって会話を始める？', '既読無視された 😅', 'どうやってデートに誘う？'],
    placeholder: '状況を書いてください…', send: '送信',
    ctaTitle: 'AIコーチを試しましたね ✦',
    ctaSubtitle: 'アプリでは1日4質問、あなたを覚えてくれてリレーションをシミュレートします。',
    ctaText: 'アプリでは1日4質問：あなたを覚えてマッチを把握し、関係をシミュレートします。',
    ctaDismiss: '試し続ける',
    freeCounterOf: '/', freeCounterSuffix: '無料', freeCounterPrefix: '質問',
    taste2: '無料で試せる質問', taste1: '✦ 無料質問が残り1つ',
    download: 'アプリをダウンロード', share: 'シェア', shared: 'コピーしました！',
    shareText: 'Black Sugar 21のAIコーチを試したらこんなアドバイスをもらいました 👀',
    footer: 'AI生成 · ベータ版',
    useLoc: '📍 現在地を使う', cityPh: 'または都市名を入力…', copy: 'フレーズをコピー', copied: '✓ コピー済み', viewMap: '地図で見る', webSite: 'ウェブサイト',
    phrasesSheetTitle: '提案フレーズ', noSuggestions: 'フレーズがありません', showMore: 'さらに{n}件表示 ↓', loadMore: 'もっと生成',
    simChip: '🔮 状況をシミュレート', simHint: '状況を説明すると5つの視点で分析します',
    simAnalyzing: 'アプローチを分析中…', simThinking: '5つの視点が考え中…', simBy: '分析者', simStage: 'ステージ', simWhy: 'なぜ効果的か', simBest: 'おすすめ',
    simTitle: '🔮 状況をシミュレート', simDesc: '今この瞬間に何を言うか · 5つの視点がすぐ使えるフレーズを提案。',
    mvTitle: '🌌 関係をシミュレート', mvDesc: '5つのステージで関係がどう発展するか + 相性。',
    mvHint: '相手や関係を説明してください。5段階の関係をシミュレートします',
    mvAnalyzing: '5つのユニバースをシミュレート中…', mvCompat: '相性', mvInsights: 'この関係のポイント',
    fbAsk: '役に立ちましたか？', fbThanks: 'フィードバックありがとう！ 💛',
    placeChip: '📍 デートスポット', placeQuery: '私の近くで初デートに良い場所を教えてください',
    planLabel: 'デートを計画', suggested: '今おすすめ',
    placeCats: [
      { key: 'cafe', t: '☕ カフェ', q: '近くのデートにぴったりなカフェはどこ？' },
      { key: 'restaurant', t: '🍽️ レストラン', q: '近くの雰囲気の良いレストランはどこ？' },
      { key: 'bar', t: '🍸 バー', q: '近くのデートに良いバーはどこ？' },
      { key: 'night_club', t: '💃 クラブ', q: '近くの踊れるいいクラブはどこ？' },
    ],
    areaEventsTitle: '近くのイベント', areaEventsSoon: 'もうすぐ',
    thinking: 'コーチが考えています…', placesLoading: '近くのデートスポットを探しています 📍…',
    debateSteps: [
      '近くの場所を分析中…',
      'ソーシャルダイナミクス · 雰囲気を読む…',
      'コミュニケーション · レビューをチェック…',
      '感情知性 · つながりを測定…',
      'デジタルプレゼンス · InstagramとStories検索…',
      'あなたへのベストオプションを合成中…',
    ],
    locRequesting: '位置情報を取得中 📍…',
    locBlocked: 'ブラウザで位置情報がブロックされています 🔒 アドレスバーの鍵アイコンから有効にするか、下に都市名を入力してください 👇',
    needCity: 'どの都市にいるか教えてください 👇',
  },
  zh: {
    fab: 'AI教练', title: 'AI教练', demo: '测试版', newChat: '新对话', showPrev: '查看上一个对话', historyTitle: '我的对话', historyEmpty: '还没有保存的对话。', morning: '早上好', afternoon: '下午好', evening: '晚上好', discoverHint: '✨ 在应用中：发现合拍的人',
    greeting: '你好 👋 我是你的约会情商教练。告诉我你的情况，我会给你一个下次对话的具体建议。',
    chips: ['怎么开始一段对话？', '被已读不回了 😅', '怎么约出去？'],
    placeholder: '描述你的情况…', send: '发送',
    ctaTitle: '你已体验过AI教练 ✦',
    ctaSubtitle: '在应用中每天有4个问题，它记得你并模拟你的关系。',
    ctaText: '在应用中每天4个问题：它记得你，了解你的匹配对象，模拟你的关系。',
    ctaDismiss: '继续体验',
    freeCounterOf: '/', freeCounterSuffix: '免费', freeCounterPrefix: '问题',
    taste2: '免费体验问题', taste1: '✦ 还剩1个免费问题',
    download: '下载应用', share: '分享', shared: '已复制！',
    shareText: '我尝试了Black Sugar 21的AI教练，它给了我这个建议 👀',
    footer: 'AI生成 · 测试版',
    useLoc: '📍 使用我的位置', cityPh: '或输入你的城市…', copy: '复制短语', copied: '✓ 已复制', viewMap: '在地图上查看', webSite: '网站',
    phrasesSheetTitle: '建议短语', noSuggestions: '暂无短语', showMore: '查看另外{n}条 ↓', loadMore: '生成更多',
    simChip: '🔮 模拟情景', simHint: '描述你的情况，我的5个视角将分析它',
    simAnalyzing: '分析方法中…', simThinking: '5个视角思考中…', simBy: '分析者', simStage: '阶段', simWhy: '为什么有效', simBest: '推荐',
    simTitle: '🔮 模拟情景', simDesc: '现在该说什么 · 5个视角给你随时可用的短语。',
    mvTitle: '🌌 模拟关系', mvDesc: '关系将如何在5个阶段发展 + 你的兼容性。',
    mvHint: '告诉我这个人或连接，我来模拟5个关系阶段',
    mvAnalyzing: '模拟5个宇宙中…', mvCompat: '兼容性', mvInsights: '这段连接的关键',
    fbAsk: '这有帮助吗？', fbThanks: '感谢你的反馈！ 💛',
    placeChip: '📍 约会地点', placeQuery: '你推荐我附近哪些第一次约会的好地方？',
    planLabel: '规划你的约会', suggested: '现在推荐',
    placeCats: [
      { key: 'cafe', t: '☕ 咖啡厅', q: '附近有什么适合约会的温馨咖啡厅？' },
      { key: 'restaurant', t: '🍽️ 餐厅', q: '附近有什么气氛好的约会餐厅？' },
      { key: 'bar', t: '🍸 酒吧', q: '附近有什么适合约会的好酒吧？' },
      { key: 'night_club', t: '💃 夜店', q: '附近有什么可以跳舞的好夜店？' },
    ],
    areaEventsTitle: '附近活动', areaEventsSoon: '即将',
    thinking: '教练正在思考…', placesLoading: '正在寻找附近的约会地点 📍…',
    debateSteps: [
      '分析附近地点…',
      '社交动态 · 读取氛围…',
      '沟通 · 检查评价…',
      '情商 · 衡量连接…',
      '数字形象 · 搜索Instagram和Stories…',
      '为你整合最佳选项…',
    ],
    locRequesting: '获取你的位置 📍…',
    locBlocked: '你的浏览器已禁用位置权限 🔒 请在地址栏的锁定图标处启用，或在下方输入你的城市，我来推荐地方 👇',
    needCity: '告诉我你在哪个城市，我来推荐地方 👇',
  },
  ko: {
    fab: 'AI 코치', title: 'AI 코치', demo: '베타 버전', newChat: '새 대화', showPrev: '이전 대화 보기', historyTitle: '내 대화', historyEmpty: '저장된 대화가 아직 없어요.', morning: '좋은 아침이에요', afternoon: '좋은 오후예요', evening: '좋은 저녁이에요', discoverHint: '✨ 앱에서 잘 맞는 사람을 만나보세요',
    greeting: '안녕하세요 👋 저는 당신의 데이트 감성 지능 코치예요. 상황을 알려주시면 다음 대화를 위한 구체적인 아이디어를 드릴게요.',
    chips: ['어떻게 대화를 시작하지?', '읽씹 당했어요 😅', '어떻게 데이트 신청해?'],
    placeholder: '상황을 적어주세요…', send: '보내기',
    ctaTitle: 'AI 코치를 경험했어요 ✦',
    ctaSubtitle: '앱에서는 하루 4개 질문, 나를 기억하고 관계를 시뮬레이션해요.',
    ctaText: '앱에서는 하루 4개 질문: 나를 기억하고, 매치를 파악하고, 관계를 시뮬레이션해요.',
    ctaDismiss: '계속 체험하기',
    freeCounterOf: '/', freeCounterSuffix: '무료', freeCounterPrefix: '질문',
    taste2: '무료로 체험할 질문', taste1: '✦ 무료 질문 1개 남았어요',
    download: '앱 다운로드', share: '공유', shared: '복사됐어요!',
    shareText: 'Black Sugar 21 AI 코치를 써봤는데 이런 조언을 해줬어요 👀',
    footer: 'AI 생성 · 베타 버전',
    useLoc: '📍 내 위치 사용', cityPh: '또는 도시 입력…', copy: '문구 복사', copied: '✓ 복사됨', viewMap: '지도에서 보기', webSite: '웹사이트',
    phrasesSheetTitle: '추천 문구', noSuggestions: '사용 가능한 문구가 없어요', showMore: '{n}개 더 보기 ↓', loadMore: '더 생성하기',
    simChip: '🔮 상황 시뮬레이션', simHint: '상황을 설명하면 5가지 관점이 분석해요',
    simAnalyzing: '접근법 분석 중…', simThinking: '5가지 관점 생각 중…', simBy: '분석자', simStage: '단계', simWhy: '왜 효과적인가', simBest: '추천',
    simTitle: '🔮 상황 시뮬레이션', simDesc: '지금 이 순간 무슨 말을 할지 · 5가지 관점이 즉시 사용 가능한 문구를 제공해요.',
    mvTitle: '🌌 관계 시뮬레이션', mvDesc: '관계가 5단계에 걸쳐 어떻게 발전할지 + 궁합.',
    mvHint: '상대방이나 관계를 설명해 주시면 5단계 관계를 시뮬레이션할게요',
    mvAnalyzing: '5개 우주 시뮬레이션 중…', mvCompat: '궁합', mvInsights: '이 연결의 핵심',
    fbAsk: '도움이 됐나요?', fbThanks: '피드백 감사해요! 💛',
    placeChip: '📍 데이트 스팟', placeQuery: '내 근처에서 첫 데이트하기 좋은 곳 추천해줄 수 있어?',
    planLabel: '데이트 계획', suggested: '지금 추천',
    placeCats: [
      { key: 'cafe', t: '☕ 카페', q: '근처에 데이트하기 좋은 아늑한 카페가 어디 있어?' },
      { key: 'restaurant', t: '🍽️ 레스토랑', q: '근처에 분위기 좋은 데이트 식당이 어디 있어?' },
      { key: 'bar', t: '🍸 바', q: '근처에 데이트하기 좋은 바가 어디 있어?' },
      { key: 'night_club', t: '💃 클럽', q: '근처에 춤출 수 있는 좋은 클럽이 어디 있어?' },
    ],
    areaEventsTitle: '내 근처 이벤트', areaEventsSoon: '곧',
    thinking: '코치가 생각 중이에요…', placesLoading: '근처 데이트 스팟 찾는 중 📍…',
    debateSteps: [
      '근처 장소 분석 중…',
      '사회적 역학 · 분위기 파악…',
      '소통 · 리뷰 확인…',
      '감성 지능 · 연결감 측정…',
      '디지털 존재감 · Instagram과 스토리 검색…',
      '최적의 옵션 종합 중…',
    ],
    locRequesting: '위치 정보 가져오는 중 📍…',
    locBlocked: '브라우저에서 위치가 차단됐어요 🔒 주소 표시줄의 자물쇠 아이콘에서 활성화하거나, 아래에 도시를 입력하면 장소를 추천해 드릴게요 👇',
    needCity: '어느 도시에 계신지 알려주시면 장소를 추천해 드릴게요 👇',
  },
  ru: {
    fab: 'ИИ-коуч', title: 'ИИ-коуч', demo: 'Бета-версия', newChat: 'Новый разговор', showPrev: 'Показать предыдущий разговор', historyTitle: 'Твои разговоры', historyEmpty: 'Пока нет сохранённых разговоров.', morning: 'Доброе утро', afternoon: 'Добрый день', evening: 'Добрый вечер', discoverHint: '✨ В приложении: знакомься с подходящими людьми',
    greeting: 'Привет 👋 Я твой коуч эмоционального интеллекта для свиданий. Расскажи мне свою ситуацию, и я дам конкретную идею для следующего разговора.',
    chips: ['Как начать разговор?', 'Меня оставили на «читал» 😅', 'Как пригласить на свидание?'],
    placeholder: 'Опиши свою ситуацию…', send: 'Отправить',
    ctaTitle: 'Ты попробовал ИИ-коуча ✦',
    ctaSubtitle: 'В приложении у тебя 4 вопроса в день, он запоминает тебя и симулирует твои отношения.',
    ctaText: 'В приложении 4 вопроса в день: он помнит тебя, знает твои мэтчи и симулирует отношения.',
    ctaDismiss: 'Продолжить пробовать',
    freeCounterOf: 'из', freeCounterSuffix: 'бесплатно', freeCounterPrefix: 'Вопрос',
    taste2: 'бесплатных вопроса для пробы', taste1: '✦ Остался 1 бесплатный вопрос',
    download: 'Скачать приложение', share: 'Поделиться', shared: 'Скопировано!',
    shareText: 'Я попробовал ИИ-коуча Black Sugar 21, и он дал мне этот совет 👀',
    footer: 'Сгенерировано ИИ · бета-версия',
    useLoc: '📍 Использовать моё местоположение', cityPh: 'или введи свой город…', copy: 'Скопировать фразу', copied: '✓ Скопировано', viewMap: 'Посмотреть на карте', webSite: 'Веб-сайт',
    phrasesSheetTitle: 'Предложенные фразы', noSuggestions: 'Нет доступных фраз', showMore: 'Ещё {n} ↓', loadMore: 'Сгенерировать ещё',
    simChip: '🔮 Симулировать ситуацию', simHint: 'Опиши ситуацию, и мои 5 перспектив её проанализируют',
    simAnalyzing: 'Анализ подходов…', simThinking: '5 перспектив думают…', simBy: 'Проанализировано', simStage: 'Этап', simWhy: 'Почему это работает', simBest: 'Рекомендуется',
    simTitle: '🔮 Симулировать ситуацию', simDesc: 'Что сказать СЕЙЧАС в конкретный момент · 5 перспектив дают готовые фразы.',
    mvTitle: '🌌 Симулировать отношения', mvDesc: 'Как развивались бы отношения в 5 этапах + ваша совместимость.',
    mvHint: 'Опиши мне человека или связь, и я симулирую 5 этапов отношений',
    mvAnalyzing: 'Симуляция 5 вселенных…', mvCompat: 'Совместимость', mvInsights: 'Ключи этой связи',
    fbAsk: 'Было полезно?', fbThanks: 'Спасибо за отзыв! 💛',
    placeChip: '📍 Места для свидания', placeQuery: 'Что посоветуешь для первого свидания рядом со мной?',
    planLabel: 'Планируй свидание', suggested: 'сейчас рекомендуется',
    placeCats: [
      { key: 'cafe', t: '☕ Кафе', q: 'Какие уютные кафе есть рядом для свидания?' },
      { key: 'restaurant', t: '🍽️ Ресторан', q: 'Какие рестораны с хорошей атмосферой есть рядом?' },
      { key: 'bar', t: '🍸 Бар', q: 'Какие хорошие бары есть рядом для свидания?' },
      { key: 'night_club', t: '💃 Клуб', q: 'Какие хорошие клубы есть рядом потанцевать?' },
    ],
    areaEventsTitle: 'События рядом', areaEventsSoon: 'Скоро',
    thinking: 'Коуч думает…', placesLoading: 'Ищу места для свидания 📍…',
    debateSteps: [
      'Анализ ближайших мест…',
      'Социальная динамика · читаю атмосферу…',
      'Коммуникация · проверяю отзывы…',
      'Эмоциональный интеллект · измеряю связь…',
      'Цифровое присутствие · ищу Instagram и истории…',
      'Синтезирую лучшие варианты для тебя…',
    ],
    locRequesting: 'Получаю твоё местоположение 📍…',
    locBlocked: 'В браузере заблокирован доступ к местоположению 🔒 Разреши в настройках значка замка в адресной строке, или напиши свой город внизу и я посоветую места 👇',
    needCity: 'Напиши, в каком городе ты находишься, и я посоветую места 👇',
  },
  ar: {
    fab: 'مدرّب الذكاء', title: 'مدرّب الذكاء', demo: 'إصدار تجريبي', newChat: 'محادثة جديدة', showPrev: 'عرض المحادثة السابقة', historyTitle: 'محادثاتك', historyEmpty: 'لا توجد محادثات محفوظة بعد.', morning: 'صباح الخير', afternoon: 'مساء الخير', evening: 'مساء النور', discoverHint: '✨ في التطبيق: اكتشف أشخاصاً متوافقين',
    greeting: 'مرحباً 👋 أنا مدرّب ذكاءك العاطفي في المواعدة. أخبرني بوضعك وسأعطيك فكرة محددة لمحادثتك القادمة.',
    chips: ['كيف أبدأ محادثة؟', 'رأى الرسالة ولم يرد 😅', 'كيف أدعوه/ها لموعد؟'],
    placeholder: 'اكتب وضعك…', send: 'إرسال',
    ctaTitle: 'جرّبت مدرّب الذكاء ✦',
    ctaSubtitle: 'في التطبيق لديك 4 أسئلة يومياً، ويتذكّرك ويحاكي علاقتك.',
    ctaText: 'في التطبيق 4 أسئلة يومياً: يتذكّرك، يعرف مطابقاتك ويحاكي علاقتك.',
    ctaDismiss: 'الاستمرار في التجربة',
    freeCounterOf: 'من', freeCounterSuffix: 'مجاني', freeCounterPrefix: 'سؤال',
    taste2: 'أسئلة مجانية للتجربة', taste1: '✦ سؤال مجاني واحد متبقٍ',
    download: 'تحميل التطبيق', share: 'مشاركة', shared: 'تم النسخ!',
    shareText: 'جرّبت مدرّب الذكاء من Black Sugar 21 وأعطاني هذه النصيحة 👀',
    footer: 'مُنشأ بالذكاء الاصطناعي · إصدار تجريبي',
    useLoc: '📍 استخدام موقعي', cityPh: 'أو اكتب مدينتك…', copy: 'نسخ العبارة', copied: '✓ تم النسخ', viewMap: 'عرض على الخريطة', webSite: 'الموقع',
    phrasesSheetTitle: 'عبارات مقترحة', noSuggestions: 'لا توجد عبارات متاحة', showMore: 'عرض {n} أخرى ↓', loadMore: 'توليد المزيد',
    simChip: '🔮 محاكاة موقف', simHint: 'صف وضعك و5 وجهات نظر ستحلّله',
    simAnalyzing: 'تحليل المقاربات…', simThinking: '5 وجهات نظر تفكّر…', simBy: 'تحليل بواسطة', simStage: 'مرحلة', simWhy: 'لماذا يعمل', simBest: 'موصى به',
    simTitle: '🔮 محاكاة موقف', simDesc: 'ماذا تقول الآن في لحظة معينة · 5 وجهات نظر تعطيك عبارات جاهزة.',
    mvTitle: '🌌 محاكاة العلاقة', mvDesc: 'كيف ستتطور العلاقة في 5 مراحل + توافقك.',
    mvHint: 'صف لي الشخص أو الاتصال وسأحاكي 5 مراحل للعلاقة',
    mvAnalyzing: 'محاكاة 5 أكوان…', mvCompat: 'التوافق', mvInsights: 'مفاتيح هذا الاتصال',
    fbAsk: 'هل كان مفيداً؟', fbThanks: 'شكراً على ملاحظاتك! 💛',
    placeChip: '📍 أماكن للقاء', placeQuery: 'ما الأماكن التي توصي بها لأول موعد بالقرب مني؟',
    planLabel: 'خطّط لموعدك', suggested: 'مقترح الآن',
    placeCats: [
      { key: 'cafe', t: '☕ مقهى', q: 'ما المقاهي الدافئة القريبة مني لموعد؟' },
      { key: 'restaurant', t: '🍽️ مطعم', q: 'ما المطاعم ذات الأجواء الجيدة القريبة مني؟' },
      { key: 'bar', t: '🍸 بار', q: 'ما البارات الجيدة القريبة مني لموعد؟' },
      { key: 'night_club', t: '💃 نادٍ', q: 'ما النوادي الجيدة القريبة مني للرقص؟' },
    ],
    areaEventsTitle: 'فعاليات قريبة', areaEventsSoon: 'قريباً',
    thinking: 'المدرّب يفكّر…', placesLoading: 'البحث عن أماكن قريبة منك 📍…',
    debateSteps: [
      'تحليل الأماكن القريبة…',
      'الديناميكيات الاجتماعية · قراءة الأجواء…',
      'التواصل · مراجعة التقييمات…',
      'الذكاء العاطفي · قياس الاتصال…',
      'الحضور الرقمي · البحث عن Instagram والقصص…',
      'تجميع أفضل الخيارات لك…',
    ],
    locRequesting: 'جلب موقعك 📍…',
    locBlocked: 'متصفحك يحظر الوصول إلى موقعك 🔒 فعّله من أيقونة القفل في شريط العناوين، أو اكتب مدينتك أدناه وسأقترح أماكن 👇',
    needCity: 'أخبرني في أي مدينة أنت وسأقترح أماكن 👇',
  },
  id: {
    fab: 'Coach AI', title: 'Coach AI', demo: 'Versi beta', newChat: 'Percakapan baru', showPrev: 'Lihat percakapan sebelumnya', historyTitle: 'Percakapanmu', historyEmpty: 'Belum ada percakapan tersimpan.', morning: 'Selamat pagi', afternoon: 'Selamat siang', evening: 'Selamat malam', discoverHint: '✨ Di app: temukan orang yang cocok',
    greeting: 'Halo 👋 Aku adalah Coach kecerdasan emosional kencanmu. Ceritakan situasimu dan aku akan memberikan ide konkret untuk percakapan berikutmu.',
    chips: ['Gimana caranya mulai percakapan?', 'Di-ghosting deh 😅', 'Gimana caranya ngajak kencan?'],
    placeholder: 'Ceritakan situasimu…', send: 'Kirim',
    ctaTitle: 'Kamu sudah coba Coach AI ✦',
    ctaSubtitle: 'Di app kamu punya 4 pertanyaan sehari, dia ingat kamu dan mensimulasikan hubunganmu.',
    ctaText: 'Di app ada 4 pertanyaan sehari: dia ingat kamu, tahu match-mu, dan mensimulasikan hubunganmu.',
    ctaDismiss: 'Lanjut coba',
    freeCounterOf: 'dari', freeCounterSuffix: 'gratis', freeCounterPrefix: 'Pertanyaan',
    taste2: 'pertanyaan gratis untuk dicoba', taste1: '✦ Tersisa 1 pertanyaan gratis',
    download: 'Unduh app', share: 'Bagikan', shared: 'Disalin!',
    shareText: 'Aku coba Coach AI dari Black Sugar 21 dan dia kasih saran ini 👀',
    footer: 'Dibuat AI · versi beta',
    useLoc: '📍 Gunakan lokasimu', cityPh: 'atau ketik kotamu…', copy: 'Salin kalimat', copied: '✓ Disalin', viewMap: 'Lihat di peta', webSite: 'Situs web',
    phrasesSheetTitle: 'Kalimat yang disarankan', noSuggestions: 'Tidak ada kalimat tersedia', showMore: 'Lihat {n} lagi ↓', loadMore: 'Buat lebih banyak',
    simChip: '🔮 Simulasikan situasi', simHint: 'Ceritakan situasimu dan 5 perspektifku akan menganalisisnya',
    simAnalyzing: 'Menganalisis pendekatan…', simThinking: '5 perspektif sedang berpikir…', simBy: 'Dianalisis oleh', simStage: 'Tahap', simWhy: 'Kenapa berhasil', simBest: 'Direkomendasikan',
    simTitle: '🔮 Simulasikan situasi', simDesc: 'Apa yang harus dikatakan SEKARANG dalam momen tertentu · 5 perspektif memberimu kalimat siap pakai.',
    mvTitle: '🌌 Simulasikan hubungan', mvDesc: 'Bagaimana hubungan akan berkembang dalam 5 tahap + kompatibilitasmu.',
    mvHint: 'Ceritakan orang atau koneksinya dan aku akan mensimulasikan 5 tahap hubungan',
    mvAnalyzing: 'Mensimulasikan 5 alam semesta…', mvCompat: 'Kompatibilitas', mvInsights: 'Kunci koneksi ini',
    fbAsk: 'Apakah ini membantu?', fbThanks: 'Terima kasih atas masukkanmu! 💛',
    placeChip: '📍 Tempat kencan', placeQuery: 'Tempat apa yang kamu rekomendasikan untuk kencan pertama di dekatku?',
    planLabel: 'Rencanakan kencanmu', suggested: 'disarankan sekarang',
    placeCats: [
      { key: 'cafe', t: '☕ Kafe', q: 'Kafe mana yang nyaman di dekatku untuk kencan?' },
      { key: 'restaurant', t: '🍽️ Restoran', q: 'Restoran mana dengan suasana bagus di dekatku?' },
      { key: 'bar', t: '🍸 Bar', q: 'Bar mana yang bagus di dekatku untuk kencan?' },
      { key: 'night_club', t: '💃 Klub', q: 'Klub mana yang bagus di dekatku untuk menari?' },
    ],
    areaEventsTitle: 'Acara di dekatmu', areaEventsSoon: 'Segera',
    thinking: 'Coach sedang berpikir…', placesLoading: 'Mencari tempat kencan di dekatmu 📍…',
    debateSteps: [
      'Menganalisis tempat terdekat…',
      'Dinamika sosial · membaca suasana…',
      'Komunikasi · memeriksa ulasan…',
      'Kecerdasan emosional · mengukur koneksi…',
      'Kehadiran digital · mencari Instagram dan stories…',
      'Mensintesis opsi terbaik untukmu…',
    ],
    locRequesting: 'Mendapatkan lokasimu 📍…',
    locBlocked: 'Browsermu memblokir lokasi 🔒 Aktifkan dari ikon gembok di bilah alamat, atau ketik kotamu di bawah dan aku sarankan tempat 👇',
    needCity: 'Beritahu aku di kota mana kamu dan aku sarankan tempat 👇',
  },
  tr: {
    fab: 'Coach AI', title: 'Coach AI', demo: 'Beta sürümü', newChat: 'Yeni sohbet', showPrev: 'Önceki sohbetleri gör', historyTitle: 'Sohbetlerin', historyEmpty: 'Henüz kayıtlı sohbet yok.', morning: 'Günaydın', afternoon: 'İyi günler', evening: 'İyi akşamlar', discoverHint: '✨ Uygulamada: uyumlu kişileri keşfet',
    greeting: 'Merhaba 👋 Ben senin duygusal zeka flört koçunum. Durumunu anlat, bir sonraki konuşman için somut fikirler vereyim.',
    chips: ['Nasıl konuşmaya başlarım?', 'Okundu ama cevap yok 😅', 'Nasıl randevuya davet ederim?'],
    placeholder: 'Durumunu anlat…', send: 'Gönder',
    ctaTitle: 'Coach AI\'yı denedin ✦',
    ctaSubtitle: 'Uygulamada günde 4 sorun var, seni hatırlıyor ve ilişkini simüle ediyor.',
    ctaText: 'Uygulamada günde 4 soru: seni hatırlıyor, eşleşmeni tanıyor ve ilişkini simüle ediyor.',
    ctaDismiss: 'Denemeye devam et',
    freeCounterOf: 'tanesi', freeCounterSuffix: 'ücretsiz', freeCounterPrefix: 'Soru',
    taste2: 'ücretsiz soru denemesi', taste1: '✦ 1 ücretsiz soru kaldı',
    download: 'Uygulamayı indir', share: 'Paylaş', shared: 'Kopyalandı!',
    shareText: 'Black Sugar 21\'in Coach AI\'sını denedim ve bu tavsiyeyi aldım 👀',
    footer: 'Yapay Zeka tarafından oluşturuldu · beta',
    useLoc: '📍 Konumumu kullan', cityPh: 'ya da şehrini yaz…', copy: 'İfadeyi kopyala', copied: '✓ Kopyalandı', viewMap: 'Haritada gör', webSite: 'Web sitesi',
    phrasesSheetTitle: 'Önerilen ifadeler', noSuggestions: 'Kullanılabilir ifade yok', showMore: '{n} tane daha gör ↓', loadMore: 'Daha fazla ifade oluştur',
    simChip: '🔮 Durumu simüle et', simHint: 'Durumunu açıkla, 5 perspektifim analiz etsin',
    simAnalyzing: 'Yaklaşımlar analiz ediliyor…', simThinking: '5 perspektif düşünüyor…', simBy: 'Analiz eden', simStage: 'Aşama', simWhy: 'Neden işe yarıyor', simBest: 'Önerilen',
    simTitle: '🔮 Durumu simüle et', simDesc: 'ŞİMDİ ne söyleneceği · 5 perspektif sana kullanıma hazır ifadeler sunuyor.',
    mvTitle: '🌌 İlişkiyi simüle et', mvDesc: 'İlişki 5 aşamada nasıl gelişir + uyumunuz.',
    mvHint: 'Kişiyi ya da bağlantıyı anlat, ilişkinin 5 aşamasını simüle edeyim',
    mvAnalyzing: '5 evren simüle ediliyor…', mvCompat: 'Uyumluluk', mvInsights: 'Bu bağlantının anahtarları',
    fbAsk: 'Bu faydalı oldu mu?', fbThanks: 'Geri bildiriminiz için teşekkürler! 💛',
    placeChip: '📍 Randevu yerleri', placeQuery: 'Yakınımda ilk randevu için ne tavsiye edersin?',
    planLabel: 'Randevunu planla', suggested: 'şu an önerilen',
    placeCats: [
      { key: 'cafe', t: '☕ Kafe', q: 'Randevu için yakınımda hangi kafeler var?' },
      { key: 'restaurant', t: '🍽️ Restoran', q: 'Yakınımda atmosferi iyi hangi restoranlar var?' },
      { key: 'bar', t: '🍸 Bar', q: 'Randevu için yakınımda hangi barlar var?' },
      { key: 'night_club', t: '💃 Kulüp', q: 'Geceleri dans etmek için yakınımda hangi kulüpler var?' },
    ],
    areaEventsTitle: 'Yakınındaki etkinlikler', areaEventsSoon: 'Yakında',
    thinking: 'Coach düşünüyor…', placesLoading: 'Yakındaki randevu yerleri aranıyor 📍…',
    debateSteps: [
      'En yakın yerler analiz ediliyor…',
      'Sosyal dinamikler · atmosfer okunuyor…',
      'İletişim · yorumlar inceleniyor…',
      'Duygusal zeka · bağlantı değerlendiriliyor…',
      'Dijital varlık · Instagram ve stories aranıyor…',
      'Senin için en iyi seçenekler sentezleniyor…',
    ],
    locRequesting: 'Konumun alınıyor 📍…',
    locBlocked: 'Tarayıcın konumu engelliyor 🔒 Adres çubuğundaki kilit simgesinden etkinleştir ya da aşağıya şehrini yaz, yer önereyim 👇',
    needCity: 'Hangi şehirde olduğunu söyle, yer önereceğim 👇',
  },
};

@Component({
  selector: 'app-coach-widget',
  standalone: true,
  imports: [CommonModule, FormsModule, UiPillComponent, UiSkeletonComponent, UiButtonComponent, UiPhoneInputComponent, CoachPlaceCardComponent, CoachSessionsListComponent],
  templateUrl: './coach-widget.component.html',
  styleUrls: ['./coach-widget.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoachWidgetComponent implements OnDestroy {
  readonly isBrowser: boolean;
  /** Mobile: the EXACT visible-viewport rectangle (top = visualViewport.offsetTop, height =
   *  visualViewport.height). The panel is pinned to this rect so it always fills exactly what the user
   *  can see — fullscreen when no keyboard, and above the keyboard when it's open (composer included).
   *  An opaque backdrop covers the rest, so the page NEVER shows through. null on desktop/embedded. */
  readonly panelRect = signal<{ top: number; height: number } | null>(null);
  private vvHandler = () => {
    const vv: any = (window as any).visualViewport;
    if (!vv || this.embedded || window.innerWidth > 600) { this.panelRect.set(null); return; }
    this.panelRect.set({ top: Math.round(vv.offsetTop), height: Math.round(vv.height) });
    if (this.open()) setTimeout(() => this.scrollMessagesToBottom(), 50);
  };
  private scrollMessagesToBottom() {
    if (!this.isBrowser) return;
    const el = document.querySelector('.cw-body');
    if (el) el.scrollTop = el.scrollHeight;
  }
  // Edge case (iOS Safari / bfcache): the Google/Apple OAuth popup can navigate full-page, so the
  // sign-in promise may never settle — leaving the "Signing you in…" overlay STUCK when the user
  // returns (back button, account-chooser dismissed, or page restored from Safari's bfcache, where
  // the in-memory signingIn=true is snapshotted). When the page becomes visible/focused again, give
  // Firebase a brief moment to settle, then either finish the sign-in (if it actually succeeded) or
  // dismiss the overlay so the user is NEVER trapped on "Iniciando sesión…".
  private signInWatchdog: any = null;
  private clearOAuthPending() { try { sessionStorage.removeItem(CoachWidgetComponent.LS_OAUTH_PENDING); } catch { /* noop */ } }
  private resolveStuckSignIn = () => {
    if (!this.isBrowser || !this.signingIn()) return;
    clearTimeout(this.signInWatchdog);
    this.signInWatchdog = setTimeout(() => {
      if (!this.signingIn()) return;                                        // popup await/finally / effect already cleared it
      if (this.firebase.currentUser()) { this.clearOAuthPending(); this.signingIn.set(false); this.afterSignIn(); } // succeeded → proceed
      else { this.clearOAuthPending(); this.signingIn.set(false); }         // came back without finishing → un-stick
    }, 1800);
  };
  private onVisibilityReturn = () => { if (this.isBrowser && document.visibilityState === 'visible') this.resolveStuckSignIn(); };
  ngOnDestroy() {
    const vv: any = this.isBrowser ? (window as any).visualViewport : null;
    if (vv) { vv.removeEventListener('resize', this.vvHandler); vv.removeEventListener('scroll', this.vvHandler); }
    if (this.isBrowser) {
      window.removeEventListener('pageshow', this.resolveStuckSignIn);
      window.removeEventListener('focus', this.resolveStuckSignIn);
      document.removeEventListener('visibilitychange', this.onVisibilityReturn);
      clearTimeout(this.signInWatchdog);
      this.stopOtpAutoRead();
      this.stopDebateSteps();
      this.cleanupScrollObserver();
    }
  }

  private scrollObserver: MutationObserver | null = null;

  @ViewChild('body') set bodyElement(ref: ElementRef) {
    if (ref && this.isBrowser) {
      this.setupScrollObserver(ref.nativeElement);
    } else {
      this.cleanupScrollObserver();
    }
  }

  private _initialScrollDone = false;

  private setupScrollObserver(el: HTMLElement) {
    this.cleanupScrollObserver();
    this._initialScrollDone = false;
    // Instant jump to bottom on mount (no animation — like WhatsApp/Instagram)
    this.snapToBottom(el);
    // Also scroll on mutations (new messages, typing state, place cards)
    this.scrollObserver = new MutationObserver(() => {
      if (!this._initialScrollDone) {
        // Still in initial load: keep snapping instantly, no animation
        this.snapToBottom(el);
      } else {
        this.scrollToBottom(el);
      }
    });
    this.scrollObserver.observe(el, { childList: true, subtree: true });
    // After first paint settles, mark initial load done
    setTimeout(() => { this._initialScrollDone = true; }, 300);
  }

  private cleanupScrollObserver() {
    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
  }

  /** Instantly jumps to bottom with NO animation whatsoever (for initial load) */
  private snapToBottom(el: HTMLElement) {
    // Override any inherited scroll-behavior for this operation
    const prev = el.style.scrollBehavior;
    el.style.scrollBehavior = 'auto';
    el.scrollTop = el.scrollHeight;
    // Staggered to catch late DOM insertions (images/cards loading)
    setTimeout(() => { el.style.scrollBehavior = 'auto'; el.scrollTop = el.scrollHeight; }, 0);
    setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
    setTimeout(() => { el.scrollTop = el.scrollHeight; el.style.scrollBehavior = prev; }, 150);
  }

  /** Scrolls to bottom for new messages — also instant (no smooth animation) */
  private scrollToBottom(el: HTMLElement) {
    const msgs = this.messages();
    const lastMsg = msgs[msgs.length - 1];
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    if (lastMsg?.role === 'user' || lastMsg?.typing || isNearBottom) {
      el.scrollTop = el.scrollHeight;
      setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
    }
  }
  readonly open = signal(false);
  // Embedded mode: render the coach inline as a full panel (no FAB / overlay / close) — used by the
  // web-app shell where the Coach is the main centerpiece. Forces the panel open.
  private _embedded = false;
  @Input() set embedded(v: boolean) { this._embedded = v; if (v) this.open.set(true); }
  get embedded(): boolean { return this._embedded; }

  readonly messages = signal<Msg[]>([]);
  // Multi-conversation (ChatGPT-style): every chat is saved to localStorage so nothing is lost and
  // the user can SELECT a previous session and continue it. The active conversation's messages live
  // in `messages`; the full list lives in localStorage and is surfaced via the history picker.
  readonly confirmSignOut = signal(false);
  readonly historyOpen = signal(false);
  readonly historyLoading = signal(false);
  readonly chatLoading = signal(false); // initial Firestore restore (logged-in) → card-preview skeleton
  readonly convoList = signal<Array<{ id: string; title: string; updatedAt: number; active: boolean }>>([]);
  private activeId = '';
  // How many messages of the active session are already persisted to Firestore (logged-in only),
  // so the persistence effect appends only NEW ones instead of duplicating.
  private persistedCounts = new Map<string, number>();
  private static readonly LS_CONVOS = 'bs21_coach_convos';
  private static readonly LS_ACTIVE = 'bs21_coach_active';
  // sessionStorage flag marking an in-flight full-page OAuth redirect (survives the navigation to
  // accounts.google.com and back), so on return we finish the sign-in / un-stick the overlay.
  private static readonly LS_OAUTH_PENDING = 'bs21_oauth_redirect';
  readonly busy = signal(false);
  readonly justShared = signal(false);
  readonly copiedIdx = signal<number | string | null>(null);
  readonly expandedPhraseMessages = new Set<number>();
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
  // expose to template (module-level const not accessible otherwise)
  readonly FREE_TASTE = FREE_TASTE;
  /** "Pregunta 1 de 2 gratis" — localized free-taste counter label. */
  freeCounterLabel(): string {
    const n = this.freeCounterNum();
    const t = this.t();
    if (t.freeCounterOf) {
      return `${t.freeCounterPrefix} ${n} ${t.freeCounterOf} ${FREE_TASTE} ${t.freeCounterSuffix}`;
    }
    return this.freeLeft() === 1 ? t.taste1 : `✦ ${this.freeLeft()} ${t.taste2}`;
  }
  private readonly coachReplies = signal(0); // reactive so the free-taste counter + CTA update live
  // R50: app-store CTA + free-taste funnel are OFF until the apps are approved. Backend sends `appCta`
  // (RC flag coach_demo_app_cta, default false) → both stay hidden until flipped on in Remote Config.
  readonly appCtaEnabled = signal(false);
  // Plan C: the CTA is NOT a hard wall — the user can dismiss it and keep chatting.
  // The backstop (FREE_TASTE per session) still prevents unlimited free use; the CTA is a generous nudge.
  readonly ctaDismissed = signal(false);
  dismissCta() { this.ctaDismissed.set(true); this.ga('coach_demo_cta_dismiss'); }
  private lastCoachText = '';
  private lastUserMsg = '';
  /** Last known GPS coords obtained from the browser — injected into every ask() call
   *  so typed place messages also benefit from accurate location, not just chip presses. */
  private lastKnownCoords: { lat: number; lng: number } | null = null;
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
  // Show the premium CTA once FREE_TASTE replies are used, unless the user dismissed it.
  // "Seguir probando" (dismiss) makes the CTA non-blocking — generous soft-gate.
  readonly showCta = computed(() => this.appCtaEnabled() && this.coachReplies() >= FREE_TASTE && !this.ctaDismissed());
  readonly freeLeft = computed(() => Math.max(0, FREE_TASTE - this.coachReplies()));
  // Counter: "Pregunta X de 2 gratis" shown while < FREE_TASTE replies have been received.
  // coachReplies() is 0 before any answer, 1 after first, etc.
  // Show when appCtaEnabled and replies < FREE_TASTE (i.e. there are still free questions left).
  readonly showFreeCounter = computed(() => this.appCtaEnabled() && this.coachReplies() < FREE_TASTE);
  // "Pregunta 1 de 2" before reply 1, "Pregunta 2 de 2" after reply 1
  readonly freeCounterNum = computed(() => Math.min(this.coachReplies() + 1, FREE_TASTE));
  // Time-aware date-place suggestion: highlight the category that fits the current local hour
  // (morning→café, day→restaurant, evening→bar, late-night→club) using the app's venue categories.
  // R62: date-planner config from Remote Config (coach_planner_config) — single source shared with
  // iOS/Android. Falls back to the i18n placeCats when RC is unavailable. NOT hardcoded.
  readonly rcPlanner = signal<any | null>(null);
  readonly planCats = computed(() => {
    const rc = this.rcPlanner(); const lang = this.lang();
    if (rc?.categories?.length) {
      return rc.categories.map((c: any) => ({
        key: c.key,
        t: (c.emoji ? c.emoji + ' ' : '') + (c.label?.[lang] || c.label?.['en'] || c.key),
        q: c.query?.[lang] || c.query?.['en'] || '',
      }));
    }
    return this.t().placeCats;
  });
  readonly planLabelText = computed(() => {
    const rc = this.rcPlanner(); const lang = this.lang();
    return (rc?.planLabel?.[lang] || rc?.planLabel?.['en']) || this.t().planLabel;
  });
  readonly suggestedNowText = computed(() => {
    const rc = this.rcPlanner(); const lang = this.lang();
    return (rc?.suggestedNow?.[lang] || rc?.suggestedNow?.['en']) || this.t().suggested;
  });
  readonly suggestedCat = computed(() => {
    void this.lang(); // re-evaluate on language change
    const h = this.isBrowser ? new Date().getHours() : 13;
    const rc = this.rcPlanner();
    if (rc?.categories?.length) {
      const hit = rc.categories.find((c: any) => {
        if (!Array.isArray(c.hours) || c.hours.length !== 2) return false;
        const [s, e] = c.hours;
        return s <= e ? (h >= s && h < e) : (h >= s || h < e);
      });
      if (hit) return hit.key;
    }
    if (h >= 5 && h < 12) return 'cafe';
    if (h >= 12 && h < 18) return 'restaurant';
    if (h >= 18 && h < 23) return 'bar';
    return 'night_club'; // 23:00–05:00
  });
  // Welcome/empty state (ChatGPT/Claude-style) — shown before the first real exchange.
  readonly isWelcome = computed(() => this.messages().length <= 1 && !this.simMode() && !this.simLoading() && !this.thinking());
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

  constructor(@Inject(PLATFORM_ID) platformId: object, private translation: TranslationService, private firebase: FirebaseService, private router: Router) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      const vv: any = (window as any).visualViewport;
      if (vv) { vv.addEventListener('resize', this.vvHandler); vv.addEventListener('scroll', this.vvHandler); }
      // Un-stick a hung "Signing you in…" overlay when the user returns from the OAuth screen
      // (pageshow covers Safari bfcache/back; focus + visibilitychange cover the popup-hang return).
      window.addEventListener('pageshow', this.resolveStuckSignIn);
      window.addEventListener('focus', this.resolveStuckSignIn);
      document.addEventListener('visibilitychange', this.onVisibilityReturn);
      // Returning from a full-page Google/Apple redirect: show the overlay while auth settles, and arm
      // the watchdog so it resolves (→ /app) or clears even if getRedirectResult never yields a user.
      let oauthPending = false; try { oauthPending = sessionStorage.getItem(CoachWidgetComponent.LS_OAUTH_PENDING) === '1'; } catch { /* noop */ }
      if (oauthPending) { this.signingIn.set(true); this.resolveStuckSignIn(); }
      try {
        this.sessionId = localStorage.getItem('bs21_demo_sid') || '';
        if (!this.sessionId) { this.sessionId = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('bs21_demo_sid', this.sessionId); }
      } catch { this.sessionId = 's_' + Date.now().toString(36); }
      // Restore the active conversation so nothing is lost across visits.
      // If LS_ACTIVE points to a new empty session (not yet in LS_CONVOS), honor it —
      // don't fall back to the most-recent session (which would clobber "Nueva conversación").
      try {
        const saved = localStorage.getItem(CoachWidgetComponent.LS_ACTIVE) || '';
        const convos = this.loadConvos().sort((a, b) => b.updatedAt - a.updatedAt);
        if (saved) {
          const foundConvo = convos.find((c) => c.id === saved);
          if (foundConvo) {
            this.activeId = foundConvo.id;
            if (Array.isArray(foundConvo.msgs) && foundConvo.msgs.length) this.messages.set(foundConvo.msgs);
          } else {
            // New empty session explicitly created by the user — keep it empty
            this.activeId = saved;
          }
        } else {
          // No active ID saved → restore most recent existing conversation
          const mostRecent = convos[0];
          if (mostRecent) {
            this.activeId = mostRecent.id;
            if (Array.isArray(mostRecent.msgs) && mostRecent.msgs.length) this.messages.set(mostRecent.msgs);
          }
        }
      } catch { /* noop */ }
      // ALWAYS have an active id (even if the read above threw) so persistence can't silently break.
      if (!this.activeId) this.activeId = this.newConvoId();
      try { localStorage.setItem(CoachWidgetComponent.LS_ACTIVE, this.activeId); } catch { /* noop */ }
      // Persist the active conversation on every change (skips greeting-only / transient typing).
      effect(() => {
        const authed = this.firebase.currentUser(); // track auth → re-runs on login/logout
        const m = this.messages().filter((x) => !x.typing);
        if (!this.activeId || !m.some((x) => x.role === 'user')) return;
        // Logged-in → Firestore (synced across devices + visible to the iOS/Android apps).
        if (authed) { this.persistToFirestore(m); return; }
        // Anonymous demo visitor → localStorage (per-browser, like ChatGPT signed-out).
        try {
          const list = this.loadConvos();
          const idx = list.findIndex((c) => c.id === this.activeId);
          const entry = { id: this.activeId, msgs: m, updatedAt: Date.now() };
          if (idx >= 0) list[idx] = entry; else list.push(entry);
          // Keep the 40 most-recent conversations (bounded localStorage, no unbounded growth).
          const trimmed = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 40);
          localStorage.setItem(CoachWidgetComponent.LS_CONVOS, JSON.stringify(trimmed));
        } catch { /* quota / private mode */ }
      });
      // On login, restore the user's most-recent Firestore session (unless they're mid-chat).
      let lastAuthUid: string | null = null;
      effect(() => {
        const u = this.firebase.currentUser();
        const uid = u?.uid ?? null;
        if (uid && uid !== lastAuthUid) {
          lastAuthUid = uid;
          this.restoreFromFirestore();
          // Finish a pending full-page OAuth redirect (iOS Safari): land in /app + clear the overlay.
          let pending = false; try { pending = sessionStorage.getItem(CoachWidgetComponent.LS_OAUTH_PENDING) === '1'; } catch { /* noop */ }
          if (pending) { try { sessionStorage.removeItem(CoachWidgetComponent.LS_OAUTH_PENDING); } catch { /* noop */ } this.signingIn.set(false); this.afterSignIn(); }
          // Silently refresh Firestore location on every login so the authenticated coach
          // always uses the current city — only if GPS was already granted (no prompt).
          this.silentLocationRefresh();
        }
        else if (!uid) { lastAuthUid = null; }
      });
      // R64: Apple Sign-In only on Apple devices (iPhone/iPad/Mac); hidden on Android/others.
      try {
        const ua = navigator.userAgent || '';
        // Apple device AND the web Apple OAuth is fully configured. Firebase returns
        // auth/operation-not-allowed until the Apple Services ID + .p8 key are set up in
        // Apple Developer + Firebase Console — so hide the button until then (no broken option).
        this.appleDevice = APPLE_WEB_ENABLED && /iPhone|iPad|iPod|Macintosh/i.test(ua) && !/Android/i.test(ua);
      } catch { this.appleDevice = false; }
      // R62: load the RC date-planner config once (single source shared with the apps).
      this.firebase.getCoachPlannerConfig().then((c) => { if (c) this.rcPlanner.set(c); }).catch(() => {});
      // Open from the hero CTA (or any "Talk to the Coach" button) via the shared signal — reliable
      // regardless of mount timing and works when logged-out. Only the request counter is a dependency
      // (untracked body), so closing the panel / new messages never re-trigger an unwanted re-open.
      effect(() => {
        const n = this.firebase.coachOpenRequest();
        if (n === 0) return; // initial run — nothing requested yet
        untracked(() => {
          if (this.embedded || this.open()) return;
          this.open.set(true);
          this.ga('coach_demo_open', { source: 'hero_cta' });
          if (this.messages().length === 0) this.messages.set([{ role: 'coach', text: this.t().greeting }]);
        });
      });
    }
  }

  /** Google Analytics (GA4) event — country + user counts come automatically from GA. */
  private ga(event: string, params: Record<string, unknown> = {}) {
    try { this.firebase.logEvent(event, { ...params, source: 'coach_demo' }); } catch { /* noop */ }
  }

  toggle() {
    // Mobile: the FAB opens the dedicated fullscreen /coach page (back gesture closes it) instead of
    // the inline overlay — more elegant + robust on phones. Desktop keeps the floating card overlay.
    if (!this.embedded && this.isBrowser && window.innerWidth <= 600 && this.router.url.split('?')[0].split('#')[0] !== '/coach') {
      this.router.navigate(['/coach']);
      return;
    }
    this.open.update((v) => !v);
    if (this.open()) {
      this.ga('coach_demo_open');
      if (this.messages().length === 0) this.messages.set([{ role: 'coach', text: this.t().greeting }]);
      // ChatAI parity: size the panel to the actual visible viewport the moment it opens (not just on
      // a later resize event), so on iOS the composer never sits behind Safari's bottom bar.
      setTimeout(() => this.vvHandler(), 0);
    }
  }

  // ── Multi-conversation: save / pick / continue prior sessions (nothing is lost) ──────────
  private newConvoId(): string { return 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  private loadConvos(): Array<{ id: string; msgs: Msg[]; updatedAt: number }> {
    try { const r = localStorage.getItem(CoachWidgetComponent.LS_CONVOS); const a = r ? JSON.parse(r) : []; return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  private convoTitle(msgs: Msg[]): string {
    const u = (msgs || []).find((m) => m.role === 'user' && m.text);
    return u ? (u.text.length > 42 ? u.text.slice(0, 42) + '…' : u.text) : this.ui('newChat');
  }

  /** Append only the not-yet-saved messages of the active session to Firestore (logged-in). */
  private persistToFirestore(m: Msg[]) {
    const id = this.activeId; if (!id) return;
    const done = this.persistedCounts.get(id) ?? 0;
    if (m.length <= done) return;
    const isNew = done === 0;
    this.persistedCounts.set(id, m.length); // optimistic — prevents double-append on rapid effects
    (async () => {
      try {
        for (let i = done; i < m.length; i++) {
          const msg = m[i];
          // Store the full Msg as the rich `web` payload so the web re-renders cards exactly;
          // apps read the plain sender/message.
          await this.firebase.appendCoachMessage(id, msg.role, msg.text || '', msg);
        }
        await this.firebase.upsertCoachSession(id, this.convoTitle(m), m[m.length - 1]?.text || '', isNew ? Date.now() : undefined);
      } catch { this.persistedCounts.set(id, done); /* allow retry on next change */ }
    })();
  }

  /** On login, load the user's most-recent Firestore session (unless mid-chat anonymously). */
  private async restoreFromFirestore() {
    if (this.messages().some((x) => x.role === 'user')) return; // don't clobber an in-progress chat
    // If the user explicitly pressed "Nueva conversación", honor that new empty session.
    let isNewSession = false;
    try { isNewSession = sessionStorage.getItem('bs21_new_session') === '1'; } catch { /* noop */ }
    if (isNewSession) {
      try { sessionStorage.removeItem('bs21_new_session'); } catch { /* noop */ }
      return;
    }
    // If LS_ACTIVE points to a known new empty session, don't overwrite it either.
    try {
      const savedId = localStorage.getItem(CoachWidgetComponent.LS_ACTIVE);
      if (savedId && savedId === this.activeId && !this.messages().some((x) => x.role === 'user')) {
        // activeId is already set — only proceed if it doesn't exist in Firestore (could be new)
      }
    } catch { /* noop */ }
    this.chatLoading.set(true);
    try {
      const sessions = await this.firebase.loadCoachSessions();
      if (!sessions.length) return;
      // Check if the current activeId is a newly-created empty session not yet in Firestore
      const savedId = (() => { try { return localStorage.getItem(CoachWidgetComponent.LS_ACTIVE) || ''; } catch { return ''; } })();
      const existsInFirestore = sessions.some((s) => s.id === savedId);
      if (savedId && !existsInFirestore && savedId === this.activeId) return; // new empty session
      const recent = sessions[0];
      const msgs = await this.firebase.loadCoachMessages(recent.id);
      this.activeId = recent.id;
      try { localStorage.setItem(CoachWidgetComponent.LS_ACTIVE, recent.id); } catch { /* noop */ }
      if (msgs.length) {
        this.messages.set(msgs as unknown as Msg[]);
        this.persistedCounts.set(recent.id, msgs.length);
      }
    } catch { /* noop */ }
    finally { this.chatLoading.set(false); }
  }

  /** "Nueva conversación": the current chat is already saved — just start a fresh active session. */
  newConversation() {
    this.activeId = this.newConvoId();
    this.persistedCounts.set(this.activeId, 0);
    // Save for ALL users (anonymous + logged-in) so a page reload restores this new empty session.
    try {
      localStorage.setItem(CoachWidgetComponent.LS_ACTIVE, this.activeId);
      sessionStorage.setItem('bs21_new_session', '1'); // tells restoreFromFirestore to skip
    } catch { /* noop */ }
    this.messages.set([]); // truly empty — isWelcome() shows the welcome screen
    this.historyOpen.set(false);
    this.ga('coach_demo_new_conversation');
  }

  /** Open the conversation picker (most-recent first; current highlighted). */
  async openHistory() {
    this.historyOpen.set(true);
    this.ga('coach_demo_history_open');
    if (this.firebase.currentUser()) {
      // Logged-in: fetch from Firestore → show a skeleton while the network round-trip runs.
      this.historyLoading.set(true);
      this.convoList.set([]);
      try {
        const sessions = await this.firebase.loadCoachSessions();
        this.convoList.set(sessions
          .filter((s) => (s.title || s.lastMessage))
          .map((s) => ({ id: s.id, title: s.title || this.ui('newChat'), updatedAt: s.updatedAt || s.createdAt, active: s.id === this.activeId })));
      } finally { this.historyLoading.set(false); }
    } else {
      this.historyLoading.set(false);
      this.convoList.set(this.loadConvos()
        .filter((c) => Array.isArray(c.msgs) && c.msgs.some((m) => m.role === 'user'))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((c) => ({ id: c.id, title: this.convoTitle(c.msgs), updatedAt: c.updatedAt, active: c.id === this.activeId })));
    }
  }
  closeHistory() { this.historyOpen.set(false); }

  /** Select a previous session and continue it (restores its full message context). */
  async selectConversation(id: string) {
    if (this.firebase.currentUser()) {
      const msgs = await this.firebase.loadCoachMessages(id);
      this.activeId = id;
      this.persistedCounts.set(id, msgs.length);
      this.messages.set(msgs.length ? (msgs as unknown as Msg[]) : [{ role: 'coach', text: this.t().greeting }]);
    } else {
      const c = this.loadConvos().find((x) => x.id === id);
      if (c) {
        this.activeId = id;
        try { localStorage.setItem(CoachWidgetComponent.LS_ACTIVE, id); } catch { /* noop */ }
        this.messages.set(Array.isArray(c.msgs) && c.msgs.length ? c.msgs : [{ role: 'coach', text: this.t().greeting }]);
      }
    }
    this.historyOpen.set(false);
  }

  /** Delete a stored conversation from the picker. */
  async deleteConversation(id: string, ev?: Event) {
    ev?.stopPropagation();
    if (this.firebase.currentUser()) {
      await this.firebase.deleteCoachSession(id);
    } else {
      try { localStorage.setItem(CoachWidgetComponent.LS_CONVOS, JSON.stringify(this.loadConvos().filter((c) => c.id !== id))); } catch { /* noop */ }
    }
    this.convoList.update((l) => l.filter((c) => c.id !== id));
    if (id === this.activeId) this.newConversation();
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
  /** Card tap → open Google Maps (logs the click). IG/website tags handle their own nav + stopPropagation. */
  openPlace(p: PlaceCard, rank: number) {
    this.placeClick(p, rank);
    if (this.isBrowser && p.mapsUrl) window.open(p.mapsUrl, '_blank', 'noopener');
  }
  inputPlaceholder() {
    if (this.simMode() === 'multiverse') return this.t().mvHint;
    if (this.simMode() === 'situation') return this.t().simHint;
    return this.t().placeholder;
  }

  async send(text: string) {
    const msg = (text || '').trim();
    if (!msg || this.busy()) return;
    // Demo soft gate: unauthenticated visitors get FREE_TASTE free questions, then the login sheet
    // (signed-in users are limited server-side to coach_daily_credits/day via dateCoachChat).
    if (!this.firebase.currentUser() && this.coachReplies() >= FREE_TASTE) { this.openLogin(true); return; }
    this.draft = '';
    this.lastUserMsg = msg;
    this.messages.update((m) => [...m, { role: 'user', text: msg }]);
    if (this.simMode() === 'situation') { await this.runSim(msg); return; }
    if (this.simMode() === 'multiverse') { await this.runMultiverse(msg); return; }
    // Inject last known GPS coords so typed place queries also get accurate location.
    await this.ask({ message: msg, ...this.lastKnownCoords ?? {} });
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
      this.messages.update((m) => [...m, { role: 'coach', text: this.simErrMsg() }]);
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
      this.messages.update((m) => [...m, { role: 'coach', text: this.simErrMsg() }]);
    } finally { this.busy.set(false); this.simLoading.set(false); this.simMode.set(''); this.scroll(); }
  }

  // ── carousel + sim card helpers ──
  msgKey(i: number) { return (i + 1) * 100; }
  toneEmoji(toneKey?: string | null): string {
    const m: Record<string, string> = {
      warm: '🤗', playful: '😄', direct: '⚡', curious: '🤔', flirty: '😏', vulnerable: '💙',
      // legacy sim keys kept for backward compat
      romantic_vulnerable: '💕', grounded_honest: '🌱',
    };
    return (toneKey && m[toneKey]) || '💬';
  }
  toneLabel(toneKey?: string | null): string {
    const m: Record<string, string> = {
      warm: 'Warm', playful: 'Playful', direct: 'Direct',
      curious: 'Curious', flirty: 'Flirty', vulnerable: 'Vulnerable',
      romantic_vulnerable: 'Romantic', grounded_honest: 'Honest',
    };
    const label = (toneKey && m[toneKey]) || toneKey || '';
    return label ? `${this.toneEmoji(toneKey)} ${label}` : '';
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
    // Elegant "agents debating" loader while the places backend works (scan → 4 venue
    // perspectives debate → synthesize). Auto-stops when `thinking` clears.
    this.startDebateSteps();
    await this.ask({ message: this.lastUserMsg, ...extra });
  }

  // Rotating "coach agents are debating" loader steps shown during the places request.
  // Settles on the final ("synthesizing") step; auto-stops if the response arrives early
  // (thinking() flips false) so we never out-live the loader.
  private debateTimer: ReturnType<typeof setInterval> | null = null;
  private startDebateSteps() {
    if (!this.isBrowser) return;
    this.stopDebateSteps();
    const steps = this.t().debateSteps as string[] | undefined;
    if (!steps || !steps.length) { this.thinkingLabel.set(this.t().placesLoading); return; }
    let i = 0;
    this.thinkingLabel.set(steps[0]);
    this.thinking.set(true); // ensure the loader is visible (sendCity path sets it late in ask())
    this.debateTimer = setInterval(() => {
      if (!this.thinking()) { this.stopDebateSteps(); return; }
      i = Math.min(i + 1, steps.length - 1);
      this.thinkingLabel.set(steps[i]);
      if (i >= steps.length - 1) { this.stopDebateSteps(); } // settle on "synthesizing…"
    }, 1400);
  }
  private stopDebateSteps() {
    if (this.debateTimer) { clearInterval(this.debateTimer); this.debateTimer = null; }
  }

  // R64: logged-in web users (optional sign-in) get the authenticated coach.
  get user() { return this.firebase.currentUser; }
  get accountDeleted() { return this.firebase.accountDeleted; }
  deletedNotice(): string {
    const m: Record<string, string> = {
      es: 'Esta cuenta fue eliminada y ya no está disponible.',
      en: 'This account was deleted and is no longer available.',
      pt: 'Esta conta foi excluída e não está mais disponível.',
      fr: 'Ce compte a été supprimé et n\'est plus disponible.',
      de: 'Dieses Konto wurde gelöscht und ist nicht mehr verfügbar.',
      it: 'Questo account è stato eliminato e non è più disponibile.',
      zh: '此账户已删除，不再可用。',
      ja: 'このアカウントは削除されており、利用できません。',
      ko: '이 계정은 삭제되었으며 더 이상 사용할 수 없습니다.',
      ru: 'Этот аккаунт удалён и больше недоступен.',
      ar: 'تم حذف هذا الحساب ولم يعد متاحاً.',
      id: 'Akun ini telah dihapus dan tidak lagi tersedia.',
      tr: 'Bu hesap silindi ve artık mevcut değil.',
    };
    return m[this.lang()] || m['en'];
  }

  /** Localized simulation error message — all 13 coach languages. */
  private simErrMsg(): string {
    const m: Record<string, string> = {
      es: 'Hubo un problema con la simulación, inténtalo de nuevo.',
      en: 'Simulation hiccup — try again.',
      pt: 'Houve um problema com a simulação, tente de novo.',
      fr: 'Problème avec la simulation — réessaie.',
      de: 'Simulation fehlgeschlagen — versuch es erneut.',
      it: 'Problema con la simulazione — riprova.',
      zh: '模拟出了点问题，请重试。',
      ja: 'シミュレーションに問題が発生しました。再試行してください。',
      ko: '시뮬레이션에 문제가 생겼어요. 다시 시도하세요.',
      ru: 'Ошибка симуляции — попробуйте снова.',
      ar: 'حدثت مشكلة في المحاكاة، حاول مجدداً.',
      id: 'Ada masalah dengan simulasi, coba lagi.',
      tr: 'Simülasyonda sorun oluştu — tekrar dene.',
    };
    return m[this.coachLang()] || m['en'];
  }

  /** Localized connection error message — all 13 coach languages. */
  private connErrMsg(): string {
    const m: Record<string, string> = {
      es: 'Hubo un problema de conexión, inténtalo de nuevo.',
      en: 'Connection hiccup — try again.',
      pt: 'Houve um problema de conexão, tente de novo.',
      fr: 'Problème de connexion — réessaie.',
      de: 'Verbindungsproblem — versuch es erneut.',
      it: 'Problema di connessione — riprova.',
      zh: '连接出现问题，请重试。',
      ja: '接続に問題が発生しました。再試行してください。',
      ko: '연결 문제가 생겼어요. 다시 시도하세요.',
      ru: 'Проблема соединения — попробуйте снова.',
      ar: 'حدثت مشكلة في الاتصال، حاول مجدداً.',
      id: 'Ada masalah koneksi, coba lagi.',
      tr: 'Bağlantı sorunu — tekrar dene.',
    };
    return m[this.coachLang()] || m['en'];
  }
  readonly loginOpen = signal(false);
  readonly loginGate = signal(false); // true → opened because the free-taste limit was hit
  readonly loginStep = signal<'choose' | 'phone' | 'code'>('choose');
  readonly signingIn = signal(false); // elegant "signing in…" state after picking a Google/Apple account
  readonly authErr = signal('');      // surfaced provider error (Apple/Google) — never fail silently
  readonly phoneBusy = signal(false);
  readonly phoneErr = signal('');
  phoneInput = '';
  codeInput = '';
  private pendingAsk: { message: string; lat?: number; lng?: number; city?: string } | null = null;
  // Apple Sign-In is offered ONLY on Apple devices (iPhone/iPad/Mac); hidden on Android/others.
  appleDevice = false;
  /** Localized login string (13 langs) — en fallback. */
  li(key: string): string { const m = LOGIN_I18N[key]; return (m && (m[this.lang()] || m['en'])) || key; }
  /** 13-language UI string (greeting / history / discover) — falls back to English. */
  ui(key: string): string { const m = UI_I18N[key]; return (m && (m[this.lang()] || m['en'])) || key; }
  openLogin(gated = false) { this.phoneErr.set(''); this.authErr.set(''); this.phoneInput = ''; this.phoneE164 = ''; this.phoneValid.set(false); this.codeInput = ''; this.loginStep.set('choose'); this.loginGate.set(gated); this.loginOpen.set(true); }
  closeLogin() { this.stopOtpAutoRead(); this.loginOpen.set(false); this.loginStep.set('choose'); this.loginGate.set(false); }
  // After any successful sign-in, land in /app so the user reaches the full experience
  // (Profile / Discover / Chats). The app shell routes profile-less accounts to web onboarding
  // — iOS/Android parity (a login with no userType/birthDate always lands in onboarding).
  private async afterSignIn() {
    this.closeLogin();
    this.pendingAsk = null;
    // Account deletion is now a HARD delete (server-side) — a re-login with the same provider is a
    // brand-new account with no profile doc, so the app shell routes it straight to onboarding.
    try { await this.firebase.refreshProfile(); } catch { /* best-effort */ }
    this.router.navigate(['/app']);
  }
  async signInGoogle() {
    this.authErr.set(''); this.signingIn.set(true);
    // iOS Safari: signInWithPopup hangs (ITP blocks cross-origin popup messaging) → use full-page
    // redirect, completed on the next load by the auth effect / watchdog below. Desktop keeps popup.
    if (this.firebase.shouldUseRedirect()) {
      try { sessionStorage.setItem(CoachWidgetComponent.LS_OAUTH_PENDING, '1'); } catch { /* private mode */ }
      try { await this.firebase.signInWithGoogleRedirect(); /* navigates away */ }
      catch (e) { try { sessionStorage.removeItem(CoachWidgetComponent.LS_OAUTH_PENDING); } catch { /* noop */ } this.handleAuthError(e); this.signingIn.set(false); }
      return;
    }
    try { await this.firebase.signInWithGoogle(); this.afterSignIn(); } catch (e) { this.handleAuthError(e); } finally { this.signingIn.set(false); }
  }
  async signInApple() {
    this.authErr.set(''); this.signingIn.set(true);
    try { await this.firebase.signInWithApple(); this.afterSignIn(); }
    catch (e) {
      // Popup blocked → retry via full-page redirect (more reliable for Apple on Safari/macOS).
      const code = (e as any)?.code || '';
      if (code.includes('popup-blocked')) {
        try { sessionStorage.setItem(CoachWidgetComponent.LS_OAUTH_PENDING, '1'); } catch { /* noop */ }
        try { await this.firebase.signInWithAppleRedirect(); return; } catch (e2) { this.clearOAuthPending(); this.handleAuthError(e2); }
      } else { this.handleAuthError(e); }
    }
    finally { this.signingIn.set(false); }
  }
  /** Classify a provider auth error → a localized message (silent only on genuine user cancel). */
  private handleAuthError(e: unknown) {
    const code = (e as any)?.code || '';
    if (code.includes('cancelled-popup-request') || code === 'auth/user-cancelled') return; // user dismissed → no error
    if (code.includes('popup-closed-by-user')) return;
    if (code.includes('operation-not-allowed')) this.authErr.set(this.li('errProviderOff'));
    else if (code.includes('popup-blocked')) this.authErr.set(this.li('errPopupBlocked'));
    else if (code.includes('network')) this.authErr.set(this.li('errNetwork'));
    else this.authErr.set(this.li('errAuthFailed'));
  }
  async signOut() { this.confirmSignOut.set(false); try { await this.firebase.signOutUser(); } catch { /* noop */ } }
  // Phone OTP (2 steps): enter number → SMS code → verify.
  /** E.164 number + validity from the ui-phone-input (country selector + libphonenumber-js). */
  phoneE164 = '';
  readonly phoneValid = signal(false);
  onPhone(e: { e164: string; valid: boolean }) { this.phoneE164 = e.e164; this.phoneValid.set(e.valid); if (this.phoneErr()) this.phoneErr.set(''); }
  async sendCode() {
    // Validated per-country by libphonenumber-js; phoneE164 is already a clean +<country><national>.
    if (!this.phoneValid() || !/^\+\d{8,15}$/.test(this.phoneE164)) { this.phoneErr.set(this.li('errInvalidPhone')); return; }
    this.phoneBusy.set(true); this.phoneErr.set('');
    try { await this.firebase.startPhoneSignIn(this.phoneE164, 'cw-recaptcha'); this.loginStep.set('code'); this.startOtpAutoRead(); }
    catch (e) { console.error('[phone sign-in] sendVerificationCode failed:', (e as any)?.code, (e as any)?.message, e); this.phoneErr.set(this.li('errSend')); }
    finally { this.phoneBusy.set(false); }
  }
  // SMS code autofill — parity with iOS: keep only digits and AUTO-SUBMIT once the full 6-digit
  // code is present (whether typed, pasted, suggested by the iOS one-time-code keyboard, or read by
  // the WebOTP API on Android). No extra tap needed.
  onCodeInput() {
    const digits = (this.codeInput || '').replace(/\D/g, '').slice(0, 6);
    if (digits !== this.codeInput) this.codeInput = digits;
    if (digits.length === 6 && !this.phoneBusy()) this.verifyCode();
  }
  /** WebOTP: on supported devices (Android Chrome) read the incoming SMS code automatically and
   *  verify it. iOS Safari has no WebOTP — there the input's autocomplete="one-time-code" makes the
   *  keyboard suggest the code (same end result). Best-effort; never blocks manual entry. */
  private otpAbort: AbortController | null = null;
  private startOtpAutoRead() {
    if (!this.isBrowser) return;
    const nav: any = navigator;
    if (!('OTPCredential' in window) || !nav.credentials || !nav.credentials.get) return;
    try { this.otpAbort?.abort(); } catch { /* noop */ }
    this.otpAbort = new AbortController();
    nav.credentials.get({ otp: { transport: ['sms'] }, signal: this.otpAbort.signal })
      .then((cred: any) => { const code = (cred?.code || '').replace(/\D/g, ''); if (code) { this.codeInput = code; this.onCodeInput(); } })
      .catch(() => { /* aborted / no SMS / unsupported — manual + one-time-code keyboard still work */ });
  }
  private stopOtpAutoRead() { try { this.otpAbort?.abort(); } catch { /* noop */ } this.otpAbort = null; }
  async verifyCode() {
    const code = this.codeInput.trim().replace(/\D/g, '');
    if (code.length < 4) { this.phoneErr.set(this.li('errCode')); return; }
    this.phoneBusy.set(true); this.phoneErr.set('');
    try { await this.firebase.confirmPhoneCode(code); this.stopOtpAutoRead(); this.afterSignIn(); }
    catch { this.phoneErr.set(this.li('errWrong')); }
    finally { this.phoneBusy.set(false); }
  }
  initial(u: { displayName?: string | null; email?: string | null } | null): string {
    const n = (u?.displayName || u?.email || '?').trim();
    return (n.charAt(0) || '?').toUpperCase();
  }
  /** First name of the signed-in user (Claude.ai-style personalized greeting). Empty if anonymous. */
  get firstName(): string {
    const u = this.user();
    const n = (u?.displayName || u?.email || '').trim();
    return n ? (n.split(/[\s@]/)[0] || '') : '';
  }
  /** Time-of-day greeting ("Buenos días/tardes/noches"), localized. */
  greetingTime(): string {
    const h = this.isBrowser ? new Date().getHours() : 12;
    const key = h < 12 ? 'morning' : (h < 19 ? 'afternoon' : 'evening');
    return this.ui(key);
  }
  /** Map the authenticated dateCoachChat response into the widget's render model (places/phrases). */
  /** Compact date badge for an area event: "28 jun" from YYYY-MM-DD, else the localized "soon". */
  areaEventBadge(e: AreaEvent): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e?.date || '');
    if (!m) return this.t().areaEventsSoon || 'Soon';
    const months: Record<string, string[]> = {
      es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
      pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
      en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    };
    const mo = (months[this.lang()] || months['en'])[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))];
    return `${parseInt(m[3], 10)} ${mo}`;
  }
  /** Instagram profile URL for an area event row (or null). */
  areaEventIg(e: AreaEvent): string | null {
    const h = (e?.instagram || '').trim().replace(/^@/, '');
    return h ? 'https://instagram.com/' + h : null;
  }

  private mapAuthCoachResponse(r: any): any {
    const acts = Array.isArray(r?.activitySuggestions) ? r.activitySuggestions : [];
    const places = acts.map((a: any) => ({
      name: a.title || a.name || '', address: a.address || '', rating: typeof a.rating === 'number' ? a.rating : null,
      mapsUrl: a.googleMapsUrl || '', emoji: a.emoji || null, why: a.psychWhy || null,
      perspectives: Array.isArray(a.psychPerspectives) ? a.psychPerspectives : [],
      score: typeof a.psychFit === 'number' ? a.psychFit : null, tip: a.psychTip || null,
      website: a.website || null, instagram: a.instagram || null, instagramHandle: a.instagramHandle || null,
      venueOffer: a.venueOffer || null, upcomingEvents: Array.isArray(a.upcomingEvents) ? a.upcomingEvents : null,
      description: a.description || null,
      distanceKm: typeof a.distanceKm === 'number' ? a.distanceKm : null,
      isOpenNow: typeof a.isOpenNow === 'boolean' ? a.isOpenNow : null,
      reviewCount: typeof a.reviewCount === 'number' ? a.reviewCount : null,
      priceLevel: a.priceLevel || null,
      isEvent: a.isEvent === true,
      eventInfo: a.eventInfo || null,
      promoInfo: a.promoInfo || null,
      category: a.category || null,
      bestFor: a.bestFor || null,
      photos: Array.isArray(a.photos) ? a.photos : null,
    })).filter((p: any) => p.name);
    const initialVisible: number = typeof r?.suggestionsInitialVisible === 'number' ? r.suggestionsInitialVisible : 3;
    const rawSuggestions = Array.isArray(r?.suggestions) ? r.suggestions : [];
    const suggestions: SuggestionItem[] = rawSuggestions
      .map((s: any) => {
        if (typeof s === 'string' && s.trim()) return { text: s.trim() };
        if (s && typeof s === 'object' && typeof s.text === 'string' && s.text.trim()) {
          return {
            text: s.text.trim(),
            tone: s.tone || null,
            why: s.why || null,
            bestFor: s.bestFor || null,
            score: typeof s.score === 'number' ? s.score : null,
          };
        }
        return null;
      })
      .filter(Boolean) as SuggestionItem[];
    // Distinct "events near you" card — Google-grounded area events (Instagram-independent).
    const areaEvents = Array.isArray(r?.areaEvents)
      ? r.areaEvents.filter((e: any) => e && typeof e.title === 'string' && e.title.trim()).slice(0, 4).map((e: any) => ({
        title: String(e.title), date: String(e.date || ''), time: String(e.time || ''),
        venue: String(e.venue || ''), description: String(e.description || ''),
        category: String(e.category || ''), instagram: e.instagram ? String(e.instagram) : null,
      }))
      : [];
    return {
      reply: (r && typeof r.reply === 'string') ? r.reply : '',
      places: places.length ? places : undefined,
      phrases: suggestions.length ? suggestions : undefined,
      phrasesInitialVisible: initialVisible,
      areaEvents: areaEvents.length ? areaEvents : undefined,
    };
  }

  private async ask(payload: { message: string; lat?: number; lng?: number; city?: string }) {
    // R65: anonymous visitors get FREE_TASTE (3) questions; to reach the default 4/day they sign in.
    if (!this.user() && this.coachReplies() >= FREE_TASTE) {
      this.pendingAsk = payload;
      this.openLogin(true);
      return;
    }
    this.busy.set(true);
    if (!this.thinking()) { this.thinkingLabel.set(this.t().thinking); }
    this.thinking.set(true); this.scroll();
    try {
      let data: any = null;
      if (this.user()) {
        // R64: logged-in → the SAME authenticated coach as the apps (persists + feeds the agent).
        try {
          const r = await this.firebase.coachChat({
            message: payload.message,
            userLanguage: this.coachLang(),
            city: payload.city || undefined,
            ...(this.shownPhrases.size ? { excludePhrases: [...this.shownPhrases] } : {}),
            // Pass browser GPS directly so the CF uses fresh coords even when the
            // Firestore profile still has stale ones (async update hasn't landed yet).
            ...(payload.lat != null && payload.lng != null ? { lat: payload.lat, lng: payload.lng } : {}),
          });
          const mapped = this.mapAuthCoachResponse(r);
          if (mapped.reply || mapped.places || mapped.phrases) data = mapped;
        } catch { /* e.g. web-only account without a profile → fall back to the demo coach */ }
      }
      if (data === null) {
        const history = this.messages().filter((m) => !m.places && !m.phrases).slice(-8).map((m) => ({ role: m.role, text: m.text }));
        const res = await fetch(ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // R37/R45: send venues + phrases already shown so the panel returns OTHERS on re-press (no repeats).
          body: JSON.stringify({ ...payload, userLanguage: this.coachLang(), history, sessionId: this.sessionId, exclude: [...this.shownPlaces], excludePhrases: [...this.shownPhrases] }),
        });
        data = await res.json().catch(() => ({}));
      }
      this.thinking.set(false); // response arrived → hide the loader before rendering/typewriter
      if (typeof data?.appCta === 'boolean') this.appCtaEnabled.set(data.appCta); // RC: app-store CTA + funnel
      if (data?.places?.length) {
        if (data?.exhausted) this.shownPlaces.clear(); // saw everything nearby → recycle next time
        for (const p of data.places) { if (p?.name) this.shownPlaces.add(p.name); }
      }
      if (data?.phrases?.length) {
        // Normalize: demo endpoint returns string[], auth returns SuggestionItem[]. Unify to objects.
        if (typeof data.phrases[0] === 'string') {
          const meta: any[] = Array.isArray(data.phraseMeta) ? data.phraseMeta : [];
          data.phrases = (data.phrases as string[]).map((text: string, i: number) => ({
            text,
            tone: null,
            score: null,
            why: meta[i]?.why ?? null,
            bestFor: meta[i]?.perspective ?? null,
          }));
        }
        if (data?.exhausted) this.shownPhrases.clear();
        for (const p of data.phrases) { if (p?.text) this.shownPhrases.add(p.text); }
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
      if (data?.places?.length || data?.phrases?.length || data?.needLocation || data?.areaEvents?.length) {
        // structured result — show immediately with attachments (no typewriter)
        this.messages.update((m) => [...m, { role: 'coach', text: reply, places: data.places, phrases: data.phrases, phrasesInitialVisible: data.phrasesInitialVisible, phraseMeta: Array.isArray(data.phraseMeta) ? data.phraseMeta : undefined, needLocation: data.needLocation, areaEvents: data.areaEvents, ask: !!(data.places?.length || data.phrases?.length), q: this.lastUserMsg }]);
        this.scroll();
      } else {
        await this.typewrite(reply);
        this.messages.update((m) => m.map((x, i) => i === m.length - 1 ? { ...x, ask: true, q: this.lastUserMsg } : x));
      }
    } catch {
      this.messages.update((m) => [...m, { role: 'coach', text: this.connErrMsg() }]);
    } finally { this.stopDebateSteps(); this.busy.set(false); this.thinking.set(false); this.scroll(); }
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

  /** Shared geolocation read. On success → fetch places. On ANY failure (denied/blocked/timeout/
   *  unavailable) → show the city input RIGHT HERE (needLocation block) so the user can always get
   *  places by typing a city — instant, no round-trip, never a dead-end. */
  /** True if the chat already shows an unanswered "need your city/location" prompt. */
  private hasPendingLocationPrompt(): boolean {
    const m = this.messages();
    const last = m[m.length - 1];
    return !!(last && last.role === 'coach' && (last as any).needLocation);
  }
  /** Show ONE location prompt — never stack a second card (refreshes the existing one instead). */
  private addLocationPrompt(text: string) {
    if (this.hasPendingLocationPrompt()) {
      this.messages.update((m) => m.map((x, i) => (i === m.length - 1 ? { ...x, text } : x)));
    } else {
      this.messages.update((m) => [...m, { role: 'coach', text, needLocation: true }]);
    }
  }

  /** Silently refresh Firestore location when GPS is already granted — no UI, no prompt.
   *  Called on every login so the authenticated coach always has the user's current city. */
  private silentLocationRefresh(): void {
    if (!this.isBrowser || !navigator.geolocation) return;
    this.geoPermissionState().then((state) => {
      if (state !== 'granted') return; // never prompt silently
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.lastKnownCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.firebase.updateLocation(pos.coords.latitude, pos.coords.longitude).catch(() => {});
        },
        () => { /* silently ignored — not a user-visible action */ },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
      );
    }).catch(() => {});
  }

  private requestGeolocation(q: string) {
    this.busy.set(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.busy.set(false);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        this.lastKnownCoords = { lat, lng };
        // Persist fresh GPS coords to Firestore so authenticated coach always uses current location.
        if (this.user()) { this.firebase.updateLocation(lat, lng).catch(() => {}); }
        this.askWithLocation({ lat, lng });
      },
      (_err) => {
        // GPS denied / timeout / unavailable → proceed without coords.
        // Backend uses server-side IP geolocation; only shows city input if IP also fails.
        this.busy.set(false);
        this.startDebateSteps();
        this.askWithLocation({});
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 },
    );
  }

  /**
   * Place / category chip:
   *  - Permission GRANTED → use the coordinates directly.
   *  - Permission NOT given yet (prompt/unknown) → REQUEST it (native prompt via getCurrentPosition);
   *    on allow → coords, on deny/error → city input fallback.
   *  - Permission BLOCKED (denied) → no prompt will appear → show the city input.
   */
  async askPlaces(query?: string, label?: string) {
    if (this.busy()) return;
    // Don't stack another prompt if one is already waiting for the user's city/location.
    if (this.hasPendingLocationPrompt()) { this.scroll(); return; }
    const q = query || this.t().placeQuery;
    this.lastUserMsg = q;
    this.messages.update((m) => [...m, { role: 'user', text: label || this.t().placeChip }]);
    this.ga('coach_demo_place_chip', { lang: this.coachLang(), cat: label ? 'category' : 'general' });

    if (!this.isBrowser || !navigator.geolocation) {
      // No GPS API (SSR / old browser) → proceed to backend; IP fallback handles location.
      this.thinkingLabel.set(this.t().placesLoading);
      this.thinking.set(true); this.scroll();
      this.startDebateSteps();
      await this.ask({ message: this.lastUserMsg });
      return;
    }
    const state = await this.geoPermissionState();
    if (state === 'denied') {
      // GPS blocked at browser level → proceed to backend without coords; IP fallback handles it.
      // City input is shown only if the backend also fails to determine location (needLocation: true).
      this.thinkingLabel.set(this.t().placesLoading);
      this.thinking.set(true); this.scroll();
      this.startDebateSteps();
      await this.ask({ message: this.lastUserMsg });
      return;
    }
    // granted → uses coords instantly; prompt/unknown → triggers the native permission request.
    this.thinkingLabel.set(state === 'granted' ? this.t().placesLoading : this.t().locRequesting);
    this.thinking.set(true); this.scroll();
    this.requestGeolocation(q);
  }

  /** "Use my location" button shown in the needLocation block — same three-case handling. */
  async useLocation() {
    const fallbackMsg = this.lastUserMsg || this.t().placeQuery;
    if (!this.isBrowser || !navigator.geolocation) {
      // No GPS API → IP fallback via backend.
      this.thinkingLabel.set(this.t().placesLoading);
      this.thinking.set(true); this.scroll();
      this.startDebateSteps();
      await this.ask({ message: fallbackMsg });
      return;
    }
    const state = await this.geoPermissionState();
    if (state === 'denied') {
      // GPS blocked → IP fallback via backend; city input only if IP also fails.
      this.thinkingLabel.set(this.t().placesLoading);
      this.thinking.set(true); this.scroll();
      this.startDebateSteps();
      await this.ask({ message: fallbackMsg });
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
  expandPhrases(msgIdx: number): void {
    this.expandedPhraseMessages.add(msgIdx);
  }
  visiblePhrases(msg: Msg, msgIdx: number): SuggestionItem[] {
    const sorted = [...(msg.phrases ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    const initialVisible = msg.phrasesInitialVisible ?? 3;
    return this.expandedPhraseMessages.has(msgIdx) ? sorted : sorted.slice(0, initialVisible);
  }
  hiddenPhrasesCount(msg: Msg, msgIdx: number): number {
    const initialVisible = msg.phrasesInitialVisible ?? 3;
    return Math.max(0, (msg.phrases?.length ?? 0) - initialVisible);
  }

  async copyPhrase(text: string, i: any) {
    if (!this.isBrowser) return;
    try { await navigator.clipboard.writeText(text); this.copiedIdx.set(i); setTimeout(() => this.copiedIdx.set(null), 1800); } catch { /* noop */ }
  }

  // ── Phrase BottomSheet ──────────────────────────────────────────────────────
  readonly phraseSheetOpen = signal(false);
  readonly phraseSheetMsg = signal<any>(null);
  readonly phraseSheetExpanded = signal(false);
  readonly phraseSheetLoading = signal(false);

  openPhraseSheet(msg: any): void {
    this.phraseSheetMsg.set(msg);
    this.phraseSheetExpanded.set(false);
    this.phraseSheetOpen.set(true);
  }
  closePhraseSheet(): void { this.phraseSheetOpen.set(false); }

  phraseSheetSorted(): SuggestionItem[] {
    return [...((this.phraseSheetMsg()?.phrases as SuggestionItem[]) ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }
  phraseSheetVisible(): SuggestionItem[] {
    const all = this.phraseSheetSorted();
    const initial = this.phraseSheetMsg()?.phrasesInitialVisible ?? 3;
    return this.phraseSheetExpanded() ? all : all.slice(0, initial);
  }
  phraseSheetHiddenCount(): number {
    const all = this.phraseSheetSorted();
    const initial = this.phraseSheetMsg()?.phrasesInitialVisible ?? 3;
    return Math.max(0, all.length - initial);
  }
  phraseSheetMoreLabel(): string {
    const n = this.phraseSheetHiddenCount();
    const tpl = this.t().showMore as string | undefined;
    return tpl ? tpl.replace('{n}', String(n)) : `Ver ${n} más ↓`;
  }

  async loadMorePhrases(): Promise<void> {
    const msg = this.phraseSheetMsg();
    if (!msg || this.phraseSheetLoading()) return;
    const current: SuggestionItem[] = this.phraseSheetSorted();
    const excludeTexts = current.map(p => p.text);
    this.phraseSheetLoading.set(true);
    try {
      let added: SuggestionItem[] = [];
      if (this.user()) {
        const r = await this.firebase.coachChat({
          message: msg.q || msg.text || '',
          userLanguage: this.coachLang(),
          loadMoreSuggestions: true,
          excludePhrases: excludeTexts,
        });
        added = (this.mapAuthCoachResponse(r) as any).phrases ?? [];
      } else {
        const res = await fetch(ENDPOINT, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg.q || msg.text || '', userLanguage: this.coachLang(), sessionId: this.sessionId, excludePhrases: excludeTexts }),
        });
        const data = await res.json().catch(() => ({}));
        added = (Array.isArray(data?.phrases) ? data.phrases : [])
          .filter((s: any) => s?.text)
          .map((s: any) => ({ text: String(s.text).trim(), tone: s.tone ?? null, why: s.why ?? null, bestFor: s.bestFor ?? null, score: typeof s.score === 'number' ? s.score : null }));
      }
      if (added.length) {
        this.phraseSheetMsg.set({ ...msg, phrases: [...current, ...added] });
        this.phraseSheetExpanded.set(true);
        for (const p of added) { if (p?.text) this.shownPhrases.add(p.text); }
      }
    } catch { /* silent — user can retry */ }
    finally { this.phraseSheetLoading.set(false); }
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
