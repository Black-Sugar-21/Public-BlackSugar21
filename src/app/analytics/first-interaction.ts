/**
 * Llama a `cb` una sola vez, en la primera interacción de la persona (clic, toque, tecla o desplazamiento). Devuelve una función que cancela la espera.
 * El aviso de analítica aparece ahí y no al cargar: un aviso que se pinta solo, tras el primer pintado, puede pasar a ser el «elemento más grande»
 * y empeorar el LCP. Va en un archivo aparte y mínimo para que el JS inicial no cargue el resto de la analítica.
 */
export function onFirstInteraction(cb: () => void): () => void {
  const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'];
  const stop = () => events.forEach((e) => removeEventListener(e, fire, true));
  function fire(): void {
    stop();
    cb();
  }
  events.forEach((e) => addEventListener(e, fire, { capture: true, passive: true }));
  return stop;
}
