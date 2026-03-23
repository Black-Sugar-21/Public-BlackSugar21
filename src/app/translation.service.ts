import { Injectable, signal } from '@angular/core';

export type Language = 'es' | 'en';

interface Translations {
  [key: string]: {
    es: string;
    en: string;
    pt?: string;
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
      es: 'Términos de Uso',
      en: 'Terms of Use'
    },
    'nav.privacy': {
      es: 'Políticas de Privacidad',
      en: 'Privacy Policy'
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

    // Footer
    'footer.tagline': {
      es: 'Descubre conexiones genuinas con orientación potenciada por IA • Solo mayores de 18 años',
      en: 'Discover genuine connections with AI-powered guidance • 18+ only',
      pt: 'Descubra conexões genuínas com orientação impulsionada por IA • Apenas maiores de 18 anos'
    },
    'footer.home': {
      es: 'Inicio',
      en: 'Home'
    },
    'footer.terms': {
      es: 'Términos',
      en: 'Terms'
    },
    'footer.privacy': {
      es: 'Privacidad',
      en: 'Privacy'
    },
    'footer.support': {
      es: 'Soporte',
      en: 'Support'
    },
    'footer.contact': {
      es: 'Contacto',
      en: 'Contact'
    },
    'footer.copyright': {
      es: `© ${this.currentYear} Black Sugar 21. Todos los derechos reservados.`,
      en: `© ${this.currentYear} Black Sugar 21. All rights reserved.`
    },
    'footer.moderation': {
      es: 'Moderación',
      en: 'Moderation'
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
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith('es')) {
        this.currentLanguage.set('es');
      } else {
        this.currentLanguage.set('en');
      }
    }
  }

  translate(key: string, params?: Record<string, string | number>): string {
    const translation = this.translations[key];
    if (!translation) {
      console.warn(`Translation missing for key: ${key}`);
      return key;
    }
    let result = translation[this.currentLanguage()];
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
