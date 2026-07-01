import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO content page (prerendered). Query: "estilos de apego / apego ansioso / teoría del
// apego relaciones". Ties to the app's Bowlby framework. UI Spanish; code English.
@Component({
  selector: 'app-guia-apego',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <h1>Psicología del apego en las citas: los 4 estilos y cómo afectan tu vida amorosa</h1>
    <p class="lead">Por qué algunas personas huyen cuando algo va bien, y otras necesitan constante
    seguridad. La teoría del apego (John Bowlby) explica gran parte de cómo nos vinculamos. Conocer tu estilo
    es uno de los mayores saltos que puedes dar en tus relaciones.</p>

    <h2>¿Qué es la teoría del apego?</h2>
    <p>Desarrollada por <strong>John Bowlby</strong> y Mary Ainsworth, describe cómo los vínculos tempranos
    moldean la forma en que buscamos (o evitamos) cercanía de adultos. No es destino: es un patrón que se
    puede entender y trabajar.</p>

    <h2>Los 4 estilos de apego</h2>
    <h3>1. Seguro</h3>
    <p>Cómodo con la intimidad y la independencia. Comunica necesidades sin miedo. Es el estilo al que todos
    podemos movernos con conciencia.</p>
    <h3>2. Ansioso</h3>
    <p>Anhela cercanía, teme el abandono, busca confirmación. En citas puede sobre-analizar cada mensaje que
    tarda en llegar.</p>
    <h3>3. Evitativo</h3>
    <p>Valora la independencia al punto de incomodarse con la intimidad. Suele "enfriarse" cuando algo se
    vuelve serio.</p>
    <h3>4. Desorganizado</h3>
    <p>Mezcla de deseo de cercanía y miedo a ella. Relaciones intensas y contradictorias.</p>

    <h2>Cómo identificar el tuyo</h2>
    <p>Observa tu reacción cuando alguien te gusta y hay silencio: ¿ansiedad (ansioso), alivio de espacio
    (evitativo), o calma (seguro)? Nombrar el patrón ya reduce su poder sobre ti.</p>

    <h2>Cómo mejora tus citas conocer tu apego</h2>
    <ul>
      <li>Dejas de tomarte personal el comportamiento del otro y entiendes el patrón.</li>
      <li>Comunicas lo que necesitas en vez de actuar desde el miedo.</li>
      <li>Eliges parejas y ritmos que te dan seguridad real.</li>
    </ul>

    <h2>Un coach que entiende de apego</h2>
    <p><strong>Black Sugar 21</strong> integra la teoría del apego de Bowlby (junto a Gottman, Goleman y
    otros 3 marcos) para darte orientación según tu situación real — no consejos genéricos. Conecta desde la
    seguridad, no desde el miedo.</p>
    <div class="cta">
      <a routerLink="/coach" class="btn-primary">Conoce el Coach IA →</a>
      <a routerLink="/guia/primera-cita" class="btn-ghost">Guía: primera cita</a>
    </div>
    <p class="note"><a routerLink="/">Volver al inicio</a> · Black Sugar 21 — coach de inteligencia emocional con IA.</p>
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
export class ApegoGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Psicología del apego en las citas: los 4 estilos · Black Sugar 21',
      description: 'Los 4 estilos de apego (seguro, ansioso, evitativo, desorganizado), cómo identificar el tuyo y cómo mejora tus relaciones. Basado en Bowlby y Ainsworth.',
      url: '/guia/psicologia-apego-citas',
    });
  }
}
