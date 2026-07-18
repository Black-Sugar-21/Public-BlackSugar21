import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO guide. Queries: "cómo pasar del chat a la cita" / "cómo proponer quedar apps de citas".
const GUIDE_STYLES = `
  .guide { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; color: #EDEDF2; line-height: 1.7; }
  .back { color: #9c59ea; font-size: 14px; display: inline-block; margin-bottom: 8px; }
  .updated { font-size: 12px; color: #8A8A99; margin: 0 0 20px; }
  h1 { font-size: 34px; line-height: 1.2; margin: 0 0 16px; }
  h2 { font-size: 23px; margin: 34px 0 12px; }
  h3 { font-size: 17px; margin: 20px 0 6px; }
  .lead { font-size: 18px; color: #C9C9D4; margin-bottom: 28px; }
  ul, ol { padding-left: 22px; } li { margin: 8px 0; }
  strong { color: #fff; }
  .cta { display: flex; gap: 12px; flex-wrap: wrap; margin: 28px 0; }
  .btn-primary { background: linear-gradient(135deg,#D4AF37,#B8860B); color:#1A1206; padding:12px 20px; border-radius:12px; font-weight:700; }
  .btn-ghost { border:1px solid rgba(255,255,255,0.2); color:#EDEDF2; padding:12px 20px; border-radius:12px; }
  .faq { margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 24px; }
  .faq-item { margin-bottom: 20px; }
  .note { margin-top: 40px; font-size: 14px; color:#8A8A99; }
  a { text-decoration: none; color: inherit; }
  .note a { color: #9c59ea; }
  @media (max-width:600px){ h1{font-size:27px;} .guide{padding:32px 16px 64px;} }
`;

@Component({
  selector: 'app-guia-chat-a-cita',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <p class="updated">Actualizado: julio 2026</p>
    <h1>Cómo pasar del chat a la cita (sin que suene forzado)</h1>
    <p class="lead">El mayor error en apps de citas no es el primer mensaje — es quedarse atrapado/a
    en el chat para siempre. La investigación de Aron (1997) muestra que la conexión real se construye
    en persona. Aquí tienes cuándo y cómo proponer quedar.</p>

    <h2>¿Cuántos mensajes antes de proponer?</h2>
    <p>No hay un número mágico, pero hay señales que indican que el momento es el correcto:</p>
    <ul>
      <li>Han tenido <strong>al menos 2-3 intercambios de ida y vuelta</strong> con respuestas reales
      (no monosílabos)</li>
      <li>La otra persona ha compartido algo personal o ha hecho preguntas sobre ti</li>
      <li>Hay humor o ligereza — la conversación no se siente forzada</li>
      <li>No han pasado más de 10 días desde el match sin proponer quedar</li>
    </ul>
    <p>Proponer demasiado pronto (en los primeros 2 mensajes) puede sentirse apresurado. Esperar más
    de 3 semanas hace que la propuesta resulte extraña porque la "conexión" del chat se vuelve una
    burbuja de papel sin base real.</p>

    <h2>Cómo proponer: frases que funcionan</h2>
    <p>La clave es ser directo/a pero dar opciones. Evita preguntas abiertas como "¿quedamos algún día?"
    — son fáciles de responder con evasión. En cambio:</p>
    <ul>
      <li><strong>Con contexto de la conversación:</strong> "Oye, hablando de que a los dos nos gusta el
      café de especialidad — ¿te animarías a ir a ese lugar del que te hablé el martes?"</li>
      <li><strong>Propuesta concreta con opciones:</strong> "Me gustaría conocerte en persona. ¿Tienes
      tiempo el jueves o el sábado para tomar algo?"</li>
      <li><strong>Ligera y sin presión:</strong> "Creo que sería más divertido charlar en persona que
      por aquí — ¿qué te parece?"</li>
    </ul>

    <h2>Si dice que no puede (o no da fecha)</h2>
    <p>Una respuesta vaga como "sí, a ver cuándo" puede ser genuina (está ocupada/o) o una forma
    educada de no querer. La prueba es simple: si no propone una alternativa, no está interesado/a.
    No insistas más de una vez. Sigue con otras conversaciones.</p>

    <h2>Cómo elegir el lugar</h2>
    <p>La primera cita debe ser corta (1-1.5 horas máximo), en un lugar público y con posibilidad de
    conversación. Evita el cine (no puedes hablar), conciertos en vivo (muy ruidosos) o lugares que
    requieren demasiada planificación. Café, cervecería tranquila, plaza o paseo funcionan mejor.</p>
    <p><strong>Black Sugar 21</strong> sugiere lugares reales cerca del punto medio entre los dos —
    cafeterías, restaurantes y sitios de ocio con valoraciones y horarios actualizados.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Obtener sugerencias de lugares →</a>
      <a routerLink="/guia/primera-cita" class="btn-ghost">Guía: qué hacer en la primera cita</a>
    </div>

    <h2>Confirmar y evitar la cancelación</h2>
    <p>El día anterior, envía un mensaje breve para confirmar: "¿Seguimos con el plan de mañana a las
    7?" Es cortés y reduce las probabilidades de que cancele sin avisar. No preguntes "¿estás seguro/a?"
    — asume que sí.</p>

    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      <div class="faq-item">
        <h3>¿Quién debe proponer quedar primero?</h3>
        <p>Quien tenga interés. No hay regla de género. Proponer demuestra seguridad, lo cual es
        atractivo independientemente del género.</p>
      </div>
      <div class="faq-item">
        <h3>¿Qué pasa si propongo y no responde?</h3>
        <p>Espera 48 horas. Si no hay respuesta, puedes enviar un único recordatorio casual. Si sigue
        sin responder, considera ese match cerrado.</p>
      </div>
      <div class="faq-item">
        <h3>¿Cuánto tiempo de anticipación dar para proponer una cita?</h3>
        <p>Entre 3 y 7 días. Menos de 2 días puede sonar impulsivo (a menos que lleven mucho tiempo
        hablando). Más de 10 días crea incertidumbre y aumenta las probabilidades de cancelación.</p>
      </div>
      <div class="faq-item">
        <h3>¿Está bien proponer una cita virtual primero?</h3>
        <p>Sí, especialmente si viven lejos o hay incertidumbre. Una videollamada de 20 minutos es
        mucho mejor que 3 semanas de chat: confirma compatibilidad real mucho más rápido.</p>
      </div>
    </section>
    <p class="note"><a routerLink="/guia/como-empezar-conversacion">Cómo empezar una conversación</a> ·
    <a routerLink="/guia/primera-cita">Consejos primera cita</a> ·
    <a routerLink="/">Black Sugar 21</a> — coach de citas con IA, gratis.</p>
  </article>
  `,
  styles: [GUIDE_STYLES],
})
export class ChatACitaGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Cómo pasar del chat a la cita (sin que suene forzado) · Black Sugar 21',
      description: 'Cuándo y cómo proponer quedar en apps de citas. Frases exactas, señales del momento correcto y cómo elegir el lugar ideal para una primera cita.',
      url: '/guia/como-pasar-chat-a-cita',
    });
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Cómo pasar del chat a la cita en apps de citas',
      description: 'Guía paso a paso para proponer quedar en apps de citas de forma natural y efectiva.',
      datePublished: '2026-07-17',
      url: 'https://www.blacksugar21.com/guia/como-pasar-chat-a-cita',
      author: { '@type': 'Organization', name: 'Black Sugar 21' },
      step: [
        { '@type': 'HowToStep', name: 'Espera las señales correctas', text: 'Al menos 2-3 intercambios reales, humor y preguntas mutuas.' },
        { '@type': 'HowToStep', name: 'Propón con contexto y opciones', text: 'Usa algo de la conversación y da dos posibles días.' },
        { '@type': 'HowToStep', name: 'Elige el lugar correcto', text: 'Café, bar tranquilo o plaza. Corto (1-1.5h), público, conversacional.' },
        { '@type': 'HowToStep', name: 'Confirma el día anterior', text: 'Un mensaje breve para confirmar reduce cancelaciones.' },
      ],
    });
  }
}

