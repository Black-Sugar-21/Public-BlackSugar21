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
  es: { title: 'Mi armario', emptyTitle: 'Tu armario te espera', deleteQ: '¿Eliminar?', add: 'Agregar prenda', empty: 'Agrega al menos 3 prendas para recibir sugerencias de outfit', suggest: '¿Qué me pongo?', confirmDelete: '¿Eliminar esta prenda?', full: 'Tu armario está lleno (máx. 60 prendas)', noGarment: 'No se detectó una prenda en la foto', rateLimit: 'Demasiadas solicitudes, intenta más tarde', missing: 'Te falta:', advice: 'Consejo', cataloging: 'Analizando prenda…', suggesting: 'Armando outfits…', error: 'Algo salió mal, intenta de nuevo', back: 'Volver al coach', cafe: 'Café', restaurant: 'Restaurante', bar: 'Bar', night_club: 'Club', park: 'Parque', museum: 'Museo', previewTitle: 'Vista de la prenda', previewGenerating: 'Generando vista 360°…', previewHint: 'Vista frontal, lateral y trasera generada con IA', previewError: 'No se pudo generar la vista', previewRetry: 'Reintentar', previewLimit: 'Ya usaste tus vistas de ejemplo (máx. {n})' },
  en: { title: 'My wardrobe', emptyTitle: 'Your wardrobe awaits', deleteQ: 'Delete?', add: 'Add garment', empty: 'Add at least 3 garments to get outfit suggestions', suggest: 'What should I wear?', confirmDelete: 'Delete this garment?', full: 'Your wardrobe is full (max 60 items)', noGarment: 'No garment detected in the photo', rateLimit: 'Too many requests, try again later', missing: 'Missing:', advice: 'Tip', cataloging: 'Analyzing garment…', suggesting: 'Building outfits…', error: 'Something went wrong, try again', back: 'Back to coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Park', museum: 'Museum', previewTitle: 'Garment view', previewGenerating: 'Generating 360° view…', previewHint: 'Front, side and back view generated with AI', previewError: 'Couldn\'t generate the view', previewRetry: 'Retry', previewLimit: 'You\'ve used your sample previews (max {n})' },
  pt: { title: 'Meu guarda-roupa', emptyTitle: 'Seu guarda-roupa espera por você', deleteQ: 'Excluir?', add: 'Adicionar peça', empty: 'Adicione pelo menos 3 peças para receber sugestões de look', suggest: 'O que eu visto?', confirmDelete: 'Excluir esta peça?', full: 'Seu guarda-roupa está cheio (máx. 60 peças)', noGarment: 'Nenhuma peça detectada na foto', rateLimit: 'Muitas solicitações, tente mais tarde', missing: 'Falta:', advice: 'Dica', cataloging: 'Analisando peça…', suggesting: 'Montando looks…', error: 'Algo deu errado, tente novamente', back: 'Voltar ao coach', cafe: 'Café', restaurant: 'Restaurante', bar: 'Bar', night_club: 'Balada', park: 'Parque', museum: 'Museu', previewTitle: 'Visualização da peça', previewGenerating: 'Gerando visão 360°…', previewHint: 'Vista frontal, lateral e traseira gerada com IA', previewError: 'Não foi possível gerar a visualização', previewRetry: 'Tentar novamente', previewLimit: 'Você já usou suas visualizações de exemplo (máx. {n})' },
  fr: { title: 'Ma garde-robe', emptyTitle: 'Ta garde-robe t\'attend', deleteQ: 'Supprimer ?', add: 'Ajouter un vêtement', empty: 'Ajoute au moins 3 vêtements pour recevoir des suggestions de tenue', suggest: 'Je mets quoi ?', confirmDelete: 'Supprimer ce vêtement ?', full: 'Ta garde-robe est pleine (max 60 pièces)', noGarment: 'Aucun vêtement détecté sur la photo', rateLimit: 'Trop de demandes, réessaie plus tard', missing: 'Il manque :', advice: 'Conseil', cataloging: 'Analyse du vêtement…', suggesting: 'Création des tenues…', error: 'Une erreur est survenue, réessaie', back: 'Retour au coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Parc', museum: 'Musée', previewTitle: 'Aperçu du vêtement', previewGenerating: 'Génération de la vue 360°…', previewHint: 'Vue de face, de profil et de dos générée par IA', previewError: 'Impossible de générer l\'aperçu', previewRetry: 'Réessayer', previewLimit: 'Tu as utilisé tes aperçus d\'exemple (max {n})' },
  de: { title: 'Mein Kleiderschrank', emptyTitle: 'Dein Kleiderschrank wartet', deleteQ: 'Löschen?', add: 'Kleidungsstück hinzufügen', empty: 'Füge mindestens 3 Teile hinzu, um Outfit-Vorschläge zu erhalten', suggest: 'Was ziehe ich an?', confirmDelete: 'Dieses Teil löschen?', full: 'Dein Schrank ist voll (max. 60 Teile)', noGarment: 'Kein Kleidungsstück im Foto erkannt', rateLimit: 'Zu viele Anfragen, versuche es später', missing: 'Es fehlt:', advice: 'Tipp', cataloging: 'Analysiere Kleidungsstück…', suggesting: 'Erstelle Outfits…', error: 'Etwas ist schiefgelaufen, versuche es erneut', back: 'Zurück zum Coach', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar', night_club: 'Club', park: 'Park', museum: 'Museum', previewTitle: 'Ansicht des Kleidungsstücks', previewGenerating: '360°-Ansicht wird erstellt…', previewHint: 'Vorder-, Seiten- und Rückansicht per KI erstellt', previewError: 'Ansicht konnte nicht erstellt werden', previewRetry: 'Erneut versuchen', previewLimit: 'Du hast deine Beispiel-Ansichten aufgebraucht (max. {n})' },
  it: { title: 'Il mio guardaroba', emptyTitle: 'Il tuo guardaroba ti aspetta', deleteQ: 'Eliminare?', add: 'Aggiungi capo', empty: 'Aggiungi almeno 3 capi per ricevere suggerimenti di outfit', suggest: 'Cosa mi metto?', confirmDelete: 'Eliminare questo capo?', full: 'Il tuo guardaroba è pieno (max 60 capi)', noGarment: 'Nessun capo rilevato nella foto', rateLimit: 'Troppe richieste, riprova più tardi', missing: 'Manca:', advice: 'Consiglio', cataloging: 'Analisi del capo…', suggesting: 'Creazione outfit…', error: 'Qualcosa è andato storto, riprova', back: 'Torna al coach', cafe: 'Caffè', restaurant: 'Ristorante', bar: 'Bar', night_club: 'Club', park: 'Parco', museum: 'Museo', previewTitle: 'Vista del capo', previewGenerating: 'Generazione vista 360°…', previewHint: 'Vista frontale, laterale e posteriore generata con IA', previewError: 'Impossibile generare la vista', previewRetry: 'Riprova', previewLimit: 'Hai usato le tue viste di esempio (max {n})' },
  zh: { title: '我的衣橱', emptyTitle: '你的衣橱在等你', deleteQ: '删除？', add: '添加服装', empty: '添加至少3件服装以获取穿搭建议', suggest: '我该穿什么？', confirmDelete: '删除这件服装？', full: '你的衣橱已满（最多60件）', noGarment: '照片中未检测到服装', rateLimit: '请求过多，请稍后再试', missing: '缺少：', advice: '建议', cataloging: '正在分析服装…', suggesting: '正在搭配…', error: '出错了，请重试', back: '返回教练', cafe: '咖啡馆', restaurant: '餐厅', bar: '酒吧', night_club: '夜店', park: '公园', museum: '博物馆', previewTitle: '服装预览', previewGenerating: '正在生成360°视图…', previewHint: 'AI生成的正面、侧面和背面视图', previewError: '无法生成视图', previewRetry: '重试', previewLimit: '你已用完示例预览（最多{n}次）' },
  ja: { title: 'マイクローゼット', emptyTitle: 'クローゼットがあなたを待っています', deleteQ: '削除する？', add: '服を追加', empty: 'コーデ提案を受けるには3着以上追加してください', suggest: '何を着る？', confirmDelete: 'この服を削除しますか？', full: 'クローゼットがいっぱいです（最大60着）', noGarment: '写真から服が検出されませんでした', rateLimit: 'リクエストが多すぎます。後でもう一度', missing: '足りない：', advice: 'アドバイス', cataloging: '服を分析中…', suggesting: 'コーデ作成中…', error: 'エラーが発生しました。再試行してください', back: 'コーチに戻る', cafe: 'カフェ', restaurant: 'レストラン', bar: 'バー', night_club: 'クラブ', park: '公園', museum: '美術館', previewTitle: 'アイテムプレビュー', previewGenerating: '360°ビューを生成中…', previewHint: 'AIが生成した正面・側面・背面ビュー', previewError: 'ビューを生成できませんでした', previewRetry: '再試行', previewLimit: 'サンプルビューを使い切りました（最大{n}回）' },
  ko: { title: '내 옷장', emptyTitle: '옷장이 기다리고 있어요', deleteQ: '삭제할까요?', add: '옷 추가', empty: '코디 추천을 받으려면 3벌 이상 추가하세요', suggest: '뭐 입지?', confirmDelete: '이 옷을 삭제할까요?', full: '옷장이 가득 찼어요 (최대 60벌)', noGarment: '사진에서 옷을 찾지 못했어요', rateLimit: '요청이 너무 많아요. 나중에 다시 시도하세요', missing: '부족한 것:', advice: '팁', cataloging: '옷 분석 중…', suggesting: '코디 만드는 중…', error: '문제가 발생했어요. 다시 시도하세요', back: '코치로 돌아가기', cafe: '카페', restaurant: '레스토랑', bar: '바', night_club: '클럽', park: '공원', museum: '미술관', previewTitle: '옷 미리보기', previewGenerating: '360° 뷰 생성 중…', previewHint: 'AI가 생성한 정면·측면·후면 뷰', previewError: '뷰를 생성하지 못했어요', previewRetry: '다시 시도', previewLimit: '샘플 미리보기를 모두 사용했어요 (최대 {n}회)' },
  ru: { title: 'Мой гардероб', emptyTitle: 'Ваш гардероб ждёт', deleteQ: 'Удалить?', add: 'Добавить вещь', empty: 'Добавьте минимум 3 вещи, чтобы получать подборки образов', suggest: 'Что надеть?', confirmDelete: 'Удалить эту вещь?', full: 'Гардероб заполнен (макс. 60 вещей)', noGarment: 'На фото не найдена одежда', rateLimit: 'Слишком много запросов, попробуйте позже', missing: 'Не хватает:', advice: 'Совет', cataloging: 'Анализ вещи…', suggesting: 'Собираем образы…', error: 'Что-то пошло не так, попробуйте ещё раз', back: 'Назад к коучу', cafe: 'Кафе', restaurant: 'Ресторан', bar: 'Бар', night_club: 'Клуб', park: 'Парк', museum: 'Музей', previewTitle: 'Просмотр вещи', previewGenerating: 'Создаём обзор 360°…', previewHint: 'Вид спереди, сбоку и сзади, созданный ИИ', previewError: 'Не удалось создать обзор', previewRetry: 'Повторить', previewLimit: 'Вы использовали все пробные обзоры (макс. {n})' },
  ar: { title: 'خزانتي', emptyTitle: 'خزانتك بانتظارك', deleteQ: 'حذف؟', add: 'إضافة قطعة', empty: 'أضف 3 قطع على الأقل للحصول على اقتراحات الإطلالات', suggest: 'ماذا أرتدي؟', confirmDelete: 'حذف هذه القطعة؟', full: 'خزانتك ممتلئة (60 قطعة كحد أقصى)', noGarment: 'لم يتم العثور على ملابس في الصورة', rateLimit: 'طلبات كثيرة جدًا، حاول لاحقًا', missing: 'ينقصك:', advice: 'نصيحة', cataloging: 'جارٍ تحليل القطعة…', suggesting: 'جارٍ تنسيق الإطلالات…', error: 'حدث خطأ ما، حاول مرة أخرى', back: 'العودة إلى المدرب', cafe: 'مقهى', restaurant: 'مطعم', bar: 'بار', night_club: 'نادٍ ليلي', park: 'حديقة', museum: 'متحف', previewTitle: 'عرض القطعة', previewGenerating: 'جارٍ إنشاء عرض 360°…', previewHint: 'عرض أمامي وجانبي وخلفي مُنشأ بالذكاء الاصطناعي', previewError: 'تعذّر إنشاء العرض', previewRetry: 'إعادة المحاولة', previewLimit: 'استخدمت جميع عروض العينة (بحد أقصى {n})' },
  id: { title: 'Lemari saya', emptyTitle: 'Lemari menantimu', deleteQ: 'Hapus?', add: 'Tambah pakaian', empty: 'Tambahkan minimal 3 pakaian untuk mendapat saran outfit', suggest: 'Pakai apa ya?', confirmDelete: 'Hapus pakaian ini?', full: 'Lemari penuh (maks. 60 item)', noGarment: 'Tidak ada pakaian terdeteksi di foto', rateLimit: 'Terlalu banyak permintaan, coba lagi nanti', missing: 'Kurang:', advice: 'Tips', cataloging: 'Menganalisis pakaian…', suggesting: 'Menyusun outfit…', error: 'Ada yang salah, coba lagi', back: 'Kembali ke coach', cafe: 'Kafe', restaurant: 'Restoran', bar: 'Bar', night_club: 'Klub', park: 'Taman', museum: 'Museum', previewTitle: 'Tampilan pakaian', previewGenerating: 'Membuat tampilan 360°…', previewHint: 'Tampilan depan, samping, dan belakang dibuat dengan AI', previewError: 'Gagal membuat tampilan', previewRetry: 'Coba lagi', previewLimit: 'Kamu sudah memakai semua pratinjau contoh (maks. {n})' },
  tr: { title: 'Gardırobum', emptyTitle: 'Gardırobun seni bekliyor', deleteQ: 'Silinsin mi?', add: 'Kıyafet ekle', empty: 'Kombin önerileri için en az 3 parça ekle', suggest: 'Ne giysem?', confirmDelete: 'Bu parçayı sil?', full: 'Gardırobun dolu (en fazla 60 parça)', noGarment: 'Fotoğrafta kıyafet bulunamadı', rateLimit: 'Çok fazla istek, daha sonra dene', missing: 'Eksik:', advice: 'İpucu', cataloging: 'Kıyafet analiz ediliyor…', suggesting: 'Kombinler hazırlanıyor…', error: 'Bir şeyler ters gitti, tekrar dene', back: 'Koça dön', cafe: 'Kafe', restaurant: 'Restoran', bar: 'Bar', night_club: 'Kulüp', park: 'Park', museum: 'Müze', previewTitle: 'Kıyafet görünümü', previewGenerating: '360° görünüm oluşturuluyor…', previewHint: 'Ön, yan ve arka görünüm yapay zekâ ile oluşturuldu', previewError: 'Görünüm oluşturulamadı', previewRetry: 'Tekrar dene', previewLimit: 'Örnek görünümlerini kullandın (en fazla {n})' },
};

const VENUES = ['cafe', 'restaurant', 'bar', 'night_club', 'park', 'museum'] as const;
const VENUE_EMOJI: Record<string, string> = { cafe: '☕', restaurant: '🍽️', bar: '🍸', night_club: '💃', park: '🌳', museum: '🖼️' };

@Component({
  selector: 'app-wardrobe-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closePreview()' },
  template: `
  <div class="wd">
    <div class="wd-head">
      <h2>👗 {{ t('title') }}</h2>
      <label class="wd-add" [class.busy]="cataloging()">
        {{ cataloging() ? t('cataloging') : '+ ' + t('add') }}
        <input id="wdFile" class="wd-file" type="file" accept="image/*" (change)="onFile($event)" [disabled]="cataloging()">
      </label>
    </div>
    @if (errMsg()) { <p class="wd-err">{{ errMsg() }}</p> }

    @if (items().length === 0 && !cataloging()) {
      <div class="wd-empty">
        <span class="wd-empty-glow" aria-hidden="true">{{ heroEmoji() }}</span>
        <h3 class="wd-empty-title">{{ t('emptyTitle') }}</h3>
        <p class="wd-empty-sub">{{ t('empty') }}</p>
        <label class="wd-cta" for="wdFile">+ {{ t('add') }}</label>
      </div>
    } @else {
      <div class="wd-grid">
        @for (it of items(); track it.id; let i = $index) {
          <div class="wd-item" [class.confirming]="deleteId() === it.id" [style.animation-delay.ms]="riseDelay(i)" (click)="openPreview(it)">
            <button class="wd-del" (click)="$event.stopPropagation(); askDelete(it.id)" aria-label="delete">✕</button>
            <span class="wd-emoji">{{ it.emoji || '👕' }}</span>
            <span class="wd-name">{{ it.name }}</span>
            <div class="wd-colors">
              @for (c of it.colors; track c) { <span class="wd-chip">{{ c }}</span> }
            </div>
            @if (deleteId() === it.id) {
              <div class="wd-item-confirm" role="alertdialog" [attr.aria-label]="t('confirmDelete')" (click)="$event.stopPropagation()">
                <p>{{ t('deleteQ') }}</p>
                <div class="wd-item-confirm-btns">
                  <button class="wd-btn-danger" (click)="confirmDelete()" [attr.aria-label]="t('confirmDelete')">✓</button>
                  <button class="wd-btn-ghost" (click)="deleteId.set(null)" aria-label="cancel">✕</button>
                </div>
              </div>
            }
          </div>
        }
        @if (cataloging()) {
          <div class="wd-item wd-skel" aria-live="polite">
            <span class="wd-skel-circle"></span>
            <span class="wd-skel-bar"></span>
            <span class="wd-skel-txt">{{ t('cataloging') }}</span>
          </div>
        }
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
        @for (o of outfits(); track o.title; let i = $index) {
          <div class="wd-outfit" [style.animation-delay.ms]="riseDelay(i)">
            <h4>{{ o.title }}</h4>
            <div class="wd-outfit-div" aria-hidden="true"></div>
            <div class="wd-outfit-items">
              @for (id of o.itemIds; track id) {
                @if (itemById(id); as it) { <span class="wd-chip big">{{ it.emoji }} {{ it.name }}</span> }
              }
            </div>
            <p class="wd-why">{{ o.why }}</p>
            <p class="wd-tip"><span class="wd-tip-ic" aria-hidden="true">💡</span><span>{{ o.tip }}</span></p>
          </div>
        }
        @if (generalAdvice()) { <p class="wd-advice"><b>{{ t('advice') }}:</b> {{ generalAdvice() }}</p> }
        @if (missingPiece()) { <p class="wd-missing"><b>{{ t('missing') }}</b> {{ missingPiece() }}</p> }
      </div>
    }

    <!-- AI garment 360° preview modal (generateWardrobePreview CF) -->
    @if (previewItem(); as pit) {
      <div class="wd-pv-scrim" (click)="closePreview()">
        <div class="wd-pv" role="dialog" aria-modal="true" [attr.aria-label]="t('previewTitle')" (click)="$event.stopPropagation()">
          <div class="wd-pv-head">
            <span class="wd-pv-emoji" aria-hidden="true">{{ pit.emoji || '👕' }}</span>
            <h3 class="wd-pv-name">{{ pit.name }}</h3>
            <button class="wd-pv-close" (click)="closePreview()" aria-label="close">✕</button>
          </div>
          <div class="wd-pv-body">
            @if (previewLoading()) {
              <div class="wd-pv-skel" aria-hidden="true"></div>
              <p class="wd-pv-caption" aria-live="polite">{{ t('previewGenerating') }}</p>
            } @else if (previewLimitHit()) {
              <p class="wd-pv-err">{{ t('previewLimit').replace('{n}', '' + previewMaxAllowed()) }}</p>
            } @else if (previewError()) {
              <p class="wd-pv-err">{{ t('previewError') }}</p>
              <button class="wd-pv-retry" (click)="retryPreview()">{{ t('previewRetry') }}</button>
            } @else if (previewUrl()) {
              <img class="wd-pv-img" [src]="previewUrl()" [alt]="pit.name">
              <p class="wd-pv-caption">{{ t('previewHint') }}</p>
            }
          </div>
        </div>
      </div>
    }
  </div>
  `,
  styles: [`
    :host { --wd-ease: cubic-bezier(0.16, 1, 0.3, 1); }
    .wd { max-width: 680px; margin: 0 auto; padding: 16px; color: var(--text-primary, #EDEDF2); }
    .wd-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .wd-head h2 { font-size: 22px; margin: 0; }

    /* Add garment — gold gradient pill wrapping a visually-hidden (still focusable) file input */
    .wd-add { position: relative; background: var(--gradient-gold, linear-gradient(135deg,#B8860B,#D4AF37)); color: var(--on-gold, #1A1206); padding: 10px 16px; border-radius: 12px; font-weight: 700; cursor: pointer; font-size: 14px; transition: transform 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease); }
    .wd-add:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(212,175,55,.25); }
    .wd-add:focus-within { outline: 2px solid var(--gold, #D4AF37); outline-offset: 2px; }
    .wd-add.busy { opacity: .6; pointer-events: none; }
    .wd-file { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

    .wd-err { color: #ff8080; font-size: 14px; margin: 10px 0; }

    /* Empty state — glow circle + headline + gold CTA (labels the hidden input) */
    .wd-empty { text-align: center; padding: 48px 16px 40px; }
    .wd-empty-glow { display: grid; place-items: center; width: 96px; height: 96px; margin: 0 auto 18px; font-size: 44px; border-radius: 50%; background: radial-gradient(circle at 50% 42%, rgba(212,175,55,.16), rgba(131,27,252,.12) 62%, transparent 78%); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
    .wd-empty-title { margin: 0 0 8px; font-size: 19px; font-weight: 700; color: var(--text-primary, #FFF); }
    .wd-empty-sub { margin: 0 auto 22px; max-width: 38ch; font-size: 14px; line-height: 1.5; color: var(--text-muted, #B0B0B0); }
    .wd-cta { display: inline-block; background: var(--gradient-gold, linear-gradient(135deg,#B8860B,#D4AF37)); color: var(--on-gold, #1A1206); font-weight: 700; font-size: 15px; padding: 13px 28px; border-radius: 999px; cursor: pointer; box-shadow: 0 8px 24px rgba(212,175,55,.22); transition: transform 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease); }
    .wd-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(212,175,55,.32); }

    /* Item grid */
    .wd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; margin-top: 16px; }
    .wd-item { position: relative; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 14px 10px; display: flex; flex-direction: column; align-items: center; gap: 6px; transition: transform 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease), border-color 200ms var(--wd-ease); }
    .wd-item:hover { transform: translateY(-2px); border-color: rgba(212,175,55,.25); box-shadow: 0 8px 24px rgba(0,0,0,.35), 0 4px 18px rgba(212,175,55,.12); }
    .wd-item.confirming { transform: none; }
    .wd-del { position: absolute; top: 6px; right: 6px; z-index: 1; background: none; border: none; color: #8A8A99; cursor: pointer; font-size: 12px; padding: 4px; border-radius: 8px; transition: color 200ms var(--wd-ease); }
    .wd-del:hover { color: var(--app-red, #FF4457); }
    .wd-del:focus-visible { outline: 2px solid var(--gold, #D4AF37); outline-offset: 1px; }
    .wd-emoji { display: grid; place-items: center; width: 58px; height: 58px; font-size: 30px; border-radius: 50%; background: radial-gradient(circle at 50% 42%, rgba(212,175,55,.12), rgba(131,27,252,.12) 62%, transparent 80%); }
    .wd-name { font-size: 13px; text-align: center; }
    .wd-colors { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
    .wd-chip { background: rgba(156,89,234,.2); border-radius: 8px; padding: 2px 8px; font-size: 11px; }
    .wd-chip.big { font-size: 13px; padding: 4px 10px; }

    /* Inline delete confirm — overlay on the card itself */
    .wd-item-confirm { position: absolute; inset: 0; z-index: 2; border-radius: 16px; background: rgba(14,10,18,.9); backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 10px; box-shadow: inset 0 0 0 1px rgba(212,175,55,.28); }
    .wd-item-confirm p { margin: 0; font-size: 13.5px; font-weight: 600; text-align: center; }
    .wd-item-confirm-btns { display: flex; gap: 10px; }
    .wd-btn-danger { background: #c0392b; color: #fff; border: none; border-radius: 10px; padding: 8px 14px; cursor: pointer; transition: transform 200ms var(--wd-ease), filter 200ms var(--wd-ease); }
    .wd-btn-danger:hover { filter: brightness(1.12); transform: translateY(-1px); }
    .wd-btn-ghost { background: none; color: var(--text-primary, #EDEDF2); border: 1px solid rgba(255,255,255,.25); border-radius: 10px; padding: 8px 14px; cursor: pointer; transition: background 200ms var(--wd-ease); }
    .wd-btn-ghost:hover { background: rgba(255,255,255,.08); }
    .wd-btn-danger:focus-visible, .wd-btn-ghost:focus-visible { outline: 2px solid var(--gold, #D4AF37); outline-offset: 2px; }

    /* Cataloging skeleton card — gradient sweep shimmer */
    .wd-skel { overflow: hidden; justify-content: center; min-height: 128px; }
    .wd-skel-circle { width: 58px; height: 58px; border-radius: 50%; background: var(--skeleton-base, rgba(255,255,255,.06)); }
    .wd-skel-bar { width: 70%; height: 10px; border-radius: 6px; background: var(--skeleton-base, rgba(255,255,255,.06)); }
    .wd-skel-txt { font-size: 11.5px; color: var(--text-muted, #B0B0B0); }
    .wd-skel::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(105deg, transparent 25%, var(--skeleton-sheen, rgba(255,255,255,.14)) 50%, transparent 75%); }

    /* Suggestions */
    .wd-suggest { margin-top: 28px; border-top: 1px solid rgba(255,255,255,.08); padding-top: 18px; }
    .wd-suggest h3 { font-size: 18px; margin: 0 0 12px; }
    .wd-venues { display: flex; gap: 8px; flex-wrap: wrap; }
    .wd-venue { background: rgba(255,255,255,.05); color: var(--text-primary, #EDEDF2); border: 1px solid rgba(255,255,255,.08); border-radius: 20px; padding: 8px 14px; cursor: pointer; font-size: 13px; font-family: inherit; transition: transform 200ms var(--wd-ease), background 200ms var(--wd-ease), border-color 200ms var(--wd-ease), color 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease); }
    .wd-venue:hover:not(:disabled):not(.sel) { background: rgba(255,255,255,.09); border-color: rgba(212,175,55,.4); transform: translateY(-1px); }
    .wd-venue:focus-visible { outline: 2px solid var(--gold, #D4AF37); outline-offset: 2px; }
    .wd-venue:disabled { opacity: .55; cursor: default; }
    .wd-venue.sel { background: var(--gradient-gold, linear-gradient(135deg,#B8860B,#D4AF37)); color: var(--on-gold, #1A1206); border-color: transparent; font-weight: 700; transform: scale(1.05); box-shadow: 0 4px 16px rgba(212,175,55,.28); }
    .wd-loading { color: var(--text-muted, #C9C9D4); font-size: 14px; margin-top: 12px; }

    /* Outfit result cards */
    .wd-outfit { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.08); border-radius: 16px; padding: 14px; margin-top: 12px; transition: transform 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease), border-color 200ms var(--wd-ease); }
    .wd-outfit:hover { transform: translateY(-2px); border-color: rgba(212,175,55,.22); box-shadow: 0 8px 24px rgba(0,0,0,.35), 0 4px 18px rgba(212,175,55,.1); }
    .wd-outfit h4 { margin: 0 0 8px; font-size: 15px; color: var(--gold, #D4AF37); }
    .wd-outfit-div { height: 1px; margin: 0 0 10px; background: linear-gradient(90deg, rgba(212,175,55,.5), rgba(131,27,252,.35), transparent); }
    .wd-outfit-items { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
    .wd-why { font-size: 13px; color: var(--text-muted, #C9C9D4); margin: 4px 0; }
    .wd-tip { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; margin: 8px 0 0; padding: 8px 10px; border-radius: 10px; background: rgba(212,175,55,.08); border: 1px solid rgba(212,175,55,.14); }
    .wd-tip-ic { flex: none; }
    .wd-advice, .wd-missing { font-size: 13px; color: var(--text-muted, #C9C9D4); margin-top: 12px; }

    /* AI garment preview modal — dark blurred scrim + centered card */
    .wd-pv-scrim { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px; background: rgba(10,8,14,.72); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
    .wd-pv { max-width: min(92vw, 600px); max-height: 92vh; overflow-y: auto; background: var(--surface, #17121F); border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 14px 16px 18px; box-shadow: 0 24px 64px rgba(0,0,0,.5); }
    .wd-pv-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .wd-pv-emoji { font-size: 22px; }
    .wd-pv-name { flex: 1; margin: 0; font-size: 16px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .wd-pv-close { flex: none; background: none; border: none; color: #8A8A99; cursor: pointer; font-size: 15px; padding: 6px 8px; border-radius: 8px; transition: color 200ms var(--wd-ease); }
    .wd-pv-close:hover { color: var(--text-primary, #FFF); }
    .wd-pv-close:focus-visible, .wd-pv-retry:focus-visible { outline: 2px solid var(--gold, #D4AF37); outline-offset: 2px; }
    .wd-pv-body { display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .wd-pv-img { display: block; width: 100%; max-width: min(90vw, 560px); border-radius: 16px; box-shadow: 0 0 34px rgba(212,175,55,.18), 0 8px 28px rgba(0,0,0,.4); }
    .wd-pv-caption { margin: 0; font-size: 12.5px; text-align: center; color: var(--text-muted, #B0B0B0); }
    .wd-pv-skel { position: relative; overflow: hidden; width: min(76vw, 380px); aspect-ratio: 3 / 4; border-radius: 16px; background: var(--skeleton-base, rgba(255,255,255,.06)); }
    .wd-pv-skel::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%); background: linear-gradient(105deg, transparent 25%, var(--skeleton-sheen, rgba(255,255,255,.14)) 50%, transparent 75%); }
    .wd-pv-err { margin: 18px 0 0; font-size: 14px; color: #ff8080; text-align: center; }
    .wd-pv-retry { background: var(--gradient-gold, linear-gradient(135deg,#B8860B,#D4AF37)); color: var(--on-gold, #1A1206); border: none; border-radius: 12px; padding: 10px 20px; font-weight: 700; font-size: 14px; cursor: pointer; transition: transform 200ms var(--wd-ease), box-shadow 200ms var(--wd-ease); }
    .wd-pv-retry:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(212,175,55,.25); }

    /* Entrance + shimmer motion — only when the user hasn't asked for reduced motion */
    @media (prefers-reduced-motion: no-preference) {
      @keyframes wdRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes wdFadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes wdSweep { to { transform: translateX(100%); } }
      @keyframes wdPop { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
      .wd-item { animation: wdRise 450ms var(--wd-ease) backwards; }
      .wd-outfit { animation: wdRise 400ms var(--wd-ease) backwards; }
      .wd-item-confirm { animation: wdFadeIn 180ms var(--wd-ease) backwards; }
      .wd-skel::after { animation: wdSweep 1.4s ease-in-out infinite; }
      .wd-pv-scrim { animation: wdFadeIn 200ms var(--wd-ease) backwards; }
      .wd-pv { animation: wdPop 280ms var(--wd-ease) backwards; }
      .wd-pv-skel::after { animation: wdSweep 1.4s ease-in-out infinite; }
    }
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
  /** Own profile gender (users/{uid}.male) — personalizes the empty-state hero. null = unknown. */
  readonly isMale = signal<boolean | null>(null);
  // AI garment preview modal state (generateWardrobePreview CF)
  readonly previewItem = signal<WardrobeItem | null>(null);
  readonly previewUrl = signal('');
  readonly previewLoading = signal(false);
  readonly previewError = signal(false);
  // R152: lifetime sample-preview cap — 'preview_limit_reached' hides retry (permanent).
  readonly previewLimitHit = signal(false);
  readonly previewMaxAllowed = signal(5);
  readonly venues = VENUES;
  readonly venueEmoji = VENUE_EMOJI;
  private unsub: (() => void) | null = null;
  private itemMap = computed(() => new Map(this.items().map((i) => [i.id, i])));

  ngOnInit() {
    this.unsub = this.fb.listenWardrobe((rows) => this.items.set(rows as WardrobeItem[]));
    this.fb.getMyGender().then((g) => this.isMale.set(g)).catch(() => { /* keep neutral hero */ });
  }
  ngOnDestroy() { this.unsub?.(); }

  /** Empty-state hero emoji, personalized by profile gender. */
  heroEmoji(): string {
    const m = this.isMale();
    return m === true ? '👔' : m === false ? '👗' : '🧺';
  }

  private lang(): string {
    try { const l = (navigator.language || 'es').slice(0, 2); return W_I18N[l] ? l : 'es'; } catch { return 'es'; }
  }
  t(key: string): string { return W_I18N[this.lang()]?.[key] || W_I18N['es'][key] || key; }
  itemById(id: string): WardrobeItem | undefined { return this.itemMap().get(id); }
  /** Staggered entrance delay per grid index, capped so late items don't lag. */
  riseDelay(i: number): number { return Math.min(i * 40, 480); }

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

  // ── AI garment 360° preview modal ──────────────────────────────────────────
  /** Open the preview modal for an item card (ignored while its delete-confirm overlay is open). */
  openPreview(it: WardrobeItem) {
    if (this.deleteId() === it.id) return;
    this.previewItem.set(it);
    this.loadPreview();
  }
  retryPreview() { this.loadPreview(); }
  closePreview() {
    this.previewItem.set(null);
    this.previewUrl.set('');
    this.previewError.set(false);
    this.previewLimitHit.set(false);
    this.previewLoading.set(false);
  }
  private async loadPreview() {
    const it = this.previewItem();
    if (!it) return;
    this.previewUrl.set('');
    this.previewError.set(false);
    this.previewLimitHit.set(false);
    this.previewLoading.set(true);
    try {
      const res = await this.fb.wardrobePreview(it.id, this.lang());
      if (this.previewItem()?.id !== it.id) return; // closed/changed mid-flight — drop stale result
      if (res?.success && res.previewUrl) this.previewUrl.set(res.previewUrl);
      else if (res?.error === 'preview_limit_reached') {
        this.previewMaxAllowed.set(Number(res.maxPreviews) || 5);
        this.previewLimitHit.set(true);
      } else this.previewError.set(true);
    } catch {
      if (this.previewItem()?.id === it.id) this.previewError.set(true);
    } finally {
      if (this.previewItem()?.id === it.id) this.previewLoading.set(false);
    }
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
