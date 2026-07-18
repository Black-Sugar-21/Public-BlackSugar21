import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO guide. Queries: "red flags apps de citas" / "señales de alerta citas online".
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
  selector: 'app-guia-red-flags',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <p class="updated">Actualizado: julio 2026</p>
    <h1>12 red flags en apps de citas que debes conocer</h1>
    <p class="lead">Los red flags (señales de alerta) en apps de citas son patrones de comportamiento que
    predicen dificultades más adelante. Reconocerlos a tiempo ahorra semanas de inversión emocional en
    personas con quienes la conexión real es improbable.</p>

    <h2>Red flags en el perfil</h2>
    <ol>
      <li><strong>Sin fotos del rostro.</strong> Un perfil sin cara visible tiene alta probabilidad de
      ser falso. Según datos de la FTC (2023), el 21% de las pérdidas por fraude romántico en apps
      de citas comienzan con perfiles sin foto de rostro.</li>
      <li><strong>Solo fotos grupales.</strong> Imposible saber quién es el match. Puede indicar falta
      de confianza en sí mismo/a o intención de ocultar su apariencia real.</li>
      <li><strong>Bio vacía o genérica.</strong> "Me gusta viajar y disfrutar la vida" no dice nada.
      Las personas que buscan algo real suelen dedicar tiempo a describirse.</li>
      <li><strong>Inconsistencias de edad/altura/ciudad.</strong> Si algo en el perfil parece demasiado
      perfecto o no cuadra con las fotos, puede ser información falsa.</li>
      <li><strong>Fotos de muy alta producción.</strong> Fotos de modelo/stock sin naturalidad pueden
      indicar perfil falso o catfishing.</li>
    </ol>

    <h2>Red flags en la conversación</h2>
    <ol start="6">
      <li><strong>Acelera demasiado la intimidad.</strong> "Ya te amo" o "siento que te conozco de
      toda la vida" en los primeros días es una táctica común de manipulación conocida como love bombing.</li>
      <li><strong>Evita las videollamadas.</strong> Si llevan semanas hablando y siempre tiene una excusa
      para no hacer video, algo no cuadra.</li>
      <li><strong>Habla constantemente de dinero o problemas financieros.</strong> La mayoría de las
      estafas románticas siguen el patrón: crear vínculo → pedir favor económico.</li>
      <li><strong>Respuestas que no conectan con lo que dijiste.</strong> Puede indicar que usa
      plantillas con múltiples personas simultáneamente o una cuenta automatizada.</li>
      <li><strong>Siempre está "muy ocupado/a" para quedar.</strong> Después de 2-3 semanas de chat
      sin voluntad de conocerse en persona, la intención real es cuestionable.</li>
    </ol>

    <h2>Red flags en la primera cita</h2>
    <ol start="11">
      <li><strong>Habla solo/a de sí mismo/a.</strong> Según Gottman, la curiosidad activa hacia el
      otro es uno de los mejores predictores de conexión. Alguien que no pregunta nada sobre ti no
      está interesado/a realmente.</li>
      <li><strong>Actitud irrespetuosa con el personal del lugar.</strong> Investigaciones de la
      Universidad de Florida (Ruder, 2021) muestran que cómo trata una persona al personal de servicio
      predice de forma significativa cómo tratará a su pareja a largo plazo.</li>
    </ol>

    <h2>Qué hacer si detectas un red flag</h2>
    <p>No cada red flag es definitivo. La clave es la frecuencia y el patrón:</p>
    <ul>
      <li>Un red flag aislado → mencionar directamente y ver cómo reacciona</li>
      <li>Dos red flags que se refuerzan → dar mucho menos energía a esa conversación</li>
      <li>Tres o más, especialmente los de manipulación (love bombing, evitar video, dinero) → salir
      sin culpa</li>
    </ul>
    <p><strong>Black Sugar 21</strong> incluye un Shield de Seguridad con IA que analiza patrones
    de riesgo en conversaciones y genera alertas antes de llegar a la primera cita.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Probar el Coach IA →</a>
      <a routerLink="/guia/primera-cita" class="btn-ghost">Guía: primera cita</a>
    </div>

    <section class="faq">
      <h2>Preguntas frecuentes</h2>
      <div class="faq-item">
        <h3>¿Cuántos red flags son suficientes para dejar de hablar con alguien?</h3>
        <p>No hay un número fijo. Importa más la gravedad y el patrón. Un red flag de seguridad (pide
        dinero, evita video, información inconsistente) es suficiente por sí solo.</p>
      </div>
      <div class="faq-item">
        <h3>¿El love bombing siempre es manipulación intencional?</h3>
        <p>No siempre. Algunas personas simplemente tienen un estilo de apego ansioso que genera
        intensidad temprana sin mala intención. La diferencia está en si el patrón persiste o se
        calma con el tiempo.</p>
      </div>
      <div class="faq-item">
        <h3>¿Cómo verificar si alguien es real antes de quedar?</h3>
        <p>Busca su foto con Google Lens (detección de imágenes robadas), pide una foto espontánea con
        algo específico ("hazte una foto sosteniendo tres dedos"), o propón una videollamada corta.
        Una persona real no tendrá problema.</p>
      </div>
    </section>
    <p class="note"><a routerLink="/guia/ghosting-que-hacer">Qué hacer con el ghosting</a> ·
    <a routerLink="/guia/como-pasar-chat-a-cita">Pasar del chat a la cita</a> ·
    <a routerLink="/">Black Sugar 21</a> — coach de citas con IA, gratis.</p>
  </article>
  `,
  styles: [GUIDE_STYLES],
})
export class RedFlagsGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: '12 red flags en apps de citas que debes reconocer · Black Sugar 21',
      description: 'Las 12 señales de alerta más comunes en apps de citas: perfiles falsos, love bombing, catfishing y cómo reaccionar ante cada una.',
      url: '/guia/red-flags-apps-citas',
    });
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: '12 red flags en apps de citas que debes conocer',
      description: 'Las 12 señales de alerta más comunes en apps de citas: perfiles falsos, love bombing, catfishing y cómo reaccionar ante cada una.',
      datePublished: '2026-07-17',
      dateModified: '2026-07-17',
      url: 'https://www.blacksugar21.com/guia/red-flags-apps-citas',
      author: { '@type': 'Organization', name: 'Black Sugar 21', url: 'https://www.blacksugar21.com' },
      publisher: { '@type': 'Organization', name: 'Black Sugar 21', logo: { '@type': 'ImageObject', url: 'https://www.blacksugar21.com/logo-21.png' } },
      mainEntityOfPage: 'https://www.blacksugar21.com/guia/red-flags-apps-citas',
    });
  }
}

