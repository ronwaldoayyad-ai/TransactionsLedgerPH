# Testing and Debugging Procedures

Reviewed October 27, 2026. A procedure is not a statement that every future build has passed it.

## Local and continuous checks
Run npm ci, npm run lint:release, npm run test:release and npm run build with the required public build configuration. Release CI also regenerates the reviewed forward candidate and exercises database migration/accounting suites against disposable PostgreSQL. Use the generated inventory below for the current suite names and [release workflow](https://github.com/ronwaldoayyad-ai/TransactionsLedgerPH/actions) for actual run results.

Documentation checks must verify fourteen unique sections, their source files, legal-source parity, registered admin route/navigation, safe rendering/export and metadata generation. Recheck schema metadata after migrations; never substitute a list of migration filenames for a live schema comparison.

## Hosted Chrome acceptance
1. Test the immutable protected build under normal authorized sign-in.
2. Check both admin and borrower roles; test New and Classic routing where affected.
3. Exercise changed controls at representative mobile/desktop widths, keyboard use and supported reduced motion.
4. Inspect console/network errors, first and warm navigation, request results and background refresh behavior.
5. For financial workflows, use approved synthetic accounts in an isolated environment. Do not create real postings solely for UI testing.
6. Promote the same accepted build, then verify canonical assets, health, aliases and protection.

## Accounting and migration regression
Cover partial payments, excess credit, credit application, retries, stale review, correction/reversal restrictions and ownership isolation. For migrations prove early/middle/late rollback and safe retry. Capture a protected current database/Auth/Storage/configuration recovery set and prove restoration in isolation before a schema cutover. Local rollback tests alone do not prove recoverability.

## Debugging checklist
| Symptom | Investigate first |
| --- | --- |
| Missing transactions | Active filters, archived_at, borrower ownership, audit events and pre-change IDs/checksums. |
| Duplicate financial effect | Retry key, posting/allocation evidence and display-only breakdown duplication. |
| Delayed records/chat | Subscription state, invalidation signals, session/RLS and targeted refresh errors. |
| Missing logo | Retail eligibility, saved removal/override, ambiguity, public Client ID and asset fallback. |
| Login unavailable | API health, origin/configuration, account/device restriction and Auth hook setup. |
| Failed upload/download | Bucket size/MIME, validation, ownership and signed-link expiry. |
| No Telegram alert | Feature switches, verified destination, durable queue, worker/cron and delivery status. |

## Incident handling
Keep production inspection read-only until a repair is reviewed. Preserve IDs and evidence; distinguish archive, permanent deletion, filtering and reassignment. Restore only the reviewed records with expected-state guards and verify accounting invariants. Do not infer new credit from legacy proofs.

Known safety gap: the existing All Transactions bulk archive button acts without a dedicated review confirmation. An archive removes rows from active borrower balances until restored. Brand assignment is a separate metadata action. Permanent archive purge and payment reversal have different consequences.

## Operational limits
Browser screenshots, synthetic mocks and simulated motion preferences are useful evidence but not proof of real account authentication, email delivery or financial settlement. Record exactly what was tested, the build, environment, inputs and unresolved limitations.

## Artwork, labels and search regression

Exercise individual PNG upload after an empty Brandfetch result and reviewed bulk SVG assignment through the real UI and database service. Verify previews, transparency, explicit review, live borrower refresh, automatic/Brandfetch reset and unchanged financial fingerprints. Cover early/middle/late migration failures, safe retry, concurrent/stale saves, deduplication, target eligibility, limits and admin/owner/foreign/anonymous authorization. Direct Data API writes must fail.

Check proof artwork in Recent Activity and the separate submission-history section without submitting a real payment. Check current-result switch text for both states, keyboard focus, native search typing/clearing, small-screen overflow and reduced-motion CSS. Record synthetic snapshot and external search mocks as test boundaries. Never upload placeholder artwork to production merely to test persistence.

## Payment-selection credit regression

Verify multi-date mandatory credits, Clear all/Select all, attempted credit deselection, positive-item deselection, credit-only/zero-due states, zero/invalid rows, integer-cent math, changed-credit draft review and positive-only proof allocation IDs. Verify already-applied posting breakdowns do not reduce remaining dues twice. In Chrome test the three-row payment summary, green locked credit rows, mobile/desktop overflow and shared fee artwork under History → Fees. Use synthetic snapshots; do not submit a production proof just to test this display change.
