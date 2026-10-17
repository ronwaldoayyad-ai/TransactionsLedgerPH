# User Interface Requirements Document

Baseline: October 14, 2026. [Design-System](Design-System.md) defines reusable treatment; [user-flow](user-flow.md) describes navigation.

## Structure and hierarchy

Every primary screen has a clear title, short explanatory subtitle, relevant account context and consistent legal footer. The borrower bottom navigation provides the main areas. More and Profile & Settings group account features without repeating every control. Help & Support has two child destinations: FAQ and Submit Request. The same two-item navigation appears on the support pages, including before login.

Use heading → summary → content → action order. Separate transaction date from due date. Keep the original principal visually stronger than installment progress metadata. Align icons with the label’s visual center. Long names, document labels and status descriptions must wrap without hiding the amount or clipping the action.

## Screen requirements

| Screen | Layout and interaction |
| --- | --- |
| Login | Borderless form; email validation above the email control; 12 px email/password gap; floating labels and password visibility control; Protected badge with green readiness, checkmark and pulse after a valid email format and filled password; existing logo animation and footers |
| Dashboard | Current/Next selector, amount, item count and dates; reversible expansion; advisory immediately relates to active card |
| Transactions | Search and sort; Installment before Straight; five initial rows where available; clear principal, credit and status treatment |
| Loan request | Request summary and expandable details; complete schedule; History Timeline typography aligned with other details |
| Documents | Document-name download button with shared SVG; proof and receipt actions share a row when space permits |
| Notifications | Search and category destinations; compact unread badges; Reply, Download attachment and one reaction trigger |
| Settings | Active Loans and Next Payment summaries use consistent three-row hierarchy; next-payment action opens the dashboard group |
| Submit Request | Topic, contact email, description, optional screenshot, inline errors and visible submission confirmation/history |
| FAQ | Search, topic selector, five visible expandable questions, reversible Show more/fewer and assistant beneath |
| Pawcheebels | Ask Pawcheebels/Message lender modes; explicit answer source and status; readable bounded conversation |

## Focus and feedback

Search inputs retain focus while results change. Finder collapses to its orb when focus leaves it; there is no manual minimize control. A field container may show a focus ring, but the nested text input must not show a second border. Labels, autocomplete and input modes should match the task.

Submit errors appear near the form and retain input. Pending buttons expose disabled and aria-busy states. Status messages use live regions without blocking normal navigation. Toasts are visible above the active modal or near the visual viewport on mobile, dismissible where implemented, and distinguish download start from completed saving.

## Accessibility and motion

Use native buttons, labels, input/select controls and details/summary for FAQ. Expose text beside icons and accessible names for icon-only actions. Unread/status meaning uses labels or symbols as well as color. Keyboard users must be able to navigate menus, expand questions, submit forms and follow references. Respect reduced-motion preferences for animation and smooth scrolling where implemented. Avoid moving a focused control to another DOM parent during interactions.

The new screens are checked at 390 px and 320 px mobile widths. This establishes focused layout behavior, not full accessibility certification. Physical phones, screen readers, browser zoom, translated content and enlarged text require additional acceptance checks.

## Proof-submission confirmation

Use a compact, responsive light/dark dialog with a top-left close control, green success check, prominent amount, rounded information cards, and sticky Save Image/Share actions. The captured payment date precedes reference and submission time. Payment details use compact typography matching My Payment. Reconciliation emphasizes the difference amount and keeps review status explicit. Missing bank/account rows occupy no space. Long references wrap; keyboard focus and reduced motion are supported.

## Retained payment draft UI

A compact draft notice identifies retained, unsubmitted content and offers Discard draft with confirmation. Changed allocation items require review. Submission fields lock while saving, with retry available after failure. General magnetic dots provide nonblocking feedback, while the successful-authentication pulse grid briefly covers the sign-in transition.

## Account number and retract UI

Present the complete numeric borrower account reference with leading zeros and compact tabular text. Retract proof uses a labelled undo icon, red-tinted background, visible border, keyboard focus and a minimum 40 px touch target. Recent Payments omits the proof-format tile and places Proof, Receipt and Retract proof on one line. The latest-proof panel retains its full-width retract action. The retract action is hidden for approved, rejected or withdrawn proofs.

The login header uses the original illustration from the supplied reference screenshot. SVG masks and clips separate the original paper, shield, lock, coin and check-mark pixels for gentle independent motion without replacing the original artwork. A responsive clipped image window displays only its top artwork region; the animated app logo sits beside the live app name and the original corner mark is masked away. The illustration remains decorative to screen readers, with reserved dimensions to avoid a loading layout shift. The live heading, controls and footer remain real app elements.

Illustration plays automatically, with gentler movement when reduced motion is requested. Credential-triggered Protected animation remains disabled for reduced-motion preferences. Clearing either email or password stops Protected animation. Its animation is visual feedback and does not indicate successful authentication.

## Automatic illustration playback

The header plays its silent illustration automatically without playback controls. Paper floats, the shield sways, the lock and coin bob, and the check mark pulses visibly. Reduced-motion preferences select gentler movement while the loop continues. The form remains usable while artwork loads.


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

## Login background continuity


Historical implementation: the free React Bits Aurora background was selected after the owner confirmed they do not have a Pro license. The current update below removes this background and restores the original gradient. The original animated illustration is transparent: its SVG sky and whole-image backdrop are removed, while the original pixel clips for paper, shield, lock, coin and checkmark remain. The platform and decorative curves remain visible. The lock opening, illustration host and iframe document are transparent. The static fallback follows the same foreground composition, so Aurora shows through during loading as well as playback. Branding, form behavior and footers remain intact.

The Protected pill has a minimum height of 24 px, 4 px vertical and 9 px horizontal padding, and a 5 px icon/text gap. Its icon and text use a 14 px line box and share their vertical center. Explicit span font and margin resets prevent form-label styling from shifting the text. Existing valid-email/nonempty-password readiness and reduced-motion behavior continue.

The illustration must have no opaque rectangle above the app name. The Aurora layer sits behind the entire login content and cannot intercept form input. The animated objects remain recognizable above the blue/teal/violet background.

## Restored login, installment cards and Tagalog UI

The login background returns to the original quiet gradient. Aurora is no longer mounted or included as a build entry. The transparent foreground illustration, automatic Remotion loop, app logo and footers remain. A fresh successful password response starts the authentication matrix while the profile and Dashboard prepare; the first ready borrower snapshot is delivered immediately. The matrix still holds for at least four seconds and fades for 450 ms when data is ready. Failed sign-in does not trigger success feedback. A missing or disabled profile dismisses the matrix. Authentication failures release the pending state. Restored sessions retain their existing continuity behavior.

Revealing a borrower account number starts a fixed four-second conceal deadline. Copying does not extend it, including delayed or failed clipboard requests. Navigation, owner changes, rendering and hidden pages retain the existing conceal safeguards.

Transactions, More → Installment Transactions and Loan Profile offer List and Cards. Cards overlap in a deck with swipe/drag, previous/next buttons and arrow-key navigation. Selecting the active card uses openInstallment and opens the existing schedule. Filters and sorting still determine the visible plans; selection follows a stable loan identity. Drag gestures suppress accidental schedule clicks. Inactive cards are disabled and hidden from accessibility navigation. Empty and single-plan results remain usable. Owner changes reset the presentation and selection; reduced motion removes card transitions.

Changing the language applies immediately throughout borrower screens, dialogs, controls, accessibility labels, feedback, FAQ and policy pages. Curated Tagalog phrases explain the meaning of balances, proof review and installment plans rather than substituting isolated words. Input/option values, numeric data, names, bank names, user messages and issued files keep their originals. Switching back to English restores source UI text. Form nodes are retained so unfinished inputs and attachments are not discarded. FAQ search includes translated questions and answers. New AI questions include a validated language choice; responses are requested in contextual Tagalog and response caching includes the language.

## Login greeting, installment list status and support confirmation

Installment list rows and Loan Profile rows use the same shared Fully paid, Past Due and In progress badge as the stacked cards. The badge is right aligned beside the loan title on the same row. Titles may wrap while the status stays on the right. The existing schedule action, filters, financial values and progress calculations continue to supply the view.

Login uses the Dashboard's Manila time-of-day and calendar-occasion greeting selection, including its choice of languages and session rotation. The greeting omits the borrower name and translation control, is centered, and has an obvious scale/glow pulse with an expanding halo. Reduced-motion preference retains static emphasis. The animated illustration, logo, authentication hold, form and footers remain.

Guests on Help & Support and FAQ can return directly to sign-in using a visible back button. Notifications, Profile and bottom account navigation are hidden for unauthenticated users. Signed-in support retains its account navigation.

Support descriptions require at least 10 non-whitespace characters and allow at most 2,000 input characters. A live counter, initial guidance, ready-state feedback, near-limit warning and limit-reached feedback accompany the field. An existing draft over the limit remains editable and cannot be submitted until shortened. The authenticated and guest request bridges validate the same range before sending; guest service validation also caps descriptions at 2,000.

Only a confirmed server response with a ticket number triggers the support confirmation. The immutable snapshot combines actual submitted topic, email, description and optional picture name with captured ticket number, status and creation time. Missing values are omitted. Long descriptions and ticket identifiers wrap. Save Image creates a PNG from the same snapshot, and Share uses native file sharing where available, otherwise a download fallback. PNG preparation gives loading feedback and may fail independently of a saved request. Requests that fail retain their form details and attachment. Pending submissions cannot be duplicated through the submit button. Navigation and account changes dismiss or invalidate confirmation work. User-entered descriptions and identifiers stay original; labels and guidance use contextual Tagalog when selected.

## Dashboard assistant invitations

Pawcheebels displays a dismissible speech bubble beside the existing Dashboard mascot. A welcome invitation appears two seconds after the Dashboard is visible and ready, following the successful-sign-in animation. A bubble stays for ten seconds; keyboard focus inside it pauses removal so an active control is not taken away. A maximum of one additional invitation appears after two minutes without user activity. Pointer, keyboard, input and scroll activity restart that idle deadline. Selecting the bubble opens Ask Pawcheebels without submitting a question. Dismissing an invitation or opening chat stops additional invitations for that sign-in session.

Messages vary among reviewed app-help, payment-proof guidance, installment-schedule navigation and availability invitations. They follow the selected English or contextual Tagalog language and do not claim account lookup, verification, lender decisions or a submitted action. No account details enter the invitation copy. The invitations do not invoke an AI provider or consume a free-model request.

Invitations respect the existing mascot visibility setting and appear on Dashboard only. Authentication/loading overlays, dialogs, account search, editable-field focus, hidden tabs and an offscreen mascot pause or remove them. Returning to the Dashboard starts a fresh visible/idle waiting period. Language and account snapshots can update the screen without replaying a consumed invitation or extending its visible lifetime. A tab-scoped session record stores the account owner and three Boolean presentation flags; sign-out and blocked accounts clear it. Owner changes replace it. Reloading an existing signed-in tab restores the consumed/stopped flags. Reduced motion removes the invitation entrance and sparkle animation. Dark mode and narrow viewports retain readable text and reachable chat/dismiss actions.
