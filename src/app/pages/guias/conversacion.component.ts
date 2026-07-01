import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO content page (prerendered). Query: "cómo empezar una conversación / qué escribir
// primer mensaje / icebreakers". UI copy Spanish; identifiers/comments English.
@Component({
  selector: 'app-guia-conversacion',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <h1>Cómo empezar una conversación en apps de citas (ejemplos que funcionan)</h1>
    <p class="lead">"Hola" tiene la peor tasa de respuesta de todos los primeros mensajes. Si tus matches
    mueren sin responder, el problema casi nunca eres tú: es el mensaje. Aquí tienes por qué, y 5 tipos de
    aperturas con ejemplos reales que sí abren conversación.</p>

    <h2>Por qué "hola" no funciona</h2>
    <p>Un "hola" le pasa a la otra persona toda la carga de pensar qué decir. Sin contexto ni motivo para
    responder, compite con otros 20 "hola" iguales. La clave de un buen primer mensaje es <strong>dar algo
    concreto a lo que responder</strong>.</p>

    <h2>5 tipos de aperturas (con ejemplos)</h2>
    <ol>
      <li><strong>Detalle específico de su perfil.</strong> "Vi que fuiste a Japón — ¿mejor comida callejera
      que probaste?" Demuestra que miraste, no deslizaste.</li>
      <li><strong>Pregunta con opción (fácil de responder).</strong> "¿Equipo playa o equipo montaña para
      desconectar?"</li>
      <li><strong>Humor ligero + observación.</strong> Un comentario simpático sobre una foto, sin forzar.</li>
      <li><strong>Interés en común.</strong> Si comparten algo (música, un lugar, un hobby), úsalo de puente.</li>
      <li><strong>Curiosidad genuina.</strong> Una pregunta abierta sobre algo que mencionó en su bio.</li>
    </ol>

    <h2>Errores que matan la conversación</h2>
    <ul>
      <li>Cumplidos genéricos sobre el físico ("qué guapa"): suena automático.</li>
      <li>Mensajes larguísimos de entrada: abruman.</li>
      <li>Preguntas cerradas de sí/no: cortan el hilo.</li>
    </ul>

    <h2>Cómo un coach de IA te da el mensaje perfecto</h2>
    <p><strong>Black Sugar 21</strong> analiza el contexto y te sugiere <strong>frases listas para enviar</strong>
    según la situación: primer mensaje, retomar una charla fría, o pasar a la cita. En vez de bloquearte,
    tienes un coach de inteligencia emocional que sabe qué funciona.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Prueba el Coach IA →</a>
      <a routerLink="/guia/swipe-fatigue" class="btn-ghost">Guía: swipe fatigue</a>
    </div>
    <p class="note"><a routerLink="/">Volver al inicio</a> · Black Sugar 21 — coach de citas con IA, gratis.</p>
  </article>
  `,
  styles: [`.guide { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; color: #EDEDF2; line-height: 1.7; }
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
    @media (max-width:600px){ h1{font-size:27px;} .guide{padding:32px 16px 64px;} }`],
})
export class ConversacionGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Cómo empezar una conversación en apps de citas (ejemplos) · Black Sugar 21',
      description: 'Por qué "hola" no funciona y 5 tipos de primeros mensajes con ejemplos reales que abren conversación en las apps de citas. Consejos de un coach de IA.',
      url: '/guia/como-empezar-conversacion',
    });
  }
}
