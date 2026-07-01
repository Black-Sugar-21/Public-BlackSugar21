import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO content page (prerendered via SSG). Targets the informational query "swipe fatigue /
// fatiga de swipe / cómo dejar de hacer swipe" and funnels to the app. UI copy in Spanish
// (primary market); identifiers/comments in English.
@Component({
  selector: 'app-guia-swipe-fatigue',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <h1>Swipe fatigue: qué es y cómo superarla (guía 2026)</h1>
    <p class="lead">Si abres una app de citas, deslizas veinte perfiles y cierras la app más cansado que
    antes, no estás solo. Eso tiene nombre: <strong>swipe fatigue</strong> (fatiga de deslizar). En esta
    guía te explicamos qué es, por qué ocurre según la psicología, y 7 formas prácticas de superarla para
    volver a tener conexiones reales.</p>

    <h2>¿Qué es el swipe fatigue?</h2>
    <p>El swipe fatigue es el <strong>agotamiento emocional</strong> de deslizar perfiles sin fin en las
    apps de citas tradicionales: muchas coincidencias, pocas conversaciones y aún menos conexiones reales.
    El cerebro trata cada match como una micro-recompensa; el problema es que el ciclo está diseñado para
    que sigas deslizando, no para que conectes.</p>

    <h2>Señales de que tienes fatiga de swipe</h2>
    <ul>
      <li>Deslizas en automático, casi sin mirar los perfiles.</li>
      <li>Tienes matches con los que nunca escribes (o que mueren en "hola").</li>
      <li>Sientes ansiedad o vacío después de usar la app.</li>
      <li>Empiezas a creer que "no hay nadie interesante" — cuando en realidad estás saturado.</li>
    </ul>

    <h2>Por qué ocurre (la psicología detrás)</h2>
    <p>La paradoja de la elección (Barry Schwartz) explica que <strong>demasiadas opciones paralizan</strong>
    y bajan la satisfacción. Sumado al refuerzo intermitente (el mismo mecanismo de las máquinas
    tragamonedas), el resultado es un bucle que consume tu atención sin darte lo que buscas: una conexión
    que importe.</p>

    <h2>Cómo superar el swipe fatigue: 7 formas prácticas</h2>
    <ol>
      <li><strong>Pon un límite de tiempo.</strong> 10-15 minutos al día. La calidad sube cuando la
      cantidad baja.</li>
      <li><strong>Deja de deslizar en automático.</strong> Lee una cosa real de cada perfil antes de decidir.</li>
      <li><strong>Escribe primero y específico.</strong> Un mensaje sobre algo de su perfil supera a
      cualquier "hey" mil veces.</li>
      <li><strong>Pasa a una cita antes.</strong> El objetivo no es chatear semanas: es conocerse en persona.</li>
      <li><strong>Cuida tu energía emocional.</strong> Si la app te deja peor, ciérrala. No te debe una cita.</li>
      <li><strong>Enfócate en pocas conexiones.</strong> Menos matches, más intención.</li>
      <li><strong>Usa un coach que te guíe.</strong> En vez de un feed infinito, apóyate en orientación
      basada en psicología para saber qué decir y cómo avanzar.</li>
    </ol>

    <h2>Cómo un coach de IA te ayuda a salir del bucle</h2>
    <p><strong>Black Sugar 21</strong> no es una app de swipe. Es un <strong>coach de inteligencia
    emocional con IA</strong>: analiza tus conversaciones en tiempo real, te sugiere qué decir, recomienda
    lugares para la cita y evalúa la compatibilidad, todo respaldado por 6 marcos de psicología (Bowlby,
    Gottman, Goleman, Hofstede, Seligman y Fisher). En vez de más perfiles, te da <strong>menos conexiones
    pero más reales</strong>.</p>

    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Conoce el Coach IA →</a>
      <a routerLink="/features" class="btn-ghost">Ver todas las funciones</a>
    </div>

    <h2>Preguntas frecuentes</h2>
    <h3>¿El swipe fatigue es real?</h3>
    <p>Sí. Es un patrón reconocido de agotamiento por sobrecarga de decisiones y refuerzo intermitente en
    las apps de citas.</p>
    <h3>¿Cuál es la mejor app para evitar el swipe fatigue?</h3>
    <p>Las que reemplazan el feed infinito por orientación real. Black Sugar 21 usa un coach de IA con
    psicología para priorizar conexiones significativas sobre volumen de matches.</p>

    <p class="note"><a routerLink="/">Volver al inicio</a> · Black Sugar 21 — coach de inteligencia
    emocional con IA, gratis, en 13 idiomas.</p>
  </article>
  `,
  styles: [`
    .guide { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; color: #EDEDF2; line-height: 1.7; }
    .back { color: #9c59ea; font-size: 14px; display: inline-block; margin-bottom: 24px; }
    h1 { font-size: 34px; line-height: 1.2; margin: 0 0 16px; }
    h2 { font-size: 23px; margin: 34px 0 12px; }
    h3 { font-size: 17px; margin: 20px 0 6px; }
    .lead { font-size: 18px; color: #C9C9D4; }
    ul, ol { padding-left: 22px; } li { margin: 8px 0; }
    strong { color: #fff; }
    .cta { display: flex; gap: 12px; flex-wrap: wrap; margin: 28px 0; }
    .btn-primary { background: linear-gradient(135deg,#D4AF37,#B8860B); color:#1A1206; padding:12px 20px; border-radius:12px; font-weight:700; }
    .btn-ghost { border:1px solid rgba(255,255,255,0.2); color:#EDEDF2; padding:12px 20px; border-radius:12px; }
    .note { margin-top: 40px; font-size: 14px; color:#8A8A99; }
    a { text-decoration: none; }
    @media (max-width:600px){ h1{font-size:27px;} .guide{padding:32px 16px 64px;} }
  `],
})
export class SwipeFatigueGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Swipe fatigue: qué es y cómo superarla (2026) · Black Sugar 21',
      description: 'Qué es el swipe fatigue (fatiga de deslizar), por qué ocurre según la psicología y 7 formas prácticas de superarlo para tener conexiones reales en las apps de citas.',
      url: '/guia/swipe-fatigue',
    });
  }
}
