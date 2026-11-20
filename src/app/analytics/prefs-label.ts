// Etiqueta «Preferencias de privacidad» del pie, aparte de `consent-messages.ts` (13 idiomas completos): así el JS inicial
// solo lleva estas 13 frases cortas y el aviso (textos, estilos, lógica) se descarga cuando hace falta. Una prueba exige que
// coincidan con `CONSENT_MESSAGES[lang].preferences`.
const LABELS: Record<string, string> = {
  es: 'Preferencias de privacidad',
  en: 'Privacy preferences',
  pt: 'Preferências de privacidade',
  fr: 'Préférences de confidentialité',
  de: 'Datenschutzeinstellungen',
  it: 'Preferenze sulla privacy',
  ja: 'プライバシー設定',
  ko: '개인정보 설정',
  zh: '隐私偏好',
  ar: 'تفضيلات الخصوصية',
  hi: 'गोपनीयता प्राथमिकताएँ',
  ru: 'Настройки конфиденциальности',
  tr: 'Gizlilik tercihleri',
};

export function prefsLabel(lang: string): string {
  return LABELS[lang.toLowerCase().split('-')[0]] ?? LABELS['es'];
}
