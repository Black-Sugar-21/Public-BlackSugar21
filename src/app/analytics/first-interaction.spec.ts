import { describe, expect, it } from 'vitest';
import { onFirstInteraction } from './first-interaction';

describe('onFirstInteraction (el aviso espera a la primera interacción)', () => {
  it.each(['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'])('%s dispara una sola vez', (ev) => {
    let n = 0; onFirstInteraction(() => { n++; });
    window.dispatchEvent(new Event(ev)); window.dispatchEvent(new Event('pointerdown'));
    expect(n).toBe(1);
  });
  it('sin interacción no dispara y se puede cancelar', () => {
    let n = 0; const stop = onFirstInteraction(() => { n++; });
    expect(n).toBe(0); stop(); window.dispatchEvent(new Event('keydown'));
    expect(n).toBe(0);
  });
});
