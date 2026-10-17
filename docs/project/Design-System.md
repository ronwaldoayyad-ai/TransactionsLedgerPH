# Design System

Baseline: v4.12.24 · October 14, 2026. Applies to the borrower web interface. Existing classic/admin and Expo interfaces have their own components; this is not a claim that every surface has been migrated to identical styling.

## Principles

Keep financial meaning unambiguous, preserve context during updates, use compact readable hierarchy, and make asynchronous outcomes visible. Every color state needs a text or symbol equivalent. Icons should be professional SVG line icons from a consistent visual family; labels identify the action or document.

## Tokens and typography

The later base theme in [borrower-v4.12.24.html](../../public/borrower-v4.12.24.html) defines ink `#172b46`, muted `#61738c`, blue `#2465da`, soft surface `#f0f5fc`, white glass/surface, line `#e3eaf3` and a restrained shadow. Existing interactive features also use accent `#1769f5`. Reuse `--ink`, `--muted`, `--blue`, `--soft`, `--glass`, `--line`, `--surface`, `--shadow` and `--ease`; do not introduce a duplicate undefined token family.

Font stack: platform system sans serif, including Segoe UI on Windows. Primary titles are approximately 24–25 px; content headings 14–17 px; compact row labels/body 11–13 px; supporting metadata 9–11 px. Financial totals are larger and use tabular numerals where implemented. Loan request timeline text follows surrounding detail typography. Principal and prominent totals use stronger weight. Keep text readable when wrapping or device text size changes; compact metadata is not a substitute for essential readable labels.

## Semantic states

| State | Treatment |
| --- | --- |
| Primary action / Submitted | Blue; Submitted `#2563eb` |
| Pending / Under Review | Amber `#b7791f` with label |
| Coordinating with Bank | Violet `#7c3aed` |
| Bank Approved | Cyan `#0891b2` |
| Transfer in Progress | Indigo `#4f46e5` |
| Completed / success | Green `#059669`, check mark |
| Declined / Rejected / error | Red `#dc2626` |
| Canceled / neutral | Slate `#64748b` |
| Payment / credit | Subtle green background and green negative amount |
| Unread | Red badge/dot with optional pulse and accessible context |

## Components

**Cards:** rounded surfaces, light border/shadow, consistent padding and clear dividers. Balance cards retain distinct Current/Next backgrounds; the active selection and amount/items/advisory change as one view.

**Text fields:** label, leading icon where useful, and one outer container focus treatment. Nested input/textarea has no extra border, outline or shadow. Login labels float without changing field height. Validation uses inline text, aria-invalid and an associated description. Keep email/password close while preserving separation from the sign-in method control.

**Buttons:** primary actions use a solid accent; secondary actions have a restrained outline/surface; inline navigation uses clear link treatment. Provide visible focus and disabled/busy states. Minimum hit area should be comfortable on touch devices; compact visual icons must not become tiny isolated targets.

**Download action:** shared SVG arrow/tray and document name such as Proof, Receipt, Invoice or Disbursement. Keep icon and text aligned and allow enough intrinsic width; do not apply icon-only button sizing to a labeled control. Group related proof/receipt actions horizontally when they fit. Animate the icon or preparation spinner while working, respecting reduced motion.

**FAQ:** search container, topic selector, native details/summary answers, five initial questions and reversible expansion. Source references use a small book SVG and the actual question title. FAQ and Submit Request are the two support destinations.

**Pawcheebels:** preserve mascot and movable/resizable panel. Use Ask Pawcheebels and Message lender mode buttons with aria-pressed. Assistant messages identify their source; lender mode retains the existing chat controls. Never render an AI answer as a lender-authored bubble.

## Spacing, motion and lists

Use a compact 4/8/12/16/24 px spacing rhythm as guidance; existing CSS may use intermediate values for alignment. Prefer consistent row gaps to empty vertical space. Long record lists initially show five where applicable; message history has its own twenty-message window. Every expansion control has an inverse action.

Payment card switching uses a 280 ms fade/slide and preserves unrelated dashboard nodes. Reduced motion removes animation. Unread pulses must not clip at container edges. Loading indicators belong to the affected action; successful download feedback says Download started and remains visible across mobile foreground return where implemented.

## Validation checklist

Check light/dark themes, 320/390 px widths, long labels and amounts, visible badges, focus and keyboard behavior, disabled/busy state, reduced motion and modal layering. Use actual-device review for mobile keyboard, browser chrome, scrolling and download UI.
# Transfer destination deck

The dashboard transfer CTA uses a blue-to-violet gradient, a clearly visible glow pulse without moving the button and a horizontally scrolling due-date label. Hover and focus pause the marquee. Five equal-width bank-logo shortcuts sit below the active balance card.

The modal follows surface and ink theme tokens with a compact 8–10 px gap before the card stack. Bank cards use light full-width headers and brand-colored gradients, unboxed official logos in their original colors, confined to a 44 px header, a compact account-details panel and the bank-export QR region with a white scanning margin without added borders, padding or a frame. Inactive cards sit behind the active card with subtle rotation and scale. Pagination buttons have larger hit areas than their visible dots. Use 9–15 px text hierarchy consistent with the borrower frame and preserve visible keyboard focus. All animation respects reduced-motion preferences.

## Chat input bars and receiving-account motion

Ask Pawcheebels and Message lender share the rotating conic-gradient border, rounded input bar, visible focus state and 12 px input text with an 18 px line height. The assistant matches the lender composer dimensions within each surface: the pop-up uses a 29 px circular send control and the Messages screen uses a 34 px control. Conversation space grows with the available pop-up height; the composer remains visible and long message text wraps without horizontal scrolling. Only GCash needs a repeated bank-name label; its official logo is aligned left.

The receiving-account dialog unfolds from the activating transfer control and folds back toward it with a genie-style deformation. Opening lasts 560 ms and closing lasts 420 ms. Closing during opening reverses the active animation from its current position; it does not restart from a fully open state. The backdrop fades with the dialog. Escape, close and outside dismissal use the closing transition; navigation removes the dialog immediately so it cannot block the destination. Reduced-motion preferences open and close instantly. Focus returns to the activating control.

Receiving-account motion uses a stable native overlay with an animated inner panel. Keep the final transform layer after opening and avoid simultaneous card transitions while the panel unfolds; the opening end must settle without a layout jump.


## Payment confirmation pattern

Use a 360 px maximum-width dialog within the viewport, 23 px outer corners, 16 px information-card corners, and a muted background. Use a 44 px green check, 16 px heading, 27 px amount, compact 10–12 px data and 9 px supporting copy. Green indicates saved submission/covered amount, amber indicates partial coverage, and blue identifies excess submitted. Review status stays Submitted for review. Save Image and Share use icon/text controls with visible focus and busy states; a brief entrance transition stops for reduced motion. The image export uses a clean light receipt presentation independent of appearance preference.

## Login validation spacing

The login form uses a transparent, borderless surface without a card shadow. Email validation appears above the email control with a reserved 16 px line and 6 px separation; wrapped messages expand naturally. Email and password controls have a 12 px gap. The empty validation slot keeps 24 px between the method tabs and email control. The Protected badge sits 6 px below the password, with a green ready state, shield checkmark and visible halo pulse when the email format is valid and the password is filled. Reduced-motion preferences disable badge movement. Existing app-logo animation, help link and footer content remain in place.

## Pulse matrix and magnetic feedback

Successful sign-in uses a blue wallet brand tile over a 7×7 grid with diagonal, sequenced pulse delays. Magnetic feedback uses four colored dots with 120 ms stagger, elastic transform motion, a compact status pill and a 240 ms reveal threshold to avoid quick-request flashes. Its nonblocking layer yields to document progress. Reduced motion removes dot/grid movement and preserves the four-second hold and removes grid movement.

## Proof status palette

Approved is green (#087347), Pending is amber (#a0600a), Submitted is blue (#205ecd), Under review is purple (#7251a6), Rejected is red (#b92f45), and Withdrawn/Canceled is slate (#627087). Unknown proof states use neutral styling. Green proof badges require Approved. Retract proof uses a red tint, undo icon, clear text, 40 px minimum height and visible focus. Dark-mode variants preserve the semantic colors.

Recent Payments gives payment details the full available width without a proof-format tile. Proof, Receipt and eligible Retract proof actions share one row with a minimum 40 px height, compact icons and text, and a slightly wider retract control. Labels remain visible at narrow phone widths.

The login header uses the original illustration from the supplied reference screenshot. SVG masks and clips separate the original paper, shield, lock, coin and check-mark pixels for gentle independent motion without replacing the original artwork. A responsive clipped image window displays only its top artwork region; the animated app logo sits beside the live app name and the original corner mark is masked away. The illustration remains decorative to screen readers, with reserved dimensions to avoid a loading layout shift. The live heading, controls and footer remain real app elements.

Illustration plays automatically, with gentler movement when reduced motion is requested. Credential-triggered Protected animation remains disabled for reduced-motion preferences. Clearing either email or password stops Protected animation. Its animation is visual feedback and does not indicate successful authentication.

## Remotion illustration playback

The login illustration uses Remotion Player with an eight-second, 30 fps repeating composition. Frame-driven SVG transforms move the original paper, shield, lock, coin and check-mark pixels by visibly larger amounts than the former two-pixel CSS drift. Playback controls are completely hidden. The silent loop starts automatically; reduced-motion preferences reduce its movement amplitude. Off-screen or hidden playback pauses. The static artwork remains visible during loading or playback failure.


## Protected badge readiness

The Protected badge retains its label and changes from a neutral state to a green pill with a shield checkmark when the email format is valid and the password is nonempty. A 1.8-second shield/halo pulse makes that change visible; the checkmark draws on activation. Clearing either field or entering an invalid email resets the badge. A polite accessible status announces only readiness changes. The tooltip explains that sign-in is still required to authenticate; this state does not verify credentials or confirm authentication.

Input and change events update readiness immediately. A login-only 250 ms check detects password manager fills that emit neither event, synchronizing the badge, floating labels and sign-in button. It skips hidden documents, stops on navigation and is replaced rather than duplicated on render. Credential values remain in the existing form DOM and are neither retained nor persisted by the observer.

Reduced-motion preference stops the pulse and checkmark drawing while preserving the green ready state and completed checkmark. Dark appearance uses a contrasting green surface. Placement below the password and the existing input spacing remain.


## Dashboard balance status badges

A compact status pill sits beside the active balance card's eyebrow above the amount. Current Balance Due shows ON-SCHEDULE in green when it has no overdue unpaid charges, or PAST DUE in red when any positive unpaid charge has a due date before today. Next Balance Due shows UPCOMING in blue for positive unpaid charges due today or later. If a Next charge has become overdue, PAST DUE takes priority. An empty or credit-only Next balance has no Upcoming badge.

Classification uses only the selected card's positive unpaid charges and valid calendar dates, with today's date in Asia/Manila, matching the dashboard advisory. Paid, refunded, cancelled, zero and negative rows cannot create a past-due or upcoming badge. Due today is not past due; the grace period does not change the overdue date classification.

The colored dot and surrounding halo pulse on a 1.8-second loop through transform and opacity, keeping the text and layout stable. Reduced-motion preference removes the pulse while retaining the status text, color and dot. The badge includes an accessible status label and explanatory tooltip. The compact heading adapts to narrow screens.

The badge belongs to balance-content, so existing tab switches replace it with the selected card's content while retaining the rest of Dashboard. Initial render and later snapshots derive status from current presentation data. The badge does not change transactions, payment allocations or account records.


## Borrower account reveal and copy

Dashboard, personal information and floating chat account labels start masked, showing bullets and only the account number's last four digits. An eye button reveals the full numeric reference and changes to a copy button. Copy writes the exact number, including leading zeros, to the clipboard and gives success or failure feedback while the action remains current. Unassigned accounts show Not assigned without a reveal/copy button.

The four-second conceal timer starts when the copy button is clicked, including clipboard prompts or failures. At expiry the label returns to its last-four mask and the button returns to the reveal icon. A retry replaces the timer. Revealing alone does not start the timer. Navigation, full presentation render, document hiding and page exit reset revealed controls and clear outstanding timers. The existing partial balance-tab switch retains the footer control and its active timer.

The copy action is disabled while pending. Async completion is guarded by the current owner, connected control and operation generation; expired, superseded or detached actions cannot update the new view. Clipboard API is used in secure contexts, with a temporary textarea fallback where needed. The fallback restores focus without scrolling and removes its temporary field. No full number is placed in masked markup, action labels or data attributes, and reveal state is not persisted. The underlying account identifier and saved receipt/disclosure data retain their actual values.

The icon button has a 32px target, keyboard-accessible reveal/copy labels, a focus ring and an explanatory tooltip. Account text can wrap on narrow layouts. Dashboard icons contrast with the balance surface; reduced motion removes their background transition.

## Aurora background and transparent illustration


Historical implementation: the free React Bits Aurora background was selected after the owner confirmed they do not have a Pro license. The current update below removes this background and restores the original gradient. The original animated illustration is transparent: its SVG sky and whole-image backdrop are removed, while the original pixel clips for paper, shield, lock, coin and checkmark remain. The platform and decorative curves remain visible. The lock opening, illustration host and iframe document are transparent. The static fallback follows the same foreground composition, so Aurora shows through during loading as well as playback. Branding, form behavior and footers remain intact.

The Protected pill has a minimum height of 24 px, 4 px vertical and 9 px horizontal padding, and a 5 px icon/text gap. Its icon and text use a 14 px line box and share their vertical center. Explicit span font and margin resets prevent form-label styling from shifting the text. Existing valid-email/nonempty-password readiness and reduced-motion behavior continue.

Aurora uses blue #1769f5, teal #08b996 and violet #6757d6, with light/dark opacity 0.38/0.60, speed 0.45, two layers and a 1.25 pixel ratio. A soft static gradient remains behind the canvas. The background is decorative, has no pointer interaction or controls, and freezes for reduced motion.

## Original login background and installment deck

The login background returns to the original quiet gradient. Aurora is no longer mounted or included as a build entry. The transparent foreground illustration, automatic Remotion loop, app logo and footers remain. A fresh successful password response starts the authentication matrix while the profile and Dashboard prepare; the first ready borrower snapshot is delivered immediately. The matrix still holds for at least four seconds and fades for 450 ms when data is ready. Failed sign-in does not trigger success feedback. A missing or disabled profile dismisses the matrix. Authentication failures release the pending state. Restored sessions retain their existing continuity behavior.

Revealing a borrower account number starts a fixed four-second conceal deadline. Copying does not extend it, including delayed or failed clipboard requests. Navigation, owner changes, rendering and hidden pages retain the existing conceal safeguards.

Transactions, More → Installment Transactions and Loan Profile offer List and Cards. Cards overlap in a deck with swipe/drag, previous/next buttons and arrow-key navigation. Selecting the active card uses openInstallment and opens the existing schedule. Filters and sorting still determine the visible plans; selection follows a stable loan identity. Drag gestures suppress accidental schedule clicks. Inactive cards are disabled and hidden from accessibility navigation. Empty and single-plan results remain usable. Owner changes reset the presentation and selection; reduced motion removes card transitions.

Changing the language applies immediately throughout borrower screens, dialogs, controls, accessibility labels, feedback, FAQ and policy pages. Curated Tagalog phrases explain the meaning of balances, proof review and installment plans rather than substituting isolated words. Input/option values, numeric data, names, bank names, user messages and issued files keep their originals. Switching back to English restores source UI text. Form nodes are retained so unfinished inputs and attachments are not discarded. FAQ search includes translated questions and answers. New AI questions include a validated language choice; responses are requested in contextual Tagalog and response caching includes the language.

The deck uses rounded pale-blue cards, a clear principal amount, progress bar and status pill. A restrained fan exposes the next plans. Tagalog cards have additional vertical room for wrapped labels. The Protected pill keeps its centered icon and text.

## Greeting pulse and support confirmation patterns

Installment list rows and Loan Profile rows use the same shared Fully paid, Past Due and In progress badge as the stacked cards. The badge is right aligned beside the loan title on the same row. Titles may wrap while the status stays on the right. The existing schedule action, filters, financial values and progress calculations continue to supply the view.

Login uses the Dashboard's Manila time-of-day and calendar-occasion greeting selection, including its choice of languages and session rotation. The greeting omits the borrower name and translation control, is centered, and has an obvious scale/glow pulse with an expanding halo. Reduced-motion preference retains static emphasis. The animated illustration, logo, authentication hold, form and footers remain.

Guests on Help & Support and FAQ can return directly to sign-in using a visible back button. Notifications, Profile and bottom account navigation are hidden for unauthenticated users. Signed-in support retains its account navigation.

Support descriptions require at least 10 non-whitespace characters and allow at most 2,000 input characters. A live counter, initial guidance, ready-state feedback, near-limit warning and limit-reached feedback accompany the field. An existing draft over the limit remains editable and cannot be submitted until shortened. The authenticated and guest request bridges validate the same range before sending; guest service validation also caps descriptions at 2,000.

Only a confirmed server response with a ticket number triggers the support confirmation. The immutable snapshot combines actual submitted topic, email, description and optional picture name with captured ticket number, status and creation time. Missing values are omitted. Long descriptions and ticket identifiers wrap. Save Image creates a PNG from the same snapshot, and Share uses native file sharing where available, otherwise a download fallback. PNG preparation gives loading feedback and may fail independently of a saved request. Requests that fail retain their form details and attachment. Pending submissions cannot be duplicated through the submit button. Navigation and account changes dismiss or invalidate confirmation work. User-entered descriptions and identifiers stay original; labels and guidance use contextual Tagalog when selected.

List title and badge share a flexible horizontal row. Status colors are reused from Cards. The support confirmation reuses the rounded payment confirmation surface, success check, captured-detail sections and sticky Save Image/Share action footer.

## Pawcheebels speech bubble

Pawcheebels displays a dismissible speech bubble beside the existing Dashboard mascot. A welcome invitation appears two seconds after the Dashboard is visible and ready, following the successful-sign-in animation. A bubble stays for ten seconds; keyboard focus inside it pauses removal so an active control is not taken away. A maximum of one additional invitation appears after two minutes without user activity. Pointer, keyboard, input and scroll activity restart that idle deadline. Selecting the bubble opens Ask Pawcheebels without submitting a question. Dismissing an invitation or opening chat stops additional invitations for that sign-in session.

Messages vary among reviewed app-help, payment-proof guidance, installment-schedule navigation and availability invitations. They follow the selected English or contextual Tagalog language and do not claim account lookup, verification, lender decisions or a submitted action. No account details enter the invitation copy. The invitations do not invoke an AI provider or consume a free-model request.

Invitations respect the existing mascot visibility setting and appear on Dashboard only. Authentication/loading overlays, dialogs, account search, editable-field focus, hidden tabs and an offscreen mascot pause or remove them. Returning to the Dashboard starts a fresh visible/idle waiting period. Language and account snapshots can update the screen without replaying a consumed invitation or extending its visible lifetime. A tab-scoped session record stores the account owner and three Boolean presentation flags; sign-out and blocked accounts clear it. Owner changes replace it. Reloading an existing signed-in tab restores the consumed/stopped flags. Reduced motion removes the invitation entrance and sparkle animation. Dark mode and narrow viewports retain readable text and reachable chat/dismiss actions.

Use a rounded pale-blue speech bubble with a tail toward the mascot, a prominent Pawcheebels name, short help text, Let’s chat affordance and separate close button. Position it within the phone viewport without resizing the underlying Dashboard.
