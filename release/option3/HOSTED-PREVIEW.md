# Hosted preview database — October 18, 2026

Test project: lzprybrxhwktfxqvsbjk (Seoul). Production was not accessed or changed during this stage.

## Completed and verified

- Connection access confirmed; the project initially had zero public tables, Auth users and stored objects.
- Applied the captured Classic public schema plus the reviewed additive candidate in the isolated test project. Installed state: 36 public app tables, 16 mobile-private tables and 35 rule templates.
- Release settings remain paused and default Classic. No production users, credentials or financial rows were copied.
- Applied the reviewed anonymous-RPC restriction: seven signed-in Classic RPCs reject anonymous execution and retain authenticated/service access. The production migration candidate now includes this correction.
- Configured the original proof/avatars storage baseline alongside mobile attachments. Proof and support buckets are private; avatars retain the Classic public-read setting.
- Chrome DevTools actual hosted requests: anonymous profiles read returned 200 with zero rows; anonymous is_admin RPC returned 401 / PostgreSQL 42501. This verifies the anonymous access boundary, not signed-in account isolation.
- Hosted advisor no longer reports anonymous SECURITY DEFINER RPC access. Its nine authenticated RPC warnings remain for caller/session review; 16 informational private-table/no-policy findings are intentional server-only access boundaries.
- Updated local additive-schema rehearsal passed, preserving six Classic borrower policies and safe release defaults.
- Seven local integration checks passed: RPC grants/private permissions and notification SQL regressions. The preceding unit suite had 38 passing checks.

## Not deployed / remaining

- Automatic approval review rejected a temporary fixture helper because it would publish a privileged account-management endpoint with platform JWT verification disabled. No Edge Function was deployed; the function list remains empty. Do not retry that helper or use it as a workaround.
- Use the standard Supabase Admin API from the local runner to create three synthetic accounts after the owner fills the test-only server credentials. No test Auth accounts exist yet.
- Ignored file: work/option3-release/.env.hosted-preview.local. Required entries: SUPABASE_SERVICE_KEY and DATABASE_URL. Use the test project secret and its session-pooler connection on port 5432. Never paste secrets into chat or commit them. Public key and separate generated server secrets are already present.
- The normal Admin API runner is outputs/release-readiness/prepare-hosted-users.cjs. It is fixed to the test project, refuses other accounts, sends no emails and stores only synthetic credentials privately. Do not run until the owner says the credentials file is ready.
- Auth profile/sign-in trigger wiring still needs to mirror the Classic baseline after the synthetic administrator is provisioned. Configure and verify the standard custom access-token hook before lockout acceptance.
- Vercel plugin installation is confirmed, but no Vercel tools were exposed in the current chat. Deployment-account access and hosted application acceptance remain unverified. Refresh the chat/app tool session if needed; do not ask the owner to install it again.
- Database is in Seoul while the production candidate's Vercel region is Singapore. Align the preview function region or record this cross-region difference before judging hosted performance.
- Verify approved production aliases/canonical-origin behavior, current production recovery, independent Classic recovery deployment, hosted Linux packaging/native validation, TLS/cookies, queued notification delivery and full authenticated Chrome acceptance before production approval.