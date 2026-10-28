# Lender workspace

Implemented workspace foundation · October 15, 2026

## Direction and delivery boundary

The owner selected a desktop-first responsive workspace, the borrower application's branding, a single lender/admin initially, and all existing admin functions in the eventual complete release. This delivery builds the navigation and overview, integrates the existing operational screens, improves borrower discovery and gives support its own destination. It is not completion of the entire lender release plan.

The current application contains 19 protected admin routes and 20 admin page files. Seventeen routes existed before this redesign. The two added routes are `/admin/portfolio` for the original detailed dashboard and `/admin/support` for the existing support service. Analytics was already rendered inside Reports & Logs; it did not need a new route.

## Design contract

| Item | Contract |
| --- | --- |
| Surface | Lender/admin workspace; borrower rendering retains its existing shell |
| User job | Find accounts, review submissions and manage existing lending operations |
| Primary action | Open the payment review queue or relevant operational screen |
| Hierarchy | Work needing attention, ledger summaries, collections chart, pending proofs, collection schedule and recent activity |
| Target sizes | 1440 × 1000 desktop and 390 × 844 phone; bottom navigation and the full More drawer below 1100 px |
| Reference | Existing borrower blue branding and wallet mark, existing admin route inventory and shared ledger definitions |
| Typography | Existing local IBM Plex Sans; compact operational text, labelled statuses and tabular financial figures |
| Presentation | White surfaces, soft neutral background, blue primary actions, amber pending and red past-due states |
| Navigation | Workspace, Collections, Lending, Communication and Management groups; all existing destinations remain reachable |

## Implemented behavior

- `AppShell` uses `AdminWorkspace` for an effective admin session. Borrower and view-as-borrower rendering retain the existing path and permission checks.
- The desktop sidebar has current-page highlighting, pending proof/request counts and unread message/notification counts. Mobile bottom navigation provides Overview, Borrowers, Review, Messages and More, with current-page styling, pending/unread counts and safe-area spacing. More opens the full browser-modal drawer. Closing restores focus to whichever navigation button opened it; the drawer closes when navigation switches to desktop width.
- The top bar includes page context, notification access, profile access and workspace search. Search opens beneath the header input on focus or Ctrl/Cmd+K. Its rounded results window follows the borrower Finder presentation, with icon tiles and a short downward reveal. Arrow keys browse results, Enter opens the selection and Escape closes. Outside interaction or leaving search also dismisses it. It searches pages and borrower names, emails, phone numbers and permanent numeric account references. It returns links to the matching borrower directory scope. Search stays in memory; borrower-directory filters use replaceable URL parameters.
- Overview calculates outstanding and past-due totals with the existing shared transaction-status helpers. Collected this month means paid ledger rows with a payment date in the current Manila calendar month; approving a proof alone is not counted as a ledger collection.
- The six/twelve-month chart groups scheduled dues by due month and paid collections by payment month. Canceled/refunded rows do not count as scheduled dues. An expandable data table provides the chart amounts without requiring chart interaction.
- Pending proof counts and rows exclude withdrawn proofs. Selecting a proof opens the existing review screen scoped to that proof; Show all proofs clears that scope.
- Collection schedule groups open ledger rows by borrower and due date, oldest first. On a phone, rows become compact account/amount/date/status cards. This schedule does not change the borrower Pay By calculation.
- Recent activity uses the context's newest-first audit ordering. The original dashboard's detailed charts, controls and filters remain available in Portfolio detail.
- Borrowers supports name/email/phone/account-number search, status filtering and the existing pagination and account controls. Search resets the page. Displayed references use the permanent numeric number; missing references say Account number pending rather than exposing an internal key.
- Support tickets uses the existing authenticated local service with reference/borrower/email search, status filters, attachment previews, status history, loading feedback and retry. Borrower login-code tools are separated under Borrowers → Borrower access tools. Support explicitly explains unavailability in environments without that service.
- Refresh and route loading use the shared magnetic dots. Request failures retain already displayed records, offer retry and do not reload the document. Existing document upload/download feedback is preserved.

## Content states

| State | Trigger, feedback and next action |
| --- | --- |
| Loading | Lazy route or support load: magnetic dots and a named loading message. Refresh keeps existing records visible. |
| Empty | No collection history, proofs, dues, activity or borrower matches: explain the missing content; directory offers Clear filters. |
| Error | Shared refresh or support request fails: an alert and Retry; available records remain displayed. |
| Partial | Shared synchronization reports failure: display available records and the failure banner; do not present a success/synced badge. |
| Success | Successful reads display the saved records; existing mutation screens retain their current service and confirmation behavior. |
| Permission | Existing admin role/account guards remain authoritative. This delivery introduces no new roles or client-only authorization bypass. |

## Remaining release work

The full plan still requires the reviewed allocation and combined approval/posting transaction, correction/reversal rules, explicit disbursement prerequisites, verified guest ticket tracking and ticket replies, and production support integration. Existing invitation/edit/delete behavior is inherited and still needs the planned confirmed-server-outcome review. The current profile invitation function creates a profile; source comments document that delivering an actual authentication invitation requires the supported server process. The inherited invitation message must not be used as evidence of email delivery.

No schema, role, authentication, service endpoint, notification delivery or financial calculation changes were introduced by this workspace build. Public borrower FAQ and legal content did not change because this is an admin presentation change with no new borrower data destination.

## Review scope and local use

The following limits describe the initial October 15 delivery. The authenticated October 16 verification below supplements that historical review.

- Production compilation and focused ESLint review cover the changed workspace source. No automated tests were added or run for this delivery.
- An isolated localhost design preview rendered the actual workspace components with synthetic accounts at desktop and phone sizes. It does not use a real session or connect to account services. The initial phone review led to a compact collection-schedule treatment and readability adjustments.
- Browser captures were returned inline. The browser tool refused to save captures inside the workspace; no saved screenshot artifacts or passing visual-evidence-gate record are claimed. Later browser-tool calls stalled, so the final spacing changes and search/drawer interactions are not claimed as fully exercised.
- Live authentication, database mutations, financial posting, email delivery and cross-account permission behavior were not exercised in this task. Build/lint success does not establish those outcomes.
- Production and local-environment compilation passed, as did focused ESLint review. The source builds are available in the workspace output directory. Thirteen application source files were copied to local staging, with originals backed up. The local server was found stopped and started with automatic reload disabled; no active screen or database was restarted. Open a fresh admin tab to load the new source without replacing a borrower's active screen.

## Authenticated Chrome verification — October 16, 2026

The owner reported that the admin address was not loading and requested Chrome DevTools verification. Chrome showed that an unconfigured Vite process returned HTTP 200 but the app crashed before rendering because the Supabase environment was missing. The initial shell port observation was incomplete. The confirmed unconfigured process was replaced with the existing configured local UI launcher running hidden in the background with automatic reload disabled. Local authentication and database checks passed, followed by actual sign-in through the app using a temporary verification admin.

All 19 admin routes passed desktop rendering, active-navigation and document-width checks at 1440 × 1000. Every sidebar transition retained the browser document. Eleven interaction/access checks passed: workspace search empty state and navigation; full numeric account search; status filtering; keyboard clearing; search focus restoration; mobile drawer opening and navigation; profile opening/closing; sign-out; and unauthenticated admin access showing sign-in. Mobile overview/directory/drawer checks used 390 × 844, with no horizontal document overflow and collection rows displayed as cards.

The checks found and fixed two issues. Borrower query input now filters immediately and synchronizes its URL after a 350 ms pause so complete account numbers can be typed. External query navigation remains synchronized. Workspace search now closes its native dialog before restoring outside focus, including the development StrictMode effect replay, and handles Escape through its controlled close path. These changes passed repeat checks. Tool-specific stale element IDs, select-option labels and empty-string filling were handled in the procedure using fresh snapshots and keyboard input.

No JavaScript errors were reported in the authenticated navigation pass or final fix recheck. Initial chart-dimension warnings and the Remotion license notice were non-blocking. The temporary account was signed out and removed, and its credentials file was deleted. Existing borrower records were not modified. Financial mutations, payment posting, disbursement release, invitation/message delivery and AI calls were not exercised; combined posting and verified guest tracking remain future implementation work. This is authenticated navigation/control coverage, not a complete production acceptance claim.

Aggregate evidence is stored in the workspace's `outputs/admin-workspace-check/VERIFICATION.md` and `results.json`. The repeatable configured start is `outputs/start-admin-workspace.ps1`. The launcher stays active when the chat's shell command ends and leaves an already-running configured instance alone. Reload an already-blank browser tab once to load the corrected app environment.

## Staging completeness and manual refresh — October 16, 2026

The original staging snapshot deliberately supported borrower flows. Its documented scope excluded unowned lender tracking records, lender wallets, templates and audit history. Therefore the Loan Portfolio Dashboard (`/admin/loan-tracker`, backed by `tracked_loans`) was empty even though borrower `loans` and `transactions` were present. The prior route-rendering checks did not establish data completeness.

A new read-only production inventory covered all 27 public tables and their complete primary keys, including composite keys. The local restore inserted 454 missing rows across 12 tables: 18 tracked loans, 333 audit entries, 11 announcement templates, 32 notification templates, two interest rates, eight notifications, ten notification-read records, eight wallet accounts, 12 wallet cards, one wallet account transaction, nine wallet bills and ten wallet payments. All 37 public foreign-key relationships passed. Production received no writes. Existing local rows, numeric borrower account references, private preferences and other staging-only fields were retained. No production Auth passwords, sessions, keys or delivery configuration were copied.

Primary-key comparisons found zero missing source records after restoration. Value digests match the captured production columns across all tables; the only profile-field difference is local `last_login`, as expected after staging sign-ins. The 940 loans, 2,322 installment transactions, 40 source payment proofs, 62 payment logs, 13 invoices, three disbursements and other existing production rows remain unchanged. Extra staging rows are retained, so total stage counts can exceed production counts. This is a point-in-time capture, collected with read-only queries across the audit interval, not an atomic whole-system snapshot or continuous synchronization.

Captured rows and pre-restore backups are encrypted with Windows DPAPI under `C:/Users/ronay/loanledger-staging/private-copy/admin-parity`, outside application source and the knowledge map. Audit-log identity values were explicitly retained using the database identity override. An import verification caught the initial generated-ID mismatch; the transactionally corrected import now matches both source IDs and values, and its local identity counter is above the restored maximum. Restoring these backups requires the same Windows identity. They are not the separate portable production recovery backup.

`VersionedBorrower` previously scheduled a six-provider bulk refresh every ten seconds and on window focus/visibility changes. That task also ran for an administrator with no borrower frame. The regression test reproduced 51 GET requests during a short idle/refocus observation. That interval and both focus listeners have been removed. Borrower-only extra-detail loading no longer runs for admins. Actual messaging/notification/domain changes retain their scoped subscriptions; authentication token renewal remains active.

Manual Refresh now coalesces concurrent clicks, awaits participating providers through `recordRefresh`, and keeps the existing document and records on screen. Messaging, requests, disbursements, invoices, notifications, templates, announcements, support, borrower extras and an open wallet register for explicit refresh; no provider adds an interval. Loan-tracker artwork now uses the supplied local logos where available and immediate initials otherwise, removing repeated failed external logo requests.

Evidence: workspace `outputs/admin-workspace-check/` contains red/green browser reports, aggregate parity and value-digest results, profile-field drift checks and the verification report. The red refresh test failed on real requests; the patched Chromium refresh/data tests passed. Chrome DevTools confirmed 18 cards, zero record reads over a 64-second idle interval, the same document, and no console errors after local logo replacement. The existing live-service integration suite passed 60 checks with temporary accounts, including proof validation/idempotency, isolation, support, messages, requests, statements, disbursements and one-use login codes. Production compilation passed. Final cross-browser outcomes are recorded separately; no physical-device or production-write acceptance is implied.

Final verification consolidated 69 passing browser scenarios across Chromium, Firefox and WebKit, 60 passing live service checks and two passing coordinator unit tests. The broad run initially passed 63 of 66; corrected privacy/disabled-field assertions and the new wallet cases passed nine final cross-browser reruns. This is consolidated evidence rather than one uninterrupted all-green broad run. All 47 source upload paths match MIME and size; extra staging uploads remain. Thirteen published runtime files match canonical source, compilation and focused lint pass, and no temporary test profiles or credential file remain. A final source fingerprint found no production-table changes during verification. The current report is workspace `outputs/admin-workspace-check/DATA-AND-PERFORMANCE.md`, with aggregate `final-results.json`.

Automated approval review rejected use of the saved lender password because verification was authorized with a temporary admin account. The saved-owner sign-in was not performed. Wallet database values and ownership match production; UI acceptance uses a temporary admin's synthetic owned card. Combined approval and posting, guest ticket verification and the other Remaining release work above are still separate product work.

### Refresh source map

- [Manual refresh coordination](../../src/lib/recordRefresh.js)
- [Primary data loading and refresh coalescing](../../src/context/AppContext.jsx)
- [Borrower frame and targeted extras](../../src/components/VersionedBorrower.jsx)
- [Loan Portfolio Dashboard](../../src/pages/admin/LoanTracker.jsx)
- [Regression registry](../../tests/README.md)
- [Admin refresh and data browser tests](../../tests/e2e/admin-refresh.spec.js)

### Shared sign-in recovery — October 16, 2026

Borrowers and the lender/admin use one email/password screen. The authenticated profile selects `/portal` or `/admin`, including entry through the other role's URL and restored sessions. No role selector or password changes are required. Local staging credentials remain independent of production credentials.

Authentication and profile requests have a twenty-second deadline, including response bodies. Timeout cancellation stops hidden profile retries, clears the busy state and allows another attempt. The existing four-second success presentation remains. Verification uses temporary local accounts; detailed evidence and exclusions are in workspace `outputs/shared-login/VERIFICATION.md`.

- [Trusted-role destination](../../src/lib/sessionDestination.js)
- [Authentication request deadline](../../src/lib/authRequest.js)
- [Shared login regressions](../../tests/e2e/shared-login.spec.js)

## Finder motion and mobile navigation refinement — October 16, 2026

The borrower Finder sphere retains its mounted DOM during Dashboard data snapshots. Its glossy base stays stable while cyan and violet light layers rotate through continuous two-dimensional loops. A soft halo and diagonal flare surround it. Opening/minimizing uses opacity and transform with final layout applied once; it no longer animates width, height, left or top. Reduced-motion preference keeps a static orb and removes entrance motion.

Admin search is anchored ten pixels below the header input. It uses an opaque pale surface for readable results, a rounded frame and icon tiles. Mobile places the input on a second header row and keeps results within the visible viewport. Bottom navigation preserves all 19 routes through its four primary destinations and More drawer. No dependency, database, financial action or record-refresh behavior is added.

Focused lint and production compilation pass. Chrome review covered the authenticated desktop and 390 px mobile layouts, search placement/readability, no horizontal mobile overflow, More opening all 19 destinations and close-focus restoration. The orb was reviewed in an isolated presentation preview. No automated tests were added or run for this change; historical test outcomes above retain their original scope. Inline captures were inspected; the browser connector refused the requested workspace screenshot save path.

### Original workspace source map

- [Routing and existing role guard](../../src/App.jsx)
- [Role-specific shell selection](../../src/components/AppShell.jsx)
- [Admin shell and workspace search](../../src/components/admin/AdminWorkspace.jsx)
- [Navigation and borrower-reference helpers](../../src/components/admin/workspaceNavigation.js)
- [Workspace styles and responsive rules](../../src/components/admin/admin-workspace.css)
- [Overview and ledger-derived summaries](../../src/pages/admin/WorkspaceOverview.jsx)
- [Original detailed portfolio dashboard](../../src/pages/admin/AdminDashboard.jsx)
- [Borrower directory](../../src/pages/admin/Users.jsx)
- [Payment review selection](../../src/pages/admin/Queue.jsx)
- [Support destination](../../src/pages/admin/Support.jsx)
- [Existing support and access service adapter](../../src/components/LocalLenderOperations.jsx)
- [Analytics integration within reports](../../src/pages/admin/Logs.jsx)



## Borrower access and mobile navigation — October 16, 2026

Mobile More is a bottom sheet containing the 15 destinations outside the four primary navigation items. The redundant upper-left menu control is removed. Workspace search retains the Finder gradient border.

Login Code replaces the former Token Code wording. A six-cell input supports keyboard entry, paste, clearing, backspace and a numeric keypad. Only the newest entered digit gets a 900 ms rotating border and a brief number entrance; previous cells settle immediately. Reduced-motion settings disable movement. Continue requires exactly six digits.

New local Login Codes are cryptographically generated, hashed at rest and permanent until replaced or revoked. Replacement revokes earlier outstanding codes for that borrower. Revocation remains available after the issuance dialog closes. Existing finite legacy codes retain their original rules. Failed attempts remain throttled. Codes authorize active borrowers only; the admin signs in with email/password. Production code policy has not been changed.

Borrower directory Login access provides a server-authorized password change with confirmation and a code issuance/revocation panel. The service validates an active admin and a live session before password/profile changes. Passwords are never returned or stored in browser persistence. Email changes reconcile Supabase Auth and the profile, with compensation if the profile write fails.

The admin editor now shares full legal name, preferred name, email, phone, date of birth, address and occupation with borrower Personal Information. Optional avatar/account references are displayed for context. The borrower sign-in email remains lender-managed. Loading errors keep editing disabled and offer Retry; failed saves retain entered values. An actual preferences change refreshes only the signed-in profile and extras, preserving page state and unsaved profile edits. The preferences publication migration enables this existing subscription without periodic polling or bulk ledger reloads.

All privileged endpoints are currently connected through the existing **local staging companion**. Production needs an equivalent deployed secured service before these controls can be released there. No production records or original passwords were changed. Test evidence is kept in workspace `outputs/account-access/verification-results.json`; screenshots are local review artifacts. Fresh codes issued for the 12 existing staging borrowers were explicitly authorized by the owner and are intentionally excluded from documentation and test files.

### Access implementation map

- [Single digit entry feedback](../../public/v41224-login-code.js)
- [Shared animated border](../../public/shared-access-ring.css)
- [Admin account control panel](../../src/components/admin/BorrowerLoginControls.jsx)
- [Authenticated browser adapter](../../src/lib/borrowerAdministration.js)
- [Privileged local account service](../../server/borrower-management.cjs)
- [Permanent code issuance and redemption](../../server/local-flow-service.cjs)
- [Targeted borrower profile update publication](../../supabase/migrations/20261016090000_borrower_profile_updates.sql)


### Login Code startup refinement

The trusted companion validates the code for an active borrower, then the Auth SDK verifies the generated one-time link to establish the normal Supabase session. Role checks, live-session checks and RLS remain in force. The four-second presentation starts after code acceptance and runs concurrently with session/profile preparation; it no longer adds another full hold after preparation. Requests have deadlines and a failed verification returns to a usable form. Initial borrower loading reuses the freshly validated profile and skips admin-only arbitrage, tracked-loan and audit queries. Explicit refresh still reads current records normally.

Final account/UI verification: **43 checks passed**, including password replacement, Auth/profile email consistency, code reuse/replacement/revocation, isolated digit animation, mobile More, live profile updates and unsaved draft preservation. Temporary accounts were removed and the unfiltered Auth total returned to 13. Test codes issued to existing staging borrowers are excluded from artifacts.


### Measured local startup and policy optimization

Final Login Code sample: borrower route 3.553 s, presentation/Dashboard ready 8.072 s, matrix visible 6.571 s. These are local samples, not guaranteed timing. The four-second minimum remains and can last longer while records prepare. Earlier local samples reached about 16–17 s under the old preparation path. Initial borrower loading also avoids signing all historical proof URLs; individual proof access continues through the existing on-demand handler.

Fourteen existing restrictive `mobile_valid_session` policies now evaluate the unchanged session helper through a scalar SELECT once per statement. Existing ownership/lender visibility, unrelated-ledger denial and revoked-session denial were checked with a disposable borrower. The same ledger EXPLAIN query measured 550.431 ms before and 222.833 ms after, with zero unrelated rows visible in either case. The comparison used a rolled-back old-policy transaction. Policy originals and aggregate evidence are in workspace outputs/account-access; no production policy was changed. This follows [Supabase RLS performance guidance](https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations).

The 43-check run includes submitting a new password through the actual admin UI and signing in as the disposable borrower with that password. The unfiltered Auth account total returned to 13 with no temporary accounts remaining.

- [Once-per-statement local session checks](../../supabase/migrations/20261016091000_session_check_initplan.sql)

## F43 — Sign-in lock management

Borrowers → Login access now includes Sign-in locks for account and device recovery. Match the unlock reference from the error screen, then select Unlock. The borrower selects Check access or reloads sign-in. Password replacement and code issuance do not unlock an account. The card fetches once when opened and on explicit refresh. [Local implementation and review limits](Login-Access.md); no production authentication configuration was changed.

## Notification rules — October 16, 2026

Notifications now includes a connected rule canvas, sent-message linking and activity alongside the existing composer/inbox. See [Notification rules](Notification-Rules.md) for local staging scope, preserved interactions and verification limits.
