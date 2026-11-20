import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CoachWidgetComponent } from './coach-widget.component';
import { FirebaseService } from './firebase.service';
import { TranslationService } from './translation.service';

/** Sin red: nunca baja el SDK; solo se prueba el orden del diferido. */
class OfflineFirebase extends FirebaseService {
  protected override loadCore(): Promise<never> { return new Promise<never>(() => {}); }
}

describe('CoachWidgetComponent (Firebase diferido)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: FirebaseService, useClass: OfflineFirebase }],
    });
  });

  it('pide la configuración del planificador solo tras el reposo de Firebase', async () => {
    const fb = TestBed.inject(FirebaseService);
    let release!: () => void;
    vi.spyOn(fb, 'whenIdle').mockReturnValue(new Promise<void>((r) => (release = r)));
    const planner = vi.spyOn(fb, 'getCoachPlannerConfig').mockResolvedValue({ ok: 1 } as any);
    const widget = TestBed.runInInjectionContext(() => new CoachWidgetComponent('browser' as unknown as object, TestBed.inject(TranslationService), fb, {} as any));
    expect(planner).not.toHaveBeenCalled();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(planner).toHaveBeenCalledTimes(1);
    expect(widget.rcPlanner()).toEqual({ ok: 1 });
  });

  it('la bandera del vestidor también espera el reposo (no baja Firebase al arrancar)', async () => {
    const fb = TestBed.inject(FirebaseService);
    let release!: () => void;
    vi.spyOn(fb, 'whenIdle').mockReturnValue(new Promise<void>((r) => (release = r)));
    vi.spyOn(fb, 'getCoachPlannerConfig').mockResolvedValue(null as any);
    const wardrobe = vi.spyOn(fb, 'isWardrobeEnabled').mockResolvedValue(true);
    const widget = TestBed.runInInjectionContext(() => new CoachWidgetComponent('browser' as unknown as object, TestBed.inject(TranslationService), fb, {} as any));
    expect(wardrobe).not.toHaveBeenCalled();
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(wardrobe).toHaveBeenCalledTimes(1);
    expect((widget as any).wardrobeOn()).toBe(true);
  });
});
