# Software Design Document

Baseline: October 14, 2026. Companion: [TDD](TDD.md). Requirements: [SRS](SRS.md).

## Design responsibilities

| Module | Responsibility |
| --- | --- |
| [App.jsx](../../src/App.jsx) | Providers, role-guarded React routes and classic/admin pages |
| [VersionedBorrower.jsx](../../src/components/VersionedBorrower.jsx) | Same-origin borrower frame, authentication bridge, account snapshot and allowed actions |
| [borrower-v4.12.24.html](../../public/borrower-v4.12.24.html) | Base borrower markup, navigation, screen functions and shared interface |
| [Borrower data adapter](../../public/v41224-staging-adapter.js) | Map authenticated data to the presentation and gate guest navigation |
| [v41224-enhancements.js](../../public/v41224-enhancements.js) | Current card scope, sorting, expandable lists, date/rate display and interaction improvements |
| [Borrower action bridge](../../public/v41224-local-flows.js) | Request/response bridge, durable actions, request keys, form preservation and owner resets |
| [v41224-notifications-documents.js](../../public/v41224-notifications-documents.js) | Timeline, notifications, support confirmation and document feedback |
| [v41224-login.js](../../public/v41224-login.js) | Floating labels, field validation and login interaction |
| [v41224-mobile-feedback.js](../../public/v41224-mobile-feedback.js) | Download handoff and mobile-visible toast lifecycle |
| [v41224-help.js](../../public/v41224-help.js) | Support submenu, FAQ, shared legal rendering and Pawcheebels modes |
| [Authenticated action client](../../src/lib/mobileLocalFlow.js) | Authenticated RPC calls, upload validation, extras and attachment cache |
| [Companion request service](../../server/local-flow-service.cjs) | Token validation, guest support, upload validation and active-user checks |
| [pawcheebels.cjs](../../server/pawcheebels.cjs) | Trusted FAQ retrieval, optional provider call and bounded fallback |

## Loading and state

Presentation scripts are classic scripts loaded after the inline base screen logic. Their wrappers extend established functions in sequence. New optional screens are resolved when selected rather than referenced before their script is loaded. FAQ and legal JSON load once; their pages show a loading/retry state if needed. A changed account clears support and assistant drafts and invalidates owner-scoped state.

React remains the owner of Auth and data subscriptions. The frame receives an account snapshot without credentials. Generation checks prevent a response for an old account from being applied to a new one. The existing extras poll runs every ten seconds while the document is visible and data is ready, with overlap guards; unchanged snapshots are suppressed before presentation updates. This is not a claim that all app rendering has been eliminated.

Card switching updates card content and advisory together rather than rebuilding the dashboard. FAQ search replaces its results only, preserving the input. Assistant updates replace its own pane and retain twenty messages in memory. AI questions and lender messages use separate handlers.

## Content model

[faq-knowledge.json](../../public/faq-knowledge.json) is the shared, versioned FAQ source. Browser and server retrieval normalize words, remove common stop words and rank matches in question/keywords above answer text. Up to three entries become references. This is lexical retrieval, not a vector database or a trained custom model. With AI enabled, a missing FAQ match does not block a general question. FAQ-only questions outside the knowledge base yield a support route. Stable FAQ IDs allow reference links to reopen the matching answer.

[legal-content.json](../../public/legal-content.json) supplies the borrower legal screens and public React privacy route. A shared source keeps record handling, account servicing and AI-processing notices consistent. Operations maintains the applicable retention and contact information.

## Optional AI design

The client enables AI by default for signed-in users and honors their off choice for subsequent questions. React attaches its bearer token to the companion API; the token is never sent to the AI provider. The server validates active-user access and retrieves FAQ references itself. OpenRouter receives only the question and public FAQ text through its HTTPS Chat Completions endpoint. Only openrouter/free or a :free variant is accepted; provider price caps are zero for prompt, completion and request pricing. The default model is OpenRouter's free-model router, provider sorting prioritizes latency, optional reasoning is disabled and answers are requested in fewer than 90 words. Provider data collection is requested as deny. Output is bounded to 600 tokens and requests cancel after twelve seconds.

The model may answer greetings and general knowledge from its general knowledge. App policies, fees and workflows must use the approved references; uncovered app-specific details route to support. It has no financial action tools. FAQ fallback handles absent configuration, private-detail patterns, provider failures, missing/incomplete output and timeout. Source links represent supplied FAQ references; they do not constitute a mathematical guarantee that generated text is grounded. Live provider evaluation remains necessary after configuration.

## Durable actions

Support confirmation merges the returned persisted row into immediate account history before later extras synchronization. Failed and timed-out requests retain the draft and key. Guest support uses a database transaction, retry-key uniqueness and optional private Storage upload; signed-in actions use the existing RPC. User-generated invoice deletion is soft deletion, preserving history. Assistant conversation is not persisted in the database, and the new FAQ feature creates no schema changes.

## Design trade-offs

The presentation-wrapper architecture makes script ordering significant. Avoid broad page replacement while a user edits a form. Host the companion APIs alongside the web interface with server-only configuration and authentication. Static FAQ content is reviewed and versioned with releases. AI availability and generated accuracy can vary; FAQ remains the available baseline.
# Transfer-account presentation module

`public/v41224-transfer-accounts.js` decorates the existing dashboard balance markup and renders a native dialog containing five bank cards. Its static receiving-account configuration preserves strings and leading zeroes. `public/assets/transfer-accounts/` stores unchanged lender-provided logos and QR files; these public receiving assets are excluded from the project graph's private-asset scan. They are not borrower account records.

The Pay-by helper reads the existing active-card transaction scope and selects its latest positive unpaid date. It never changes amounts, dates or allocations. Pointer gestures use horizontal intent detection, pointer capture, animation-frame updates and distance/velocity thresholds. Card positions use CSS transforms, and inactive cards are inert. Downloads capture the currently selected account before fetching its QR and call the shared download helper, retaining loading and foreground-restored feedback. Native dialog behavior and explicit dismissal restore prior focus. Navigation closes the dialog.


## Assistant recovery and verified QR downloads

Signed-in AI starts enabled and can be switched off. OpenRouter requests remain free-only with zero prompt, completion and request price caps, latency preference and denied provider data collection. The free router and another eligible free model provide bounded failover within a twelve-second request budget. Retired endpoints cool down for five minutes; transient failures cool down for thirty seconds. Successful answers are cached for five minutes per authenticated owner, question digest, FAQ version and preferred model, with at most 200 entries. Private-detail screening occurs before caching and provider access. Daily free quotas and invalid credentials have distinct recovery messages; model switching never bypasses account quotas. External free capacity is not guaranteed.

Receiving QRs use native SVG viewports to retain the bank-export pattern and replace surrounding artwork with a white scanning margin. PNG downloads preserve the decoded bank payment payload. Scan verification compares payload hashes with bank-export evidence rather than treating a decorative QR or matching file size as sufficient. The BPI displayed account number is corrected according to lender confirmation. Browser verification runs on Chromium, Firefox and WebKit with temporary fixture accounts and cleanup; reports distinguish simulated mobile layouts from physical-device acceptance.

## Receiving-account presentation and transition lifecycle

Public receiving assets use the official bank SVG logos without recoloring. Each QR asset is a native SVG viewport containing the bank-export JPEG pixels, clipped to the QR region with its white scanning quiet zone. PNG export draws that asset at natural resolution. The supplied source QR payload is preserved; the interface adds no decorative QR border. Account numbers remain strings so leading zeroes survive copying.

The dialog's Web Animations API keyframes combine translation toward the captured trigger position, nonuniform scale and continuously sampled trapezoidal clipping. The modal remains active while dismissing and is removed on completion. Repeated dismissal is guarded; navigation bypasses animation and removes it immediately. Reduced-motion and unsupported-animation paths remove or show immediately. Chat composer markup reuses the lender composer class, and scoped dimensions distinguish the pop-up from the full Messages view.

The native dialog and backdrop keep a stable layout while the inner receiving-account panel animates. Final animation styles are committed before removing the animation, with a persistent GPU transform layer to avoid an opening-end snap. Card transitions pause during opening; focus uses preventScroll. Early dismissal reverses the active animation from its current position.


## Payment confirmation module

[v41224-payment-confirmation.js](../../public/v41224-payment-confirmation.js) builds an immutable display model from the saved response. The submission bridge captures its owner, file and form payload before asynchronous work, starts shared task feedback, waits for the existing save action, and prepares the confirmation. The renderer removes task feedback just before opening the native dialog. Existing acknowledgement PDF generation remains available from Recent Payments.

A direct canvas renderer creates a high-resolution PNG from the same model without a screen-capture dependency or remote render service. The prepared file permits navigator.share to be invoked within the user's click activation. Capability checks and cancellation handling provide an image-download fallback. DOM values are escaped, long references wrap, and close/navigation/account changes invalidate the account-scoped state. Export checks verify the current owner again before download handoff.

## Session event handling

AppContext deduplicates pending and resolved identity confirmations while allowing USER_UPDATED to reload the profile. INITIAL_SESSION drives restoration without a competing getSession restore. A generation captured before scheduling rejects stale profile completions. Token refresh does not rebuild the authenticated presentation. Borrower-facing launcher processes disable asset-triggered automatic reload through APP_LIVE_RELOAD=false; other development sessions retain the default behavior.

Bulk financial and account reads happen at initial authentication or explicit Refresh. The borrower bridge has no recurring bulk timer and no focus/visibility bulk reload. `recordRefresh` lets mounted data providers join one awaited manual request; AppContext coalesces overlapping refresh clicks. Scoped subscriptions still update messages and other domains when their actual data changes. Admins do not initialize borrower extras. See [Admin-Workspace.md](Admin-Workspace.md) for staging data completeness and verification.

### Shared sign-in and stalled-request recovery — October 16

The same email/password screen authenticates both roles. The stored profile supplies the role; neither the entry URL nor any form value grants lender access. `sessionDestination` selects `/portal` for borrowers, `/admin` for lenders, and the existing password-setup route for invited accounts. The versioned borrower frame also replaces a stale `/admin` or `/login` address after authentication, without reloading the document. The classic login uses the same destination helper. Email whitespace/case is normalized; the password remains unchanged.

`authRequest` limits Auth and profile GET requests to twenty seconds, including a response body that stalls after headers. Cancellation reaches the underlying fetch and is reported as `AbortError`, which prevents the installed data SDK from silently retrying the timed-out profile lookup and multiplying that deadline. Upstream cancellation remains connected. Document transfer requests keep their existing loading and cancellation behavior. AppContext checks recognized profile roles and always releases profile-loading state on success, failure or exception, with generation checks protecting a newer session. Successful sign-in retains the existing four-second matrix; the deadline adds no wait to a completed request.

Local staging credentials remain separate from production. This change neither resets passwords nor copies production Auth hashes or sessions. All twelve copied borrower profiles and the lender profile were found linked to local login identities with matching emails, configured passwords and no active bans.

## Draft and animation modules

The payment-draft presentation module captures approved payment fields, stable selected item IDs/amounts and attachment bytes in an owner-keyed IndexedDB store. Restored selected items are reconciled against current account rows. Snapshot deferral protects the payment screen; queued data refreshes other screens on departure. Submission remains the existing server action. ProcessingFeedback renders the established wallet brand within a sequenced grid after explicit successful authentication; background token events do not trigger it. General feedback wraps user-initiated request activity and mobile-call completion, excluding document operations and silent polling. CSS uses transform/opacity motion and reduced-motion alternatives.

## Account reference and proof presentation modules

The migration adds a permanent numeric display field to profiles and a private prefix counter. mapProfile exposes accountNumber, and the borrower account helper supplies the same number to screen and receipt data sources. An unavailable number is reported as unassigned rather than exposing a storage identifier. The proof-status module decorates proof badges, promotes retract controls and tracks request busy state. Its authenticated snapshot handler refreshes only proof history during a protected payment draft; recognition and form DOM remain intact.

## Frame-driven illustration module

src/login-artwork/Illustration.jsx owns deterministic object transforms; main.jsx owns playback, image loading, visibility and motion preferences. The borrower login module embeds the presentation iframe and retains its static fallback until readiness. Protected badge state remains in the borrower form and never communicates its field values to the animation page.


## Protected badge readiness

The Protected badge retains its label and changes from a neutral state to a green pill with a shield checkmark when the email format is valid and the password is nonempty. A 1.8-second shield/halo pulse makes that change visible; the checkmark draws on activation. Clearing either field or entering an invalid email resets the badge. A polite accessible status announces only readiness changes. The tooltip explains that sign-in is still required to authenticate; this state does not verify credentials or confirm authentication.

Input and change events update readiness immediately. A login-only 250 ms check detects password manager fills that emit neither event, synchronizing the badge, floating labels and sign-in button. It skips hidden documents, stops on navigation and is replaced rather than duplicated on render. Credential values remain in the existing form DOM and are neither retained nor persisted by the observer.

Reduced-motion preference stops the pulse and checkmark drawing while preserving the green ready state and completed checkmark. Dark appearance uses a contrasting green surface. Placement below the password and the existing input spacing remain.

`syncLoginProtection()` owns badge state and changes its DOM only when readiness changes. `watchLoginProtection()` owns the login observer lifecycle; it calls `updateLoginFeedback()` only when readiness or field presentation becomes stale. Neither function requests network access.


## Dashboard balance status badges

A compact status pill sits beside the active balance card's eyebrow above the amount. Current Balance Due shows ON-SCHEDULE in green when it has no overdue unpaid charges, or PAST DUE in red when any positive unpaid charge has a due date before today. Next Balance Due shows UPCOMING in blue for positive unpaid charges due today or later. If a Next charge has become overdue, PAST DUE takes priority. An empty or credit-only Next balance has no Upcoming badge.

Classification uses only the selected card's positive unpaid charges and valid calendar dates, with today's date in Asia/Manila, matching the dashboard advisory. Paid, refunded, cancelled, zero and negative rows cannot create a past-due or upcoming badge. Due today is not past due; the grace period does not change the overdue date classification.

The colored dot and surrounding halo pulse on a 1.8-second loop through transform and opacity, keeping the text and layout stable. Reduced-motion preference removes the pulse while retaining the status text, color and dot. The badge includes an accessible status label and explanatory tooltip. The compact heading adapts to narrow screens.

The badge belongs to balance-content, so existing tab switches replace it with the selected card's content while retaining the rest of Dashboard. Initial render and later snapshots derive status from current presentation data. The badge does not change transactions, payment allocations or account records.

`dashboardBalanceStatus(view)` derives the status and description; `dashboardBalanceStatusHTML(view)` renders it. The receiving-account presentation wrapper inserts the heading and badge before the amount, and its stylesheet owns pulse and palette. Existing tab-region replacement updates the badge without adding another page render.


## Borrower account reveal and copy

Dashboard, personal information and floating chat account labels start masked, showing bullets and only the account number's last four digits. An eye button reveals the full numeric reference and changes to a copy button. Copy writes the exact number, including leading zeros, to the clipboard and gives success or failure feedback while the action remains current. Unassigned accounts show Not assigned without a reveal/copy button.

The four-second conceal timer starts when the copy button is clicked, including clipboard prompts or failures. At expiry the label returns to its last-four mask and the button returns to the reveal icon. A retry replaces the timer. Revealing alone does not start the timer. Navigation, full presentation render, document hiding and page exit reset revealed controls and clear outstanding timers. The existing partial balance-tab switch retains the footer control and its active timer.

The copy action is disabled while pending. Async completion is guarded by the current owner, connected control and operation generation; expired, superseded or detached actions cannot update the new view. Clipboard API is used in secure contexts, with a temporary textarea fallback where needed. The fallback restores focus without scrolling and removes its temporary field. No full number is placed in masked markup, action labels or data attributes, and reveal state is not persisted. The underlying account identifier and saved receipt/disclosure data retain their actual values.

The icon button has a 32px target, keyboard-accessible reveal/copy labels, a focus ring and an explanatory tooltip. Account text can wrap on narrow layouts. Dashboard icons contrast with the balance surface; reduced motion removes their background transition.

The shared account-number module owns `borrowerAccountDisplayHTML()`, `handleBorrowerAccountAction()`, `maskBorrowerAccountDisplay()` and `resetBorrowerAccountDisplays()`. A Map tracks per-control conceal timers and a WeakMap tracks owner/operation guards. Dashboard, personal information and chat use the same markup helper. Navigation and render hooks reset visible controls. The existing raw `borrowerAccountNumber()` continues serving document data.

## Aurora delivery and registry configuration


Historical implementation: the free React Bits Aurora background was selected after the owner confirmed they do not have a Pro license. The current update below removes this background and restores the original gradient. The original animated illustration is transparent: its SVG sky and whole-image backdrop are removed, while the original pixel clips for paper, shield, lock, coin and checkmark remain. The platform and decorative curves remain visible. The lock opening, illustration host and iframe document are transparent. The static fallback follows the same foreground composition, so Aurora shows through during loading as well as playback. Branding, form behavior and footers remain intact.

The Protected pill has a minimum height of 24 px, 4 px vertical and 9 px horizontal padding, and a 5 px icon/text gap. Its icon and text use a 14 px line box and share their vertical center. Explicit span font and margin resets prevent form-label styling from shifting the text. Existing valid-email/nonempty-password readiness and reduced-motion behavior continue.

components.json configures the free @react-bits registry and reserves the Pro starter/pro registry URLs with an Authorization environment placeholder for REACTBITS_LICENSE_KEY. No license key is configured and no Pro Aurora Beam was downloaded. The selected implementation is the free Aurora-JS-TW component. jsconfig.json and Vite resolve the @ alias to src. The background has its own HTML/CSS entry and uses existing React and Tailwind packages. Manual Chromium preview inspection covered the transparent foreground at an emulated 390 × 844 viewport; synthetic field input confirmed badge alignment without submitting authentication. No new automated browser suite was run for this change.

## Borrower experience delivery update

The login background returns to the original quiet gradient. Aurora is no longer mounted or included as a build entry. The transparent foreground illustration, automatic Remotion loop, app logo and footers remain. A fresh successful password response starts the authentication matrix while the profile and Dashboard prepare; the first ready borrower snapshot is delivered immediately. The matrix still holds for at least four seconds and fades for 450 ms when data is ready. Failed sign-in does not trigger success feedback. A missing or disabled profile dismisses the matrix. Authentication failures release the pending state. Restored sessions retain their existing continuity behavior.

Revealing a borrower account number starts a fixed four-second conceal deadline. Copying does not extend it, including delayed or failed clipboard requests. Navigation, owner changes, rendering and hidden pages retain the existing conceal safeguards.

Transactions, More → Installment Transactions and Loan Profile offer List and Cards. Cards overlap in a deck with swipe/drag, previous/next buttons and arrow-key navigation. Selecting the active card uses openInstallment and opens the existing schedule. Filters and sorting still determine the visible plans; selection follows a stable loan identity. Drag gestures suppress accidental schedule clicks. Inactive cards are disabled and hidden from accessibility navigation. Empty and single-plan results remain usable. Owner changes reset the presentation and selection; reduced motion removes card transitions.

Changing the language applies immediately throughout borrower screens, dialogs, controls, accessibility labels, feedback, FAQ and policy pages. Curated Tagalog phrases explain the meaning of balances, proof review and installment plans rather than substituting isolated words. Input/option values, numeric data, names, bank names, user messages and issued files keep their originals. Switching back to English restores source UI text. Form nodes are retained so unfinished inputs and attachments are not discarded. FAQ search includes translated questions and answers. New AI questions include a validated language choice; responses are requested in contextual Tagalog and response caching includes the language.

The free Aurora source remains unused; its iframe renderer and login mounting hooks are removed from active delivery. There are two Vite HTML entries. The Tagalog catalog is compiled from the reviewed copy worklist and JSON content translations, then serialized into the public language asset. Authentication UI and first-snapshot delivery changes add no runtime dependencies or schema migration. Implementation evidence records source/syntax review, manual Chromium preview and production build; no new automated browser suite was run.

## Login and support experience delivery

Installment list rows and Loan Profile rows use the same shared Fully paid, Past Due and In progress badge as the stacked cards. The badge is right aligned beside the loan title on the same row. Titles may wrap while the status stays on the right. The existing schedule action, filters, financial values and progress calculations continue to supply the view.

Login uses the Dashboard's Manila time-of-day and calendar-occasion greeting selection, including its choice of languages and session rotation. The greeting omits the borrower name and translation control, is centered, and has an obvious scale/glow pulse with an expanding halo. Reduced-motion preference retains static emphasis. The animated illustration, logo, authentication hold, form and footers remain.

Guests on Help & Support and FAQ can return directly to sign-in using a visible back button. Notifications, Profile and bottom account navigation are hidden for unauthenticated users. Signed-in support retains its account navigation.

Support descriptions require at least 10 non-whitespace characters and allow at most 2,000 input characters. A live counter, initial guidance, ready-state feedback, near-limit warning and limit-reached feedback accompany the field. An existing draft over the limit remains editable and cannot be submitted until shortened. The authenticated and guest request bridges validate the same range before sending; guest service validation also caps descriptions at 2,000.

Only a confirmed server response with a ticket number triggers the support confirmation. The immutable snapshot combines actual submitted topic, email, description and optional picture name with captured ticket number, status and creation time. Missing values are omitted. Long descriptions and ticket identifiers wrap. Save Image creates a PNG from the same snapshot, and Share uses native file sharing where available, otherwise a download fallback. PNG preparation gives loading feedback and may fail independently of a saved request. Requests that fail retain their form details and attachment. Pending submissions cannot be duplicated through the submit button. Navigation and account changes dismiss or invalidate confirmation work. User-entered descriptions and identifiers stay original; labels and guidance use contextual Tagalog when selected.

The new support experience assets load after the synchronous locale catalog and translation adapter. Shared payment confirmation styling provides modal geometry; support-specific styles provide title/status alignment and counter guidance. English and Filipino FAQ guidance is updated with back navigation, status parity, description limits and confirmation actions. Source/syntax and production build evidence are documented separately from historical automated browser suites.

## Pawcheebels invitation delivery

Pawcheebels displays a dismissible speech bubble beside the existing Dashboard mascot. A welcome invitation appears two seconds after the Dashboard is visible and ready, following the successful-sign-in animation. A bubble stays for ten seconds; keyboard focus inside it pauses removal so an active control is not taken away. A maximum of one additional invitation appears after two minutes without user activity. Pointer, keyboard, input and scroll activity restart that idle deadline. Selecting the bubble opens Ask Pawcheebels without submitting a question. Dismissing an invitation or opening chat stops additional invitations for that sign-in session.

Messages vary among reviewed app-help, payment-proof guidance, installment-schedule navigation and availability invitations. They follow the selected English or contextual Tagalog language and do not claim account lookup, verification, lender decisions or a submitted action. No account details enter the invitation copy. The invitations do not invoke an AI provider or consume a free-model request.

Invitations respect the existing mascot visibility setting and appear on Dashboard only. Authentication/loading overlays, dialogs, account search, editable-field focus, hidden tabs and an offscreen mascot pause or remove them. Returning to the Dashboard starts a fresh visible/idle waiting period. Language and account snapshots can update the screen without replaying a consumed invitation or extending its visible lifetime. A tab-scoped session record stores the account owner and three Boolean presentation flags; sign-out and blocked accounts clear it. Owner changes replace it. Reloading an existing signed-in tab restores the consumed/stopped flags. Reduced motion removes the invitation entrance and sparkle animation. Dark mode and narrow viewports retain readable text and reachable chat/dismiss actions.

The proactive JS/CSS assets load after the existing chat and localization adapters. Public English and Filipino help content explains invitation timing, dismissal and the mascot preference. No runtime dependency or database migration is added. Review evidence records source/syntax review, production build and isolated mobile preview; automated tests and real account operations were not run for this change.

## Finder motion and responsive admin navigation — October 16

`v41224-finder-motion.css` overrides the legacy orb's three-dimensional skew and animated shadows. The sphere has a static highlight/shadow; separate light layers animate rotation, and a halo animates opacity/scale. A diagonal flare is static. The compact Finder node is reused by `v41224-enhancements.js` during Dashboard snapshots. `setFinderCompact` applies final geometry before an interruptible 300 ms opacity/transform entrance, cancels stale completion callbacks and restores focus after opening/closing. Reduced motion bypasses that entrance and freezes decorative light loops.

`AdminWorkspace` owns an inline `WorkspaceSearch` input and a nonmodal results dialog anchored directly below it. Results preserve the existing page/borrower filtering and navigation. Input focus, typing and Ctrl/Cmd+K open it. Escape, outside pointer, focus leaving search and route changes dismiss it. Arrow keys navigate result buttons; Enter from the input selects the first result. Explicit dismissal restores input focus without reopening the panel. VisualViewport resize/scroll updates the available results height through a coalesced animation frame.

Below 1100 px a fixed, safe-area-aware bottom bar exposes Overview, Borrowers, Review, Messages and More. Pending/unread counts reuse existing providers. More opens the original full modal drawer, whose focus restoration now targets its actual opener. Below 761 px search occupies its own header row. Main content reserves bottom space so actions are not covered by the bar. No new dependency or backend operation is required.

## F43 — Durable sign-in access control

Local staging uses private counters, a signed HttpOnly device cookie and restricted invoker Auth hooks. The password hook counts known-account failures; the token hook blocks fresh sign-ins on locked accounts while preserving existing session refresh. The companion returns attempt metadata and audits authorized lender unlocks. A native dialog presents code, password and locked states. Explicit Check access and Refresh locks avoid polling. [Design and delivery limits](Login-Access.md).
