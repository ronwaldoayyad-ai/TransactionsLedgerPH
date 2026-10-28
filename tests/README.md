# Browser verification

Run `npm run test:e2e` against the running app. Set `APP_TEST_URL` to select another app address. Playwright covers Chromium, Firefox and WebKit; physical-device acceptance remains a separate release activity.

The suite creates temporary fixture accounts, checks public and authenticated screens, verifies the assistant's default setting, preserves separate chat drafts, and downloads each bank QR through the shared feedback flow. Fixtures are removed after each browser project's checks. Downloaded QR payloads must match the bank-export payload hashes in the verification evidence. No borrower balances are changed by these browser checks.

Use `npx playwright install chromium firefox webkit` when browser engines are missing. Generated reports and traces belong outside source control. Trace files contain fixture data and public receiving-account details and should be shared only with authorized project reviewers.

Fixture services must be available on their configured loopback authentication and database ports. Optional settings are `FIXTURE_AUTH_URL`, `FIXTURE_DB_PORT`, `FIXTURE_DB_PASSWORD` and `LOCAL_SUPABASE_JWT_SECRET`. The adapter rejects non-loopback authentication addresses. `PLAYWRIGHT_OUTPUT_DIR` and `QR_VERIFICATION_DIR` select artifact destinations. The browser cache uses standard Playwright configuration unless the workspace browser cache is available.

Each spec owns a separate fixture database pool; ending one spec cannot close another spec's connection. The test runner creates its download directory before starting browsers. On Windows, a sandboxed browser can report a canceled download despite the same test succeeding outside the sandbox; retain that distinction in test evidence.

## Admin data and refresh regression registry

Source requirement: October 16, 2026 staging data omissions and repeated record refresh incident, documented in [Admin workspace](../docs/project/Admin-Workspace.md).

| TEST-ID | State | Observable behavior | Level / purpose | Execution boundary and command |
| --- | --- | --- | --- | --- |
| TEST-ADMIN-REFRESH-001 | covered | Idle time and focus/visibility events cause zero record reads. One manual refresh reads each provider once and retains the document. | E2E / regression protection | Real loopback Auth and API, temporary admin; `npm run test:e2e -- tests/e2e/admin-refresh.spec.js` |
| TEST-ADMIN-DATA-001 | covered | Every stored tracked loan appears on Loan Portfolio Dashboard; an empty stage is a failure. | E2E / regression protection | Same command and temporary admin; restored production records are read only. |
| TEST-ADMIN-DATA-002 | covered | The wallet displays the temporary admin's own synthetic card; other lenders' ownership is retained. | E2E / specialized protection | Same command; only the synthetic card is created and removed. |
| TEST-STAGING-PARITY-001 | covered | All 27 production public tables have their captured primary keys in staging. All production values match except local profile last-login timestamps; stage-only fields and rows are preserved. | integration / regression protection | Read-only source capture and local SQL comparisons in the private staging audit; see the admin workspace evidence. |

The original refresh test failed with 51 automatic GET reads during an idle/refocus interval. The patched Chromium run passed with zero idle reads and one manual read per tested provider. Cross-browser results and the final state of each TEST-ID are recorded with the current verification report; an earlier render-only review does not establish data parity.

`node --test tests/unit/recordRefresh.test.js` verifies that explicit refresh awaits participating providers, isolates a failing provider and schedules no follow-up read. This protects the coordinator used by TEST-ADMIN-REFRESH-001; the E2E assertions remain the evidence for real Auth/API behavior.

October 16 verification: 69 unique browser scenarios pass on their latest run, plus 60 live service checks and two unit tests. The initial broad run was 63/66; corrected assertions and the new wallet cases passed nine focused reruns. The complete results and cleanup boundaries are in workspace `outputs/admin-workspace-check/DATA-AND-PERFORMANCE.md` and `final-results.json`.

## Shared login regression registry

Source: October 16 borrower sign-in staying on “Authenticating” and the requirement for one role-aware sign-in screen; design in SDD.md → Shared sign-in and stalled-request recovery.

| TEST-ID | State | Expected behavior | Level / purpose | Test and command |
| --- | --- | --- | --- | --- |
| TEST-AUTH-ROLE-001 | covered | Trusted profile role selects the correct dashboard from either role URL, including restored sessions; no role selector. | E2E / regression protection | `npm run test:e2e -- tests/e2e/shared-login.spec.js` |
| TEST-AUTH-RETRY-001 | covered | A held Auth request times out visibly and a retry succeeds. | E2E / regression protection | Same spec; real local Auth with one intercepted stalled request. |
| TEST-AUTH-RETRY-002 | covered | Invalid credentials show an error, preserve a usable form and permit a valid retry. | E2E / critical path | Same spec; actual local invalid-password response. |
| TEST-AUTH-RETRY-003 | covered | A held profile GET releases authentication, displays account-load feedback and permits retry. | E2E / regression protection | Same spec; real local Auth with the profile request held. |

`node --test tests/unit/sharedLogin.test.js` protects role destinations and deadline/cancellation behavior. Browser fixtures create and remove their own two accounts; no original account passwords or financial rows are changed. Current shared-login results belong in workspace `outputs/shared-login/`.

October 16 shared-login verification: all twelve Wi-Fi browser cases pass across Chromium, Firefox and WebKit. Six additional localhost Chromium cases pass: four shared-login cases, session renewal/draft continuity and manual-only record refresh. Four deadline/routing unit checks, focused ESLint and the final build pass. See workspace `outputs/shared-login/VERIFICATION.md` and `final-results.json`; original account passwords were not tested or changed.

## Local account access — October 16, 2026

Workspace verification `outputs/account-access/verify.cjs` completed 43 targeted service/Chrome checks with disposable local identities. `verify-live-profile.cjs` measures Login Code timing, validates the four-second presentation and checks live profile/draft preservation. Credentials are generated in memory and removed after each run; the unfiltered Auth count returns to 13. See workspace outputs/account-access/VERIFICATION.md for evidence, earlier failures and production exclusions.

## Notification workspace SQL regression — October 17, 2026

Run `npm run test:notification-sql` with the local staging database running and the notification migration applied. These five checks prepare every literal service query against PostgreSQL, execute the linked-message aggregate with synthetic rows containing duplicate column names, read list/preview/sent/activity handlers with stubbed authentication, and verify safe database-error feedback. SQL preparation never executes business writes. The read-handler check does not prove authentication; separate real local Auth/browser evidence is recorded in workspace outputs/notification-rules/workspace-read-results.json.

Regression TEST-NOTIFICATION-SQL-001: joined links and notifications both have rule_id. Both SELECT and GROUP BY must use l.rule_id. The suite reproduced PostgreSQL 42702 before the fix and passed afterward. The local notification publishing helper runs this suite first and stops copying if it fails. It does not add background browser requests or change notification delivery timing.

## Locked sign-in support — October 17, 2026

`npm run test:locked-support` runs ten Chrome checks against the local app using synthetic lock state. Submission is intercepted to verify the PNG/description payload without sending support messages. Outputs go to test-results/locked-support. See [handoff behavior and limits](../docs/project/Locked-Sign-In-Support.md).
