import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO guide. Queries: "qué hacer cuando te hacen ghosting" / "ghosting apps de citas".
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
  selector: 'app-guia-ghosting',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <p class="updated">Actualizado: julio 2026</p>
    <h1>Ghosting: qué hacer cuando te ignoran en apps de citas</h1>
    <p class="lead">El ghosting ocurre cuando alguien deja de responder sin explicación. Un estudio de
    la Universidad de Varsovia (2021) encontró que el 65% de las personas ha hecho ghosting al menos
    una vez. Si te pasó, la causa casi nunca eres tú.</p>

    <h2>¿Qué es el ghosting exactamente?</h2>
    <p>El ghosting es el cese abrupto de comunicación por parte de una persona con quien tenías contacto
    romántico, sin dar ninguna explicación. En apps de citas puede ocurrir después de un match, de varias
    conversaciones o incluso después de una cita en persona.</p>

    <h2>Por qué ocurre (y casi nunca tiene que ver contigo)</h2>
    <ul>
      <li><strong>Evitación del conflicto.</strong> Según el modelo de apego de Bowlby, las personas con
      apego evitativo prefieren desaparecer antes que gestionar la incomodidad de rechazar a alguien.</li>
      <li><strong>Sobrecarga de opciones.</strong> Con decenas de matches simultáneos, la persona priorizó
      otra conversación sin decidir conscientemente ignorarte.</li>
      <li><strong>Circunstancias externas.</strong> Trabajo, salud, familia — factores que no tienen
      relación con el interés que sentía por ti.</li>
      <li><strong>Falta de habilidades de comunicación.</strong> No todo el mundo sabe cómo decir "no me
      interesa seguir" de forma directa.</li>
    </ul>

    <h2>Lo que NO debes hacer</h2>
    <ul>
      <li>Enviar mensajes en cadena ("hola?", "todo bien?", "supongo que no te intereso...")</li>
      <li>Interpretar el silencio como una evaluación de tu valor como persona</li>
      <li>Publicar indirectas en tus historias esperando que lo vea</li>
      <li>Bloquear impulsivamente para luego desbloquear</li>
    </ul>

    <h2>3 pasos cuando te hacen ghosting</h2>
    <ol>
      <li><strong>Un mensaje de cierre (solo uno).</strong> Si llevabas conversación real, puedes enviar
      un único mensaje tranquilo: "Oye, entiendo si cambiaste de idea. Solo quería dejarte saber que
      estuvo bien conocerte." Sin expectativa de respuesta.</li>
      <li><strong>Espera 5 días antes de hacer cualquier cosa.</strong> El cerebro en modo de rechazo
      exagera la urgencia. La investigación de Gottman sobre regulación emocional sugiere que las
      decisiones tomadas en las primeras 72h de un estímulo negativo suelen ser desproporcionadas.</li>
      <li><strong>Cierra la conversación internamente.</strong> No hay una explicación que cure el
      ghosting — la necesidad de "entender por qué" puede mantenerte atrapado/a. Lo que necesitas
      no es su respuesta, sino distancia emocional.</li>
    </ol>

    <h2>¿Cuándo es ghosting definitivo vs pausa?</h2>
    <p>Una pausa (48–72h sin responder) es normal en apps de citas. Ghosting es cuando el silencio
    supera los 7 días sin contexto previo que lo justifique. Más de 10 días sin respuesta y sin haber
    tenido ninguna cita: considera ese match cerrado y enfoca tu energía en otras conversaciones.</p>

    <h2>Cómo evitar que te afecte en futuras conversaciones</h2>
    <p>El ghosting repetido puede crear un sesgo de anticipación del rechazo que daña tus próximas
    conversaciones. Reconocerlo es el primer paso. <strong>Black Sugar 21</strong> analiza en tiempo
    real el tono y el ritmo de tus conversaciones para avisarte antes de que una conversación se enfríe
    — y sugiere cómo reavivarla sin perder autenticidad.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Probar el Coach IA →</a>
      <a routerLink="/guia/mensajes-para-retomar-conversacion" class="btn-ghost">Cómo retomar un match frío</a>
    </div>

    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      <div class="faq-item">
        <h3>¿Debo enviar un segundo mensaje si no responde?</h3>
        <p>Solo si han pasado menos de 5 días y tenían conversación activa. Un único mensaje de seguimiento
        es aceptable. Más de uno convierte el seguimiento en presión.</p>
      </div>
      <div class="faq-item">
        <h3>¿El ghosting dice algo malo sobre la otra persona?</h3>
        <p>Refleja su gestión emocional, no tu valor. Las personas con habilidades de comunicación
        asertiva declinaran directamente. El ghosting es una salida de baja madurez emocional.</p>
      </div>
      <div class="faq-item">
        <h3>¿Es normal hacerle ghosting a alguien?</h3>
        <p>Es común (el 65% lo ha hecho alguna vez), pero no equivale a correcto. Existe el "soft ghost"
        — responder con monosílabos hasta que el otro se rinda — que es igual de dañino.</p>
      </div>
      <div class="faq-item">
        <h3>¿Cuánto tiempo esperar antes de hacer match con alguien más?</h3>
        <p>No hay un tiempo mínimo ético si no hubo acuerdo de exclusividad. Seguir conociendo otras
        personas mientras alguien no responde es una decisión sana, no desleal.</p>
      </div>
    </section>
    <p class="note"><a routerLink="/guia/primera-cita">Guía: primera cita</a> ·
    <a routerLink="/guia/psicologia-apego-citas">Psicología del apego</a> ·
    <a routerLink="/">Black Sugar 21</a> — coach de citas con IA, gratis.</p>
  </article>
  `,
  styles: [GUIDE_STYLES],
})
export class GhostingGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Ghosting: qué hacer cuando te ignoran en apps de citas · Black Sugar 21',
      description: 'Qué es el ghosting, por qué ocurre y 3 pasos concretos para manejarlo. Con datos de investigación sobre apego y comunicación emocional en citas.',
      url: '/guia/ghosting-que-hacer',
    });
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'Ghosting: qué hacer cuando te ignoran en apps de citas',
      description: 'Qué es el ghosting, por qué ocurre y 3 pasos concretos para manejarlo en apps de citas.',
      datePublished: '2026-07-17',
      dateModified: '2026-07-17',
      url: 'https://www.blacksugar21.com/guia/ghosting-que-hacer',
      author: { '@type': 'Organization', name: 'Black Sugar 21', url: 'https://www.blacksugar21.com' },
      publisher: { '@type': 'Organization', name: 'Black Sugar 21', logo: { '@type': 'ImageObject', url: 'https://www.blacksugar21.com/logo-21.png' } },
      mainEntityOfPage: 'https://www.blacksugar21.com/guia/ghosting-que-hacer',
    });
  }
}

