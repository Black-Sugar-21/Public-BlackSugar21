---
version: alpha
name: "Black Sugar 21 (web pública)"
description: "Web pública y web-app de Black Sugar 21 (Angular): landing, Coach en pantalla completa y páginas legales. Tema oscuro con oro y morado, Playfair Display para títulos y Outfit para texto."
colors:
  bg: "#0A0A0A"
  surface: "#1A1A1A"
  surface-high: "#1E1E1E"
  border: "#FFFFFF1A"
  text: "#FFFFFF"
  text-muted: "#B0B0B0"
  link: "#D4AF37"
  primary: "#D4AF37"
  on-primary: "#1A1206"
  primary-container: "#B8860B"
  on-primary-container: "#1A1206"
  secondary: "#4A004F"
  on-secondary: "#FFFFFF"
  error: "#FF4457"
  success: "#16DBA1"
typography:
  display-lg:
    fontFamily: "Playfair Display"
    fontSize: "3rem"
    fontWeight: 700
    lineHeight: 1.2
  headline-md:
    fontFamily: "Playfair Display"
    fontSize: "1.75rem"
    fontWeight: 700
    lineHeight: 1.25
  title-md:
    fontFamily: "Playfair Display"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
  body-lg:
    fontFamily: "Outfit"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "Outfit"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  body-sm:
    fontFamily: "Outfit"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label-lg:
    fontFamily: "Outfit"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.6
  label-md:
    fontFamily: "Outfit"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.6
rounded:
  sm: "12px"
  button: "12px"
  md: "14px"
  card: "16px"
  pill: "999px"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "2rem"
  lg: "4rem"
  xl: "8rem"
  touch: "48px"
components:
  screen:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.button}"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    typography: "{typography.label-lg}"
    rounded: "{rounded.button}"
    height: "48px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-md}"
    rounded: "{rounded.card}"
    padding: "16px"
  card-secondary-text:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.body-sm}"
  chip:
    backgroundColor: "{colors.surface-high}"
    textColor: "{colors.text}"
    typography: "{typography.label-md}"
    rounded: "{rounded.pill}"
    height: "32px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.md}"
    height: "48px"
  text-success-on-screen:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.success}"
    typography: "{typography.label-lg}"
  text-error-on-screen:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.error}"
    typography: "{typography.label-lg}"
  link:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.link}"
---

# Black Sugar 21 (web pública)

> Fuente de verdad de los valores: `src/styles.css` (variables en `:root`, alineadas con las apps: comentarios «iOS: …» que remiten a `AppColor.swift` y `ColorTheme.swift`) y `src/app/coach-widget.component.scss` (colores locales `--cw-*`). Solo existe tema oscuro hoy; las superposiciones neutrales (`--border-*`, `--fill-*`, `--scrim`) están preparadas para un tema claro futuro.
> Este archivo los refleja; si cambias un valor en el código, actualiza aquí y corre el linter (ver «Cómo mantenerlo»).

## Overview

La web pública de Black Sugar 21 es la puerta de entrada de la marca: premium, íntima y oscura, con oro para lo importante y morado para lo especial, y el Coach de IA como protagonista (ruta `/coach` a pantalla completa, con la superficie del chat y el teclado sin costuras). Debe verse igual de cuidada que las apps y compartir su paleta (los comentarios «iOS: …» son la referencia). Textos cálidos y claros, sin jerga ni nombres de tecnología, en varios idiomas.

### Reglas de la casa

- Una acción principal por pantalla; sin jerga ni nombres de tecnología en los textos.
- Todos los estados: cargando, vacío, error (en tono calmado, con salida), sin conexión, desactivado, enfocado, presionado.
- Textos en 13 idiomas (sin cadenas fijas); layouts con escritura derecha a izquierda (RTL) y tamaño de letra hasta 200 % sin recortes.
- Responsive: teléfono, tableta y ventana ancha; objetivos táctiles de al menos 48 dp / 44 pt.
- Reducir movimiento: con la preferencia del sistema, toda animación decorativa pasa a 0.
- Contraste mínimo AA (4,5:1 texto normal, 3:1 texto grande y componentes) en claro y en oscuro.
- La paleta se alinea con las apps iOS y Android: cualquier cambio de color se hace en las tres superficies.
- Fondo oscuro en la raíz (`html`) para que nunca aparezca blanco bajo el teclado de iOS.
- Ningún `rgba` suelto en componentes: se usan las superposiciones neutrales de `styles.css`.

## Colors

- **Oro (#D4AF37 metálico; #B8860B oscuro; #C5A028 variante):** títulos, enlaces y acciones. Texto sobre oro: `--on-gold` #1A1206.
- **Morado (#4A004F oscuro / #6A1B9A claro / #831BFC vivo):** coach y detalles.
- **Fondo:** #0A0A0A, barra lateral #101010, tarjetas #1A1A1A y #1E1E1E; degradado principal `#0A0A14 → #140B28 → #1C0E38`.
- **Texto:** blanco, secundario #E0E0E0, atenuado #B0B0B0.
- **Reacciones:** like #6CEAC5 y #16DBA1, dislike #FF6560 y #F83770, rojo de marca #FF4457, azul de likes #3498DB.
- **Terceros fijos:** Facebook #1877F2, Instagram #E4405F.
- **Superposiciones neutrales:** bordes blancos al 6, 10 y 14 %; rellenos al 3,5, 6 y 10 %; velo negro al 60 %.

Esta superficie es solo oscura: todos los tokens de color de abajo son del único tema (sin sufijo `-dark`).

## Typography

Títulos en Playfair Display, siempre dorados (`h1`-`h6`); texto en Outfit; ambas OFL y cargadas desde `index.html` (no por `@import`, por rendimiento). Todo en rem para respetar el tamaño de letra del usuario hasta 200 %.

## Layout

Espaciado en rem: 0,5, 1, 2, 4 y 8. En la ruta del Coach la página se bloquea y solo se desplaza el área de mensajes (`position: fixed` en el cuerpo, ya que iOS Safari ignora `overflow: hidden`). Objetivo táctil de 48 px; barra lateral y barra inferior en la web-app; responsive de teléfono a escritorio.

## Elevation & Depth

Profundidad por tarjetas más claras sobre el fondo (#1A1A1A, #1E1E1E), degradados dorados (`--gradient-gold`) y premium, y bordes blancos tenues; sin sombras duras.

## Shapes

Radios más usados: 12 (botones, campos), 14, 16 (tarjetas) y 999 / 50 % (píldoras y avatares).

## Motion

Una sola curva de salida `cubic-bezier(0.23, 1, 0.32, 1)` (`--ease-out`) y `cubic-bezier(0.77, 0, 0.175, 1)` para entrada y salida; nunca `ease-in` en la interfaz. Pulsar escala a 0,97 (`--press-scale`). Transiciones habituales de 0,2 a 0,35 s. Hay reglas `prefers-reduced-motion` en los componentes; con la preferencia activa se anulan las animaciones decorativas.

## Components

Se generan: `screen`, `button-primary` (oro con tinta oscura), `button-secondary` (oro oscuro), `card`, `chip`, `field`, `link`, `text-*-on-screen`. El widget del Coach usa colores locales `--cw-*` en `coach-widget.component.scss`; el escudo de seguridad y las tarjetas de lugar siguen la misma paleta.

## Do's and Don'ts

- Hacer: Texto #1A1206 sobre superficies doradas.
- Hacer: Reusar los tokens `--border-*` y `--fill-*` en vez de `rgba`.
- No hacer: No usar blanco como fondo en ninguna capa raíz.
- No hacer: No añadir colores nuevos sin reflejarlos en iOS y Android.
- Hacer: una sola acción principal por pantalla; las demás son secundarias o de texto.
- Hacer: dar estado a todo lo que espera, falla, está vacío o está desactivado.
- No hacer: poner colores, radios o duraciones sueltos en las pantallas; leer siempre el token.
- No hacer: nombres de tecnología, modelos o proveedores en textos que ve la persona.
- No hacer: copiar identidades, paletas o marcas de terceros.

## Cómo mantenerlo

1. Antes de tocar la interfaz, lee este archivo (agentes incluidos).
2. Si cambias un token en la fuente de verdad, actualiza este archivo en el mismo cambio.
3. Corre `npx -y @google/design.md@0.4.0 lint DESIGN.md` (cero errores) y, contra la versión de main, `npx -y @google/design.md@0.4.0 diff <main> DESIGN.md`.

