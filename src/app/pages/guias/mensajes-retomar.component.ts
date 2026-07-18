import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO guide. Queries: "mensajes para retomar una conversación" / "cómo retomar un match frío".
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
  selector: 'app-guia-mensajes-retomar',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <p class="updated">Actualizado: julio 2026</p>
    <h1>Cómo retomar una conversación que se enfrió (8 mensajes que funcionan)</h1>
    <p class="lead">Una conversación fría no es una conversación muerta. Si llevan días o semanas sin
    hablarse, un mensaje bien elegido puede reactivarla — o darte la claridad de que no vale la pena
    seguir. Aquí tienes 8 tipos de mensajes y cuándo usar cada uno.</p>

    <h2>¿Cuándo vale la pena intentarlo?</h2>
    <p>Merece la pena si:</p>
    <ul>
      <li>La conversación se cortó de forma natural (ambos dejaron de responder, sin tensión)</li>
      <li>Pasó algo relevante en tu vida o en la cultura pop que conecta con algo que dijeron antes</li>
      <li>Han pasado menos de 4 semanas desde el último mensaje</li>
    </ul>
    <p>No vale la pena si la persona te ignoró deliberadamente más de 2 veces o si dejaste mensajes
    sin respuesta en los últimos 7 días.</p>

    <h2>8 mensajes para retomar una conversación</h2>

    <h3>1. El gancho cultural (noticias, series, música)</h3>
    <p>"¿Viste que [serie/película/evento que mencionaron] acaba de [estrenar/lanzar/pasar]? Me acordé
    que dijiste que te gustaba."</p>

    <h3>2. La pregunta pendiente</h3>
    <p>"Oye, nunca me contaste cómo te fue con [algo que mencionó antes — entrevista, viaje, concierto].
    ¿Cómo salió?"</p>

    <h3>3. El chiste retomado</h3>
    <p>Si tuvieron algún chiste interno durante la conversación anterior, retomarlo demuestra que
    prestaste atención. "Todavía pienso en lo de [referencia al chiste]. 😂"</p>

    <h3>4. La recomendación directa</h3>
    <p>"Acabo de [ver/escuchar/probar] [algo relacionado con sus intereses] y pensé que te iba a
    gustar. ¿Lo conocías?"</p>

    <h3>5. La honestidad ligera</h3>
    <p>"Creo que los dos nos quedamos en deuda con esta conversación. ¿Le damos otra oportunidad?"</p>

    <h3>6. El plan concreto</h3>
    <p>Si ya habían hablado de quedar: "Oye, ese plan de [lo que mencionaron] sigue en pie para mí.
    ¿Tú qué dices?"</p>

    <h3>7. El meme/GIF relevante</h3>
    <p>Sin texto. Solo un meme que conecte con algo de la conversación anterior. Funciona bien cuando
    no sabes qué decir con palabras — y suele generar una respuesta.</p>

    <h3>8. El cierre abierto</h3>
    <p>Si llevan más tiempo sin hablar (3-4 semanas): "Hola, ¿cómo estás? Sé que ha pasado tiempo
    pero me alegra tener tu contacto por aquí." Sin drama, sin reproches.</p>

    <h2>Errores que garantizan que no responda</h2>
    <ul>
      <li><strong>"Hola" sin más.</strong> Si no respondió antes, un "hola" solo no cambia nada.</li>
      <li><strong>Reproche velado.</strong> "No sé si recuerdas que existís" o "pensé que habías
      desaparecido" generan culpa y rechazo inmediato.</li>
      <li><strong>Declaración de intenciones exagerada.</strong> "Te he estado pensando mucho" después
      de pocas conversaciones crea presión.</li>
      <li><strong>Enviar 3 mensajes seguidos.</strong> Uno es suficiente. Más de uno antes de recibir
      respuesta comunica ansiedad, no interés.</li>
    </ul>

    <p><strong>Black Sugar 21</strong> analiza el contexto de tu conversación y sugiere el tipo de
    mensaje más adecuado para reactivarla, adaptado al tono y al historial que ya tienes con esa
    persona.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Obtener mensaje personalizado →</a>
      <a routerLink="/guia/como-pasar-chat-a-cita" class="btn-ghost">Cómo proponer quedar</a>
    </div>

    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      <div class="faq-item">
        <h3>¿Cuántas veces puedo intentar retomar antes de rendirme?</h3>
        <p>Una vez. Si no responde a tu intento de retomar, espera al menos 2 semanas antes de un
        segundo intento. Si tampoco responde, considéralo cerrado.</p>
      </div>
      <div class="faq-item">
        <h3>¿Es mejor reanudar en la app o pasar a WhatsApp?</h3>
        <p>Si ya tienen WhatsApp, úsalo. Si solo tienes el chat de la app, quédate ahí — migrar
        a WhatsApp es una acción que puedes proponer una vez que la conversación fluya de nuevo.</p>
      </div>
      <div class="faq-item">
        <h3>¿Qué hora del día es mejor para enviar el mensaje?</h3>
        <p>Tarde-noche entre semana (19:00-22:00) o mediodía del fin de semana son los horarios con
        mayor probabilidad de respuesta en apps de citas, según análisis de patrones de uso.</p>
      </div>
    </section>
    <p class="note"><a routerLink="/guia/como-empezar-conversacion">Primeros mensajes</a> ·
    <a routerLink="/guia/ghosting-que-hacer">Qué hacer con el ghosting</a> ·
    <a routerLink="/">Black Sugar 21</a> — coach de citas con IA, gratis.</p>
  </article>
  `,
  styles: [GUIDE_STYLES],
})
export class MensajesRetomarGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Cómo retomar una conversación fría en apps de citas (8 mensajes) · Black Sugar 21',
      description: '8 tipos de mensajes para retomar una conversación que se enfrió en apps de citas, cuándo intentarlo y qué errores evitar.',
      url: '/guia/mensajes-para-retomar-conversacion',
    });
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Cómo retomar una conversación que se enfrió (8 mensajes que funcionan)',
      description: '8 tipos de mensajes para retomar una conversación fría en apps de citas.',
      datePublished: '2026-07-17',
      dateModified: '2026-07-17',
      url: 'https://www.blacksugar21.com/guia/mensajes-para-retomar-conversacion',
      author: { '@type': 'Organization', name: 'Black Sugar 21', url: 'https://www.blacksugar21.com' },
      publisher: { '@type': 'Organization', name: 'Black Sugar 21', logo: { '@type': 'ImageObject', url: 'https://www.blacksugar21.com/logo-21.png' } },
      mainEntityOfPage: 'https://www.blacksugar21.com/guia/mensajes-para-retomar-conversacion',
    });
  }
}

