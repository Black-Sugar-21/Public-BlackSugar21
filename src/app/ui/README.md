# Design System — Atomic Design (Public-BlackSugar21)

The web is being migrated to **Atomic Design**. Build UI from the smallest reusable
pieces up. Always use the **CSS design tokens** in `src/styles.css` (never hardcode colors)
and keep everything **responsive + cross-browser + reduced-motion safe**.

```
src/app/ui/
├── atoms/        # indivisible primitives — Button, Pill, Badge, Skeleton
├── molecules/    # small compositions of atoms — Card, SkeletonRow, (Field…)
├── organisms/    # feature sections — CoachCard, SessionList, Header… (add as we migrate)
└── index.ts      # barrel export
```

## Atoms
| Component | Selector | Purpose |
|---|---|---|
| Button | `ui-button` | Actions. Variants: `primary` (gold gradient), `outline`, `ghost`; `size` sm/md; `block`. ≥44px touch target. |
| Pill | `ui-pill` | Tags / chips / link actions. Tints: `gold` (maps), `neutral` (web), `instagram`, `purple` (perspective). Renders `<a target=_blank>` when `href` is set. |
| Badge | `ui-badge` | Gold "fit %" capsule (`94% ✦`) — `.cw-fit` parity with iOS/Android. |
| Skeleton | `ui-skeleton` | Single shimmer bar. Inputs: `width`, `height`, `radius`, `circle`. No animation under `prefers-reduced-motion`. |
| Option | `ui-option` | Selectable toggle (interest chips / segmented). `selected` → gold; `shape` pill\|rect; `block` → flex:1. Parent owns the model. |

## Molecules
| Component | Selector | Purpose |
|---|---|---|
| Card | `ui-card` | Bordered surface. `highlighted` → gold glow (selected/best); `best` → ✦ corner badge. `.cw-place` parity. |
| SkeletonRow | `ui-skeleton-row` | Session-history loading row (dot + 2 lines). |

## Usage
Components are **standalone** (Angular 21). Import what you need:

```ts
import { UiButtonComponent, UiPillComponent } from './ui';

@Component({ standalone: true, imports: [UiButtonComponent, UiPillComponent], ... })
```

```html
<ui-button variant="primary">Descargar la app</ui-button>
<ui-pill tint="instagram" [href]="igUrl">📷 Instagram</ui-pill>
<ui-badge>94% ✦</ui-badge>
```

## Organisms (planned — feature components that compose atoms/molecules)

The atom + molecule layer and adoption are complete. Organisms are the next, optional layer —
extracting whole feature sections into reusable components. Recommended as a **focused pass**
(not mixed with other work) since they touch signature production UI:

| Organism | Composes | Source today |
|---|---|---|
| `coach-place-card` | ui-card + ui-badge + ui-pill | inline `.cw-place` in coach-widget |
| `coach-sessions-list` | ui-skeleton-row + rows | history overlay in coach-widget |
| `app-header` | logo + ui-button (sign in/out) | `app.html` toolbar |

Extraction rules: keep the exact markup/CSS first (verbatim move → zero visual change), wire
data via `@Input()` and actions via `@Output()`, then refactor internals to atoms. Verify each
against a screenshot before/after — the place card is the brand's signature element.

## Rules
1. **Tokens only** — colors/spacing from `styles.css` variables; no inline hex.
2. **Cross-device/browser** — `-webkit-` prefixes where needed, `touch-action: manipulation`,
   `-webkit-tap-highlight-color: transparent`, fluid widths, ≥44px touch targets.
3. **Accessibility** — honor `prefers-reduced-motion`, provide `aria-label`s, `OnPush`.
4. **Migration is incremental** — new screens use these; existing screens adopt them as touched.
   Don't rewrite working production screens wholesale.
