# Borrower Dashboard shortcuts

Updated October 16, 2026.

## Behavior

The borrower Dashboard uses a single floating orb for Finder, Pawcheebels and Message lender. Selecting an option closes the quarter-circle fan and opens its existing interface. The orb changes to a dismiss icon while open. Backdrop tapping or Escape closes the menu, with focus returned to the orb. The native dialog contains keyboard focus and arrow keys move between actions.

Pawcheebels retains its welcome and idle reminders, anchored to this orb. Opening chat or dismissing a proactive message stops further prompts for that login session. The combined launcher appears only on Dashboard. Existing chat drafts, Finder behavior and lender communication remain supported.

## Compact presentation

Actions are 44 pixels high, with 25 pixel icons and reduced horizontal padding. The fan uses a 144 pixel vertical reach and 140 pixel leftward reach, adjusted to the viewport. Labels can wrap for contextual Tagalog translations. Transform and opacity transitions provide staggered opening, reverse closing and selection feedback. Reduced-motion preferences disable continuous decoration and shorten transitions.

## Implementation

- [Dashboard orb controller](../../public/v41224-dashboard-orbit.js)
- [Dashboard orb presentation](../../public/v41224-dashboard-orbit.css)
- [Proactive message anchoring](../../public/v41224-paw-proactive.js)
- [Borrower document](../../public/borrower-v4.12.24.html)

## Review evidence and limits

Chrome DevTools visual review used synthetic display data in an isolated standalone borrower document. The compact fan was inspected at 390 × 844 and 320 × 740, including Tagalog labels. Earlier manual interactions opened the existing Finder, assistant and lender interfaces. The lender input focus target was corrected to `chatDraft`. No financial records, actual account credentials, outgoing messages or AI requests were used. No automated tests were added or run for this presentation change. Full authenticated acceptance remains separate from this visual review.

Local staging receives static asset copies without a server restart. With live reload disabled, reload the page once to load the updated assets.

## Settings cleanup — October 16, 2026

The Floating chat mascot toggle is removed from Settings now that Dashboard actions share the combined orb. Other settings and existing shortcut destinations are preserved.
