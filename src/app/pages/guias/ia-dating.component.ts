import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SeoService } from '../../services/seo.service';

// SEO content page (prerendered via SSG). Targets the informational cluster
// "apps de citas con inteligencia artificial / mejor app de citas ia / coach de citas ia /
// inteligencia artificial para citas / ia para ligar" and funnels to the coach.
// UI copy in Spanish (primary market); identifiers/comments in English.
@Component({
  selector: 'app-guia-ia-dating',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <article class="guide">
    <a routerLink="/" class="back">← Black Sugar 21</a>
    <h1>Apps de citas con inteligencia artificial: guía completa 2026</h1>
    <p class="lead">Casi todas las apps de citas dicen usar <strong>inteligencia artificial</strong>, pero
    la mayoría se limita a un algoritmo básico de filtrado. En esta guía te explicamos qué es realmente
    la IA aplicada a las citas, cómo distinguir una función genuina de un término de marketing, y por
    qué un verdadero <strong>coach de citas con IA</strong> cambia las reglas del juego.</p>

    <h2>¿Qué hace diferente a una app de citas con IA real?</h2>
    <p>La mayoría de las plataformas etiquetan como "IA" cosas que llevan décadas en el mercado: filtros
    de edad y distancia, ordenar perfiles por popularidad o recomendarte personas similares a tus
    matches anteriores. Eso es aprendizaje automático básico, no inteligencia artificial conversacional.</p>
    <p>Una <strong>app de citas con IA real</strong> va mucho más allá:</p>
    <ul>
      <li>Entiende el contexto de tus conversaciones, no solo palabras sueltas.</li>
      <li>Ofrece orientación personalizada basada en tu estilo de apego y comunicación.</li>
      <li>Aprende de tus interacciones para afinar sus sugerencias con el tiempo.</li>
      <li>Puede explicar <em>por qué</em> recomienda algo, no solo qué decir.</li>
      <li>Integra marcos de psicología reconocidos, no intuiciones genéricas.</li>
    </ul>
    <p>Si la "IA" de una app no puede razonar sobre lo que ocurrió en tu última conversación, no estás
    ante inteligencia artificial: estás ante un sistema de recomendación glorificado.</p>

    <h2>Cómo funciona un coach de citas con IA</h2>
    <p>Un <strong>coach de citas con IA</strong> actúa como un mentor de inteligencia emocional disponible
    24/7. Analiza tus conversaciones en tiempo real, detecta patrones de comunicación, señala momentos
    clave (como cuando la conversación pierde ritmo o cuando hay una señal de interés) y te sugiere
    cómo responder de forma auténtica.</p>
    <p><strong>Black Sugar 21</strong> es el único coach de IA para citas que combina el modelo de
    lenguaje Gemini con <strong>seis marcos de psicología</strong> validados:</p>
    <ul>
      <li><strong>Bowlby</strong> — estilos de apego (ansioso, evitativo, seguro).</li>
      <li><strong>Gottman</strong> — predicción de compatibilidad y gestión del conflicto.</li>
      <li><strong>Goleman</strong> — inteligencia emocional aplicada a la comunicación.</li>
      <li><strong>Hofstede</strong> — diferencias culturales que afectan la atracción y el cortejo.</li>
      <li><strong>Seligman</strong> — bienestar y motivaciones positivas en las relaciones.</li>
      <li><strong>Fisher</strong> — neurociencia de la atracción romántica y los sistemas de amor.</li>
    </ul>
    <p>El resultado no es una lista genérica de frases para ligar, sino orientación adaptada a tu
    perfil psicológico, al de la otra persona y al momento concreto de la conversación. Además sugiere
    lugares para la primera cita basándose en la ubicación real y el perfil de ambos.</p>

    <h2>Qué buscar en una app de citas con IA</h2>
    <p>Antes de descargar cualquier app que presuma de IA, hazte estas preguntas:</p>
    <ul>
      <li><strong>¿La IA analiza conversaciones o solo perfiles?</strong> El análisis conversacional es
      la diferencia entre un coach real y un buscador avanzado.</li>
      <li><strong>¿Usa psicología con respaldo científico?</strong> Modelos como apego, Gottman o Fisher
      tienen décadas de investigación detrás; "algoritmos propietarios" no tienen ninguna.</li>
      <li><strong>¿Ofrece retroalimentación explicada?</strong> Una IA útil dice "esto funcionó porque
      mostraste curiosidad genuina", no solo "buen mensaje".</li>
      <li><strong>¿Protege tu privacidad?</strong> El análisis de conversaciones íntimas requiere
      transparencia sobre cómo se almacenan y usan esos datos.</li>
      <li><strong>¿Está disponible en tu idioma?</strong> La inteligencia emocional pierde matices
      cuando la app solo funciona bien en inglés.</li>
      <li><strong>¿Funciona sin suscripción abusiva?</strong> El coach IA debería ser accesible, no
      una función premium oculta tras un muro de pago.</li>
    </ul>
    <p>Black Sugar 21 cumple todos estos criterios: coach gratuito, 13 idiomas, psicología certificada
    y política de privacidad clara sobre el uso de tus conversaciones.</p>

    <h2>Ventajas de la IA en citas vs apps tradicionales de swipe</h2>
    <p>Las apps de swipe optimizan el <em>volumen</em>: más deslizamientos, más matches, más tiempo
    dentro de la app. La IA bien aplicada optimiza la <em>calidad</em>: menos fricción, conversaciones
    que avanzan, citas reales.</p>
    <ul>
      <li><strong>Menos bloqueo mental.</strong> Saber qué decir y cuándo decirlo elimina el momento
      de "no sé cómo responder esto".</li>
      <li><strong>Más confianza.</strong> El coach no escribe por ti — te guía para que seas tú quien
      conecte, de forma auténtica.</li>
      <li><strong>Progresión real.</strong> Las conversaciones avanzan hacia una cita en lugar de
      quedarse en charla superficial indefinida.</li>
      <li><strong>Aprendizaje continuo.</strong> Cada interacción te enseña algo sobre tu estilo
      de comunicación, para que mejores con el tiempo.</li>
      <li><strong>Menos fatiga de swipe.</strong> Cuando sabes que una conversación tiene potencial,
      no necesitas abrir veinte más para sentir que hiciste algo.</li>
      <li><strong>Compatibilidad más profunda.</strong> Los marcos de psicología detectan afinidad
      real, no solo atracción superficial basada en fotos.</li>
    </ul>
    <p>En resumen: las apps tradicionales de swipe te dan candidatos; la <strong>inteligencia artificial
    para citas</strong> te ayuda a convertirlos en conexiones reales.</p>

    <div class="cta">
      <a routerLink="/coach" class="cta-btn">Prueba el Coach IA gratis →</a>
      <a routerLink="/" class="back-link">← Descargar Black Sugar 21</a>
    </div>

    <h2>Preguntas frecuentes</h2>

    <h3>¿Qué app de citas usa inteligencia artificial de verdad?</h3>
    <p>La gran mayoría usa filtros y recomendaciones básicas que no son IA en sentido estricto.
    <strong>Black Sugar 21</strong> es una excepción: integra Gemini (el modelo de Google) con seis
    marcos de psicología para analizar conversaciones y ofrecer coaching personalizado en tiempo real.</p>

    <h3>¿Un coach de citas con IA escribe los mensajes por mí?</h3>
    <p>No, y no debería. Un buen coach de IA sugiere enfoques, señala oportunidades y te ayuda a
    comunicarte mejor — pero el mensaje lo escribes tú. El objetivo es que seas más auténtico, no
    que delegues la conversación a un bot.</p>

    <h3>¿Es seguro compartir mis conversaciones con una IA?</h3>
    <p>Depende de la app. Busca políticas de privacidad claras sobre retención y uso de datos.
    Black Sugar 21 no vende datos de conversaciones a terceros ni los usa para entrenar modelos
    externos sin consentimiento explícito.</p>

    <h3>¿Funciona la IA para ligar si soy introvertido?</h3>
    <p>Especialmente bien. Las personas introvertidas suelen tener mucho que ofrecer pero sienten
    fricción al iniciar o mantener conversaciones. Un coach de IA actúa como guía discreta que
    reduce esa fricción sin cambiar quién eres.</p>

    <h3>¿La IA reemplaza la intuición en las citas?</h3>
    <p>No. La complementa. Tu intuición capta señales que los modelos no siempre ven; la IA aporta
    estructura y patrones que la emoción del momento puede hacerte pasar por alto. El mejor resultado
    combina ambas.</p>

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
    .cta-btn { background: linear-gradient(135deg,#D4AF37,#B8860B); color:#1A1206; padding:12px 20px; border-radius:12px; font-weight:700; }
    .back-link { border:1px solid rgba(255,255,255,0.2); color:#EDEDF2; padding:12px 20px; border-radius:12px; }
    .note { margin-top: 40px; font-size: 14px; color:#8A8A99; }
    a { text-decoration: none; }
    @media (max-width:600px){ h1{font-size:27px;} .guide{padding:32px 16px 64px;} }
  `],
})
export class IaDatingGuideComponent implements OnInit {
  constructor(private seo: SeoService) {}
  ngOnInit() {
    this.seo.update({
      title: 'Apps de citas con inteligencia artificial: guía 2026 · Black Sugar 21',
      description: 'Descubre qué diferencia una app de citas con IA real de las que solo dicen tenerla. Coach de citas con IA, psicología y guía completa 2026.',
      url: '/guia/apps-citas-ia',
    });
  }
}
