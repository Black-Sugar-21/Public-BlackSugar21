import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';

// R151 Virtual Wardrobe (web, logged-in) — parity with Android WardrobeScreen /
// iOS WardrobeView. Items are cataloged by the catalogWardrobeItem CF (client
// never writes wardrobe docs); grid is a live Firestore listener; outfit
// suggestions come from suggestDateOutfit using the user's real garments.

interface WardrobeItem {
  id: string; type: string; name: string; colors: string[]; style: string;
  formality: number; seasons: string[]; pattern: string; emoji: string;
}
interface OutfitSuggestion { title: string; itemIds: string[]; why: string; tip: string; }

const W_I18N: Record<string, Record<string, string>> = {
  es: { title: 'Mi armario', add: 'Agregar prenda', empty: 'Agrega al menos 3 prendas para recibir sugerencias de outfit', suggest: '¿Qué me pongo?', confirmDelete: '¿Eliminar esta prenda?', full: 'Tu armario está lleno (máx. 60 prendas)', noGarment: 'No se detectó una prenda en la foto', rateLimit: 'Demasiadas solicitudes, intenta más tarde', missing: 'Te falta:', advice: 'Consejo', cataloging: 'Analizando prenda…', suggesting: 'Armando outfits…', error: 'Algo salió mal, intenta de nuevo', back: 'Volver al coach', cafe: 'Café', restaurant: 'Restaurante', bar: 'Bar', night_club: 'Club', park: 'Parque', museum: 'Museo' },
  en: { title: 'My wardrobe', add: 'Add garment', empty: 'Add at least 3 garments to get outfit suggestions', suggest: 'What should I wear?', confirmDelete: 'Delete this garment?', full: 'Your wardrobe is full (max 60 items)', noGarment: 'No garment detected in the photo', rateLimit: 'Too many requests, try again later', missing: 'Missing:', advice: 'Tip', cataloging: 'Analyzing garment…', suggesting: 'Building outfits…', error: 'Something went wrong, try again', back: 'Back to coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Park', museum: 'Museum' },
  pt: { title: 'Meu guarda-roupa', add: 'Adicionar peça', empty: 'Adicione pelo menos 3 peças para receber sugestões de look', suggest: 'O que eu visto?', confirmDelete: 'Excluir esta peça?', full: 'Seu guarda-roupa está cheio (máx. 60 peças)', noGarment: 'Nenhuma peça detectada na foto', rateLimit: 'Muitas solicitações, tente mais tarde', missing: 'Falta:', advice: 'Dica', cataloging: 'Analisando peça…', suggesting: 'Montando looks…', error: 'Algo deu errado, tente novamente', back: 'Voltar ao coach', cafe: 'Café', restaurant: 'Restaurante', bar: 'Bar', night_club: 'Balada', park: 'Parque', museum: 'Museu' },
  fr: { title: 'Ma garde-robe', add: 'Ajouter un vêtement', empty: 'Ajoute au moins 3 vêtements pour recevoir des suggestions de tenue', suggest: 'Je mets quoi ?', confirmDelete: 'Supprimer ce vêtement ?', full: 'Ta garde-robe est pleine (max 60 pièces)', noGarment: 'Aucun vêtement détecté sur la photo', rateLimit: 'Trop de demandes, réessaie plus tard', missing: 'Il manque :', advice: 'Conseil', cataloging: 'Analyse du vêtement…', suggesting: 'Création des tenues…', error: 'Une erreur est survenue, réessaie', back: 'Retour au coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Parc', museum: 'Musée' },
  de: { title: 'Mein Kleiderschrank', add: 'Kleidungsstück hinzufügen', empty: 'Füge mindestens 3 Teile hinzu, um Outfit-Vorschläge zu erhalten', suggest: 'Was ziehe ich an?', confirmDelete: 'Dieses Teil löschen?', full: 'Dein Schrank ist voll (max. 60 Teile)', noGarment: 'Kein Kleidungsstück im Foto erkannt', rateLimit: 'Zu viele Anfragen, versuche es später', missing: 'Es fehlt:', advice: 'Tipp', cataloging: 'Analysiere Kleidungsstück…', suggesting: 'Erstelle Outfits…', error: 'Etwas ist schiefgelaufen, versuche es erneut', back: 'Zurück zum Coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Park', museum: 'Museum' },
  it: { title: 'Il mio guardaroba', add: 'Aggiungi capo', empty: 'Aggiungi almeno 3 capi per ricevere suggerimenti di outfit', suggest: 'Cosa mi metto?', confirmDelete: 'Eliminare questo capo?', full: 'Il tuo guardaroba è pieno (max 60 capi)', noGarment: 'Nessun capo rilevato nella foto', rateLimit: 'Troppe richieste, riprova più tardi', missing: 'Manca:', advice: 'Consiglio', cataloging: 'Analisi del capo…', suggesting: 'Creazione outfit…', error: 'Qualcosa è andato storto, riprova', back: 'Torna al coach', cafe: 'Caffè', restaurant: 'Ristorante', bar: 'Bar', night_club: 'Club', park: 'Parco', museum: 'Museo' },
  zh: { title: '我的衣橱', add: '添加服装', empty: '添加至少3件服装以获取穿搭建议', suggest: '我该穿什么？', confirmDelete: '删除这件服装？', full: '你的衣橱已满（最多60件）', noGarment: '照片中未检测到服装', rateLimit: '请求过多，请稍后再试', missing: '缺少：', advice: '建议', cataloging: '正在分析服装…', suggesting: '正在搭配…', error: '出错了，请重试', back: '返回教练', cafe: '咖啡馆', restaurant: '餐厅', bar: '酒吧', night_club: '夜店', park: '公园', museum: '博物馆' },
  ja: { title: 'マイクローゼット', add: '服を追加', empty: 'コーデ提案を受けるには3着以上追加してください', suggest: '何を着る？', confirmDelete: 'この服を削除しますか？', full: 'クローゼットがいっぱいです（最大60着）', noGarment: '写真から服が検出されませんでした', rateLimit: 'リクエストが多すぎます。後でもう一度', missing: '足りない：', advice: 'アドバイス', cataloging: '服を分析中…', suggesting: 'コーデ作成中…', error: 'エラーが発生しました。再試行してください', back: 'コーチに戻る', cafe: 'カフェ', restaurant: 'レストラン', bar: 'バー', night_club: 'クラブ', park: '公園', museum: '美術館' },
  ko: { title: '내 옷장', add: '옷 추가', empty: '코디 추천을 받으려면 3벌 이상 추가하세요', suggest: '뭐 입지?', confirmDelete: '이 옷을 삭제할까요?', full: '옷장이 가득 찼어요 (최대 60벌)', noGarment: '사진에서 옷을 찾지 못했어요', rateLimit: '요청이 너무 많아요. 나중에 다시 시도하세요', missing: '부족한 것:', advice: '팁', cataloging: '옷 분석 중…', suggesting: '코디 만드는 중…', error: '문제가 발생했어요. 다시 시도하세요', back: '코치로 돌아가기', cafe: '카페', restaurant: '레스토랑', bar: '바', night_club: '클럽', park: '공원', museum: '미술관' },
  ru: { title: 'Мой гардероб', add: 'Добавить вещь', empty: 'Добавьте минимум 3 вещи, чтобы получать подборки образов', suggest: 'Что надеть?', confirmDelete: 'Удалить эту вещь?', full: 'Гардероб заполнен (макс. 60 вещей)', noGarment: 'На фото не найдена одежда', rateLimit: 'Слишком много запросов, попробуйте позже', missing: 'Не хватает:', advice: 'Совет', cataloging: 'Анализ вещи…', suggesting: 'Собираем образы…', error: 'Что-то пошло не так, попробуйте ещё раз', back: 'Назад к коучу', cafe: 'Кафе', restaurant: 'Ресторан', bar: 'Бар', night_club: 'Клуб', park: 'Парк', museum: 'Музей' },
  ar: { title: 'خزانتي', add: 'إضافة قطعة', empty: 'أضف 3 قطع على الأقل للحصول على اقتراحات الإطلالات', suggest: 'ماذا أرتدي؟', confirmDelete: 'حذف هذه القطعة؟', full: 'خزانتك ممتلئة (60 قطعة كحد أقصى)', noGarment: 'لم يتم العثور على ملابس في الصورة', rateLimit: 'طلبات كثيرة جدًا، حاول لاحقًا', missing: 'ينقصك:', advice: 'نصيحة', cataloging: 'جارٍ تحليل القطعة…', suggesting: 'جارٍ تنسيق الإطلالات…', error: 'حدث خطأ ما، حاول مرة أخرى', back: 'العودة إلى المدرب', cafe: 'مقهى', restaurant: 'مطعم', bar: 'بار', night_club: 'نادٍ ليلي', park: 'حديقة', museum: 'متحف' },
  id: { title: 'Lemari saya', add: 'Tambah pakaian', empty: 'Tambahkan minimal 3 pakaian untuk mendapat saran outfit', suggest: 'Pakai apa ya?', confirmDelete: 'Hapus pakaian ini?', full: 'Lemari penuh (maks. 60 item)', noGarment: 'Tidak ada pakaian terdeteksi di foto', rateLimit: 'Terlalu banyak permintaan, coba lagi nanti', missing: 'Kurang:', advice: 'Tips', cataloging: 'Menganalisis pakaian…', suggesting: 'Menyusun outfit…', error: 'Ada yang salah, coba lagi', back: 'Kembali ke coach', cafe: 'Kafe', restaurant: 'Restoran', bar: 'Bar', night_club: 'Klub', park: 'Taman', museum: 'Museum' },
  tr: { title: 'Gardırobum', add: 'Kıyafet ekle', empty: 'Kombin önerileri için en az 3 parça ekle', suggest: 'Ne giysem?', confirmDelete: 'Bu parçayı sil?', full: 'Gardırobun dolu (en fazla 60 parça)', noGarment: 'Fotoğrafta kıyafet bulunamadı', rateLimit: 'Çok fazla istek, daha sonra dene', missing: 'Eksik:', advice: 'İpucu', cataloging: 'Kıyafet analiz ediliyor…', suggesting: 'Kombinler hazırlanıyor…', error: 'Bir şeyler ters gitti, tekrar dene', back: 'Koça dön', cafe: 'Kafe', restaurant: 'Restoran', bar: 'Bar', night_club: 'Kulüp', park: 'Park', museum: 'Müze' },
};

const VENUES = ['cafe', 'restaurant', 'bar', 'night_club', 'park', 'museum'] as const;
const VENUE_EMOJI: Record<string, string> = { cafe: '☕', restaurant: '🍽️', bar: '🍸', night_club: '💃', park: '🌳', museum: '🖼️' };

@Component({
  selector: 'app-wardrobe-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="wd">
    <div class="wd-head">
      <h2>👗 {{ t('title') }}</h2>
      <label class="wd-add" [class.busy]="cataloging()">
        {{ cataloging() ? t('cataloging') : '+ ' + t('add') }}
        <input type="file" accept="image/*" (change)="onFile($event)" [disabled]="cataloging()" hidden>
      </label>
    </div>
    @if (errMsg()) { <p class="wd-err">{{ errMsg() }}</p> }

    @if (items().length === 0 && !cataloging()) {
      <div class="wd-empty"><span>🧺</span><p>{{ t('empty') }}</p></div>
    } @else {
      <div class="wd-grid">
        @for (it of items(); track it.id) {
          <div class="wd-item">
            <button class="wd-del" (click)="askDelete(it.id)" aria-label="delete">✕</button>
            <span class="wd-emoji">{{ it.emoji || '👕' }}</span>
            <span class="wd-name">{{ it.name }}</span>
            <div class="wd-colors">
              @for (c of it.colors; track c) { <span class="wd-chip">{{ c }}</span> }
            </div>
          </div>
        }
      </div>
    }

    @if (deleteId(); as did) {
      <div class="wd-confirm">
        <p>{{ t('confirmDelete') }}</p>
        <div>
          <button class="wd-btn-danger" (click)="confirmDelete()">✓</button>
          <button class="wd-btn-ghost" (click)="deleteId.set(null)">✕</button>
        </div>
      </div>
    }

    @if (items().length >= 3) {
      <div class="wd-suggest">
        <h3>{{ t('suggest') }}</h3>
        <div class="wd-venues">
          @for (v of venues; track v) {
            <button class="wd-venue" [class.sel]="selVenue() === v" [disabled]="suggesting()" (click)="suggest(v)">
              {{ venueEmoji[v] }} {{ t(v) }}
            </button>
          }
        </div>
        @if (suggesting()) { <p class="wd-loading">{{ t('suggesting') }}</p> }
        @for (o of outfits(); track o.title) {
          <div class="wd-outfit">
            <h4>{{ o.title }}</h4>
            <div class="wd-outfit-items">
              @for (id of o.itemIds; track id) {
                @if (itemById(id); as it) { <span class="wd-chip big">{{ it.emoji }} {{ it.name }}</span> }
              }
            </div>
            <p class="wd-why">{{ o.why }}</p>
            <p class="wd-tip">💡 {{ o.tip }}</p>
          </div>
        }
        @if (generalAdvice()) { <p class="wd-advice"><b>{{ t('advice') }}:</b> {{ generalAdvice() }}</p> }
        @if (missingPiece()) { <p class="wd-missing"><b>{{ t('missing') }}</b> {{ missingPiece() }}</p> }
      </div>
    }
  </div>
  `,
  styles: [`
    .wd { max-width: 680px; margin: 0 auto; padding: 16px; color: #EDEDF2; }
    .wd-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .wd-head h2 { font-size: 22px; margin: 0; }
    .wd-add { background: linear-gradient(135deg,#D4AF37,#B8860B); color: #1A1206; padding: 10px 16px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px; }
    .wd-add.busy { opacity: .6; pointer-events: none; }
    .wd-err { color: #ff8080; font-size: 14px; margin: 10px 0; }
    .wd-empty { text-align: center; padding: 40px 16px; color: #C9C9D4; }
    .wd-empty span { font-size: 44px; display: block; margin-bottom: 10px; }
    .wd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 16px; }
    .wd-item { position: relative; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 14px; padding: 14px 10px; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .wd-del { position: absolute; top: 6px; right: 6px; background: none; border: none; color: #8A8A99; cursor: pointer; font-size: 12px; }
    .wd-emoji { font-size: 34px; }
    .wd-name { font-size: 13px; text-align: center; }
    .wd-colors { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
    .wd-chip { background: rgba(156,89,234,.2); border-radius: 8px; padding: 2px 8px; font-size: 11px; }
    .wd-chip.big { font-size: 13px; padding: 4px 10px; }
    .wd-confirm { position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%); background: #2A2233; border: 1px solid rgba(255,255,255,.15); border-radius: 14px; padding: 14px 18px; display: flex; gap: 14px; align-items: center; z-index: 30; }
    .wd-btn-danger { background: #c0392b; color: #fff; border: none; border-radius: 10px; padding: 8px 14px; cursor: pointer; margin-right: 8px; }
    .wd-btn-ghost { background: none; color: #EDEDF2; border: 1px solid rgba(255,255,255,.25); border-radius: 10px; padding: 8px 14px; cursor: pointer; }
    .wd-suggest { margin-top: 28px; border-top: 1px solid rgba(255,255,255,.1); padding-top: 18px; }
    .wd-suggest h3 { font-size: 18px; margin: 0 0 12px; }
    .wd-venues { display: flex; gap: 8px; flex-wrap: wrap; }
    .wd-venue { background: rgba(255,255,255,.06); color: #EDEDF2; border: 1px solid rgba(255,255,255,.12); border-radius: 20px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
    .wd-venue.sel { background: rgba(212,175,55,.25); border-color: #D4AF37; }
    .wd-loading { color: #C9C9D4; font-size: 14px; margin-top: 12px; }
    .wd-outfit { background: rgba(255,255,255,.05); border-radius: 14px; padding: 14px; margin-top: 12px; }
    .wd-outfit h4 { margin: 0 0 8px; font-size: 15px; color: #D4AF37; }
    .wd-outfit-items { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .wd-why { font-size: 13px; color: #C9C9D4; margin: 4px 0; }
    .wd-tip { font-size: 13px; margin: 4px 0 0; }
    .wd-advice, .wd-missing { font-size: 13px; color: #C9C9D4; margin-top: 12px; }
  `],
})
export class WardrobePanelComponent implements OnInit, OnDestroy {
  private fb = inject(FirebaseService);
  readonly items = signal<WardrobeItem[]>([]);
  readonly cataloging = signal(false);
  readonly suggesting = signal(false);
  readonly errMsg = signal('');
  readonly outfits = signal<OutfitSuggestion[]>([]);
  readonly generalAdvice = signal('');
  readonly missingPiece = signal('');
  readonly selVenue = signal('');
  readonly deleteId = signal<string | null>(null);
  readonly venues = VENUES;
  readonly venueEmoji = VENUE_EMOJI;
  private unsub: (() => void) | null = null;
  private itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));

  ngOnInit() { this.unsub = this.fb.listenWardrobe((rows) => this.items.set(rows as WardrobeItem[])); }
  ngOnDestroy() { this.unsub?.(); }

  private lang(): string {
    try { const l = (navigator.language || 'es').slice(0, 2); return W_I18N[l] ? l : 'es'; } catch { return 'es'; }
  }
  t(key: string): string { return W_I18N[this.lang()]?.[key] || W_I18N['es'][key] || key; }
  itemById(id: string): WardrobeItem | undefined { return this.itemMap().get(id); }

  async onFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.errMsg.set('');
    this.cataloging.set(true);
    try {
      const b64 = await this.toJpegBase64(file, 1024);
      const res = await this.fb.wardrobeCatalog(b64, this.lang());
      if (!res?.success) {
        const map: Record<string, string> = { wardrobe_full: 'full', no_garment_detected: 'noGarment', rate_limit_exceeded: 'rateLimit' };
        this.errMsg.set(this.t(map[res?.error] || 'error'));
      }
      // Grid updates via the live listener — no manual insert needed.
    } catch { this.errMsg.set(this.t('error')); }
    finally { this.cataloging.set(false); }
  }

  askDelete(id: string) { this.deleteId.set(id); }
  async confirmDelete() {
    const id = this.deleteId();
    this.deleteId.set(null);
    if (id) { try { await this.fb.wardrobeDelete(id); } catch { this.errMsg.set(this.t('error')); } }
  }

  async suggest(venue: string) {
    this.selVenue.set(venue);
    this.errMsg.set('');
    this.outfits.set([]);
    this.generalAdvice.set('');
    this.missingPiece.set('');
    this.suggesting.set(true);
    try {
      const res = await this.fb.wardrobeSuggest(venue, this.lang());
      if (res?.success) {
        this.outfits.set(res.outfits || []);
        this.generalAdvice.set(res.generalAdvice || '');
        this.missingPiece.set(res.missingPiece || '');
      } else {
        this.errMsg.set(this.t(res?.error === 'rate_limit_exceeded' ? 'rateLimit' : 'error'));
      }
    } catch { this.errMsg.set(this.t('error')); }
    finally { this.suggesting.set(false); }
  }

  /** Downscale + strip data-uri prefix → raw base64 JPEG (CF contract). */
  private toJpegBase64(file: File, maxDim: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, ''));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
      img.src = url;
    });
  }
}
