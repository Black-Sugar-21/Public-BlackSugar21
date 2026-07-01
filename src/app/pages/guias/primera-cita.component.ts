import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO content page (prerendered). Query: "consejos primera cita / qué hacer primera cita /
// lugares para una cita". UI copy Spanish; identifiers/comments English.
@Component({
  selector: 'app-guia-primera-cita',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <h1>Consejos para la primera cita: cómo hacer que salga bien (2026)</h1>
    <p class="lead">La primera cita no se gana siendo perfecto, sino haciendo que la otra persona se sienta
    cómoda y con ganas de una segunda. Esta guía cubre qué hacer antes, durante y después — más cómo elegir
    el lugar correcto.</p>

    <h2>Antes de la cita</h2>
    <ul>
      <li><strong>Elige un plan con "salida" fácil.</strong> Un café o un trago superan a una cena de tres
      horas: menos presión, más química real.</li>
      <li><strong>Confirma el día antes,</strong> con un mensaje cálido y concreto.</li>
      <li><strong>Baja expectativas, sube curiosidad.</strong> Vas a conocer a alguien, no a rendir examen.</li>
    </ul>

    <h2>Cómo elegir el lugar perfecto</h2>
    <p>El mejor lugar es <strong>tranquilo para conversar</strong>, con buen ambiente y a mitad de camino
    entre ambos. Cafeterías con carácter, bares con música suave, o un paseo si hace buen día. Evita sitios
    tan ruidosos que no puedan escucharse.</p>

    <h2>Durante la cita</h2>
    <ul>
      <li><strong>Escucha más de lo que hablas.</strong> Las preguntas abiertas ("¿qué te llevó a…?") crean
      conexión.</li>
      <li><strong>Comparte algo real de ti.</strong> La vulnerabilidad medida genera cercanía (Brené Brown).</li>
      <li><strong>Lee las señales.</strong> Contacto visual, risa, preguntas de vuelta = interés.</li>
    </ul>

    <h2>Después de la cita</h2>
    <p>Si lo pasaste bien, dilo con naturalidad ese mismo día: "Me gustó mucho verte, repitamos". La claridad
    es atractiva; los juegos de "esperar 3 días" restan.</p>

    <h2>Cómo el Coach IA te prepara</h2>
    <p><strong>Black Sugar 21</strong> te sugiere <strong>lugares reales para la cita</strong> cerca de ti,
    temas de conversación y cómo leer la química — con orientación basada en 6 marcos de psicología. Menos
    nervios, más conexión.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Descubre el Coach IA →</a>
      <a routerLink="/guia/como-empezar-conversacion" class="btn-ghost">Guía: cómo iniciar conversación</a>
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
export class PrimeraCitaGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Consejos para la primera cita: cómo hacer que salga bien · Black Sugar 21',
      description: 'Qué hacer antes, durante y después de la primera cita, cómo elegir el lugar perfecto y leer la química. Guía práctica con un coach de IA.',
      url: '/guia/primera-cita',
    });
  }
}
