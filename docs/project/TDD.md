# Technical Design and Verification Document

Baseline: October 14, 2026. “TDD” here denotes the requested Technical Design Document; this project also uses test-driven development when authorized. Software design is in [SDD](SDD.md).

## Technical decisions

| Decision | Reason and consequence |
| --- | --- |
| Same-origin frame with React-owned Auth | Preserve approved borrower UI while keeping tokens outside presentation |
| Server-authorized existing mobile RPC | Centralize ownership, mutation validation and request-key behavior |
| Shared FAQ/legal JSON | Avoid duplicate content in screen, assistant and public policy route |
| FAQ retrieval before provider use | Limit answers to app guidance and supply traceable references |
| OpenRouter free models, server-only | FAQ remains usable; AI requires its own protected key |
| Distinct assistant/lender modes | Prevent automated answers being mistaken for lender communication |
| No new FAQ database table | Versioned content and memory-only assistant history meet current scope |
| Preserve browser download behavior | Website cannot disable native browser download UI or verify completed saving |

## Verification approach

Record a failing behavioral check before a change where practical, implement the fix and repeat the scenario. Evaluate source logic, browser rendering and durable storage separately. Use isolated authorized fixtures with unique identifiers and cleanup; protect actual borrower records.

Provider validation checks request shape, input minimization, free-model restrictions, error fallback and absence of key disclosure. Real requests use general FAQ questions with no private borrower information. Review generated answers against the published references.

## Acceptance matrix

| Area | Required outcome |
| --- | --- |
| Privacy and Terms | Shared dated notices describe account records and AI processing that users can disable |
| Help & Support | Guest and signed-in submissions return durable ticket confirmation; registered email is prefilled |
| FAQ | Search, reversible expansion and references work at narrow widths |
| Pawcheebels | Greetings and general questions reach AI without a FAQ match; app policies remain FAQ-grounded; labels and citations reflect the answer |
| OpenRouter | Own server key, free-only model selection, zero-price limits and FAQ fallback |
| Data handling | Only the question and public FAQ references reach the model provider |
| Lender messages | User-selected Send creates an authenticated account message |
| Downloads | Preparation appears before handoff and Download started remains visible after foreground return |
| Payment cards | Amount, scoped items, dates and advisory switch together with reduced-motion support |

Maintain dated quality records for each release. Evaluate source logic, browser behavior and durable storage separately. Provider contract checks and real provider checks are distinct; generated answers require content review. Build success establishes bundling rather than financial settlement.

## Recovery and timing

Support: validation before sending; pending button; twenty-second bridge timeout; retained draft and idempotent key on retry. Assistant: provider timeout twelve seconds, bridge fifteen, FAQ fallback. Generic bridge: forty-five seconds. Guest screenshot validation: bounded file and image-content verification. Downloads: show preparation before generation/fetch, retain at least 600 ms visible preparation for fast files, then hand off and show Download started.

## Regression matrix

Verify guest → account → guest state isolation; account switch during asynchronous work; stale result handling; duplicate clicks; server response loss after commit; failed attachment; unknown FAQ with AI off; general question with AI on; greeting; irrelevant question-word matches; malformed provider output; denied origin; oversized question; rate/concurrency limit; source-link filter reset; reduced motion; narrow widths; dark appearance; keyboard focus; and native browser handoff.

Release acceptance includes authorized data access, policy review, accessibility, financial status accuracy and device behavior. Evaluate Android Chrome/Edge/Samsung/Firefox and iOS Safari/Chrome/Edge on representative phones.

## Deployment validation

Release matching server and browser assets through the approved deployment process. Reload server processes after server module, FAQ reference or credential changes; refresh browser assets as required. Keep account services available and retain rollback and recovery procedures. UI validation must not reset account databases or alter financial records.


## Assistant recovery and verified QR downloads

Signed-in AI starts enabled and can be switched off. OpenRouter requests remain free-only with zero prompt, completion and request price caps, latency preference and denied provider data collection. The free router and another eligible free model provide bounded failover within a twelve-second request budget. Retired endpoints cool down for five minutes; transient failures cool down for thirty seconds. Successful answers are cached for five minutes per authenticated owner, question digest, FAQ version and preferred model, with at most 200 entries. Private-detail screening occurs before caching and provider access. Daily free quotas and invalid credentials have distinct recovery messages; model switching never bypasses account quotas. External free capacity is not guaranteed.

Receiving QRs use native SVG viewports to retain the bank-export pattern and replace surrounding artwork with a white scanning margin. PNG downloads preserve the decoded bank payment payload. Scan verification compares payload hashes with bank-export evidence rather than treating a decorative QR or matching file size as sufficient. The BPI displayed account number is corrected according to lender confirmation. Browser verification runs on Chromium, Firefox and WebKit with temporary fixture accounts and cleanup; reports distinguish simulated mobile layouts from physical-device acceptance.

## Payment, assistant and browser release checks

The Playwright suite is maintained under [tests/e2e/app.spec.js](../../tests/e2e/app.spec.js) with [playwright.config.js](../../playwright.config.js). The project-contained fixture adapter limits account administration to loopback fixture services. Generated reports and trace artifacts remain outside source control. QR output validation uses an independent decoder and compares payload hashes to the bank-export source, without retaining the raw payment payload in documentation.

Chat acceptance checks compare the input-bar width and height, text size and animated border between destinations in both surfaces, including reduced motion. Dialog checks cover genie opening, dismissal, trigger focus recovery and removal on route navigation. Engine/viewport results do not claim physical-device verification. Business-flow checks use isolated records and retain cleanup outcomes.

## Payment confirmation verification

[Payment confirmation browser checks](../../tests/e2e/payment-confirmation.spec.js) exercise delayed saved responses, no early success, OCR-populated values, manual failure retention, repeated-click prevention, authoritative allocation totals, partial/excess amounts, escaped references, image dimensions, share capabilities, reduced motion, narrow layouts and owner cleanup. These checks use temporary authentication accounts and simulated submission responses; they do not mutate financial rows or send lender notifications. Existing business-flow evidence covers the unchanged save action. Native share destinations and physical phones remain acceptance activities.

## Session continuity verification

The focused session-continuity suite uses temporary authentication fixtures, renews the actual session token, reconfirms the same identity and triggers focus/visibility events. It observes the screen and draft for more than one minute and checks genuine sign-out. These events must not bulk-refresh records. Narrow-width checks measure separation between valid/error feedback and the password control. Fixture accounts are cleaned up; borrower financial records are untouched. Browser results and limitations are recorded in the release evidence. The October 16 admin data/refresh regression registry is maintained in [tests/README.md](../../tests/README.md), with staging parity and verification boundaries in [Admin-Workspace.md](Admin-Workspace.md).

Shared-login verification uses temporary borrower and lender identities through the same screen on localhost and the Wi-Fi address. It covers login from the other role's route, canonical destination after restoration, invalid-password feedback, and successful retry after deliberately stalled Auth and profile requests. Unit checks cover trusted-role routing, deadline cancellation, a stalled response body, non-cooperating fetch and upstream cancellation. The original implementation failed the route test by retaining `/admin` for a borrower and failed the stalled-request test by leaving the form busy without feedback. Record current outcomes in the shared-login report; these tests do not establish the password used in an individual reported attempt or physical-phone acceptance.

## Draft and feedback acceptance scope

Focused browser checks cover failed/successful/restored sign-in, 49 matrix cells, snapshot/OCR DOM continuity, navigation and reload recovery with attachment bytes, failed retry and successful draft removal, concurrent document/general feedback, reduced motion, navigation during pending submission and owner isolation. Payment-save responses are simulated; authentication fixtures are temporary. Physical devices and browser storage eviction remain acceptance scope.

## Numeric reference and proof control verification

Verify short-name padding, same-name concurrent allocations, uniqueness, stability after name change, rejection of manual number replacement, and private allocator permissions. Check borrower screen and PDF account references, green-only Approved proof badges, non-green Pending/Submitted/Rejected/Withdrawn badges, pending-only retract controls, minimum 40 px touch targets, removal of proof-format tiles and three-action alignment at 320/390 px widths, confirmation and busy states, and proof-history updates that preserve draft inputs. Fixture retraction responses are simulated; temporary accounts are removed.

## Login presentation acceptance

Check the borderless transparent form, email feedback above the input, 12 px separation between controls, Protected badge placement and motion, reduced-motion and dark-theme behavior, password visibility, token-method switching and retained logo/footer at 320 px and 390 px widths. Guest UI checks do not submit credentials or create authentication records.

The login header uses the original illustration from the supplied reference screenshot. SVG masks and clips separate the original paper, shield, lock, coin and check-mark pixels for gentle independent motion without replacing the original artwork. A responsive clipped image window displays only its top artwork region; the animated app logo sits beside the live app name and the original corner mark is masked away. The illustration remains decorative to screen readers, with reserved dimensions to avoid a loading layout shift. The live heading, controls and footer remain real app elements.

Illustration plays automatically, with gentler movement when reduced motion is requested. Credential-triggered Protected animation remains disabled for reduced-motion preferences. Clearing either email or password stops Protected animation. Its animation is visual feedback and does not indicate successful authentication.

## Remotion acceptance checks

Verify that the embedded Player advances frames and that actual illustration pixels change between samples, rather than checking CSS animation declarations alone. Check automatic playback, hidden controls and reduced-motion gentler movement, stable header sizing, fields/footers and credential-triggered Protected behavior across browser engines. Confirm that both build entry pages are generated and that the fallback remains available. Guest checks submit no credentials.


## Protected badge readiness

The Protected badge retains its label and changes from a neutral state to a green pill with a shield checkmark when the email format is valid and the password is nonempty. A 1.8-second shield/halo pulse makes that change visible; the checkmark draws on activation. Clearing either field or entering an invalid email resets the badge. A polite accessible status announces only readiness changes. The tooltip explains that sign-in is still required to authenticate; this state does not verify credentials or confirm authentication.

Input and change events update readiness immediately. A login-only 250 ms check detects password manager fills that emit neither event, synchronizing the badge, floating labels and sign-in button. It skips hidden documents, stops on navigation and is replaced rather than duplicated on render. Credential values remain in the existing form DOM and are neither retained nor persisted by the observer.

Reduced-motion preference stops the pulse and checkmark drawing while preserving the green ready state and completed checkmark. Dark appearance uses a contrasting green surface. Placement below the password and the existing input spacing remain.

Focused checks cover valid and invalid email, one-field versus both-field readiness, reset after clearing either field, eventless autofill, sign-in button readiness, actual shield transform changes, visible pill/checkmark/halo styling, accessible status, reduced-motion static feedback and dark appearance. These guest checks use synthetic field values and submit no credentials.


## Dashboard balance status badges

A compact status pill sits beside the active balance card's eyebrow above the amount. Current Balance Due shows ON-SCHEDULE in green when it has no overdue unpaid charges, or PAST DUE in red when any positive unpaid charge has a due date before today. Next Balance Due shows UPCOMING in blue for positive unpaid charges due today or later. If a Next charge has become overdue, PAST DUE takes priority. An empty or credit-only Next balance has no Upcoming badge.

Classification uses only the selected card's positive unpaid charges and valid calendar dates, with today's date in Asia/Manila, matching the dashboard advisory. Paid, refunded, cancelled, zero and negative rows cannot create a past-due or upcoming badge. Due today is not past due; the grace period does not change the overdue date classification.

The colored dot and surrounding halo pulse on a 1.8-second loop through transform and opacity, keeping the text and layout stable. Reduced-motion preference removes the pulse while retaining the status text, color and dot. The badge includes an accessible status label and explanatory tooltip. The compact heading adapts to narrow screens.

The badge belongs to balance-content, so existing tab switches replace it with the selected card's content while retaining the rest of Dashboard. Initial render and later snapshots derive status from current presentation data. The badge does not change transactions, payment allocations or account records.

Acceptance cases include mixed past/future dates, due today, overdue charges within grace, paid/refunded/cancelled rows, credit-only and empty Next balances, active-tab isolation, narrow layouts and reduced-motion static status. This change received source review, JavaScript syntax checking and a production build; no additional browser test was run for this feature.


## Borrower account reveal and copy

Dashboard, personal information and floating chat account labels start masked, showing bullets and only the account number's last four digits. An eye button reveals the full numeric reference and changes to a copy button. Copy writes the exact number, including leading zeros, to the clipboard and gives success or failure feedback while the action remains current. Unassigned accounts show Not assigned without a reveal/copy button.

The four-second conceal timer starts when the copy button is clicked, including clipboard prompts or failures. At expiry the label returns to its last-four mask and the button returns to the reveal icon. A retry replaces the timer. Revealing alone does not start the timer. Navigation, full presentation render, document hiding and page exit reset revealed controls and clear outstanding timers. The existing partial balance-tab switch retains the footer control and its active timer.

The copy action is disabled while pending. Async completion is guarded by the current owner, connected control and operation generation; expired, superseded or detached actions cannot update the new view. Clipboard API is used in secure contexts, with a temporary textarea fallback where needed. The fallback restores focus without scrolling and removes its temporary field. No full number is placed in masked markup, action labels or data attributes, and reveal state is not persisted. The underlying account identifier and saved receipt/disclosure data retain their actual values.

The icon button has a 32px target, keyboard-accessible reveal/copy labels, a focus ring and an explanatory tooltip. Account text can wrap on narrow layouts. Dashboard icons contrast with the balance surface; reduced motion removes their background transition.

Acceptance cases include initial last-four masking, reveal-to-copy icon switching, exact clipboard value, four seconds from copy click, failed/delayed clipboard operations, retry timer replacement, navigation/owner reset, tab switching, keyboard use, narrow layouts and no assigned reference. This change received source review, JavaScript syntax checking and a production build. No new browser tests were added or run for this feature. Earlier presentation checks predate the masked default.

## Aurora integration and illustration transparency


Historical implementation: the free React Bits Aurora background was selected after the owner confirmed they do not have a Pro license. The current update below removes this background and restores the original gradient. The original animated illustration is transparent: its SVG sky and whole-image backdrop are removed, while the original pixel clips for paper, shield, lock, coin and checkmark remain. The platform and decorative curves remain visible. The lock opening, illustration host and iframe document are transparent. The static fallback follows the same foreground composition, so Aurora shows through during loading as well as playback. Branding, form behavior and footers remain intact.

The Protected pill has a minimum height of 24 px, 4 px vertical and 9 px horizontal padding, and a 5 px icon/text gap. Its icon and text use a 14 px line box and share their vertical center. Explicit span font and margin resets prevent form-label styling from shifting the text. Existing valid-email/nonempty-password readiness and reduced-motion behavior continue.

Installed Aurora-JS-TW through the free @react-bits registry using the official shadcn installer. src/components/Aurora.jsx renders WebGL2 directly and adds no runtime dependency. src/login-background/main.jsx mounts LoginAurora with an AuroraFallback boundary. Its CSS imports Tailwind with source(none) and explicitly scans only Aurora.jsx. The earlier Aurora build emitted three entries; the current build emits index.html and login-illustration.html only. syncLoginAuroraBackground creates the presentation layer; sendLoginAuroraTheme sends only the dark-theme boolean. Message handlers validate origin, source window, channel and type. Hidden documents and reduced motion pause Aurora; render errors or missing WebGL leave the parent gradient visible. SVG changes apply to Illustration.jsx and loginArtworkMarkup without editing the original PNG.

## Borrower experience implementation — October 15

The login background returns to the original quiet gradient. Aurora is no longer mounted or included as a build entry. The transparent foreground illustration, automatic Remotion loop, app logo and footers remain. A fresh successful password response starts the authentication matrix while the profile and Dashboard prepare; the first ready borrower snapshot is delivered immediately. The matrix still holds for at least four seconds and fades for 450 ms when data is ready. Failed sign-in does not trigger success feedback. A missing or disabled profile dismisses the matrix. Authentication failures release the pending state. Restored sessions retain their existing continuity behavior.

Revealing a borrower account number starts a fixed four-second conceal deadline. Copying does not extend it, including delayed or failed clipboard requests. Navigation, owner changes, rendering and hidden pages retain the existing conceal safeguards.

Transactions, More → Installment Transactions and Loan Profile offer List and Cards. Cards overlap in a deck with swipe/drag, previous/next buttons and arrow-key navigation. Selecting the active card uses openInstallment and opens the existing schedule. Filters and sorting still determine the visible plans; selection follows a stable loan identity. Drag gestures suppress accidental schedule clicks. Inactive cards are disabled and hidden from accessibility navigation. Empty and single-plan results remain usable. Owner changes reset the presentation and selection; reduced motion removes card transitions.

Changing the language applies immediately throughout borrower screens, dialogs, controls, accessibility labels, feedback, FAQ and policy pages. Curated Tagalog phrases explain the meaning of balances, proof review and installment plans rather than substituting isolated words. Input/option values, numeric data, names, bank names, user messages and issued files keep their originals. Switching back to English restores source UI text. Form nodes are retained so unfinished inputs and attachments are not discarded. FAQ search includes translated questions and answers. New AI questions include a validated language choice; responses are requested in contextual Tagalog and response caching includes the language.

v41224-installment-deck.js adds installmentDeckHTML, initializeInstallmentDecks and the List/Cards adapters. v41224-i18n.js uses reversible text and attribute records, freezes implicit option values before translating labels, skips user-authored message text and preserves numeric service status metadata. Mutation updates are coalesced to animation frames; transform/style changes do not trigger localization scans. public/locales/filipino.json is the compiled phrase source, filipino-content.json holds FAQ/policy translations, and v41224-locale-data.js loads the serialized catalog synchronously. Vite now emits app and illustration entries only. Language messages validate the source frame and origin; they carry only the selected language enum. Server AI caching separates English and Filipino requests.

## Guest support and list status implementation — October 15

Installment list rows and Loan Profile rows use the same shared Fully paid, Past Due and In progress badge as the stacked cards. The badge is right aligned beside the loan title on the same row. Titles may wrap while the status stays on the right. The existing schedule action, filters, financial values and progress calculations continue to supply the view.

Login uses the Dashboard's Manila time-of-day and calendar-occasion greeting selection, including its choice of languages and session rotation. The greeting omits the borrower name and translation control, is centered, and has an obvious scale/glow pulse with an expanding halo. Reduced-motion preference retains static emphasis. The animated illustration, logo, authentication hold, form and footers remain.

Guests on Help & Support and FAQ can return directly to sign-in using a visible back button. Notifications, Profile and bottom account navigation are hidden for unauthenticated users. Signed-in support retains its account navigation.

Support descriptions require at least 10 non-whitespace characters and allow at most 2,000 input characters. A live counter, initial guidance, ready-state feedback, near-limit warning and limit-reached feedback accompany the field. An existing draft over the limit remains editable and cannot be submitted until shortened. The authenticated and guest request bridges validate the same range before sending; guest service validation also caps descriptions at 2,000.

Only a confirmed server response with a ticket number triggers the support confirmation. The immutable snapshot combines actual submitted topic, email, description and optional picture name with captured ticket number, status and creation time. Missing values are omitted. Long descriptions and ticket identifiers wrap. Save Image creates a PNG from the same snapshot, and Share uses native file sharing where available, otherwise a download fallback. PNG preparation gives loading feedback and may fail independently of a saved request. Requests that fail retain their form details and attachment. Pending submissions cannot be duplicated through the submit button. Navigation and account changes dismiss or invalidate confirmation work. User-entered descriptions and identifiers stay original; labels and guidance use contextual Tagalog when selected.

v41224-installment-deck.js now exposes installmentStatusBadge and decorates list titles with installment-list-heading. v41224-support-experience.js supplies login greeting adaptation, character feedback, immutable supportConfirmationModel, supportConfirmationImage and dialog lifecycle. v41224-notifications-documents.js opens the dialog after a confirmed submission and keeps its busy lock through export preparation. VersionedBorrower validates description bounds for both request routes before forwarding. mobileLocalFlow validates signed-in submissions before attachment upload. The source guest service validates the same maximum; deployment must load the updated service module for direct endpoint enforcement. No database migration is required for this presentation update.

## Proactive assistant scheduler — October 15

Pawcheebels displays a dismissible speech bubble beside the existing Dashboard mascot. A welcome invitation appears two seconds after the Dashboard is visible and ready, following the successful-sign-in animation. A bubble stays for ten seconds; keyboard focus inside it pauses removal so an active control is not taken away. A maximum of one additional invitation appears after two minutes without user activity. Pointer, keyboard, input and scroll activity restart that idle deadline. Selecting the bubble opens Ask Pawcheebels without submitting a question. Dismissing an invitation or opening chat stops additional invitations for that sign-in session.

Messages vary among reviewed app-help, payment-proof guidance, installment-schedule navigation and availability invitations. They follow the selected English or contextual Tagalog language and do not claim account lookup, verification, lender decisions or a submitted action. No account details enter the invitation copy. The invitations do not invoke an AI provider or consume a free-model request.

Invitations respect the existing mascot visibility setting and appear on Dashboard only. Authentication/loading overlays, dialogs, account search, editable-field focus, hidden tabs and an offscreen mascot pause or remove them. Returning to the Dashboard starts a fresh visible/idle waiting period. Language and account snapshots can update the screen without replaying a consumed invitation or extending its visible lifetime. A tab-scoped session record stores the account owner and three Boolean presentation flags; sign-out and blocked accounts clear it. Owner changes replace it. Reloading an existing signed-in tab restores the consumed/stopped flags. Reduced motion removes the invitation entrance and sparkle animation. Dark mode and narrow viewports retain readable text and reachable chat/dismiss actions.

v41224-paw-proactive.js implements syncPawProactiveOwner, pawProactiveEligible, reconcilePawProactive, positionPawProactiveBubble, showPawProactiveBubble and stopPawProactive. It wraps existing render, navigation, chat-toggle and FAQ-question entry points. Validated frame messages mark snapshot readiness; authenticatedMatrix presence gates the welcome deadline. Timers and animation frames are cleared on navigation/page hide; callbacks recheck live owner, readiness and eligibility. Mutation observations coalesce into one animation frame and do not observe changing animation attributes. Static English messages are translated through the approved synchronous phrase catalog. The existing chat handles any later user-initiated AI request.

## Shared-login verification outcome — October 16

Twelve shared-login cases pass on the Wi-Fi origin across Chromium, Firefox and WebKit. Six localhost Chromium cases also pass, including session renewal preserving the payment screen/draft and idle/refocus producing no bulk reads while explicit Refresh loads records. Four unit checks, focused ESLint and the final build pass. The initial role and held-request regressions failed before the fix. Test fixtures are removed after verification. Physical-phone acceptance and an individual original password remain outside these checks. Current evidence: workspace `outputs/shared-login/VERIFICATION.md` and `final-results.json`.

## Finder and mobile admin presentation review — October 16

Source review and focused ESLint cover the admin search/bottom navigation component. Production compilation passes with the existing large-chunk advisory. Chrome visual review observed an authenticated desktop dropdown ten pixels under its input, a 390 px mobile document with equal viewport/scroll width, readable results above the fixed bottom bar, all 19 destinations in More, and focus returning to the More button on close. No console errors were reported. The orb's new stylesheet and light/halo presentation were inspected in an isolated public-asset preview without changing account data. Automated tests were not added or run for this presentation task; historical full-suite and shared-login evidence is unchanged. Physical-device smoothness and cross-browser performance remain outside this visual review.

## F43 — Login-access delivery evidence

Focused lint, syntax parsing and bundle compilation passed. Local Auth health returned 200; database inspection confirmed invoker hooks with anonymous execution denied, and the read-only security advisor reported no issues. Chrome visual review used synthetic pop-up state at 320 pixels, including Filipino lock copy and disabled controls. No automated tests or authenticated login/lock/unlock sequence were run. The historical 43-check result predates this change. [Scope and implementation](Login-Access.md).
