# Borrower loan-request visibility

Master Control remains the source of truth in public.loan_request_access. Missing access defaults to Disabled.

## Behaviour

- Hide the Request Loan shortcut, shortcut picker item, More menu item, Finder destination and Classic sidebar item unless access is explicitly enabled.
- Remove the application form on access revocation, retaining access to existing request history. Server-side submission permission remains enforced by the existing backend.
- Keep saved shortcut preferences intact, so enabling access restores the shortcut in its prior position.
- Display all borrower access states on the admin Loan Requests page, with Enabled/Disabled counts, status pills, name/email/account search and Manage actions.
- Failed access reads hide the borrower option and display a retry state to admins rather than mislabelling unknown access.

## Real-time delivery

Migration 20261023195500_loan_request_access_realtime.sql adds only the access-flag table to the existing publication. It changes no balances, payments, roles, RLS policies or current access flags.

A dedicated borrower-scoped channel uses subscribeToInvalidations for coalescing and initial/reconnect reconciliation. The original multi-table channel missed the event during Chrome QA; the dedicated channel passed enable and revoke tests.

## Verification

Chrome DevTools exercised separate authenticated synthetic admin and borrower sessions against isolated project lzprybrxhwktfxqvsbjk. Only release routing was forced to New in the loopback QA server; Auth, access writes, RLS, Realtime and app presentation were real.

Both enablement and revocation updated the same borrower document without reload. An open application was removed on revocation. Quick Access, More, Finder and the picker were checked. Admin status filters, account-number search and 390px layout were checked without horizontal overflow. The synthetic borrower was returned to Disabled.

Production is unchanged by this implementation. Review the exact candidate and access-publication migration before deployment. Existing access rows are preserved.
