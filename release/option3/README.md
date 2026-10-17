# Option 3 release candidate

Status: local acceptance and hosted database preparation completed; hosted application acceptance and production recovery gates remain open. Do not promote this candidate to production yet.

## Hosting design

- Vercel serves the React app and `api/index.js`, a Node 24 Web Request function. API rewrites run before the SPA fallback. The database, authentication, private files, notification queue, Cron, pg_net and Vault stay on Supabase.
- The function uses the Supabase session pooler on port 5432 with certificate verification, at most three connections per warm instance and no permanent listeners. Transaction pooling on port 6543 is rejected because login serialization uses session advisory locks.
- Signed-in documents go directly to private Supabase Storage; the function reads and validates them there. Large guest screenshots are resized locally before submission to keep JSON requests below 4 MiB. The original attachment remains in the draft until submission succeeds.
- Notification events remain in the database. A private pg_net wake calls the protected Vercel worker; Cron retries once per minute. The worker processes bounded batches, uses row locks and uniqueness constraints, and retains failed jobs for review/retry. Browser record polling is not required.

## Configure a protected preview first

1. Use a separate, empty Supabase project and synthetic accounts. Never point acceptance tests at production. The isolated project lzprybrxhwktfxqvsbjk is now initialized and verified. It contains schema, rule templates and storage configuration, with no production customers or financial records. See HOSTED-PREVIEW.md for current status and remaining credentials.
2. Restore the reviewed Classic **schema only** into that project, then apply the exact reviewed `forward-candidate.sql`. Do not run the entire historical migration directory against the live database: production already has an untracked schema. Reconcile any drift first.
3. Configure Vercel from `.env.hosted.example`. All `VITE_` values are public. Database credentials, the privileged Supabase key, database root CA, Login Code HMAC secret and worker secret belong only in Vercel server environment settings. Use different secrets for preview and production. Never import local environment files.
4. Enable the standard Supabase Custom Access Token hook: `mobile_private.login_access_token`. This rejects fresh sign-ins to a locked account while preserving refreshes for existing work. The app endpoint counts failed password attempts. The optional Password Verification hook counts direct Auth password attempts too, but currently requires Team/Enterprise and is **not** a prerequisite for this Free/Pro-compatible implementation. Without it, failed password attempts made outside the app endpoint are not included in the app's five-attempt counter. Verify this limitation before release.
5. Enable Supabase Cron and pg_net. In Vault, configure `loanledger_app_origin` and `loanledger_worker_secret` to match the accepted Vercel origin and its worker secret. For a protected preview, add `loanledger_preview_bypass`. Run `install-notification-schedule.sql` only in the accepted environment. It creates the event wake and the once-per-minute retry; it is intentionally separate from the forward database candidate.
6. Preserve the current AI provider settings as server secrets if AI is enabled. No billable AI tests are part of the migration acceptance suite. The app includes its FAQ and Pawcheebels reference fallback.
7. Verify actual Vercel Linux function packaging, native image decoding, cold starts, cookies, TLS/database connectivity, Auth hooks, private Storage and notification scheduling in Chrome DevTools on the hosted preview. Local HTTP acceptance does not prove these hosted behaviors.

## Required hosted acceptance

Use disposable admin, New borrower and Classic borrower identities. Record console errors, API statuses, navigation count, request count and timings. Do not log tokens, passwords or Login Codes.

- Shared password login routes the admin to admin and borrowers to their assigned interface. Login Code auto-submits on digit six, preserving the requested four-second success animation.
- Five invalid attempts show correct remaining attempts and lock both UI methods as designed. Email-account and unknown-code device limits stay distinct. Admin unlock restores access. Locked fresh sign-ins through Classic are rejected by the access-token hook; an already open payment session remains usable.
- Release flag off, paused rollout, unresolved assignment and API failure all resolve to Classic. The borrower cannot read/edit assignments or resolve another account. Stale admin writes are rejected.
- Assign one test borrower New, then Classic. Existing open work does not reload automatically; the assignment applies on the next navigation/reload according to the release controls.
- Upload a synthetic proof, reload the form, simulate validation failure, retry and submit. Verify exactly one pending proof, a server-issued exact submission timestamp, no early ledger settlement and no lost draft.
- Submit a guest support screenshot over 2.5 MB. Verify the ticket, private validated attachment and confirmation with Save Image/Share. Retry the same request and verify no duplicate ticket.
- Create/review/save/edit/delete/restore a synthetic notification rule; exercise category and sort controls. Verify event delivery and delayed retry using Vault/pg_net/Cron, preserving read/reply state when appropriate. Remove test rules and notifications afterward.
- Verify admin password management using synthetic users, support, messages, private downloads and account isolation. Test 390-pixel mobile layouts and no horizontal overflow.
- Leave both interfaces idle and confirm records do not reload every one or two seconds. Check navigation, first request and warm request timings separately from the four-second success animation.
- Freeze and open an independent Classic deployment. Verify recovery even when the New bundle/API is unavailable. A different origin intentionally requires reauthentication; no credentials belong in redirect URLs.

## Production gates and rollout

1. Freeze the existing production deployment before replacement. The local Classic Git tag/archive is a source recovery aid, not an independently reachable Vercel deployment.
2. Capture a current, encrypted production recovery set covering database, Auth configuration/users, Storage objects and server configuration. Rehearse restoring it into an isolated environment. A schema-only migration rehearsal does not satisfy this gate.
3. Review live schema drift and `manifest.json`; preserve existing accounts, financial rows and Classic policies. The candidate uses one transaction and a five-second lock timeout, but a database backup is still required.
4. Obtain approval for the exact hosted build and migration after the acceptance/recovery evidence is available. Production has not been changed during local preparation.
5. Apply the approved additive candidate with rollout paused and default Classic. Import no staging identities, Login Codes or release assignments. Install the accepted worker schedule and Auth hook configuration.
6. Enable the New admin first; keep Return to classic admin and the independent recovery deployment. Enroll one approved borrower through Release access. Expand only after that pilot is accepted.

## Recovery

- Pause rollout/default to Classic, or switch a pilot assignment back to Classic. The compile-time release flag also fails to Classic.
- Use the independent frozen Classic deployment if the new deployment cannot load at all. In-app `/admin/classic` depends on the current bundle and is not the only recovery route.
- Do not reverse additive tables while transactions are being written. Switching interfaces does not undo payments, approvals or support requests. Reconcile records and use the verified restore procedure only with a deliberate recovery decision.
- If worker delivery fails, retain the queue, inspect Activity and retry after configuration is corrected. Do not delete queued events to hide an error.

## Reproduce local checks

`npm ci`, `npm run lint:release`, `npm run test:release`, `npm run build`.

`node release/option3/generate-forward.cjs` regenerates the candidate and checksummed source manifest without connecting to a database. Review any regenerated SQL before applying it.

References: [Vercel Node runtime](https://vercel.com/docs/functions/runtimes/node-js), [connection pooling](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Supabase Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks), [Cron](https://supabase.com/docs/guides/cron), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net), [API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
