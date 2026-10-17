# Functional Requirements Document

Baseline: October 14, 2026. Traceability: [BRD](BRD.md), [SRS](SRS.md), [user-flow](user-flow.md).

## Functional rules

| ID | Function and rule |
| --- | --- |
| F01 | Authenticate registered users, enforce role/account status, restore sessions and allow explicit sign-out |
| F02 | Dashboard starts with Current Balance Due; switching updates amount, dates, item count, breakdown and advisory together |
| F03 | The items action opens only the active card’s transaction group; newest due dates appear first |
| F04 | Past-due summary counts distinct valid overdue dates and unpaid items on those dates; use earliest date for summary text |
| F05 | Exclude paid, canceled, refunded, archived, future, due-today and credit-only dates from creating an overdue charge advisory |
| F06 | Show three-day grace status dynamically; preserve owner-supplied late-fee and finance-charge wording |
| F07 | Installment Transactions precede Straight Transactions and include Cash Loan and Retail Installments |
| F08 | Default transaction and Loan Profile order is latest transaction date; selected sort applies consistently |
| F09 | Display principal in bold; retain negative signs for credits/partial payments and use subtle green styling |
| F10 | Provide reversible expansion on long lists and due-date summaries; recent activity initially shows at least five entries when available |
| F11 | Proof submission requires selected payable items, confirmed allocation, valid details and a supported file |
| F12 | OCR assists amount/date/reference/method entry; manual entry remains available and results are editable |
| F13 | Generate/download acknowledgement details from submitted proof and allocations; distinguish submission from approval |
| F14 | Provide consistent download-only actions and preparation/handoff feedback for specified document flows |
| F15 | Invoice due-date navigation supports year/month selection; borrower deletion is limited to user-generated invoices |
| F16 | Loan requests validate bank details and confirmations; expanded amortization includes the monthly table |
| F17 | History Timeline sorts latest event first, uses status descriptions/colors, and shows a green check for Completed |
| F18 | Notifications support search/category filtering, read state, attachment download, replies and reaction picker |
| F19 | Help & Support contains FAQ and Submit Request before and after login; account email is prefilled on sign-in |
| F20 | Support creates a durable ticket, confirms its number, updates signed-in history immediately and retains failed drafts |
| F21 | FAQ supports topic/search filters, five initial questions, in-place expansion and reference navigation |
| F22 | Pawcheebels labels FAQ/AI answers; signed-in AI supports greetings and general questions without FAQ matches, with references only when relevant; unknown app policies offer support |
| F23 | Optional external AI uses a server key, a signed-in enabled setting and a bounded request; failure returns FAQ guidance |
| F24 | Message lender uses the existing authenticated conversation; no assistant answer automatically sends a lender message |

## Support input and state

Topics: Unable to log in, Payment proof upload, Account question, Others. Email must be valid and at most 254 characters. Description must contain 10–5,000 characters after required-field checks. A screenshot is optional and supports JPG, PNG, WEBP, GIF, BMP or AVIF up to 5 MB. Validation identifies the field and focuses it. The registered email is a prefilled, editable contact field, not the ticket ownership key.

The signed-in account ID determines ticket ownership. Guests use the guest endpoint without a borrower ID. During submission the form is disabled and the button reads Submitting. The UI waits up to 20 seconds for confirmation. An error restores controls and retains details/attachment. A retry of unchanged details keeps its request key. Repeated clicks while pending do not create another call. A returned ticket number is required before success is displayed. Changing accounts clears the previous owner’s support draft.

## Status presentation

| Cash Loan Request status | Meaning | Presentation |
| --- | --- | --- |
| Submitted | Received for processing | Blue |
| Pending / Under Review | Evaluation underway | Amber |
| Coordinating with Bank | Bank details being checked | Violet |
| Bank Approved | Approval recorded | Cyan/teal |
| Transfer in Progress | Transfer processing underway | Indigo |
| Completed | Successful final processing recorded | Green check |
| Declined / Rejected | Not approved | Red |
| Canceled | Request canceled | Neutral gray |

These labels summarize recorded lender events; the UI does not independently verify bank transfers. Source status aliases are normalized for display.

## Assistant failure and authority

Question length is 2–800 characters. Guest or unconfigured AI requests use FAQ. AI receives server-selected references and the question only. The service rejects cross-origin requests, limits questions to twelve per minute per account/IP, and prevents concurrent provider work for the same identity. Provider work has a twelve-second timeout; the client waits at most fifteen seconds. Errors, incomplete answers or missing output fall back to FAQ guidance. Obvious private details such as an email address or long account number are kept out of the provider call. This filter is not a complete sensitive-data detector; the UI also instructs users to avoid private details.

The assistant cannot approve loans, verify funds, change balances, access arbitrary accounts or issue autonomous messages. Lender communication is a user-submitted action through the messaging flow.

## Pawcheebels in Messages

More → Messages offers Ask Pawcheebels and Message lender. The assistant uses the same conversation and AI preference as the mascot and FAQ screen. Switching destinations preserves separate unsent assistant and lender drafts. Asking the assistant never submits a lender message; lender messages require the user to select Send. Account changes clear assistant state.

## FR-TRANSFER-01 — Receiving-account deck

The active dashboard balance card offers a pulsating transfer CTA. “Pay by” scrolls horizontally and uses the latest positive unpaid charge date in that card's existing scope; credit dates cannot determine this date. With no applicable date, the CTA says “View payment options.” Both CTA controls open transfer destinations, without initiating a payment.

Supported transfer channel logos immediately below the balance card open the matching destination. The five-card deck is ordered MariBank, BPI, Security Bank, BDO and GCash. Each card displays the lender-provided logo, exact recipient name and account number, copy control and bank-export QR region with a white scanning margin. Leading zeroes are preserved. Opening, swiping or copying never changes ledger records.

Horizontal touch or mouse dragging, pagination dots and left/right keyboard arrows switch the active card with wrapping. Vertical touch movement permits scrolling. Only the active card is interactive. The modal supports Escape, a close button, outside dismissal and focus restoration. QR saving downloads a PNG of the active bank-export QR region, retaining its source pixels and scanning margin through shared loading and toast feedback. Reduced-motion preferences stop pulses, marquees and transition animation. Recipient details and bank fees must be confirmed in the banking app; viewing a QR is not payment verification.


## Assistant recovery and verified QR downloads

Signed-in AI starts enabled and can be switched off. OpenRouter requests remain free-only with zero prompt, completion and request price caps, latency preference and denied provider data collection. The free router and another eligible free model provide bounded failover within a twelve-second request budget. Retired endpoints cool down for five minutes; transient failures cool down for thirty seconds. Successful answers are cached for five minutes per authenticated owner, question digest, FAQ version and preferred model, with at most 200 entries. Private-detail screening occurs before caching and provider access. Daily free quotas and invalid credentials have distinct recovery messages; model switching never bypasses account quotas. External free capacity is not guaranteed.

Receiving QRs use native SVG viewports to retain the bank-export pattern and replace surrounding artwork with a white scanning margin. PNG downloads preserve the decoded bank payment payload. Scan verification compares payload hashes with bank-export evidence rather than treating a decorative QR or matching file size as sufficient. The BPI displayed account number is corrected according to lender confirmation. Browser verification runs on Chromium, Firefox and WebKit with temporary fixture accounts and cleanup; reports distinguish simulated mobile layouts from physical-device acceptance.

### F28 — Consistent chat composers and modal transitions

Both assistant entry points and lender entry points use the same animated input-border treatment and compact input typography. Assistant input-bar dimensions match the lender bar in the respective pop-up and Messages surface. Receiving-account opening and dismissal use a trigger-directed genie-style transition, with instant reduced-motion behavior and immediate removal on navigation. Pending animation cancellation must not leave a modal behind or trap focus.

### F29 — Saved proof confirmation

Only a confirmed payment-submit response opens the confirmation. Display its amount, reference, channel and payment date; show the server submission time separately. Hide bank/account fields that were not captured. Sum the authoritative requested-allocation snapshots in integer cents. Show Fully covered, Partially covered or Excess submitted with the corresponding remaining/excess amount. Every new submission remains Submitted for review until lender processing; coverage describes the supplied amount. Unknown allocations hide reconciliation instead of showing a guessed total.

Save Image exports the same captured model as a PNG. Share uses a prepared image file through supported native sharing, with explicit user choice of destination; unsupported sharing downloads the image for user-operated sharing. Escape/close/outside dismissal and navigation release the modal. Changing accounts clears the confirmation. Loading, duplicate-submit prevention, retained failures and existing PDF receipt access are required.

## F30 — Payment draft retention and process feedback

Background snapshots must not rebuild My Payment while the borrower is entering, recognizing or submitting a proof. The newest snapshot is applied after leaving. Navigation cancels recognition when needed while retaining the proof for manual review. Draft attachment bytes and metadata are saved in IndexedDB per borrower and restored after authentication. Unavailable device storage retains the in-tab draft and reports the limitation. Changed/missing selected items require allocation review. Pending submission locks its fields; failure returns retry controls and retains details, including when the borrower left and returned. Another identity cannot receive the prior owner's draft. Successful sign-in alone triggers the pulse matrix; restoration and failed sign-in do not. Generic processing indicators disappear on success or failure and yield to document progress.

## F31 — Permanent numeric account numbers and proof controls

Assign a numeric reference once per borrower, retain leading zeros, distinguish equal name prefixes with an atomic suffix allocator, and enforce uniqueness and immutability in the database. Preserve existing account relationships and access rules. Display the reference in the payment card footer, Messages context, personal information, loan summary and acknowledgement receipt. Green proof badges require Approved. Pending, Submitted, Under review, Rejected and Withdrawn use distinct non-green palettes. Only pending unretracted proofs offer Retract proof; confirmation, disabled/busy feedback and server eligibility checks remain in place. Proof status updates refresh history without replacing the unfinished payment form.

## F32 — Cleaner login presentation

Render the sign-in form without its enclosing card border or shadow. Place email validation above its control, retaining associated accessible feedback and wrapped-message spacing. Keep email/password inputs 12 px apart and the Protected badge below password with a green ready state, shield checkmark and visible halo pulse when the email format is valid and the password is filled. Respect reduced-motion preferences. Preserve authentication behavior, logo animation, Token Code switching, Help & Support and footer content.

The login header uses the original illustration from the supplied reference screenshot. SVG masks and clips separate the original paper, shield, lock, coin and check-mark pixels for gentle independent motion without replacing the original artwork. A responsive clipped image window displays only its top artwork region; the animated app logo sits beside the live app name and the original corner mark is masked away. The illustration remains decorative to screen readers, with reserved dimensions to avoid a loading layout shift. The live heading, controls and footer remain real app elements.

Illustration plays automatically, with gentler movement when reduced motion is requested. Credential-triggered Protected animation remains disabled for reduced-motion preferences. Clearing either email or password stops Protected animation. Its animation is visual feedback and does not indicate successful authentication.

## F33 — Visible Remotion login illustration

Embed the eight-second Remotion illustration in a dedicated public entry page within the login header. Preserve the reference artwork, logo beside the app name, input fields and footers. Autoplay the silent loop with no visible controls; use gentler movement for reduced-motion preferences and retain a static fallback. Send only a validated same-origin readiness/failure message to the borrower frame. Illustration playback receives no account details or credentials. Protected badge animation remains dependent on both fields containing text.


## Protected badge readiness

The Protected badge retains its label and changes from a neutral state to a green pill with a shield checkmark when the email format is valid and the password is nonempty. A 1.8-second shield/halo pulse makes that change visible; the checkmark draws on activation. Clearing either field or entering an invalid email resets the badge. A polite accessible status announces only readiness changes. The tooltip explains that sign-in is still required to authenticate; this state does not verify credentials or confirm authentication.

Input and change events update readiness immediately. A login-only 250 ms check detects password manager fills that emit neither event, synchronizing the badge, floating labels and sign-in button. It skips hidden documents, stops on navigation and is replaced rather than duplicated on render. Credential values remain in the existing form DOM and are neither retained nor persisted by the observer.

Reduced-motion preference stops the pulse and checkmark drawing while preserving the green ready state and completed checkmark. Dark appearance uses a contrasting green surface. Placement below the password and the existing input spacing remain.


## F34 — Dashboard balance status badges

A compact status pill sits beside the active balance card's eyebrow above the amount. Current Balance Due shows ON-SCHEDULE in green when it has no overdue unpaid charges, or PAST DUE in red when any positive unpaid charge has a due date before today. Next Balance Due shows UPCOMING in blue for positive unpaid charges due today or later. If a Next charge has become overdue, PAST DUE takes priority. An empty or credit-only Next balance has no Upcoming badge.

Classification uses only the selected card's positive unpaid charges and valid calendar dates, with today's date in Asia/Manila, matching the dashboard advisory. Paid, refunded, cancelled, zero and negative rows cannot create a past-due or upcoming badge. Due today is not past due; the grace period does not change the overdue date classification.

The colored dot and surrounding halo pulse on a 1.8-second loop through transform and opacity, keeping the text and layout stable. Reduced-motion preference removes the pulse while retaining the status text, color and dot. The badge includes an accessible status label and explanatory tooltip. The compact heading adapts to narrow screens.

The badge belongs to balance-content, so existing tab switches replace it with the selected card's content while retaining the rest of Dashboard. Initial render and later snapshots derive status from current presentation data. The badge does not change transactions, payment allocations or account records.


## F35 — Borrower account reveal and copy

Dashboard, personal information and floating chat account labels start masked, showing bullets and only the account number's last four digits. An eye button reveals the full numeric reference and changes to a copy button. Copy writes the exact number, including leading zeros, to the clipboard and gives success or failure feedback while the action remains current. Unassigned accounts show Not assigned without a reveal/copy button.

The four-second conceal timer starts when the copy button is clicked, including clipboard prompts or failures. At expiry the label returns to its last-four mask and the button returns to the reveal icon. A retry replaces the timer. Revealing alone does not start the timer. Navigation, full presentation render, document hiding and page exit reset revealed controls and clear outstanding timers. The existing partial balance-tab switch retains the footer control and its active timer.

The copy action is disabled while pending. Async completion is guarded by the current owner, connected control and operation generation; expired, superseded or detached actions cannot update the new view. Clipboard API is used in secure contexts, with a temporary textarea fallback where needed. The fallback restores focus without scrolling and removes its temporary field. No full number is placed in masked markup, action labels or data attributes, and reveal state is not persisted. The underlying account identifier and saved receipt/disclosure data retain their actual values.

The icon button has a 32px target, keyboard-accessible reveal/copy labels, a focus ring and an explanatory tooltip. Account text can wrap on narrow layouts. Dashboard icons contrast with the balance surface; reduced motion removes their background transition.

## F36 — Aurora login background and aligned readiness badge


Historical implementation: the free React Bits Aurora background was selected after the owner confirmed they do not have a Pro license. The current update below removes this background and restores the original gradient. The original animated illustration is transparent: its SVG sky and whole-image backdrop are removed, while the original pixel clips for paper, shield, lock, coin and checkmark remain. The platform and decorative curves remain visible. The lock opening, illustration host and iframe document are transparent. The static fallback follows the same foreground composition, so Aurora shows through during loading as well as playback. Branding, form behavior and footers remain intact.

The Protected pill has a minimum height of 24 px, 4 px vertical and 9 px horizontal padding, and a 5 px icon/text gap. Its icon and text use a 14 px line box and share their vertical center. Explicit span font and margin resets prevent form-label styling from shifting the text. Existing valid-email/nonempty-password readiness and reduced-motion behavior continue.

Mount Aurora only on the login screen and remove it when navigating elsewhere. Keep the background outside keyboard focus and pass only a validated same-origin theme flag to its presentation frame. Freeze movement for reduced-motion preferences and hidden documents; retain the static gradient if WebGL cannot render.

## F37 — Responsive sign-in and automatic account concealment

The login background returns to the original quiet gradient. Aurora is no longer mounted or included as a build entry. The transparent foreground illustration, automatic Remotion loop, app logo and footers remain. A fresh successful password response starts the authentication matrix while the profile and Dashboard prepare; the first ready borrower snapshot is delivered immediately. The matrix still holds for at least four seconds and fades for 450 ms when data is ready. Failed sign-in does not trigger success feedback. A missing or disabled profile dismisses the matrix. Authentication failures release the pending state. Restored sessions retain their existing continuity behavior.

Revealing a borrower account number starts a fixed four-second conceal deadline. Copying does not extend it, including delayed or failed clipboard requests. Navigation, owner changes, rendering and hidden pages retain the existing conceal safeguards.

Transactions, More → Installment Transactions and Loan Profile offer List and Cards. Cards overlap in a deck with swipe/drag, previous/next buttons and arrow-key navigation. Selecting the active card uses openInstallment and opens the existing schedule. Filters and sorting still determine the visible plans; selection follows a stable loan identity. Drag gestures suppress accidental schedule clicks. Inactive cards are disabled and hidden from accessibility navigation. Empty and single-plan results remain usable. Owner changes reset the presentation and selection; reduced motion removes card transitions.

Changing the language applies immediately throughout borrower screens, dialogs, controls, accessibility labels, feedback, FAQ and policy pages. Curated Tagalog phrases explain the meaning of balances, proof review and installment plans rather than substituting isolated words. Input/option values, numeric data, names, bank names, user messages and issued files keep their originals. Switching back to English restores source UI text. Form nodes are retained so unfinished inputs and attachments are not discarded. FAQ search includes translated questions and answers. New AI questions include a validated language choice; responses are requested in contextual Tagalog and response caching includes the language.

## F38 — Installment deck view

Expose the same List/Cards choice in all three installment-plan entry points. Use the original schedule action and financial records.

## F39 — Contextual borrower language

Use the approved Filipino phrase catalog and translated help/policy content. Apply a language selection without a page reload or form replacement. Preserve service enum values and document originals.

## F40 — Consistent installment status and login greeting

Installment list rows and Loan Profile rows use the same shared Fully paid, Past Due and In progress badge as the stacked cards. The badge is right aligned beside the loan title on the same row. Titles may wrap while the status stays on the right. The existing schedule action, filters, financial values and progress calculations continue to supply the view.

Login uses the Dashboard's Manila time-of-day and calendar-occasion greeting selection, including its choice of languages and session rotation. The greeting omits the borrower name and translation control, is centered, and has an obvious scale/glow pulse with an expanding halo. Reduced-motion preference retains static emphasis. The animated illustration, logo, authentication hold, form and footers remain.

Guests on Help & Support and FAQ can return directly to sign-in using a visible back button. Notifications, Profile and bottom account navigation are hidden for unauthenticated users. Signed-in support retains its account navigation.

Support descriptions require at least 10 non-whitespace characters and allow at most 2,000 input characters. A live counter, initial guidance, ready-state feedback, near-limit warning and limit-reached feedback accompany the field. An existing draft over the limit remains editable and cannot be submitted until shortened. The authenticated and guest request bridges validate the same range before sending; guest service validation also caps descriptions at 2,000.

Only a confirmed server response with a ticket number triggers the support confirmation. The immutable snapshot combines actual submitted topic, email, description and optional picture name with captured ticket number, status and creation time. Missing values are omitted. Long descriptions and ticket identifiers wrap. Save Image creates a PNG from the same snapshot, and Share uses native file sharing where available, otherwise a download fallback. PNG preparation gives loading feedback and may fail independently of a saved request. Requests that fail retain their form details and attachment. Pending submissions cannot be duplicated through the submit button. Navigation and account changes dismiss or invalidate confirmation work. User-entered descriptions and identifiers stay original; labels and guidance use contextual Tagalog when selected.

## F41 — Accessible guest support and submission confirmation

Show guest return navigation, enforce the description range, and provide saved-request confirmation with image and share actions.

## F42 — Proactive Pawcheebels invitations

Pawcheebels displays a dismissible speech bubble beside the existing Dashboard mascot. A welcome invitation appears two seconds after the Dashboard is visible and ready, following the successful-sign-in animation. A bubble stays for ten seconds; keyboard focus inside it pauses removal so an active control is not taken away. A maximum of one additional invitation appears after two minutes without user activity. Pointer, keyboard, input and scroll activity restart that idle deadline. Selecting the bubble opens Ask Pawcheebels without submitting a question. Dismissing an invitation or opening chat stops additional invitations for that sign-in session.

Messages vary among reviewed app-help, payment-proof guidance, installment-schedule navigation and availability invitations. They follow the selected English or contextual Tagalog language and do not claim account lookup, verification, lender decisions or a submitted action. No account details enter the invitation copy. The invitations do not invoke an AI provider or consume a free-model request.

Invitations respect the existing mascot visibility setting and appear on Dashboard only. Authentication/loading overlays, dialogs, account search, editable-field focus, hidden tabs and an offscreen mascot pause or remove them. Returning to the Dashboard starts a fresh visible/idle waiting period. Language and account snapshots can update the screen without replaying a consumed invitation or extending its visible lifetime. A tab-scoped session record stores the account owner and three Boolean presentation flags; sign-out and blocked accounts clear it. Owner changes replace it. Reloading an existing signed-in tab restores the consumed/stopped flags. Reduced motion removes the invitation entrance and sparkle animation. Dark mode and narrow viewports retain readable text and reachable chat/dismiss actions.

## F43 — Automatic Login Code and lender-controlled locks

The sixth Login Code digit submits once automatically; email/password still requires Sign In. Error dialogs show the server-reported attempts remaining. Five invalid codes lock the device, while five consecutive invalid email/password attempts lock the account across both methods. Only a lender/admin can clear a lock. No time-based or password-reset unlock applies. Locked messaging is centered. See [Login-Access.md](Login-Access.md) for the owner-selected device distinction and server enforcement.
