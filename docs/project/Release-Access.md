# Release access and classic admin

Implemented October 17, 2026 for local staging. Production has not been changed.

## Admin controls

Open **Settings → Release access** (`/admin/settings`) from the desktop navigation or mobile More menu. Search borrower names, email addresses or numeric account references; filter by effective interface; review individual or bulk assignments before saving. “Use default” removes an explicit assignment. The default applies to new accounts and existing accounts without overrides. Pausing the borrower rollout forces Classic at the next sign-in/reload while retaining saved assignments. Admin layout selection is independent.

The table shows what opens at the next sign-in/reload, not the interface currently open on a borrower's device. No background polling or forced navigation is introduced. Changes are transactional, version checked and recorded with the admin identity and before/after values. Concurrent stale edits require an explicit refresh. History displays the latest 50 changes; the database retains the full history.

## Classic admin

“Return to classic admin” is available in the redesigned workspace footer and on Release access. It opens `/admin/classic` with the existing classic navigation and original portfolio dashboard, retaining the authenticated session and records. The preference is scoped to the real administrator and browser tab session. Classic includes Settings and a “Use new admin workspace” button.

`/admin/classic` and `/admin?interface=classic` are recovery entry points behind the existing role checks. The redesigned workspace is lazy loaded, and an error boundary offers the independent classic route when the workspace component fails. This is the classic shell contained in this source version; it is not a separate immutable deployment of the old production release. Separate-deployment routing and a hosting-level fallback remain part of the production release plan.

## Borrower routing

The authenticated server resolves only the caller's assignment, using active profile and live Auth session checks. An authenticated admin may also resolve the existing “View as borrower” target; ordinary borrowers cannot resolve another account. The React host pins it until sign-out/reload, gates the versioned borrower presentation and suppresses the old client-only “Use mobile view” bypass for Classic assignments. Assignment changes do not alter account roles, sign-in locks, data permissions or account status. A lookup failure falls back to Classic with a notice. No assignment state is stored in borrower-editable profile metadata.

The login presentation remains shared during this pilot. The borrower interface is chosen after authentication; this does not create a second password or account. The provider stays mounted across authentication so it does not restart the successful-sign-in animation.

## Data and deployment

- Migration: `20261016205239_release_access.sql`. Three private, RLS-enabled tables; no anonymous/authenticated table access and no exposed privileged RPCs. The reviewed production migration defaults to paused/Classic.
- Local bootstrap: workspace `outputs/release-access/apply-local.cjs` has a fixed loopback destination. It preserves the existing staging experience by explicitly assigning existing staging borrowers to New and enabling the local rollout. New/unassigned accounts default to Classic. Bootstrap rows and staging accounts must never be copied to production.
- API: `server/release-access.cjs`, mounted under `/local-flow/release-access/`. Admin operations require an active admin plus an existing Auth session. Requests use same-origin POSTs, bounded bodies and no-store responses. Bulk saves accept at most 500 borrower accounts and reject admin IDs.
- Local environments enable routing automatically. Hosted environments require `VITE_RELEASE_ACCESS_ENABLED=true` plus a reviewed same-origin `/api/release-access/` adapter, the migrated production schema and real production Auth/database verification. Leave the flag off until those services and the separate classic/new deployment strategy are ready.
- No financial, Auth, password or production records are modified by this delivery.

## Review scope

Syntax, scoped lint, bundle output and local schema/security inspection are recorded in workspace `outputs/release-access`. Automated tests and authenticated browser acceptance were not requested for this delivery. A real admin/borrower pilot and the hosted routing fallback must be accepted before production rollout.
