# Combined finance charge and late-fee assessments

## Behavior

- Choose an **As of** date. All current outstanding ledger entries due on or before it are selected by default.
- Select/deselect original due dates and individual entries. Prior unpaid fees are included.
- Actual negative ledger adjustments reduce the net base. Allocated payments are already deducted from positive balances; display-only payment activity is never subtracted again.
- Default finance rate: 3%. Default late fee: one ₱1,500 fee for the entire selection.
- Both components can be disabled independently. The new charge due date applies to both entries and cannot precede the As of date.
- Descriptions reference the As of date and actual net base.
- Multiple assessments per borrower per posting calendar month are allowed. Every posting requires review; an additional checkbox explicitly authorizes a repeat when any active assessment exists that month.
- The backend checks current selected row snapshots, borrower ownership, live admin session and the reviewed prior-assessment token while holding the borrower lock.
- The request reference is saved in actor/borrower-scoped session storage before sending. Unknown outcomes freeze the form; navigation/reload can resume the exact request. Same-reference retries return the original result.
- The As of date filters **current recorded remaining balances**. It does not reconstruct how the ledger looked historically.

Reference example: 13 entries across four dates, ₱151,270.03 unpaid charges minus ₱80,000 adjustments = ₱71,270.03. Finance ₱2,138.10 + late ₱1,500 = ₱3,638.10.

## Schema and compatibility

Apply in order:

1. 20261023182733_combined_fee_assessment.sql: additive metadata, admin-only combined posting/context RPCs, and a partial index retaining the original single-date monthly restriction. Old assessment values, old posting RPC and void flow remain intact.
2. 20261023192521_non_retrying_transaction_conflicts.sql: changes only the existing transaction-correction stale guard from SQLSTATE 40001 to PT409, after verifying its exact reviewed function SHA-256. Preserves grants/owner/configuration and all accounting logic.

The second change fixes a risk identified during testing. Supabase documents that custom SQLSTATE 40001 can cause infinite retries in PostgREST 14. A rejected test request later became valid after its prerequisite assessments were voided and created an additional **isolated synthetic** assessment. Both new stale guards now return PT409. The existing production transaction-correction function has the same old custom code; production has not been patched as part of implementation.

Primary reference: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions

The original released commit and checkout remain frozen. This feature branch regenerates forward-candidate.sql for fresh-database rehearsal and CI only. Do not apply the full candidate to the installed production schema; apply only the reviewed incremental migrations.

## Verification

- Unit/lint: npm run lint:release and npm run test:release.
- Opt-in disposable local database rehearsal: set RUN_FEE_SQL_TESTS=1 and run node --test tests/integration/combinedFeeMigration.test.cjs. Default local database: 127.0.0.1:54322. FEE_LOCAL_DATABASE_URL may override it only for an isolated local cluster.
- Actual isolated Supabase RPC checks cover exact totals, permissions, stale records/history, duplicate IDs, negative-only base, explicit repeats, concurrency and same-key retries.
- Actual Chrome checks cover date/entry selection, confirmation reset, mobile 390px layout, one late fee, posting, and lost-response → reload → same-reference resume.
- Business rejection tests must assert PT409 promptly. A timeout is **not** a passing rejection.
- Production monetary QA is excluded. Test fees are voided with history retained.

## Production review and fallback

A new production schema/build review is required; the earlier cutover approval bound a different frozen commit. Reuse the existing production environment without changing Auth URLs, worker, hosting, domains, rollout assignments or AI settings.

Before executing, capture protected current target definitions/fee rows/ledger fingerprints, verify the guarded transaction function still matches, and check for any looping financial RPC backend. Stop and review if it differs. Do not terminate unrelated requests or restore a stale database over intervening writes.

Run migrations atomically with a short lock timeout. Verify original financial columns unchanged, retain the non-retryable conflict correction, stage the exact reviewed source with public domain assignment disabled, then perform protected read-only acceptance before promotion.

If the UI release is reverted, keep the expanded schema and all assessment history. Old clients continue to use the single-date API. Revoke the new combined RPC grants if necessary. Void eligible unpaid fees through the reviewed void flow; allocated/paid fees need the existing payment-reversal process. Do not delete fee records or create historical credit.
