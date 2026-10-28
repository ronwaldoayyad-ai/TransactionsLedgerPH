# Theme and Color Palettes Documentation

Reviewed October 28, 2026. The live swatches below are generated from the current source tokens.

## Visual foundations
The admin app uses IBM Plex Sans for interface text and IBM Plex Mono for numeric/technical emphasis. Its light surfaces, navy hierarchy, blue primary controls and restrained gold accents are defined in src/index.css. The borrower interface has its own responsive document tokens and a selectable dark appearance; do not assume admin and borrower palette values are identical.

## Semantic color
| Meaning | Treatment | Non-color cue |
| --- | --- | --- |
| Primary action/navigation | Brand blue/navy | Active label, outline or selected state. |
| Settled/payment or credit activity | Green/emerald | Paid or credit text and signed amount. |
| Assessed finance/late fees | Red | Fee description and amount. |
| Past due / attention | Red/amber as appropriate | Explicit due/status wording. |
| Refunded | Distinct refunded treatment | Refunded badge, not In progress. |
| Disabled or unavailable | Muted surface/text | Disabled control and explanation. |

Status text and amount signs must remain correct even without color perception. Brand artwork is not recolored to represent financial status.

## Components
Use bordered inputs, clear labels, readable helper text, visible focus states and touch-friendly controls. Tables support contained horizontal scrolling; All Transactions additionally persists column widths/order on the device. Cards and pills share consistent type scale and spacing. Logo containers are transparent and borderless; row and card placement adapts to screen width.

## Motion
Finder and Payments use the same conic-gradient border palette and finderBorderOrbit timing. The liquid-metal shader was replaced by CSS; no shader canvas is needed. Tab navigation uses one cancellable entrance. Current/next balance switches use an inert visual flip copy while committing the selected view immediately. Fully settled schedule celebration respects reduced motion.

Animations must not cover account controls, delay authorization or imply a financial result. Reduced motion uses still alternatives, and background effects pause when hidden where supported.

## Responsive behavior
Borrowers have a desktop sidebar and wider content layouts; mobile retains bottom navigation and horizontal gestures. Long titles, formatted amounts, dates and bank fields must remain visible on small screens. Information density changes with width; the account meaning does not.

## Search and switch feedback

All admin search boxes share the Finder animated-access-ring palette and five-second orbit. Native search inputs remain keyboard accessible inside the decorative wrapper; focus uses a visible halo. The animation is scoped to the admin workspace and is disabled for reduced-motion preference. Switch labels describe the current result, preserve a stable accessible name and can wrap without pushing the thumb off-screen. Artwork uploads remain transparent and borderless.

## Mobile radial action menu

Payments retains its animated Finder border. The open fan uses a full-viewport rgba(10,15,30,0.7) tint and 16 px backdrop blur. Five circular blue/cyan/indigo actions follow a 180-degree elliptical arc. The LoanLedger PH wordmark and Your loans. Your records. All in one place. tagline occupy the inner pocket. Geometry reserves separate icon, label and branding bounds; compact short-screen typography and positioning keep the close control reachable. Entrance is 360 ms with cubic-bezier(0.34,1.56,0.64,1) and 30 ms per-action stagger. Items expand from scale 0.2 at the trigger, branding fades/scales from 0.85, and the × rotates 90 degrees. Exit collapses in 200 ms ease-in without stagger. Reduced motion uses a short opacity fade with no animated transforms or border rotation.
