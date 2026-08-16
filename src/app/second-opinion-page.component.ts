import { Component, OnInit, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Meta } from '@angular/platform-browser';

// R161 "La segunda opinión" — public friend page (NO account needed). A friend opens
// a private 48h link, sees a minimal snapshot and votes 🔥/🤔/🚩 (+optional comment).
// Doubles as the acquisition surface: app CTA at the bottom. noindex (private links).
// Talks ONLY to the two public HTTP CFs (Firestore is CF-only for this collection).

const API = 'https://us-central1-black-sugar21.cloudfunctions.net';

interface Subject { firstName: string; age: number | null; bio: string; interests: string[]; photoUrls: string[]; }

const P_I18N: Record<string, Record<string, string>> = {
  es: { asks: 'quiere tu opinión sobre este match', vote: '¿Qué le dices?', fire: 'Dale', hmm: 'Mmm…', flag: 'Cuidado', commentPh: 'Un consejo corto (opcional)', send: 'Enviar veredicto', thanks: '¡Veredicto enviado!', thanksSub: 'Tu amigo/a lo verá en su app', expired: 'Este enlace expiró', expiredSub: 'Los enlaces de segunda opinión duran 48 horas', already: 'Este enlace ya tiene un veredicto', error: 'No se pudo cargar el enlace', cta: 'Conoce Black Sugar 21', ctaSub: 'La app de citas con coach de IA', interests: 'Intereses', about: 'Sobre' },
  en: { asks: 'wants your take on this match', vote: 'What do you say?', fire: 'Go for it', hmm: 'Hmm…', flag: 'Careful', commentPh: 'A short tip (optional)', send: 'Send verdict', thanks: 'Verdict sent!', thanksSub: 'Your friend will see it in their app', expired: 'This link expired', expiredSub: 'Second-opinion links last 48 hours', already: 'This link already has a verdict', error: 'Could not load the link', cta: 'Meet Black Sugar 21', ctaSub: 'The dating app with an AI coach', interests: 'Interests', about: 'About' },
  pt: { asks: 'quer sua opinião sobre este match', vote: 'O que você diz?', fire: 'Vai fundo', hmm: 'Hmm…', flag: 'Cuidado', commentPh: 'Uma dica curta (opcional)', send: 'Enviar veredicto', thanks: 'Veredicto enviado!', thanksSub: 'Seu amigo verá no app', expired: 'Este link expirou', expiredSub: 'Links de segunda opinião duram 48 horas', already: 'Este link já tem um veredicto', error: 'Não foi possível carregar o link', cta: 'Conheça o Black Sugar 21', ctaSub: 'O app de namoro com coach de IA', interests: 'Interesses', about: 'Sobre' },
  fr: { asks: 'veut ton avis sur ce match', vote: 'Tu en dis quoi ?', fire: 'Fonce', hmm: 'Hmm…', flag: 'Prudence', commentPh: 'Un petit conseil (optionnel)', send: 'Envoyer le verdict', thanks: 'Verdict envoyé !', thanksSub: 'Ton ami(e) le verra dans son app', expired: 'Ce lien a expiré', expiredSub: 'Les liens de second avis durent 48 heures', already: 'Ce lien a déjà un verdict', error: 'Impossible de charger le lien', cta: 'Découvre Black Sugar 21', ctaSub: "L'app de rencontres avec coach IA", interests: 'Intérêts', about: 'À propos' },
  de: { asks: 'möchte deine Meinung zu diesem Match', vote: 'Was sagst du?', fire: 'Los geht’s', hmm: 'Hmm…', flag: 'Vorsicht', commentPh: 'Ein kurzer Tipp (optional)', send: 'Urteil senden', thanks: 'Urteil gesendet!', thanksSub: 'Dein Freund sieht es in der App', expired: 'Dieser Link ist abgelaufen', expiredSub: 'Zweitmeinungs-Links gelten 48 Stunden', already: 'Dieser Link hat bereits ein Urteil', error: 'Link konnte nicht geladen werden', cta: 'Entdecke Black Sugar 21', ctaSub: 'Die Dating-App mit KI-Coach', interests: 'Interessen', about: 'Über' },
  it: { asks: 'vuole la tua opinione su questo match', vote: 'Che ne dici?', fire: 'Vai', hmm: 'Hmm…', flag: 'Attenzione', commentPh: 'Un consiglio breve (opzionale)', send: 'Invia verdetto', thanks: 'Verdetto inviato!', thanksSub: 'Il tuo amico lo vedrà nella sua app', expired: 'Questo link è scaduto', expiredSub: 'I link di seconda opinione durano 48 ore', already: 'Questo link ha già un verdetto', error: 'Impossibile caricare il link', cta: 'Scopri Black Sugar 21', ctaSub: "L'app di incontri con coach IA", interests: 'Interessi', about: 'Su di lui/lei' },
  ja: { asks: 'このマッチについてあなたの意見を求めています', vote: 'どう思う？', fire: 'いいね', hmm: 'うーん…', flag: '要注意', commentPh: '短いアドバイス（任意）', send: '判定を送る', thanks: '判定を送信しました！', thanksSub: '友達のアプリに表示されます', expired: 'このリンクは期限切れです', expiredSub: 'セカンドオピニオンのリンクは48時間有効です', already: 'このリンクには既に判定があります', error: 'リンクを読み込めませんでした', cta: 'Black Sugar 21を見る', ctaSub: 'AIコーチ付きマッチングアプリ', interests: '趣味', about: '自己紹介' },
  zh: { asks: '想听听你对这个匹配的看法', vote: '你怎么说？', fire: '冲', hmm: '嗯…', flag: '小心', commentPh: '简短建议（可选）', send: '发送评价', thanks: '评价已发送！', thanksSub: '你的朋友会在应用中看到', expired: '此链接已过期', expiredSub: '第二意见链接有效期为48小时', already: '此链接已有评价', error: '无法加载链接', cta: '了解 Black Sugar 21', ctaSub: '带AI教练的交友应用', interests: '兴趣', about: '关于' },
  ko: { asks: '이 매치에 대한 당신의 의견을 원해요', vote: '어떻게 생각해요?', fire: '고고', hmm: '음…', flag: '조심', commentPh: '짧은 조언 (선택)', send: '평가 보내기', thanks: '평가를 보냈어요!', thanksSub: '친구의 앱에 표시됩니다', expired: '이 링크는 만료되었어요', expiredSub: '세컨드 오피니언 링크는 48시간 유효해요', already: '이 링크에는 이미 평가가 있어요', error: '링크를 불러올 수 없어요', cta: 'Black Sugar 21 알아보기', ctaSub: 'AI 코치가 있는 데이팅 앱', interests: '관심사', about: '소개' },
  ru: { asks: 'хочет знать твоё мнение об этом матче', vote: 'Что скажешь?', fire: 'Давай', hmm: 'Хмм…', flag: 'Осторожно', commentPh: 'Короткий совет (по желанию)', send: 'Отправить вердикт', thanks: 'Вердикт отправлен!', thanksSub: 'Твой друг увидит его в приложении', expired: 'Ссылка истекла', expiredSub: 'Ссылки второго мнения действуют 48 часов', already: 'По этой ссылке уже есть вердикт', error: 'Не удалось загрузить ссылку', cta: 'Узнай Black Sugar 21', ctaSub: 'Приложение для знакомств с ИИ-коучем', interests: 'Интересы', about: 'О нём/ней' },
  ar: { asks: 'يريد رأيك في هذا التطابق', vote: 'ما رأيك؟', fire: 'انطلق', hmm: 'همم…', flag: 'احذر', commentPh: 'نصيحة قصيرة (اختياري)', send: 'إرسال الحكم', thanks: 'تم إرسال الحكم!', thanksSub: 'سيراه صديقك في التطبيق', expired: 'انتهت صلاحية هذا الرابط', expiredSub: 'روابط الرأي الثاني تدوم 48 ساعة', already: 'هذا الرابط له حكم بالفعل', error: 'تعذر تحميل الرابط', cta: 'تعرف على Black Sugar 21', ctaSub: 'تطبيق مواعدة مع مدرب ذكاء اصطناعي', interests: 'اهتمامات', about: 'نبذة' },
  id: { asks: 'ingin pendapatmu tentang match ini', vote: 'Bagaimana menurutmu?', fire: 'Gas', hmm: 'Hmm…', flag: 'Hati-hati', commentPh: 'Saran singkat (opsional)', send: 'Kirim penilaian', thanks: 'Penilaian terkirim!', thanksSub: 'Temanmu akan melihatnya di aplikasi', expired: 'Tautan ini kedaluwarsa', expiredSub: 'Tautan opini kedua berlaku 48 jam', already: 'Tautan ini sudah punya penilaian', error: 'Tidak bisa memuat tautan', cta: 'Kenali Black Sugar 21', ctaSub: 'Aplikasi kencan dengan coach AI', interests: 'Minat', about: 'Tentang' },
  tr: { asks: 'bu eşleşme hakkında fikrini istiyor', vote: 'Ne diyorsun?', fire: 'Bas gaza', hmm: 'Hmm…', flag: 'Dikkat', commentPh: 'Kısa bir tavsiye (isteğe bağlı)', send: 'Kararı gönder', thanks: 'Karar gönderildi!', thanksSub: 'Arkadaşın uygulamada görecek', expired: 'Bu bağlantının süresi doldu', expiredSub: 'İkinci görüş bağlantıları 48 saat geçerlidir', already: 'Bu bağlantıda zaten bir karar var', error: 'Bağlantı yüklenemedi', cta: 'Black Sugar 21 ile tanış', ctaSub: 'Yapay zekâ koçlu flört uygulaması', interests: 'İlgi alanları', about: 'Hakkında' },
};

@Component({
  selector: 'app-second-opinion-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="so" [attr.dir]="lang() === 'ar' ? 'rtl' : 'ltr'">
    <div class="so-brand"><span>✦</span> Black Sugar <b>21</b></div>

    @if (state() === 'loading') {
      <div class="so-card so-skel"></div>
    } @else if (state() === 'error') {
      <div class="so-card so-center">
        <div class="so-big">🔗</div>
        <h2>{{ t(errKey()) }}</h2>
        @if (errKey() === 'expired') { <p>{{ t('expiredSub') }}</p> }
      </div>
    } @else if (state() === 'done') {
      <div class="so-card so-center">
        <div class="so-big">💌</div>
        <h2>{{ t('thanks') }}</h2>
        <p>{{ t('thanksSub') }}</p>
      </div>
    } @else if (subject(); as s) {
      <p class="so-asks"><b>{{ requester() }}</b> {{ t('asks') }}</p>
      <div class="so-card">
        @if (s.photoUrls.length) {
          <div class="so-photo" [style.background-image]="'url(' + s.photoUrls[photoIdx()] + ')'" (click)="nextPhoto()">
            @if (s.photoUrls.length > 1) {
              <div class="so-dots">
                @for (p of s.photoUrls; track $index) { <span [class.on]="$index === photoIdx()"></span> }
              </div>
            }
          </div>
        } @else {
          <div class="so-photo so-nophoto">✦</div>
        }
        <div class="so-body">
          <h1>{{ s.firstName }}@if (s.age) { <span>, {{ s.age }}</span> }</h1>
          @if (s.bio) { <p class="so-bio">{{ s.bio }}</p> }
          @if (s.interests.length) {
            <div class="so-ints">
              @for (i of s.interests; track i) { <span>{{ i }}</span> }
            </div>
          }
        </div>
      </div>

      <h3 class="so-q">{{ t('vote') }}</h3>
      <!-- Comentario ANTES de los botones: opcional, y el tap del veredicto ENVÍA (1 solo clic) -->
      <input class="so-comment" [placeholder]="t('commentPh')" maxlength="100"
             [disabled]="sending()"
             [value]="comment()" (input)="comment.set($any($event.target).value)">
      <div class="so-votes">
        <button [class.sel]="verdict() === 'fire'" [disabled]="sending()" (click)="submit('fire')">🔥<small>{{ t('fire') }}</small></button>
        <button [class.sel]="verdict() === 'hmm'" [disabled]="sending()" (click)="submit('hmm')">🤔<small>{{ t('hmm') }}</small></button>
        <button [class.sel]="verdict() === 'flag'" [disabled]="sending()" (click)="submit('flag')">🚩<small>{{ t('flag') }}</small></button>
      </div>
    }

    <a class="so-cta" href="/" target="_blank" rel="noopener">
      <b>{{ t('cta') }}</b><span>{{ t('ctaSub') }}</span>
    </a>
  </div>
  `,
  styles: [`
    .so { min-height: 100dvh; max-width: 440px; margin: 0 auto; padding: 28px 20px 40px; color: #EDEDF2; display: flex; flex-direction: column; }
    .so-brand { text-align: center; font-size: 15px; color: #C9C9D4; margin-bottom: 18px; }
    .so-brand span { color: #D4AF37; }
    .so-asks { text-align: center; font-size: 15px; color: #C9C9D4; margin: 0 0 14px; }
    .so-asks b { color: #fff; }
    .so-card { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; overflow: hidden; }
    .so-skel { height: 420px; animation: soPulse 1.4s ease-in-out infinite; }
    @keyframes soPulse { 50% { opacity: .55; } }
    .so-center { padding: 48px 24px; text-align: center; }
    .so-center h2 { margin: 12px 0 6px; font-size: 20px; }
    .so-center p { color: #C9C9D4; font-size: 14px; margin: 0; }
    .so-big { font-size: 44px; }
    .so-photo { position: relative; aspect-ratio: 4/5; background-size: cover; background-position: center; cursor: pointer; }
    .so-nophoto { display: flex; align-items: center; justify-content: center; font-size: 40px; color: #D4AF37; cursor: default; }
    .so-dots { position: absolute; top: 10px; left: 0; right: 0; display: flex; gap: 5px; justify-content: center; }
    .so-dots span { width: 22px; height: 3px; border-radius: 2px; background: rgba(255,255,255,.35); }
    .so-dots span.on { background: #D4AF37; }
    .so-body { padding: 16px 18px 18px; }
    .so-body h1 { margin: 0 0 6px; font-size: 24px; }
    .so-body h1 span { font-weight: 500; color: #C9C9D4; }
    .so-bio { color: #C9C9D4; font-size: 14px; line-height: 1.5; margin: 0 0 10px; }
    .so-ints { display: flex; flex-wrap: wrap; gap: 6px; }
    .so-ints span { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: rgba(156,89,234,.18); border: 1px solid rgba(156,89,234,.3); }
    .so-q { text-align: center; font-size: 16px; margin: 22px 0 12px; }
    .so-votes { display: flex; gap: 10px; }
    .so-votes button { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 14px 8px; font-size: 26px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; color: #EDEDF2; cursor: pointer; transition: all .18s cubic-bezier(.16,1,.3,1); }
    .so-votes button small { font-size: 12px; font-weight: 600; }
    .so-votes button:hover { transform: translateY(-2px); }
    .so-votes button.sel { background: linear-gradient(135deg, rgba(212,175,55,.25), rgba(212,175,55,.12)); border-color: #D4AF37; box-shadow: 0 4px 18px rgba(212,175,55,.25); }
    .so-comment { margin-top: 12px; width: 100%; box-sizing: border-box; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 13px 15px; color: #EDEDF2; font-size: 14px; outline: none; }
    .so-comment:focus { border-color: rgba(212,175,55,.5); }
    .so-send { margin-top: 12px; width: 100%; padding: 14px; border: none; border-radius: 14px; background: linear-gradient(135deg,#E9CE6B,#D4AF37,#B8860B); color: #1A1206; font-weight: 700; font-size: 15px; cursor: pointer; }
    .so-send:disabled { opacity: .45; cursor: default; }
    .so-cta { margin-top: auto; padding-top: 28px; text-align: center; text-decoration: none; }
    .so-cta b { display: block; color: #D4AF37; font-size: 15px; }
    .so-cta span { color: #8A8A99; font-size: 12px; }
  `],
})
export class SecondOpinionPageComponent implements OnInit {
  readonly state = signal<'loading' | 'ready' | 'done' | 'error'>('loading');
  readonly errKey = signal('error');
  readonly subject = signal<Subject | null>(null);
  readonly requester = signal('');
  readonly lang = signal('es');
  readonly verdict = signal<'' | 'fire' | 'hmm' | 'flag'>('');
  readonly comment = signal('');
  readonly sending = signal(false);
  readonly photoIdx = signal(0);
  private token = '';

  constructor(private route: ActivatedRoute, private meta: Meta) {}

  t(k: string): string { return P_I18N[this.lang()]?.[k] || P_I18N['es'][k] || k; }
  nextPhoto() {
    const n = this.subject()?.photoUrls.length || 0;
    if (n > 1) this.photoIdx.update((i) => (i + 1) % n);
  }

  ngOnInit() {
    // Private links must never be indexed.
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (typeof window === 'undefined') return; // SSR: render skeleton only
    if (!this.token) { this.state.set('error'); return; }
    fetch(`${API}/getSecondOpinion?token=${encodeURIComponent(this.token)}`)
      .then(async (r) => {
        if (r.status === 410) { this.errKey.set('expired'); this.state.set('error'); return; }
        if (!r.ok) { this.state.set('error'); return; }
        const d = await r.json();
        if (d.voted) { this.errKey.set('already'); this.state.set('error'); return; }
        this.lang.set(P_I18N[d.lang] ? d.lang : 'es');
        this.requester.set(String(d.requesterFirstName || ''));
        this.subject.set({
          firstName: String(d.subject?.firstName || ''),
          age: typeof d.subject?.age === 'number' ? d.subject.age : null,
          bio: String(d.subject?.bio || ''),
          interests: Array.isArray(d.subject?.interests) ? d.subject.interests : [],
          photoUrls: Array.isArray(d.subject?.photoUrls) ? d.subject.photoUrls : [],
        });
        this.state.set('ready');
      })
      .catch(() => this.state.set('error'));
  }

  /** Un solo clic: el tap del veredicto envía de inmediato (comentario opcional previo). */
  async submit(v?: 'fire' | 'hmm' | 'flag') {
    if (v) this.verdict.set(v);
    if (!this.verdict() || this.sending()) return;
    this.sending.set(true);
    try {
      const r = await fetch(`${API}/submitSecondOpinion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, verdict: this.verdict(), comment: this.comment().trim() }),
      });
      if (r.ok) this.state.set('done');
      else if (r.status === 409) { this.errKey.set('already'); this.state.set('error'); }
      else if (r.status === 410) { this.errKey.set('expired'); this.state.set('error'); }
      else this.state.set('error');
    } catch { this.state.set('error'); }
    finally { this.sending.set(false); }
  }
}
