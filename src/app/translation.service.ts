import { Injectable, signal } from '@angular/core';

export type Language = 'es' | 'en' | 'pt' | 'fr' | 'de' | 'ja' | 'zh' | 'ru' | 'ar' | 'id';

interface Translations {
  [key: string]: {
    es: string;
    en: string;
    [key: string]: string | undefined;
  };
}

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  currentLanguage = signal<Language>('es');
  private currentYear = new Date().getFullYear();
  private currentMonth = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' });
  private currentMonthEn = new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' });

  private translations: Translations = {
    // Age Gate
    'age.title': {
      es: 'Black Sugar 21',
      en: 'Black Sugar 21'
    },
    'age.exclusive': {
      es: 'Contenido Exclusivo +{age}',
      en: 'Exclusive Content +{age}'
    },
    'age.restricted': {
      es: 'Debes tener {age} años o más para acceder.',
      en: 'You must be {age} or older to access.'
    },
    'age.button': {
      es: 'Tengo {age} años o más',
      en: "I'm {age} or older"
    },
    'age.terms': {
      es: 'Al entrar, aceptas nuestros términos.',
      en: 'By entering, you accept our terms.'
    },

    // Toolbar
    'nav.date': {
      es: 'Inicio',
      en: 'Home'
    },
    'nav.terms': {
      es: 'Términos de Uso', en: 'Terms of Use',
      fr: 'Conditions d\'utilisation', de: 'Nutzungsbedingungen', ja: '利用規約',
      zh: '使用条款', ru: 'Условия использования', ar: 'شروط الاستخدام', id: 'Ketentuan Penggunaan'
    },
    'nav.privacy': {
      es: 'Políticas de Privacidad', en: 'Privacy Policy',
      fr: 'Politique de confidentialité', de: 'Datenschutzrichtlinie', ja: 'プライバシーポリシー',
      zh: '隐私政策', ru: 'Политика конфиденциальности', ar: 'سياسة الخصوصية', id: 'Kebijakan Privasi'
    },

    // Hero Section
    'hero.title': {
      es: 'Tu coach personal con IA.',
      en: 'Your Personal AI Coach.'
    },
    'hero.tagline': {
      es: 'Descubre lugares, recibe consejos personalizados y mejora tu vida social con guía inteligente.',
      en: 'Discover places, get personalized advice, and enhance your social life with intelligent guidance.'
    },
    'hero.subtitle': {
      es: '',
      en: ''
    },
    'hero.ios': {
      es: 'Descargar en iOS',
      en: 'Download on iOS'
    },
    'hero.android': {
      es: 'Obtener en Android',
      en: 'Get it on Android'
    },

    // Features Section
    'features.stories.title': {
      es: 'Más que una foto',
      en: 'More than a photo'
    },
    'features.stories.desc': {
      es: 'Crea historias para mostrar que eres mucho más que una foto.',
      en: 'Create stories to show you\'re so much more than a photo.'
    },
    'features.connections.title': {
      es: 'Compatibilidad IA',
      en: 'AI Compatibility'
    },
    'features.connections.desc': {
      es: 'Cada perfil muestra un porcentaje de compatibilidad calculado por IA, basado en intereses compartidos, edad, proximidad y preferencias.',
      en: 'Each profile displays a compatibility percentage calculated by AI, based on shared interests, age, proximity, and preferences.'
    },
    'features.coach.title': {
      es: 'Coach IA',
      en: 'AI Coach'
    },
    'features.coach.desc': {
      es: 'Un coach de IA que te guía con consejos personalizados y sugerencias de lugares reales cerca de ti.',
      en: 'An AI coach that guides you with personalized advice and real place suggestions near you.'
    },

    // AI Coach Section
    'coach.section.label': {
      es: 'COACH IA',
      en: 'AI COACH'
    },
    'coach.section.title': {
      es: 'Tu guía personal con inteligencia artificial.',
      en: 'Your personal guide powered by AI.'
    },
    'coach.section.subtitle': {
      es: 'Accede instantáneamente desde tu perfil',
      en: 'Access instantly from your Profile'
    },
    'coach.feature1.title': {
      es: 'Consejos personalizados',
      en: 'Personalized Advice'
    },
    'coach.feature1.desc': {
      es: 'El coach analiza tu contexto y te da consejos específicos para cada situación.',
      en: 'The coach analyzes your context and gives you specific advice for each situation.'
    },
    'coach.feature2.title': {
      es: 'Descubre lugares reales',
      en: 'Discover real places'
    },
    'coach.feature2.desc': {
      es: 'Sugiere cafeterías, restaurantes, bares y más cerca de tu ubicación — con fotos y reseñas reales.',
      en: 'Suggests cafés, restaurants, bars and more near your location — with real photos and reviews.'
    },
    'coach.feature3.title': {
      es: 'Coaching en tiempo real',
      en: 'Real-time Coaching'
    },
    'coach.feature3.desc': {
      es: 'Un banner inteligente analiza tus conversaciones en vivo, mostrando compatibilidad, tips contextuales y respuestas sugeridas.',
      en: 'A smart banner analyzes your conversations live, showing compatibility, contextual tips, and suggested responses.'
    },
    'coach.feature4.title': {
      es: 'Mejora tu confianza',
      en: 'Build your confidence'
    },
    'coach.feature4.desc': {
      es: 'Te ayuda a comunicarte mejor y ganar seguridad en tus interacciones sociales.',
      en: 'Helps you communicate better and gain confidence in your social interactions.'
    },
    'coach.cta': {
      es: 'Descarga la app y conoce tu coach',
      en: 'Download the app and meet your coach'
    },

    // Terms Section
    'terms.title': {
      es: 'Términos de Uso',
      en: 'Terms of Use'
    },
    'terms.welcome': {
      es: 'Bienvenido a Black Sugar 21. Al utilizar nuestra aplicación, aceptas cumplir con los siguientes términos:',
      en: 'Welcome to Black Sugar 21. By using our application, you agree to comply with the following terms:'
    },
    'terms.age': {
      es: 'Debes tener al menos 18 años de edad para utilizar esta aplicación.',
      en: 'You must be at least 18 years old to use this application.'
    },
    'terms.content': {
      es: 'El contenido es para uso personal y entretenimiento.',
      en: 'Content is for personal use and entertainment.'
    },
    'terms.respect': {
      es: 'Respeta la privacidad y seguridad de otros usuarios.',
      en: 'Respect the privacy and security of other users.'
    },
    'terms.redistribution': {
      es: 'Queda prohibida la redistribución del contenido.',
      en: 'Content redistribution is prohibited.'
    },
    'terms.violation': {
      es: 'Nos reservamos el derecho de suspender cuentas que violen nuestras normas de comunidad.',
      en: 'We reserve the right to suspend accounts that violate our community standards.'
    },

    // Privacy Section
    'privacy.title': {
      es: 'Políticas de Privacidad',
      en: 'Privacy Policy'
    },
    'privacy.intro': {
      es: 'Tu privacidad es nuestra prioridad. Manejamos tus datos de manera privada y segura.',
      en: 'Your privacy is our priority. We handle your data privately and securely.'
    },
    'privacy.collection': {
      es: 'Recopilación de Datos',
      en: 'Data Collection'
    },
    'privacy.collectionText': {
      es: 'Solo recopilamos los datos necesarios para el funcionamiento de la app: número de teléfono (para autenticación), edad verificada 18+, fotos de perfil, ubicación aproximada y preferencias de búsqueda (rango de edad, distancia, orientación).',
      en: 'We only collect data necessary for app functionality: phone number (for authentication), verified age 18+, profile photos, approximate location, and search preferences (age range, distance, orientation).'
    },
    'privacy.usage': {
      es: 'Uso de Datos',
      en: 'Data Usage'
    },
    'privacy.usageText': {
      es: 'Tus datos nunca serán vendidos a terceros. Se utilizan exclusivamente para mejorar tu experiencia en Black Sugar 21.',
      en: 'Your data will never be sold to third parties. It is used exclusively to improve your experience on Black Sugar 21.'
    },
    'privacy.security': {
      es: 'Seguridad',
      en: 'Security'
    },
    'privacy.securityText': {
      es: 'Utilizamos encriptación de grado militar para proteger tu información.',
      en: 'We use military-grade encryption to protect your information.'
    },

    // Data Deletion
    'dataDeletion.title': {
      es: 'Eliminación de Datos',
      en: 'Data Deletion'
    },
    'dataDeletion.intro': {
      es: 'En Black Sugar 21, respetamos tu derecho a controlar tus datos personales. Puedes eliminar tu cuenta y todos tus datos de forma permanente directamente desde la aplicación.',
      en: 'At Black Sugar 21, we respect your right to control your personal data. You can permanently delete your account and all your data directly from the app.'
    },
    'dataDeletion.inApp': {
      es: 'Cómo Eliminar tu Cuenta y Datos',
      en: 'How to Delete Your Account and Data'
    },
    'dataDeletion.inAppText': {
      es: 'La eliminación de tu cuenta es un proceso inmediato y permanente que se realiza desde la aplicación Black Sugar 21:',
      en: 'Deleting your account is an immediate and permanent process done from the Black Sugar 21 app:'
    },
    'dataDeletion.step1': {
      es: 'Abre la aplicación Black Sugar 21 en tu dispositivo',
      en: 'Open the Black Sugar 21 app on your device'
    },
    'dataDeletion.step2': {
      es: 'Ve a tu perfil y accede a "Configuración"',
      en: 'Go to your profile and access "Settings"'
    },
    'dataDeletion.step3': {
      es: 'Selecciona "Eliminar Cuenta" al final de la página',
      en: 'Select "Delete Account" at the bottom of the page'
    },
    'dataDeletion.step4': {
      es: 'Confirma la eliminación. Tu cuenta y todos tus datos se eliminarán inmediatamente',
      en: 'Confirm deletion. Your account and all your data will be deleted immediately'
    },
    'dataDeletion.whatDeleted': {
      es: 'Datos que se Eliminan',
      en: 'Data that Gets Deleted'
    },
    'dataDeletion.whatDeletedText': {
      es: 'Cuando eliminas tu cuenta, se borran de forma permanente los siguientes datos:',
      en: 'When you delete your account, the following data is permanently erased:'
    },
    'dataDeletion.data1': {
      es: 'Información de perfil (nombre, fecha de nacimiento, biografía, preferencias)',
      en: 'Profile information (name, date of birth, bio, preferences)'
    },
    'dataDeletion.data2': {
      es: 'Todas tus fotos y contenido multimedia',
      en: 'All your photos and media content'
    },
    'dataDeletion.data3': {
      es: 'Historial de conversaciones y mensajes',
      en: 'Conversation history and messages'
    },
    'dataDeletion.data4': {
      es: 'Historial de interacciones y conversaciones con el coach',
      en: 'Coach interaction and conversation history'
    },
    'dataDeletion.data5': {
      es: 'Datos de ubicación y preferencias de búsqueda',
      en: 'Location data and search preferences'
    },
    'dataDeletion.data6': {
      es: 'Historial de actividad en la aplicación',
      en: 'Activity history in the app'
    },
    'dataDeletion.retention': {
      es: 'Periodo de Retención',
      en: 'Retention Period'
    },
    'dataDeletion.retentionText': {
      es: 'Nuestro compromiso con tu privacidad incluye los siguientes plazos de eliminación:',
      en: 'Our commitment to your privacy includes the following deletion timelines:'
    },
    'dataDeletion.immediate': {
      es: 'Inmediato:',
      en: 'Immediate:'
    },
    'dataDeletion.immediateText': {
      es: 'Tu cuenta se desactiva al instante y tus datos dejan de ser accesibles para otros usuarios.',
      en: 'Your account is deactivated instantly and your data is no longer accessible to other users.'
    },
    'dataDeletion.backup': {
      es: '30 días:',
      en: '30 days:'
    },
    'dataDeletion.backupText': {
      es: 'Los datos se eliminan completamente de nuestras copias de seguridad activas.',
      en: 'Data is completely removed from our active backup systems.'
    },
    'dataDeletion.legal': {
      es: 'Excepciones legales:',
      en: 'Legal exceptions:'
    },
    'dataDeletion.legalText': {
      es: 'Solo conservamos datos mínimos si es requerido por ley (registros de auditoría, prevención de fraude) por un máximo de 90 días.',
      en: 'We only retain minimal data if required by law (audit logs, fraud prevention) for a maximum of 90 days.'
    },
    'dataDeletion.important': {
      es: 'Importante',
      en: 'Important'
    },
    'dataDeletion.importantText': {
      es: 'La eliminación de tu cuenta es irreversible. Una vez confirmada, no podrás recuperar tu cuenta ni tus datos. Si deseas volver a usar Black Sugar 21 en el futuro, tendrás que crear una cuenta nueva.',
      en: 'Account deletion is irreversible. Once confirmed, you cannot recover your account or data. If you wish to use Black Sugar 21 in the future, you will need to create a new account.'
    },

    // Safety Standards
    'safety.title': {
      es: 'Estándares de Seguridad Infantil',
      en: 'Child Safety Standards'
    },
    'safety.intro': {
      es: 'En Black Sugar 21, la protección de menores y la prevención del abuso sexual infantil son nuestra máxima prioridad. Hemos implementado sistemas de seguridad avanzados con inteligencia artificial para garantizar un entorno seguro y protegido.',
      en: 'At Black Sugar 21, protecting minors and preventing child sexual abuse are our highest priority. We have implemented advanced AI-powered security systems to ensure a safe and protected environment.'
    },
    'safety.ageVerification': {
      es: 'Verificación Rigurosa de Edad',
      en: 'Strict Age Verification'
    },
    'safety.ageVerificationText': {
      es: 'Implementamos múltiples capas de verificación para garantizar que todos los usuarios sean mayores de 18 años:',
      en: 'We implement multiple verification layers to ensure all users are over 18 years old:'
    },
    'safety.age1': {
      es: 'Verificación obligatoria de fecha de nacimiento durante el registro',
      en: 'Mandatory date of birth verification during registration'
    },
    'safety.age2': {
      es: 'Validación automática de edad por país según normativas locales',
      en: 'Automatic age validation by country according to local regulations'
    },
    'safety.age3': {
      es: 'Restricción absoluta: Solo usuarios mayores de 18 años pueden acceder a la plataforma',
      en: 'Absolute restriction: Only users over 18 years old can access the platform'
    },
    'safety.childProtection': {
      es: 'Protección Contra Explotación y Abuso Sexual Infantil (EASI)',
      en: 'Protection Against Child Sexual Exploitation and Abuse (CSEA)'
    },
    'safety.childProtectionText': {
      es: 'Nuestra plataforma cuenta con sistemas de detección proactiva para prevenir cualquier forma de explotación o abuso:',
      en: 'Our platform features proactive detection systems to prevent any form of exploitation or abuse:'
    },
    'safety.child1': {
      es: 'Cero tolerancia: Prohibición absoluta de contenido relacionado con menores de edad',
      en: 'Zero tolerance: Absolute prohibition of content related to minors'
    },
    'safety.child2': {
      es: 'Bloqueo inmediato y permanente de cuentas que intenten acceder siendo menores',
      en: 'Immediate and permanent blocking of accounts attempting to access as minors'
    },
    'safety.child3': {
      es: 'Colaboración activa con autoridades competentes ante cualquier sospecha',
      en: 'Active collaboration with competent authorities in case of any suspicion'
    },
    'safety.child4': {
      es: 'Reportes automáticos al NCMEC (National Center for Missing & Exploited Children) cuando corresponda',
      en: 'Automatic reports to NCMEC (National Center for Missing & Exploited Children) when applicable'
    },
    'safety.aiModeration': {
      es: 'Moderación Inteligente con IA 24/7',
      en: 'Intelligent AI Moderation 24/7'
    },
    'safety.aiModerationText': {
      es: 'Utilizamos tecnología de inteligencia artificial de última generación para proteger nuestra comunidad:',
      en: 'We use state-of-the-art artificial intelligence technology to protect our community:'
    },
    'safety.ai1': {
      es: 'Análisis automático de todas las fotos de perfil con Google Cloud Vision AI para detectar contenido inapropiado',
      en: 'Automatic analysis of all profile photos with Google Cloud Vision AI to detect inappropriate content'
    },
    'safety.ai2': {
      es: 'Escaneo en tiempo real de mensajes con Google Gemini AI para identificar lenguaje ofensivo, acoso o contenido ilegal',
      en: 'Real-time message scanning with Google Gemini AI to identify offensive language, harassment, or illegal content'
    },
    'safety.ai3': {
      es: 'Detección proactiva de comportamientos sospechosos y patrones de abuso',
      en: 'Proactive detection of suspicious behaviors and abuse patterns'
    },
    'safety.ai4': {
      es: 'Eliminación automática de contenido que viole nuestras políticas de seguridad',
      en: 'Automatic removal of content that violates our security policies'
    },
    'safety.reporting': {
      es: 'Sistema de Reportes y Respuesta Rápida',
      en: 'Reporting System and Rapid Response'
    },
    'safety.reportingText': {
      es: 'Facilitamos a nuestros usuarios herramientas para mantener la comunidad segura:',
      en: 'We provide our users with tools to keep the community safe:'
    },
    'safety.report1': {
      es: 'Botón de reporte accesible en todos los perfiles y conversaciones',
      en: 'Accessible report button on all profiles and conversations'
    },
    'safety.report2': {
      es: 'Revisión inmediata de reportes por parte de nuestro equipo de seguridad',
      en: 'Immediate review of reports by our security team'
    },
    'safety.report3': {
      es: 'Bloqueo preventivo de usuarios reportados mientras se investiga el caso',
      en: 'Preventive blocking of reported users while the case is investigated'
    },
    'safety.contact': {
      es: 'Información de Contacto para Seguridad',
      en: 'Safety Contact Information'
    },
    'safety.contactText': {
      es: 'Para reportar cualquier problema de seguridad, contenido inapropiado o sospecha de actividad ilegal, contáctanos de inmediato:',
      en: 'To report any security issues, inappropriate content, or suspicion of illegal activity, contact us immediately:'
    },
    'safety.email': {
      es: 'Email de Seguridad',
      en: 'Safety Email'
    },
    'safety.support': {
      es: 'Soporte General',
      en: 'General Support'
    },
    'safety.compliance': {
      es: 'Cumplimiento Legal y Normativo',
      en: 'Legal and Regulatory Compliance'
    },
    'safety.complianceText': {
      es: 'Black Sugar 21 cumple estrictamente con todas las leyes y regulaciones aplicables, incluyendo COPPA (Children\'s Online Privacy Protection Act), GDPR, y normativas locales de cada país. Cooperamos plenamente con las autoridades en la investigación y persecución de cualquier actividad ilegal relacionada con menores.',
      en: 'Black Sugar 21 strictly complies with all applicable laws and regulations, including COPPA (Children\'s Online Privacy Protection Act), GDPR, and local regulations of each country. We fully cooperate with authorities in investigating and prosecuting any illegal activity related to minors.'
    },

    // AI Features Page
    'features.title': {
      es: 'Funciones IA', en: 'AI Features', pt: 'Recursos IA',
      fr: 'Fonctions IA', de: 'KI-Funktionen', ja: 'AI機能',
      zh: 'AI功能', ru: 'Функции ИИ', ar: 'ميزات الذكاء الاصطناعي', id: 'Fitur AI'
    },
    'features.intro': {
      es: 'Black Sugar 21 utiliza inteligencia artificial avanzada para ayudarte a encontrar conexiones auténticas y tener citas más seguras y memorables.',
      en: 'Black Sugar 21 uses advanced artificial intelligence to help you find authentic connections and have safer, more memorable dates.',
      pt: 'Black Sugar 21 usa inteligência artificial avançada para ajudar você a encontrar conexões autênticas e ter encontros mais seguros e memoráveis.',
      fr: 'Black Sugar 21 utilise une intelligence artificielle avancée pour vous aider à trouver des connexions authentiques et vivre des rendez-vous plus sûrs et mémorables.',
      de: 'Black Sugar 21 nutzt fortschrittliche künstliche Intelligenz, um dir zu helfen, echte Verbindungen zu finden und sicherere, unvergessliche Dates zu erleben.',
      ja: 'Black Sugar 21は高度なAIを活用して、本物のつながりを見つけ、より安全で思い出に残るデートをサポートします。',
      zh: 'Black Sugar 21 利用先进的人工智能帮助你找到真实的连接，享受更安全、更难忘的约会。',
      ru: 'Black Sugar 21 использует передовой искусственный интеллект, чтобы помочь вам найти настоящие связи и сделать свидания безопаснее и незабываемее.',
      ar: 'يستخدم Black Sugar 21 الذكاء الاصطناعي المتقدم لمساعدتك في العثور على علاقات حقيقية ومواعيد أكثر أماناً ولا تُنسى.',
      id: 'Black Sugar 21 menggunakan kecerdasan buatan canggih untuk membantu kamu menemukan koneksi autentik dan kencan yang lebih aman dan berkesan.'
    },
    'features.aiPowered': {
      es: 'Potenciado por IA', en: 'AI-Powered', pt: 'Potencializado por IA',
      fr: 'Propulsé par l\'IA', de: 'KI-gestützt', ja: 'AIで強化',
      zh: 'AI驱动', ru: 'На базе ИИ', ar: 'مدعوم بالذكاء الاصطناعي', id: 'Didukung AI'
    },
    'features.aiPoweredText': {
      es: 'Más de 35 funciones de inteligencia artificial trabajan en segundo plano para mejorar tu experiencia, desde sugerencias personalizadas hasta protección en tiempo real.',
      en: 'Over 35 AI features work behind the scenes to enhance your experience, from personalized suggestions to real-time protection.',
      pt: 'Mais de 35 recursos de IA trabalham nos bastidores para melhorar sua experiência, desde sugestões personalizadas até proteção em tempo real.',
      fr: 'Plus de 35 fonctions d\'IA travaillent en coulisses pour améliorer votre expérience, des suggestions personnalisées à la protection en temps réel.',
      de: 'Über 35 KI-Funktionen arbeiten im Hintergrund, um dein Erlebnis zu verbessern – von personalisierten Vorschlägen bis zum Echtzeitschutz.',
      ja: '35以上のAI機能がバックグラウンドで動作し、パーソナライズされた提案からリアルタイム保護まで、あなたの体験を向上させます。',
      zh: '超过35项AI功能在后台运行，从个性化建议到实时保护，全面提升你的体验。',
      ru: 'Более 35 функций ИИ работают в фоновом режиме, улучшая ваш опыт — от персональных рекомендаций до защиты в реальном времени.',
      ar: 'أكثر من 35 ميزة ذكاء اصطناعي تعمل خلف الكواليس لتحسين تجربتك، من الاقتراحات المخصصة إلى الحماية الفورية.',
      id: 'Lebih dari 35 fitur AI bekerja di balik layar untuk meningkatkan pengalamanmu, dari saran personal hingga perlindungan real-time.'
    },
    'features.photoCoach': {
      es: 'Coach de Fotos', en: 'Photo Coach', pt: 'Coach de Fotos',
      fr: 'Coach Photo', de: 'Foto-Coach', ja: 'フォトコーチ',
      zh: '照片教练', ru: 'Фото-коуч', ar: 'مدرب الصور', id: 'Coach Foto'
    },
    'features.photoCoachText': {
      es: 'Nuestra IA analiza tus fotos de perfil y te da recomendaciones personalizadas para mejorar tu atractivo.',
      en: 'Our AI analyzes your profile photos and gives you personalized recommendations to improve your appeal.',
      pt: 'Nossa IA analisa suas fotos de perfil e dá recomendações personalizadas para melhorar seu apelo.',
      fr: 'Notre IA analyse vos photos de profil et vous donne des recommandations personnalisées pour améliorer votre attrait.',
      de: 'Unsere KI analysiert deine Profilfotos und gibt dir personalisierte Empfehlungen, um deine Wirkung zu verbessern.',
      ja: 'AIがプロフィール写真を分析し、魅力を高めるためのパーソナライズされたアドバイスを提供します。',
      zh: '我们的AI会分析你的个人照片，并提供个性化建议来提升你的吸引力。',
      ru: 'Наш ИИ анализирует ваши фото профиля и даёт персональные рекомендации для повышения привлекательности.',
      ar: 'يحلل الذكاء الاصطناعي صور ملفك الشخصي ويقدم توصيات مخصصة لتحسين جاذبيتك.',
      id: 'AI kami menganalisis foto profilmu dan memberikan rekomendasi personal untuk meningkatkan daya tarikmu.'
    },
    'features.photoCoach1': {
      es: 'Puntuación individual de cada foto (1-100)', en: 'Individual score for each photo (1-100)', pt: 'Pontuação individual de cada foto (1-100)',
      fr: 'Score individuel pour chaque photo (1-100)', de: 'Individuelle Bewertung jedes Fotos (1-100)', ja: '各写真の個別スコア（1〜100）',
      zh: '每张照片的独立评分（1-100）', ru: 'Индивидуальная оценка каждого фото (1-100)', ar: 'تقييم فردي لكل صورة (1-100)', id: 'Skor individual setiap foto (1-100)'
    },
    'features.photoCoach2': {
      es: 'Sugerencias de mejora y categorías faltantes', en: 'Improvement suggestions and missing categories', pt: 'Sugestões de melhoria e categorias ausentes',
      fr: 'Suggestions d\'amélioration et catégories manquantes', de: 'Verbesserungsvorschläge und fehlende Kategorien', ja: '改善提案と不足カテゴリの提示',
      zh: '改进建议和缺失类别提示', ru: 'Советы по улучшению и недостающие категории', ar: 'اقتراحات للتحسين والفئات المفقودة', id: 'Saran perbaikan dan kategori yang kurang'
    },
    'features.photoCoach3': {
      es: 'Optimización automática del orden de tus fotos', en: 'Automatic optimization of your photo order', pt: 'Otimização automática da ordem das suas fotos',
      fr: 'Optimisation automatique de l\'ordre de vos photos', de: 'Automatische Optimierung der Fotoreihenfolge', ja: '写真の順番を自動最適化',
      zh: '自动优化照片排列顺序', ru: 'Автоматическая оптимизация порядка фотографий', ar: 'تحسين تلقائي لترتيب صورك', id: 'Optimasi otomatis urutan fotomu'
    },
    'features.safetyCheckIn': {
      es: 'Safety Check-In', en: 'Safety Check-In', pt: 'Safety Check-In',
      fr: 'Contrôle de sécurité', de: 'Sicherheits-Check-In', ja: 'セーフティチェックイン',
      zh: '安全签到', ru: 'Проверка безопасности', ar: 'فحص الأمان', id: 'Safety Check-In'
    },
    'features.safetyCheckInText': {
      es: 'La primera app de citas que cuida tu seguridad durante la cita. Programa un check-in y te enviaremos una notificación para verificar que estés bien.',
      en: 'The first dating app that keeps you safe during the date. Schedule a check-in and we\'ll send you a notification to verify you\'re okay.',
      pt: 'O primeiro app de encontros que cuida da sua segurança durante o encontro. Programe um check-in e enviaremos uma notificação para verificar que você está bem.',
      fr: 'La première appli de rencontres qui veille sur vous pendant le rendez-vous. Programmez un check-in et nous vous enverrons une notification pour vérifier que tout va bien.',
      de: 'Die erste Dating-App, die während des Dates auf deine Sicherheit achtet. Plane einen Check-In und wir senden dir eine Benachrichtigung, um sicherzustellen, dass alles in Ordnung ist.',
      ja: 'デート中の安全を守る、初めてのマッチングアプリ。チェックインを設定すると、安全確認の通知をお送りします。',
      zh: '首个在约会期间守护你安全的交友应用。安排一次签到，我们会发送通知确认你是否平安。',
      ru: 'Первое приложение для знакомств, которое заботится о вашей безопасности во время свидания. Запланируйте проверку, и мы отправим уведомление, чтобы убедиться, что с вами всё в порядке.',
      ar: 'أول تطبيق مواعدة يحرص على سلامتك أثناء الموعد. حدد موعد تسجيل وسوف نرسل لك إشعاراً للتأكد من أنك بخير.',
      id: 'Aplikasi kencan pertama yang menjaga keselamatanmu selama kencan. Jadwalkan check-in dan kami akan mengirim notifikasi untuk memastikan kamu baik-baik saja.'
    },
    'features.safety1': {
      es: 'Programa un check-in antes de tu cita', en: 'Schedule a check-in before your date', pt: 'Programe um check-in antes do seu encontro',
      fr: 'Programmez un check-in avant votre rendez-vous', de: 'Plane einen Check-In vor deinem Date', ja: 'デート前にチェックインを設定',
      zh: '在约会前安排签到', ru: 'Запланируйте проверку перед свиданием', ar: 'حدد موعد تسجيل قبل موعدك', id: 'Jadwalkan check-in sebelum kencanmu'
    },
    'features.safety2': {
      es: 'Recibe notificación con botones "Estoy bien" o "Necesito ayuda"', en: 'Receive notification with "I\'m OK" or "I need help" buttons', pt: 'Receba notificação com botões "Estou bem" ou "Preciso de ajuda"',
      fr: 'Recevez une notification avec les boutons « Tout va bien » ou « J\'ai besoin d\'aide »', de: 'Erhalte eine Benachrichtigung mit den Buttons „Mir geht\'s gut" oder „Ich brauche Hilfe"', ja: '「大丈夫」または「助けが必要」ボタン付きの通知を受信',
      zh: '收到带有"我很好"或"我需要帮助"按钮的通知', ru: 'Получите уведомление с кнопками «Всё хорошо» или «Мне нужна помощь»', ar: 'تلقَّ إشعاراً مع أزرار "أنا بخير" أو "أحتاج مساعدة"', id: 'Terima notifikasi dengan tombol "Saya baik" atau "Saya butuh bantuan"'
    },
    'features.safety3': {
      es: 'Alerta automática a tu contacto de emergencia si no respondes', en: 'Automatic alert to your emergency contact if you don\'t respond', pt: 'Alerta automático para seu contato de emergência se você não responder',
      fr: 'Alerte automatique à votre contact d\'urgence si vous ne répondez pas', de: 'Automatischer Alarm an deinen Notfallkontakt, wenn du nicht antwortest', ja: '応答がない場合、緊急連絡先に自動アラート',
      zh: '如果你未回应，自动向紧急联系人发送警报', ru: 'Автоматическое оповещение экстренного контакта при отсутствии ответа', ar: 'تنبيه تلقائي لجهة اتصال الطوارئ إذا لم تستجب', id: 'Peringatan otomatis ke kontak darurat jika kamu tidak merespons'
    },
    'features.safety4': {
      es: 'Follow-up: "¿Llegaste bien a casa?"', en: 'Follow-up: "Did you get home safe?"', pt: 'Follow-up: "Chegou bem em casa?"',
      fr: 'Suivi : « Êtes-vous bien rentré(e) ? »', de: 'Nachfrage: „Bist du gut nach Hause gekommen?"', ja: 'フォローアップ：「無事に帰れましたか？」',
      zh: '后续跟进："你安全到家了吗？"', ru: 'Проверка: «Вы благополучно добрались домой?»', ar: 'متابعة: "هل وصلت إلى المنزل بأمان؟"', id: 'Tindak lanjut: "Sudah sampai rumah dengan selamat?"'
    },
    'features.dateCoach': {
      es: 'Coach de Citas IA', en: 'AI Date Coach', pt: 'Coach de Encontros IA',
      fr: 'Coach de rendez-vous IA', de: 'KI-Dating-Coach', ja: 'AIデートコーチ',
      zh: 'AI约会教练', ru: 'ИИ-коуч свиданий', ar: 'مدرب المواعيد بالذكاء الاصطناعي', id: 'Coach Kencan AI'
    },
    'features.dateCoachText': {
      es: 'Tu asistente personal de citas con inteligencia artificial. Consejos personalizados, sugerencias de lugares y coaching en tiempo real.',
      en: 'Your personal AI dating assistant. Personalized advice, place suggestions, and real-time coaching.',
      pt: 'Seu assistente pessoal de encontros com IA. Conselhos personalizados, sugestões de lugares e coaching em tempo real.',
      fr: 'Votre assistant personnel de rendez-vous propulsé par l\'IA. Conseils personnalisés, suggestions de lieux et coaching en temps réel.',
      de: 'Dein persönlicher KI-Dating-Assistent. Personalisierte Tipps, Ortsvorschläge und Echtzeit-Coaching.',
      ja: 'AIによるパーソナルデートアシスタント。カスタマイズされたアドバイス、おすすめスポット、リアルタイムコーチング。',
      zh: '你的AI约会私人助理。个性化建议、地点推荐和实时辅导。',
      ru: 'Ваш персональный ИИ-ассистент для свиданий. Индивидуальные советы, рекомендации мест и коучинг в реальном времени.',
      ar: 'مساعدك الشخصي للمواعيد بالذكاء الاصطناعي. نصائح مخصصة، اقتراحات أماكن وتدريب فوري.',
      id: 'Asisten kencan AI pribadimu. Saran personal, rekomendasi tempat, dan coaching real-time.'
    },
    'features.coach1': {
      es: 'Consejos personalizados según tu estilo de comunicación', en: 'Personalized advice based on your communication style', pt: 'Conselhos personalizados com base no seu estilo de comunicação',
      fr: 'Conseils personnalisés selon votre style de communication', de: 'Personalisierte Tipps basierend auf deinem Kommunikationsstil', ja: 'あなたのコミュニケーションスタイルに合わせたアドバイス',
      zh: '根据你的沟通风格提供个性化建议', ru: 'Персональные советы на основе вашего стиля общения', ar: 'نصائح مخصصة بناءً على أسلوب تواصلك', id: 'Saran personal berdasarkan gaya komunikasimu'
    },
    'features.coach2': {
      es: 'Sugerencias de lugares reales cerca de ti', en: 'Real place suggestions near you', pt: 'Sugestões de lugares reais perto de você',
      fr: 'Suggestions de lieux réels près de chez vous', de: 'Echte Ortsvorschläge in deiner Nähe', ja: '近くの実際のスポットを提案',
      zh: '推荐你附近的真实地点', ru: 'Рекомендации реальных мест рядом с вами', ar: 'اقتراحات أماكن حقيقية بالقرب منك', id: 'Rekomendasi tempat nyata di dekatmu'
    },
    'features.coach3': {
      es: 'Análisis de química en tiempo real durante el chat', en: 'Real-time chemistry analysis during chat', pt: 'Análise de química em tempo real durante o chat',
      fr: 'Analyse de l\'alchimie en temps réel pendant le chat', de: 'Echtzeit-Chemieanalyse während des Chats', ja: 'チャット中のリアルタイム相性分析',
      zh: '聊天中实时分析你们的化学反应', ru: 'Анализ химии в реальном времени во время чата', ar: 'تحليل التوافق في الوقت الفعلي أثناء المحادثة', id: 'Analisis kecocokan real-time selama chat'
    },
    'features.dateBlueprint': {
      es: 'Plan de Cita IA', en: 'AI Date Blueprint', pt: 'Plano de Encontro IA',
      fr: 'Plan de rendez-vous IA', de: 'KI-Date-Plan', ja: 'AIデートプラン',
      zh: 'AI约会蓝图', ru: 'ИИ-план свидания', ar: 'مخطط الموعد بالذكاء الاصطناعي', id: 'Rencana Kencan AI'
    },
    'features.dateBlueprintText': {
      es: 'Genera itinerarios completos para tu cita con lugares reales, horarios y presupuesto estimado.',
      en: 'Generate complete date itineraries with real places, schedules, and estimated budget.',
      pt: 'Gere roteiros completos para seu encontro com lugares reais, horários e orçamento estimado.',
      fr: 'Générez des itinéraires complets pour votre rendez-vous avec des lieux réels, des horaires et un budget estimé.',
      de: 'Erstelle komplette Date-Routen mit echten Orten, Zeiten und geschätztem Budget.',
      ja: '実際の場所、スケジュール、予算付きの完全なデートプランを生成。',
      zh: '生成包含真实地点、时间安排和预算的完整约会行程。',
      ru: 'Создавайте полные маршруты для свиданий с реальными местами, расписанием и примерным бюджетом.',
      ar: 'أنشئ مسارات كاملة لموعدك مع أماكن حقيقية وجداول زمنية وميزانية تقديرية.',
      id: 'Buat rencana kencan lengkap dengan tempat nyata, jadwal, dan estimasi anggaran.'
    },
    'features.blueprint1': {
      es: 'Itinerarios con 3-5 paradas y horarios', en: 'Itineraries with 3-5 stops and schedules', pt: 'Roteiros com 3-5 paradas e horários',
      fr: 'Itinéraires avec 3 à 5 étapes et horaires', de: 'Routen mit 3-5 Stationen und Zeitplan', ja: '3〜5か所の立ち寄りスポットとスケジュール',
      zh: '包含3-5个站点和时间表的行程', ru: 'Маршруты с 3-5 остановками и расписанием', ar: 'مسارات تتضمن 3-5 محطات وجداول زمنية', id: 'Rencana perjalanan dengan 3-5 pemberhentian dan jadwal'
    },
    'features.blueprint2': {
      es: 'Fotos reales de Google Places', en: 'Real photos from Google Places', pt: 'Fotos reais do Google Places',
      fr: 'Photos réelles de Google Places', de: 'Echte Fotos von Google Places', ja: 'Google Placesの実写真',
      zh: '来自Google Places的真实照片', ru: 'Реальные фото из Google Карт', ar: 'صور حقيقية من Google Places', id: 'Foto asli dari Google Places'
    },
    'features.blueprint3': {
      es: 'Comparte el plan directamente en el chat', en: 'Share the plan directly in chat', pt: 'Compartilhe o plano diretamente no chat',
      fr: 'Partagez le plan directement dans le chat', de: 'Teile den Plan direkt im Chat', ja: 'チャットでプランを直接共有',
      zh: '在聊天中直接分享计划', ru: 'Делитесь планом прямо в чате', ar: 'شارك الخطة مباشرة في المحادثة', id: 'Bagikan rencana langsung di chat'
    },
    'features.smartReply': {
      es: 'Respuesta Inteligente', en: 'Smart Reply', pt: 'Resposta Inteligente',
      fr: 'Réponse intelligente', de: 'Intelligente Antwort', ja: 'スマートリプライ',
      zh: '智能回复', ru: 'Умный ответ', ar: 'الرد الذكي', id: 'Balasan Cerdas'
    },
    'features.smartReplyText': {
      es: 'Tres sugerencias de respuesta con diferentes tonos: casual, coqueto y profundo. La IA aprende tu estilo de comunicación.',
      en: 'Three response suggestions with different tones: casual, flirty, and deep. AI learns your communication style.',
      pt: 'Três sugestões de resposta com diferentes tons: casual, paquera e profundo. A IA aprende seu estilo de comunicação.',
      fr: 'Trois suggestions de réponse avec différents tons : décontracté, charmeur et profond. L\'IA apprend votre style de communication.',
      de: 'Drei Antwortvorschläge in verschiedenen Tonarten: locker, flirtend und tiefgründig. Die KI lernt deinen Kommunikationsstil.',
      ja: 'カジュアル、フリーティー、ディープの3つのトーンで返信を提案。AIがあなたのコミュニケーションスタイルを学習。',
      zh: '提供三种不同语气的回复建议：随意、调情和深入。AI会学习你的沟通风格。',
      ru: 'Три варианта ответа в разных тонах: непринуждённый, флиртующий и глубокий. ИИ изучает ваш стиль общения.',
      ar: 'ثلاثة اقتراحات للرد بنبرات مختلفة: عفوية، مغازلة، وعميقة. يتعلم الذكاء الاصطناعي أسلوب تواصلك.',
      id: 'Tiga saran balasan dengan nada berbeda: santai, menggoda, dan mendalam. AI mempelajari gaya komunikasimu.'
    },
    'features.wingPerson': {
      es: 'Wing-Person IA', en: 'AI Wing-Person', pt: 'Wing-Person IA',
      fr: 'Wing-Person IA', de: 'KI-Wing-Person', ja: 'AIウィングパーソン',
      zh: 'AI僚机', ru: 'ИИ-помощник', ar: 'المساعد الذكي', id: 'Wing-Person AI'
    },
    'features.wingPersonText': {
      es: 'Notificaciones proactivas que te ayudan a mantener vivas tus conversaciones. Como tener un amigo que te da un empujoncito.',
      en: 'Proactive notifications that help you keep your conversations alive. Like having a friend who gives you a nudge.',
      pt: 'Notificações proativas que ajudam a manter suas conversas ativas. Como ter um amigo que te dá um empurrãozinho.',
      fr: 'Des notifications proactives pour maintenir vos conversations vivantes. Comme avoir un ami qui vous donne un petit coup de pouce.',
      de: 'Proaktive Benachrichtigungen, die dir helfen, deine Gespräche am Laufen zu halten. Wie ein Freund, der dir einen kleinen Schubs gibt.',
      ja: '会話を途切れさせないプロアクティブ通知。そっと背中を押してくれる友達のような存在。',
      zh: '主动通知帮助你保持对话活跃，就像有个朋友在旁边轻轻推你一把。',
      ru: 'Проактивные уведомления помогают поддерживать живой диалог. Как друг, который подталкивает вас в нужный момент.',
      ar: 'إشعارات استباقية تساعدك على إبقاء محادثاتك نشطة. كأن لديك صديق يدفعك بلطف.',
      id: 'Notifikasi proaktif yang membantumu menjaga percakapan tetap hidup. Seperti punya teman yang memberi dorongan.'
    },
    'features.chemistry': {
      es: 'Puntuación de Química', en: 'Chemistry Score', pt: 'Pontuação de Química',
      fr: 'Score de compatibilité', de: 'Chemie-Score', ja: '相性スコア',
      zh: '化学反应评分', ru: 'Оценка совместимости', ar: 'مؤشر التوافق', id: 'Skor Kecocokan'
    },
    'features.chemistryText': {
      es: 'Algoritmo de 6 factores enriquecido con IA que calcula tu compatibilidad real. Más preciso que un simple swipe.',
      en: '6-factor algorithm enriched with AI that calculates your real compatibility. More accurate than a simple swipe.',
      pt: 'Algoritmo de 6 fatores enriquecido com IA que calcula sua compatibilidade real. Mais preciso que um simples swipe.',
      fr: 'Algorithme à 6 facteurs enrichi par l\'IA qui calcule votre compatibilité réelle. Plus précis qu\'un simple swipe.',
      de: '6-Faktoren-Algorithmus mit KI, der deine echte Kompatibilität berechnet. Genauer als ein einfacher Swipe.',
      ja: 'AIで強化された6要素アルゴリズムが本当の相性を算出。単なるスワイプよりも正確。',
      zh: 'AI增强的六因素算法计算你们的真实兼容度，比简单的滑动更精准。',
      ru: 'Алгоритм из 6 факторов, усиленный ИИ, рассчитывает вашу реальную совместимость. Точнее, чем простой свайп.',
      ar: 'خوارزمية من 6 عوامل معززة بالذكاء الاصطناعي تحسب توافقك الحقيقي. أدق من مجرد سحب بسيط.',
      id: 'Algoritma 6 faktor yang diperkaya AI menghitung kecocokan nyatamu. Lebih akurat dari sekadar swipe.'
    },

    // Footer
    'footer.tagline': {
      es: 'Descubre conexiones genuinas con orientación potenciada por IA • Solo mayores de 18 años',
      en: 'Discover genuine connections with AI-powered guidance • 18+ only',
      pt: 'Descubra conexões genuínas com orientação impulsionada por IA • Apenas maiores de 18 anos',
      fr: 'Découvrez des connexions authentiques avec un accompagnement par IA • Réservé aux +18 ans',
      de: 'Entdecke echte Verbindungen mit KI-gestützter Begleitung • Nur ab 18 Jahren',
      ja: 'AIガイダンスで本物のつながりを発見 • 18歳以上限定',
      zh: '通过AI引导发现真实的连接 • 仅限18岁以上',
      ru: 'Находите настоящие связи с помощью ИИ • Только 18+',
      ar: 'اكتشف علاقات حقيقية بتوجيه الذكاء الاصطناعي • للبالغين فقط 18+',
      id: 'Temukan koneksi autentik dengan panduan AI • Khusus 18+'
    },
    'footer.home': {
      es: 'Inicio', en: 'Home',
      fr: 'Accueil', de: 'Startseite', ja: 'ホーム',
      zh: '首页', ru: 'Главная', ar: 'الرئيسية', id: 'Beranda'
    },
    'footer.terms': {
      es: 'Términos', en: 'Terms',
      fr: 'Conditions', de: 'Nutzungsbedingungen', ja: '利用規約',
      zh: '条款', ru: 'Условия', ar: 'الشروط', id: 'Ketentuan'
    },
    'footer.privacy': {
      es: 'Privacidad', en: 'Privacy',
      fr: 'Confidentialité', de: 'Datenschutz', ja: 'プライバシー',
      zh: '隐私', ru: 'Конфиденциальность', ar: 'الخصوصية', id: 'Privasi'
    },
    'footer.support': {
      es: 'Soporte', en: 'Support',
      fr: 'Assistance', de: 'Support', ja: 'サポート',
      zh: '支持', ru: 'Поддержка', ar: 'الدعم', id: 'Dukungan'
    },
    'footer.contact': {
      es: 'Contacto', en: 'Contact',
      fr: 'Contact', de: 'Kontakt', ja: 'お問い合わせ',
      zh: '联系我们', ru: 'Контакты', ar: 'اتصل بنا', id: 'Kontak'
    },
    'footer.copyright': {
      es: `© ${this.currentYear} Black Sugar 21. Todos los derechos reservados.`,
      en: `© ${this.currentYear} Black Sugar 21. All rights reserved.`,
      fr: `© ${this.currentYear} Black Sugar 21. Tous droits réservés.`,
      de: `© ${this.currentYear} Black Sugar 21. Alle Rechte vorbehalten.`,
      ja: `© ${this.currentYear} Black Sugar 21. 全著作権所有。`,
      zh: `© ${this.currentYear} Black Sugar 21. 保留所有权利。`,
      ru: `© ${this.currentYear} Black Sugar 21. Все права защищены.`,
      ar: `© ${this.currentYear} Black Sugar 21. جميع الحقوق محفوظة.`,
      id: `© ${this.currentYear} Black Sugar 21. Hak cipta dilindungi.`
    },
    'footer.moderation': {
      es: 'Moderación', en: 'Moderation',
      fr: 'Modération', de: 'Moderation', ja: 'モデレーション',
      zh: '内容审核', ru: 'Модерация', ar: 'الإشراف', id: 'Moderasi'
    },

    // Moderation Policy
    'moderation.title': {
      es: 'Políticas de Moderación y Comunidad',
      en: 'Moderation and Community Policies'
    },
    'moderation.subtitle': {
      es: 'Garantizando un ambiente seguro y respetuoso para todos',
      en: 'Ensuring a safe and respectful environment for everyone'
    },
    'moderation.intro.title': {
      es: 'Nuestro Compromiso con la Seguridad',
      en: 'Our Commitment to Safety'
    },
    'moderation.intro.text': {
      es: 'En Black Sugar 21, la seguridad y el respeto son fundamentales. Hemos implementado un sistema avanzado de moderación con inteligencia artificial que funciona 24/7 para mantener nuestra comunidad segura, respetuosa y acogedora para todos los usuarios.',
      en: 'At Black Sugar 21, safety and respect are fundamental. We have implemented an advanced AI-powered moderation system that works 24/7 to keep our community safe, respectful, and welcoming for all users.'
    },
    'moderation.ai.title': {
      es: 'Detección Automática con Inteligencia Artificial',
      en: 'Automatic Detection with Artificial Intelligence'
    },
    'moderation.ai.text1': {
      es: 'Nuestro sistema utiliza Google Gemini AI para analizar todos los mensajes en tiempo real, detectando automáticamente:',
      en: 'Our system uses Google Gemini AI to analyze all messages in real-time, automatically detecting:'
    },
    'moderation.ai.detection1': {
      es: '🚫 Contenido ofensivo, insultos o lenguaje vulgar',
      en: '🚫 Offensive content, insults, or vulgar language'
    },
    'moderation.ai.detection2': {
      es: '🚨 Acoso, intimidación o amenazas',
      en: '🚨 Harassment, bullying, or threats'
    },
    'moderation.ai.detection3': {
      es: '💬 Spam o mensajes repetitivos',
      en: '💬 Spam or repetitive messages'
    },
    'moderation.ai.detection4': {
      es: '⚠️ Comportamiento inadecuado o solicitudes inapropiadas',
      en: '⚠️ Inappropriate behavior or requests'
    },
    'moderation.ai.detection5': {
      es: '🔞 Contenido sexual explícito no consensuado',
      en: '🔞 Non-consensual explicit sexual content'
    },
    'moderation.ai.privacy': {
      es: '🔒 Tu privacidad está protegida: El análisis es automático, privado y no es revisado por humanos a menos que se reporte un incidente.',
      en: '🔒 Your privacy is protected: Analysis is automatic, private, and not reviewed by humans unless an incident is reported.'
    },
    'moderation.penalty.title': {
      es: 'Sistema de Penalización Progresiva',
      en: 'Progressive Penalty System'
    },
    'moderation.penalty.text': {
      es: 'Cada vez que se detecta contenido ofensivo, se asigna una puntuación al usuario basada en la gravedad:',
      en: 'Each time offensive content is detected, a score is assigned to the user based on severity:'
    },
    'moderation.penalty.level1.title': {
      es: 'Nivel Bajo (+1 punto)',
      en: 'Low Level (+1 point)'
    },
    'moderation.penalty.level1.desc': {
      es: 'Lenguaje levemente inapropiado o comentarios desconsiderados',
      en: 'Slightly inappropriate language or inconsiderate comments'
    },
    'moderation.penalty.level1.impact': {
      es: 'Impacto: Advertencia automática, mínima reducción de visibilidad',
      en: 'Impact: Automatic warning, minimal visibility reduction'
    },
    'moderation.penalty.level2.title': {
      es: 'Nivel Medio (+3 puntos)',
      en: 'Medium Level (+3 points)'
    },
    'moderation.penalty.level2.desc': {
      es: 'Insultos directos, acoso verbal o spam persistente',
      en: 'Direct insults, verbal harassment, or persistent spam'
    },
    'moderation.penalty.level2.impact': {
      es: 'Impacto: Reducción notable de visibilidad en la plataforma',
      en: 'Impact: Noticeable visibility reduction on the platform'
    },
    'moderation.penalty.level3.title': {
      es: 'Nivel Alto (+5 puntos)',
      en: 'High Level (+5 points)'
    },
    'moderation.penalty.level3.desc': {
      es: 'Amenazas, acoso grave, contenido extremadamente ofensivo',
      en: 'Threats, severe harassment, extremely offensive content'
    },
    'moderation.penalty.level3.impact': {
      es: 'Impacto: Reducción severa de visibilidad, posible suspensión temporal',
      en: 'Impact: Severe visibility reduction, possible temporary suspension'
    },
    'moderation.penalty.recovery': {
      es: '💡 Consejo: Tu puntuación se reduce automáticamente un 20% cada 30 días de buen comportamiento.',
      en: '💡 Tip: Your score automatically decreases by 20% every 30 days of good behavior.'
    },
    'moderation.visibility.title': {
      es: 'Cómo Afecta la Visibilidad',
      en: 'How Visibility is Affected'
    },
    'moderation.visibility.text': {
      es: 'Los usuarios con historial de comportamiento ofensivo experimentan una reducción probabilística en su visibilidad:',
      en: 'Users with a history of offensive behavior experience a probabilistic reduction in their visibility:'
    },
    'moderation.visibility.effect1': {
      es: '📉 Aparecen con menor frecuencia en las recomendaciones de otros usuarios',
      en: '📉 Appear less frequently in other users\' recommendations'
    },
    'moderation.visibility.effect2': {
      es: '🎯 El sistema prioriza perfiles con buen comportamiento',
      en: '🎯 The system prioritizes profiles with good behavior'
    },
    'moderation.visibility.effect3': {
      es: '⏳ La penalización puede alcanzar hasta 95% de reducción en casos graves',
      en: '⏳ The penalty can reach up to 95% visibility reduction in severe cases'
    },
    'moderation.visibility.fairness': {
      es: '✨ Sistema justo: Las penalizaciones son temporales y se recuperan con buen comportamiento.',
      en: '✨ Fair system: Penalties are temporary and recover with good behavior.'
    },
    'moderation.decay.title': {
      es: 'Sistema de Recuperación Automática',
      en: 'Automatic Recovery System'
    },
    'moderation.decay.text': {
      es: 'Creemos en las segundas oportunidades. Nuestro sistema automáticamente reduce las penalizaciones:',
      en: 'We believe in second chances. Our system automatically reduces penalties:'
    },
    'moderation.decay.rate': {
      es: '📅 Cada 30 días, tu puntuación de ofensas se reduce en un 20%',
      en: '📅 Every 30 days, your offense score is reduced by 20%'
    },
    'moderation.decay.automatic': {
      es: '🔄 El proceso es completamente automático, no requiere solicitud',
      en: '🔄 The process is completely automatic, no request needed'
    },
    'moderation.decay.encourage': {
      es: '🌟 Fomentamos el cambio positivo y el comportamiento respetuoso',
      en: '🌟 We encourage positive change and respectful behavior'
    },
    'moderation.community.title': {
      es: 'Normas de la Comunidad',
      en: 'Community Guidelines'
    },
    'moderation.community.rule1': {
      es: '✅ Trata a todos con respeto y cortesía, como te gustaría ser tratado',
      en: '✅ Treat everyone with respect and courtesy, as you would like to be treated'
    },
    'moderation.community.rule2': {
      es: '✅ Mantén conversaciones apropiadas y consensuadas',
      en: '✅ Keep conversations appropriate and consensual'
    },
    'moderation.community.rule3': {
      es: '✅ Respeta los límites y preferencias de otros usuarios',
      en: '✅ Respect the boundaries and preferences of other users'
    },
    'moderation.community.rule4': {
      es: '✅ Reporta cualquier comportamiento inapropiado que observes',
      en: '✅ Report any inappropriate behavior you observe'
    },
    'moderation.community.rule5': {
      es: '✅ Sé auténtico y honesto en tu perfil e interacciones',
      en: '✅ Be authentic and honest in your profile and interactions'
    },
    'moderation.report.title': {
      es: 'Sistema de Reportes',
      en: 'Report System'
    },
    'moderation.report.text': {
      es: 'Si experimentas o presencias comportamiento inapropiado, puedes reportarlo fácilmente:',
      en: 'If you experience or witness inappropriate behavior, you can easily report it:'
    },
    'moderation.report.option1': {
      es: '📱 Desde cualquier conversación, toca el menú (⋮) y selecciona "Reportar Usuario"',
      en: '📱 From any conversation, tap the menu (⋮) and select "Report User"'
    },
    'moderation.report.option2': {
      es: '🎯 Selecciona la razón específica: Contenido inapropiado, spam, acoso, perfil falso u ofensivo',
      en: '🎯 Select the specific reason: Inappropriate content, spam, harassment, fake profile, or offensive'
    },
    'moderation.report.option3': {
      es: '⚡ El reporte se procesa inmediatamente y de forma confidencial',
      en: '⚡ The report is processed immediately and confidentially'
    },
    'moderation.report.option4': {
      es: '🛡️ Puedes bloquear al usuario para evitar futuras interacciones',
      en: '🛡️ You can block the user to prevent future interactions'
    },
    'moderation.report.option5': {
      es: '👥 Nuestro equipo revisa todos los reportes y toma acciones apropiadas',
      en: '👥 Our team reviews all reports and takes appropriate action'
    },
    'moderation.report.confidential': {
      es: '🔐 Todos los reportes son confidenciales y el usuario reportado no sabrá quién lo reportó.',
      en: '🔐 All reports are confidential and the reported user will not know who reported them.'
    },
    'moderation.privacy.title': {
      es: 'Privacidad y Protección de Datos',
      en: 'Privacy and Data Protection'
    },
    'moderation.privacy.text1': {
      es: 'Tu privacidad es fundamental en nuestro sistema de moderación:',
      en: 'Your privacy is fundamental in our moderation system:'
    },
    'moderation.privacy.point1': {
      es: '🔒 Los mensajes se analizan de forma automática y privada por IA',
      en: '🔒 Messages are analyzed automatically and privately by AI'
    },
    'moderation.privacy.point2': {
      es: '👤 No hay revisión humana a menos que se reporte un incidente',
      en: '👤 No human review unless an incident is reported'
    },
    'moderation.privacy.point3': {
      es: '🗑️ Los datos de moderación se eliminan según nuestra política de retención',
      en: '🗑️ Moderation data is deleted according to our retention policy'
    },
    'moderation.privacy.point4': {
      es: '🛡️ Cumplimos con todas las regulaciones de privacidad y protección de datos',
      en: '🛡️ We comply with all privacy and data protection regulations'
    },
    'moderation.commitment.title': {
      es: 'Nuestro Compromiso Contigo',
      en: 'Our Commitment to You'
    },
    'moderation.commitment.text': {
      es: 'En Black Sugar 21, estamos comprometidos a proporcionar una plataforma segura, respetuosa y acogedora donde todos puedan conectar con confianza. Nuestro sistema de moderación trabaja continuamente para proteger a nuestra comunidad mientras respeta tu privacidad.',
      en: 'At Black Sugar 21, we are committed to providing a safe, respectful, and welcoming platform where everyone can connect with confidence. Our moderation system works continuously to protect our community while respecting your privacy.'
    },
    'moderation.commitment.button': {
      es: 'Volver al Inicio',
      en: 'Back to Home'
    },
    'moderation.footer.updated': {
      es: `Última actualización: ${this.currentMonth}`,
      en: `Last updated: ${this.currentMonthEn}`
    },

    // Tester Signup Modal
    'tester.title': {
      es: 'Únete a la prueba exclusiva',
      en: 'Join the exclusive beta',
      pt: 'Junte-se ao beta exclusivo',
    },
    'tester.subtitle': {
      es: 'Ingresa tu correo de Google para acceder a la versión beta de Black Sugar 21 en Android',
      en: 'Enter your Google email to access the Black Sugar 21 beta on Android',
      pt: 'Digite seu email do Google para acessar o beta do Black Sugar 21 no Android',
    },
    'tester.placeholder': {
      es: 'tu.correo@gmail.com',
      en: 'your.email@gmail.com',
      pt: 'seu.email@gmail.com',
    },
    'tester.button': {
      es: 'Solicitar acceso',
      en: 'Request access',
      pt: 'Solicitar acesso',
    },
    'tester.success': {
      es: '¡Acceso concedido! En unos minutos podrás instalar la app desde Google Play. Revisa tu correo.',
      en: 'Access granted! In a few minutes you can install the app from Google Play. Check your email.',
      pt: 'Acesso concedido! Em alguns minutos você poderá instalar o app no Google Play. Verifique seu email.',
    },
    'tester.error': {
      es: 'Ingresa un correo válido de Google',
      en: 'Enter a valid Google email',
      pt: 'Digite um email válido do Google',
    },
    'tester.footer': {
      es: 'Tu correo solo se usa para darte acceso a la prueba',
      en: 'Your email is only used to grant beta access',
      pt: 'Seu email é usado apenas para dar acesso ao beta',
    }
  };

  constructor() {
    this.detectBrowserLanguage();
  }

  private detectBrowserLanguage(): void {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      // Check if user has previously selected a language
      const savedLang = localStorage.getItem('preferredLanguage') as Language;
      if (savedLang) {
        this.currentLanguage.set(savedLang);
        return;
      }

      // Detect browser language
      const browserLang = navigator.language?.substring(0, 2) || 'en';
      const supported: Language[] = ['es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'ru', 'ar', 'id'];
      this.currentLanguage.set(supported.includes(browserLang as Language) ? browserLang as Language : 'en');
    }
  }

  translate(key: string, params?: Record<string, string | number>): string {
    const entry = this.translations[key];
    if (!entry) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    const lang = this.currentLanguage();
    let result = entry[lang] || entry['en'] || entry['es'] || key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      }
    }
    return result;
  }

  /**
   * @deprecated Use translate() instead for parameterized translations
   */
  t(key: string): string {
    return this.translate(key);
  }

  setLanguage(lang: Language): void {
    this.currentLanguage.set(lang);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('preferredLanguage', lang);
    }
  }

  toggleLanguage(): void {
    const newLang: Language = this.currentLanguage() === 'es' ? 'en' : 'es';
    this.setLanguage(newLang);
  }
}
