// Textos del aviso de analítica en los 13 idiomas de Bimbask. Los sitios los integran en su mecanismo i18n
// (o los consumen tal cual vía `consentMessages(lang)`). [ABOGADO] revisar redacción final.
export const LANGS = ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'hi', 'ru', 'tr'] as const;
export type Lang = (typeof LANGS)[number];
export interface ConsentMessages { text: string; accept: string; necessary: string; privacy: string; preferences: string; label: string }

export const CONSENT_MESSAGES: Record<Lang, ConsentMessages> = {
  es: { text: 'Medimos las visitas con analítica anónima de Google, sin publicidad ni datos personales, para mejorar el sitio.', accept: 'Aceptar', necessary: 'Solo lo necesario', privacy: 'Privacidad', preferences: 'Preferencias de privacidad', label: 'Aviso de analítica' },
  en: { text: 'We measure visits with anonymous Google analytics, with no ads and no personal data, to improve the site.', accept: 'Accept', necessary: 'Only what is necessary', privacy: 'Privacy', preferences: 'Privacy preferences', label: 'Analytics notice' },
  pt: { text: 'Medimos as visitas com análise anónima do Google, sem publicidade nem dados pessoais, para melhorar o site.', accept: 'Aceitar', necessary: 'Apenas o necessário', privacy: 'Privacidade', preferences: 'Preferências de privacidade', label: 'Aviso de análise' },
  fr: { text: 'Nous mesurons les visites avec une analyse Google anonyme, sans publicité ni données personnelles, pour améliorer le site.', accept: 'Accepter', necessary: 'Uniquement le nécessaire', privacy: 'Confidentialité', preferences: 'Préférences de confidentialité', label: 'Avis sur la mesure d’audience' },
  de: { text: 'Wir messen Besuche mit anonymer Google-Analyse, ohne Werbung und ohne personenbezogene Daten, um die Website zu verbessern.', accept: 'Akzeptieren', necessary: 'Nur das Notwendige', privacy: 'Datenschutz', preferences: 'Datenschutzeinstellungen', label: 'Hinweis zur Analyse' },
  it: { text: 'Misuriamo le visite con un’analisi anonima di Google, senza pubblicità né dati personali, per migliorare il sito.', accept: 'Accetta', necessary: 'Solo il necessario', privacy: 'Privacy', preferences: 'Preferenze sulla privacy', label: 'Avviso sull’analisi' },
  ja: { text: 'サイト改善のため、広告や個人情報を使わない匿名のGoogleアナリティクスで訪問数を測定します。', accept: '同意する', necessary: '必要なものだけ', privacy: 'プライバシー', preferences: 'プライバシー設定', label: '解析に関するお知らせ' },
  ko: { text: '사이트 개선을 위해 광고와 개인정보 없이 익명 Google 분석으로 방문 수를 측정합니다.', accept: '동의', necessary: '필수만 허용', privacy: '개인정보', preferences: '개인정보 설정', label: '분석 안내' },
  zh: { text: '为改进网站，我们使用匿名的 Google 分析统计访问量，不含广告，也不收集个人数据。', accept: '接受', necessary: '仅限必要项', privacy: '隐私', preferences: '隐私偏好', label: '分析提示' },
  ar: { text: 'نقيس الزيارات بتحليلات جوجل المجهولة، دون إعلانات أو بيانات شخصية، لتحسين الموقع.', accept: 'قبول', necessary: 'الضروري فقط', privacy: 'الخصوصية', preferences: 'تفضيلات الخصوصية', label: 'إشعار التحليلات' },
  hi: { text: 'साइट को बेहतर बनाने के लिए हम Google के गुमनाम विश्लेषण से विज़िट मापते हैं, बिना विज्ञापन और निजी डेटा के।', accept: 'स्वीकार करें', necessary: 'केवल आवश्यक', privacy: 'गोपनीयता', preferences: 'गोपनीयता प्राथमिकताएँ', label: 'विश्लेषण सूचना' },
  ru: { text: 'Мы измеряем посещаемость анонимной аналитикой Google без рекламы и персональных данных, чтобы улучшать сайт.', accept: 'Принять', necessary: 'Только необходимое', privacy: 'Конфиденциальность', preferences: 'Настройки конфиденциальности', label: 'Уведомление об аналитике' },
  tr: { text: 'Siteyi geliştirmek için ziyaretleri, reklamsız ve kişisel veri içermeyen anonim Google analitiği ile ölçüyoruz.', accept: 'Kabul et', necessary: 'Yalnızca gerekli olanlar', privacy: 'Gizlilik', preferences: 'Gizlilik tercihleri', label: 'Analitik bildirimi' },
};

export function consentMessages(lang: string): ConsentMessages {
  const base = lang.toLowerCase().split('-')[0] as Lang;
  return CONSENT_MESSAGES[base] ?? CONSENT_MESSAGES.es;
}
export const isRtl = (lang: string): boolean => lang.toLowerCase().startsWith('ar');
